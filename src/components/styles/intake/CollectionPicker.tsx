import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { createCollection } from '@/api/collections';
import type { Collection } from '@/api/types';

interface Props {
  /** All known collections from the BE — may be empty before load. */
  collections: Collection[];
  /** Currently selected collection id (or null). */
  value: number | null;
  onChange: (next: number | null) => void;
  /** Called when a brand-new collection was created server-side so the
   *  parent can refresh its `collections` list. */
  onCollectionCreated?: (created: Collection) => void;
  disabled?: boolean;
  /** Flags the control invalid (required-but-empty on submit). */
  invalid?: boolean;
}

/**
 * Searchable Collection picker. Every design is tagged with a collection
 * at submission. Mirrors {@link CategoryPicker} but simpler — no gender
 * filter or seed codes; the option list is just the BE master.
 *
 * "+ Add new collection" opens a tiny inline modal (name + optional
 * code), POSTs `/api/collections`, then bubbles the new row up via
 * `onCollectionCreated` and auto-selects it.
 */
export default function CollectionPicker({
  collections,
  value,
  onChange,
  onCollectionCreated,
  disabled,
  invalid,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '' });
  const nameRef = useRef<HTMLInputElement>(null);

  const options = useMemo<ComboboxOption<number>[]>(
    () =>
      collections.map((c) => ({
        value: c.id,
        label: c.name,
        sublabel: c.code ?? undefined,
        searchText: `${c.name} ${c.code ?? ''}`,
      })),
    [collections],
  );

  const submit = async () => {
    const nameTrim = form.name.trim();
    const codeTrim = form.code.trim();
    if (!nameTrim) {
      toast.show('Name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await createCollection({
        name: nameTrim,
        code: codeTrim || null,
      });
      onCollectionCreated?.(created);
      onChange(created.id);
      toast.show('Collection added.', 'success');
      setModalOpen(false);
      setForm({ name: '', code: '' });
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'Could not create collection.';
      toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Combobox<number>
        value={value}
        options={options}
        onChange={(next) => onChange(next)}
        onAddNew={(typed) => {
          setForm({ name: typed.trim(), code: '' });
          setModalOpen(true);
        }}
        addNewLabel={t(
          'admin.styles.intake.addNewCollection',
          'Add new collection',
        )}
        placeholder={t(
          'admin.styles.intake.collectionPh',
          'Choose a collection',
        )}
        disabled={disabled}
        className={invalid ? 'border-[var(--color-destructive)]' : undefined}
        ariaLabel={t('admin.styles.intake.collection', 'Collection')}
      />

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('admin.styles.intake.newCollectionTitle', 'New collection')}
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
            <Button
              size="sm"
              disabled={saving || !form.name.trim()}
              onClick={() => void submit()}
            >
              {saving ? t('common.saving') : t('common.create', 'Create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--color-muted-foreground)]">
            {t(
              'admin.styles.intake.newCollectionHelp',
              'Adds a row to the Collection master (e.g. a seasonal drop).',
            )}
          </p>
          <div>
            <Label>{t('admin.styles.intake.collectionName', 'Name *')}</Label>
            <Input
              ref={nameRef}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Summer '26"
            />
          </div>
          <div>
            <Label>
              {t('admin.styles.intake.collectionCode', 'Code (optional)')}
            </Label>
            <Input
              value={form.code}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  code: e.target.value.slice(0, 40),
                }))
              }
              placeholder="e.g. SUM26"
              maxLength={40}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}
