import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { createFabric, patchFabric } from '@/api/styles';
import type { Fabric, FabricUnitOfMeasure } from '@/api/types';
import { cn } from '@/lib/utils';

const UOM_SHORT: Record<FabricUnitOfMeasure, string> = {
  meter: 'm',
  kg: 'kg',
  oz: 'oz',
};

/** A composition row in the editor — strings while editing. */
export interface CompRow {
  fibre: string;
  percent: string;
}

/** Title-Case a fibre name (mirrors backend normalisation). */
function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  /** When set with a real `id`, the form is in edit mode (PATCHes on
   *  save). Pass null / undefined / an object without an id for create
   *  mode — use `initialName` to prefill in that case. */
  editing?: Fabric | null;
  /** Optional name prefill for create mode (e.g. the typed search term
   *  in the intake's "+ Add fabric" picker). Ignored when `editing`
   *  is set with a real id. */
  initialName?: string;
  /** Optional UoM prefill for create mode. Intake quick-add defaults
   *  to 'meter' so the most common path is one fewer click; Library
   *  leaves it blank to force an explicit choice. */
  initialUnitOfMeasure?: FabricUnitOfMeasure;
  /** Trim trailing whitespace from `notes` on submit. Intake quick-add
   *  needs this so paste-and-go doesn't store whitespace; Library
   *  preserves user input verbatim. */
  trimNotes?: boolean;
  /** Called after a successful create or patch. */
  onSaved: (fabric: Fabric) => void;
  /** Called when the user hits Cancel. */
  onCancel: () => void;
  /** Toast on success. Defaults to localised "Updated." / "Added." */
  successMessage?: string;
}

/**
 * Single fabric editor form — used by both the Fabric Library page and
 * the intake's FabricPicker "+ Add fabric" picker. Captures every
 * field the BE accepts (name, count, construction, gsm, cuttableWidth,
 * unitOfMeasure, pricePerUnit, notes) plus a composition row editor
 * that validates against the sum-to-100 rule.
 *
 * The form manages its own state and call the relevant API
 * (`createFabric` / `patchFabric`); the caller only provides the
 * onSaved + onCancel handlers. Wrap in a Dialog at the call site.
 */
export default function FabricEditorForm({
  editing,
  initialName,
  initialUnitOfMeasure,
  trimNotes,
  onSaved,
  onCancel,
  successMessage,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  // Edit mode is determined by `editing.id` being a real positive
  // number — NOT by `editing` truthiness. Callers may pass a partial
  // `Fabric`-shaped object for prefill in create mode; we only PATCH
  // when an actual id is present.
  const isEditing = editing?.id != null && editing.id > 0;

  const [form, setForm] = useState(() => ({
    name: editing?.name ?? initialName ?? '',
    pricePerUnit: editing?.pricePerUnit ?? '',
    notes: editing?.notes ?? '',
    count: editing?.count ?? '',
    construction: editing?.construction ?? '',
    gsm: editing?.gsm != null ? String(editing.gsm) : '',
    cuttableWidth:
      editing?.cuttableWidth != null ? String(editing.cuttableWidth) : '',
    unitOfMeasure: (editing?.unitOfMeasure ?? initialUnitOfMeasure ?? '') as
      | ''
      | FabricUnitOfMeasure,
  }));

  const [comp, setComp] = useState<CompRow[]>(
    () =>
      editing?.compositions?.map((c) => ({
        fibre: c.fibre,
        percent: String(c.percent),
      })) ?? [],
  );

  const [saving, setSaving] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  // ── Composition helpers (sum, valid, mutators) ─────────────────
  const compSum = useMemo(
    () =>
      comp.reduce((acc, r) => {
        const n = Number(r.percent);
        return acc + (Number.isNaN(n) ? 0 : n);
      }, 0),
    [comp],
  );
  const compValid = comp.length === 0 || Math.abs(compSum - 100) <= 0.01;

  const addRow = () => setComp((c) => [...c, { fibre: '', percent: '' }]);
  const addOtherRow = () => {
    // "Other" = unaccounted-content fibre. Percent auto-set to the
    // remainder so the user can always land exactly at 100%.
    const remainder = Math.round((100 - compSum) * 100) / 100;
    setComp((c) => [
      ...c,
      { fibre: 'Other', percent: remainder > 0 ? String(remainder) : '' },
    ]);
  };
  const removeRow = (i: number) =>
    setComp((c) => c.filter((_, idx) => idx !== i));
  const patchRow = (i: number, patch: Partial<CompRow>) =>
    setComp((c) => c.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const hasOtherRow = comp.some(
    (r) => r.fibre.trim().toLowerCase() === 'other',
  );

  const submit = async () => {
    if (!form.name.trim()) return;

    // Composition validation — mirror the backend 400 so the user
    // gets a sensible error before the round-trip.
    if (comp.length > 0) {
      if (comp.some((r) => !r.fibre.trim())) {
        setCompError(t('admin.fabricLibrary.comp.errEmptyFibre'));
        return;
      }
      const norm = comp.map((r) => titleCase(r.fibre));
      if (new Set(norm).size !== norm.length) {
        setCompError(t('admin.fabricLibrary.comp.errDuplicate'));
        return;
      }
      if (!compValid) {
        setCompError(
          t('admin.fabricLibrary.comp.errSum', {
            sum: compSum.toFixed(2),
          }),
        );
        return;
      }
    }
    setCompError(null);

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        pricePerUnit: form.pricePerUnit || null,
        notes: (trimNotes ? form.notes.trim() : form.notes) || null,
        count: form.count.trim() || null,
        construction: form.construction.trim() || null,
        gsm: form.gsm ? Number(form.gsm) : null,
        cuttableWidth: form.cuttableWidth || null,
        unitOfMeasure: form.unitOfMeasure || null,
        compositions: comp.map((r) => ({
          fibre: r.fibre.trim(),
          percent: Number(r.percent),
        })),
      };
      const saved = isEditing
        ? await patchFabric(editing!.id, payload)
        : await createFabric(payload);
      toast.show(
        successMessage ??
          (isEditing
            ? t('admin.fabricLibrary.updatedToast', { defaultValue: 'Updated.' })
            : t('admin.fabricLibrary.addedToast', { defaultValue: 'Added.' })),
        'success',
      );
      onSaved(saved);
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ??
        t('admin.fabricLibrary.addError', {
          defaultValue: 'Could not save fabric.',
        });
      toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <Label>{t('admin.fabricLibrary.form.name')} *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>{t('admin.fabricLibrary.form.count')}</Label>
          <Input
            value={form.count}
            onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
            placeholder="e.g. 30s × 30s"
          />
        </div>
        <div>
          <Label>{t('admin.fabricLibrary.form.construction')}</Label>
          <Input
            value={form.construction}
            onChange={(e) =>
              setForm((f) => ({ ...f, construction: e.target.value }))
            }
            placeholder="e.g. Twill 2/1"
          />
        </div>
        <div>
          <Label>{t('admin.fabricLibrary.form.gsm')}</Label>
          <Input
            type="number"
            min={0}
            value={form.gsm}
            onChange={(e) => setForm((f) => ({ ...f, gsm: e.target.value }))}
          />
        </div>
        <div>
          <Label>{t('admin.fabricLibrary.form.cuttableWidth')}</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.cuttableWidth}
            onChange={(e) =>
              setForm((f) => ({ ...f, cuttableWidth: e.target.value }))
            }
          />
        </div>
        <div>
          <Label>{t('admin.fabricLibrary.form.unitOfMeasure')}</Label>
          <Select
            value={form.unitOfMeasure}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                unitOfMeasure: e.target.value as '' | FabricUnitOfMeasure,
              }))
            }
          >
            <option value="">—</option>
            <option value="meter">{t('admin.fabricLibrary.uom.meter')}</option>
            <option value="kg">{t('admin.fabricLibrary.uom.kg')}</option>
            <option value="oz">{t('admin.fabricLibrary.uom.oz')}</option>
          </Select>
        </div>
        <div>
          <Label>
            {t('admin.fabricLibrary.form.pricePerUnit')}
            {form.unitOfMeasure
              ? ` (₹ / ${UOM_SHORT[form.unitOfMeasure]})`
              : ' (₹)'}
          </Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.pricePerUnit}
            onChange={(e) =>
              setForm((f) => ({ ...f, pricePerUnit: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Composition editor — sum-to-100 validator */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-sm)] p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="mb-0">{t('admin.fabricLibrary.comp.title')}</Label>
          <span
            className={cn(
              'text-xs tabular-nums font-medium',
              comp.length === 0
                ? 'text-[var(--color-muted-foreground)]'
                : compValid
                  ? 'text-[var(--color-success,#16a34a)]'
                  : 'text-[var(--color-destructive)]',
            )}
          >
            {comp.length === 0
              ? t('admin.fabricLibrary.comp.unknown')
              : t('admin.fabricLibrary.comp.sumIndicator', {
                  sum: compSum.toFixed(2),
                })}
          </span>
        </div>

        {comp.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              className="h-8 text-[13px] flex-1"
              placeholder={t('admin.fabricLibrary.comp.fibrePlaceholder')}
              value={row.fibre}
              onChange={(e) => patchRow(i, { fibre: e.target.value })}
            />
            <div className="relative w-[96px]">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="h-8 text-[13px] pr-6"
                placeholder="%"
                value={row.percent}
                onChange={(e) => patchRow(i, { percent: e.target.value })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted-foreground)]">
                %
              </span>
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)] p-1"
              aria-label={t('admin.fabricLibrary.comp.remove')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus size={13} />
            <span className="ml-1">
              {t('admin.fabricLibrary.comp.addFibre')}
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={addOtherRow}
            disabled={hasOtherRow || compSum >= 100}
            title={t('admin.fabricLibrary.comp.addOtherHint')}
          >
            <Plus size={13} />
            <span className="ml-1">{t('admin.fabricLibrary.comp.addOther')}</span>
          </Button>
        </div>

        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          {t('admin.fabricLibrary.comp.help')}
        </p>
        {compError && (
          <p className="text-xs text-[var(--color-destructive)]">{compError}</p>
        )}
      </div>

      <div>
        <Label>{t('admin.fabricLibrary.form.notes')}</Label>
        <Input
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button
          size="sm"
          disabled={saving || !form.name.trim() || !compValid}
          onClick={() => void submit()}
        >
          {saving
            ? t('common.saving', { defaultValue: 'Saving…' })
            : isEditing
              ? t('common.save')
              : t('common.create')}
        </Button>
      </div>
    </div>
  );
}
