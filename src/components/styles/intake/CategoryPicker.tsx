import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { createCategory } from '@/api/categories';
import type { CategoryWithStyleCode } from '@/api/types';
import type { Gender } from '@/api/types';
import {
  GENDER_CATEGORIES,
  fineCategoryLabel,
  type FineCategoryCode,
} from './categoryOptions';

interface Props {
  /** All known categories from the BE — may be empty before load. */
  categories: CategoryWithStyleCode[];
  /** Currently selected category id (or null). */
  value: number | null;
  /** Fallback when the BE list doesn't contain the selection yet —
   *  used so the seed code (DRESS/PANT/…) stays selectable before
   *  `listCategories()` resolves. */
  fallbackCode: FineCategoryCode | null;
  /** Active gender — narrows the option list. */
  gender: Gender;
  /** Receives both the category id (server-known) AND the fine-grained
   *  code (seed/fallback). Either can be null. */
  onChange: (next: {
    categoryId: number | null;
    code: FineCategoryCode | string | null;
  }) => void;
  /** Called when a brand-new category was created server-side so the
   *  parent can refresh its `categories` list. */
  onCategoryCreated?: (created: CategoryWithStyleCode) => void;
  disabled?: boolean;
}

/**
 * Searchable Category picker. Merges the locked seed codes
 * (DRESS / PANT / TSHIRT / BLAZER / JACKET) with whatever the BE
 * returns — so the dropdown is usable instantly on cold load, and
 * upgrades to real `categoryId` values as soon as the list resolves.
 *
 * "+ Add new category" opens a tiny inline modal (code / name /
 * styleCode / styleCounter), POSTs `/api/categories`, then bubbles
 * the new row up via `onCategoryCreated` and auto-selects it.
 */
export default function CategoryPicker({
  categories,
  value,
  fallbackCode,
  gender,
  onChange,
  onCategoryCreated,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    styleCode: '',
    styleCounter: '1000',
  });
  const nameRef = useRef<HTMLInputElement>(null);

  const allowedCodes = GENDER_CATEGORIES[gender];

  // Merge seed codes with the live list. Server rows win when their
  // `code` matches a seed (real id replaces the synthetic negative one).
  const options = useMemo<ComboboxOption<number | string>[]>(() => {
    const byCode = new Map<string, ComboboxOption<number | string>>();

    for (const code of allowedCodes) {
      byCode.set(code, {
        value: code,
        label: fineCategoryLabel(code),
        sublabel: code,
        searchText: code,
      });
    }
    for (const c of categories) {
      // Skip categories not valid for this gender — but if the user is
      // already on one, we keep it visible so they can switch off.
      const code = (c.code ?? '').toUpperCase();
      const isSeed = (allowedCodes as readonly string[]).includes(code);
      if (!isSeed && value !== c.id) continue;
      byCode.set(code || `id_${c.id}`, {
        value: c.id,
        label: c.name || fineCategoryLabel(code),
        sublabel: c.styleCode ? `${code} · code ${c.styleCode}` : code,
        searchText: `${code} ${c.name} ${c.styleCode ?? ''}`,
      });
    }
    return Array.from(byCode.values());
  }, [allowedCodes, categories, value]);

  // The currently selected combobox value: prefer the numeric id, else
  // fall back to the code string seed.
  const comboValue: number | string | null =
    value ?? (fallbackCode as string | null) ?? null;

  const handleChange = (next: number | string | null) => {
    if (next === null) {
      onChange({ categoryId: null, code: null });
      return;
    }
    if (typeof next === 'number') {
      const hit = categories.find((c) => c.id === next);
      onChange({
        categoryId: next,
        code: (hit?.code ?? null) as FineCategoryCode | string | null,
      });
    } else {
      // Seed code — try to match it against the live list so we still
      // send a real id when one exists.
      const hit = categories.find(
        (c) => (c.code ?? '').toUpperCase() === next.toUpperCase(),
      );
      onChange({
        categoryId: hit?.id ?? null,
        code: next,
      });
    }
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.show('Code and name are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await createCategory({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        styleCode: form.styleCode.trim() || null,
        styleCounter: form.styleCounter ? Number(form.styleCounter) : null,
      });
      onCategoryCreated?.(created);
      onChange({ categoryId: created.id, code: created.code });
      toast.show('Category added.', 'success');
      setModalOpen(false);
      setForm({ code: '', name: '', styleCode: '', styleCounter: '1000' });
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'Could not create category.';
      toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Combobox<number | string>
        value={comboValue}
        options={options}
        onChange={handleChange}
        onAddNew={(typed) => {
          // Prefill the modal's name with whatever the user typed so
          // "+ Add 'Skirt'" lands them on the create form with the
          // name already filled in.
          setForm((f) => ({
            ...f,
            name: typed || f.name,
            code: typed
              ? typed.trim().toUpperCase().replace(/\s+/g, '_')
              : f.code,
          }));
          setModalOpen(true);
        }}
        addNewLabel={t('admin.styles.intake.addNewCategory', 'Add new category')}
        placeholder={t('admin.styles.intake.categoryPh', 'Choose a category')}
        disabled={disabled}
        ariaLabel={t('admin.styles.intake.category', 'Category')}
      />

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('admin.styles.intake.newCategoryTitle', 'New category')}
        initialFocusRef={nameRef}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void submit()}>
              {saving ? t('common.saving') : t('common.create', 'Create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--color-muted-foreground)]">
            {t(
              'admin.styles.intake.newCategoryHelp',
              'Adds a row to the Category master so the Style ID generator can use it.',
            )}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('admin.styles.intake.categoryCode', 'Code *')}</Label>
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
                placeholder="e.g. SKIRT"
              />
            </div>
            <div>
              <Label>{t('admin.styles.intake.categoryName', 'Name *')}</Label>
              <Input
                ref={nameRef}
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Skirt"
              />
            </div>
            <div>
              <Label>
                {t('admin.styles.intake.categoryStyleCode', 'Style code')}
              </Label>
              <Input
                value={form.styleCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, styleCode: e.target.value }))
                }
                placeholder="e.g. SK"
              />
            </div>
            <div>
              <Label>
                {t(
                  'admin.styles.intake.categoryStyleCounter',
                  'Style counter start',
                )}
              </Label>
              <Input
                type="number"
                min={0}
                value={form.styleCounter}
                onChange={(e) =>
                  setForm((f) => ({ ...f, styleCounter: e.target.value }))
                }
              />
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
