import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { createTailor, getTailors, type Tailor } from '@/api/tailors';

/**
 * Tailor picker for the two send-to-floor paths. Mirrors {@link CollectionPicker}:
 * "+ Add a tailor" opens a small create modal prefilled with whatever was typed,
 * POSTs `/api/tailors`, then selects the new row.
 *
 * The modal is the point — a lot can't reach the floor without a tailor, and the
 * list starts empty, so creating one has to work from a blank search box.
 *
 * Loads its own list. Callers render it inside an open Dialog, which unmounts
 * its children on close, so the fetch happens when the picker is actually shown.
 */
export default function TailorPicker({
  value,
  onChange,
  disabled,
  invalid,
  placeholder,
  ariaLabel,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  /** Flags the control invalid (required-but-empty). */
  invalid?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [tailors, setTailors] = useState<Tailor[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', shortCode: '' });
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getTailors()
      .then((rows) => {
        if (!cancelled) setTailors(rows);
      })
      .catch(() => {
        // Say so. Swallowing this rendered a REQUIRED picker as an empty list,
        // indistinguishable from "no tailors exist yet" — so the natural next
        // move is to add a tailor who is already on file.
        if (!cancelled) {
          toast.show(
            t('admin.production.tailor.loadFailed', {
              defaultValue: "Couldn't load tailors. Reopen this to try again.",
            }),
            'error',
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo<ComboboxOption<number>[]>(
    () =>
      tailors.map((tl) => ({
        value: tl.id,
        label: tl.name,
        sublabel: tl.shortCode,
        searchText: `${tl.name} ${tl.shortCode}`,
      })),
    [tailors],
  );

  const submit = async () => {
    const name = form.name.trim();
    const shortCode = form.shortCode.trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = await createTailor(name, shortCode || undefined);
      setTailors((prev) =>
        [...prev.filter((x) => x.id !== created.id), created].sort((a, z) =>
          a.name.localeCompare(z.name),
        ),
      );
      onChange(created.id);
      setModalOpen(false);
      setForm({ name: '', shortCode: '' });
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })?.response?.data
          ?.message ??
        t('admin.production.tailor.createFailed', { defaultValue: "Couldn't add that tailor." });
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
        onChange={onChange}
        onAddNew={(typed) => {
          setForm({ name: typed.trim(), shortCode: '' });
          setModalOpen(true);
        }}
        addNewLabel={t('admin.production.tailor.addNew', { defaultValue: 'Add a tailor' })}
        placeholder={
          placeholder ??
          t('admin.production.tailor.placeholder', { defaultValue: 'Who is cutting this lot?' })
        }
        disabled={disabled}
        className={invalid ? 'border-[var(--color-destructive)]' : undefined}
        ariaLabel={ariaLabel ?? t('admin.production.tailor.label', { defaultValue: 'Tailor' })}
      />

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('admin.production.tailor.newTitle', { defaultValue: 'New tailor' })}
        initialFocusRef={nameRef}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              size="sm"
              disabled={saving || !form.name.trim()}
              onClick={() => void submit()}
            >
              {saving
                ? t('common.saving', { defaultValue: 'Saving…' })
                : t('common.create', { defaultValue: 'Create' })}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>{t('admin.production.tailor.name', { defaultValue: 'Name *' })}</Label>
            <Input
              ref={nameRef}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Rajesh Kumar"
              maxLength={100}
            />
          </div>
          <div>
            <Label>
              {t('admin.production.tailor.shortCode', { defaultValue: 'Short code (optional)' })}
            </Label>
            <Input
              value={form.shortCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, shortCode: e.target.value.toUpperCase().slice(0, 10) }))
              }
              placeholder="e.g. RAJ"
              maxLength={10}
            />
            {/* Worth stating once: this is permanent — it is minted into the lot
                number of every lot this tailor ever takes. */}
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
              {t('admin.production.tailor.shortCodeHelp', {
                defaultValue:
                  'Goes into every lot number for this tailor (1001-RAJ). Left blank, it is derived from the name.',
              })}
            </p>
          </div>
        </div>
      </Dialog>
    </>
  );
}
