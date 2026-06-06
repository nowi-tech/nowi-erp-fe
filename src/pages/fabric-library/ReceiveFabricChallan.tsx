import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import FabricPicker from '@/components/styles/intake/FabricPicker';
import { listFabrics } from '@/api/styles';
import { createFabricChallan } from '@/api/fabricChallans';
import type { Fabric, FabricUnitOfMeasure } from '@/api/types';

const UOM_SHORT: Record<FabricUnitOfMeasure, string> = {
  meter: 'm',
  kg: 'kg',
  oz: 'oz',
};

/** A single editable challan line. `key` is a stable local id for React. */
interface LineRow {
  key: number;
  fabricId: number | null;
  fabricColourId: number | null;
  quantity: string;
}

const emptyLine = (key: number): LineRow => ({
  key,
  fabricId: null,
  fabricColourId: null,
  quantity: '',
});

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * "Receive fabric" — records one supplier challan as a header plus N receipt
 * lines. Each line is the shared `FabricPicker` (pick existing fabric+colour
 * or create one inline) with its own quantity. Submitting writes a positive
 * receipt to every fabric's stock ledger, grouped under the new challan.
 */
export default function ReceiveFabricChallan() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [header, setHeader] = useState({
    challanNo: '',
    challanDate: todayIso(),
    supplier: '',
    note: '',
  });
  const nextKey = useRef(2);
  const [lines, setLines] = useState<LineRow[]>([emptyLine(1)]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void listFabrics().then((rows) => {
      if (alive) setFabrics(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const fabricById = useMemo(
    () => new Map(fabrics.map((f) => [f.id, f])),
    [fabrics],
  );

  const addLine = () => {
    setLines((ls) => [...ls, emptyLine(nextKey.current++)]);
  };
  const removeLine = (key: number) => {
    setLines((ls) => (ls.length <= 1 ? ls : ls.filter((l) => l.key !== key)));
  };
  const patchLine = (key: number, patch: Partial<LineRow>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  // A line is complete when it names a fabric and a positive quantity. The
  // FabricPicker guarantees the colour is set whenever the fabric stocks one.
  const lineReady = (l: LineRow) =>
    l.fabricId != null && Number(l.quantity) > 0;

  const headerReady =
    header.challanNo.trim() !== '' &&
    header.challanDate !== '' &&
    header.supplier.trim() !== '';

  const canSubmit = headerReady && lines.every(lineReady) && !saving;

  const uomFor = (fabricId: number | null): string => {
    const f = fabricId != null ? fabricById.get(fabricId) : undefined;
    return f?.unitOfMeasure ? UOM_SHORT[f.unitOfMeasure] : '';
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await createFabricChallan({
        challanNo: header.challanNo.trim(),
        challanDate: header.challanDate,
        supplier: header.supplier.trim(),
        note: header.note.trim() || null,
        lines: lines.map((l) => ({
          fabricId: l.fabricId as number,
          fabricColourId: l.fabricColourId,
          quantity: Number(l.quantity),
        })),
      });
      toast.show(
        t('admin.fabricChallan.savedToast', {
          defaultValue: 'Challan recorded — stock updated.',
        }),
      );
      navigate('/fabric-library');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        t('admin.fabricChallan.saveError', {
          defaultValue: 'Could not record the challan.',
        });
      toast.show(Array.isArray(msg) ? msg.join(' ') : String(msg), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <button
        type="button"
        onClick={() => navigate('/fabric-library')}
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft size={15} />
        {t('admin.fabricChallan.back', { defaultValue: 'Back to Fabric Library' })}
      </button>

      <div>
        <h1 className="font-serif text-2xl text-[var(--color-primary)]">
          {t('admin.fabricChallan.title', { defaultValue: 'Receive fabric' })}
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          {t('admin.fabricChallan.subtitle', {
            defaultValue:
              'Record a supplier challan. Each line adds stock to that fabric.',
          })}
        </p>
      </div>

      {/* ── Challan header ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="challanNo">
            {t('admin.fabricChallan.challanNo', { defaultValue: 'Challan no.' })}
          </Label>
          <Input
            id="challanNo"
            autoFocus
            value={header.challanNo}
            onChange={(e) =>
              setHeader((h) => ({ ...h, challanNo: e.target.value }))
            }
            placeholder="13428"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="challanDate">
            {t('admin.fabricChallan.challanDate', { defaultValue: 'Challan date' })}
          </Label>
          <Input
            id="challanDate"
            type="date"
            value={header.challanDate}
            onChange={(e) =>
              setHeader((h) => ({ ...h, challanDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supplier">
            {t('admin.fabricChallan.supplier', { defaultValue: 'Supplier' })}
          </Label>
          <Input
            id="supplier"
            value={header.supplier}
            onChange={(e) =>
              setHeader((h) => ({ ...h, supplier: e.target.value }))
            }
            placeholder="Kotty Lifestyle Pvt. Ltd."
          />
        </div>
      </div>

      {/* ── Lines ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-[var(--color-foreground)]">
            {t('admin.fabricChallan.lines', { defaultValue: 'Fabrics on this challan' })}
          </h2>
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus size={15} />
            <span className="ml-1">
              {t('admin.fabricChallan.addLine', { defaultValue: 'Add line' })}
            </span>
          </Button>
        </div>

        {lines.map((line, idx) => (
          <div
            key={line.key}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 flex flex-col sm:flex-row sm:items-end gap-3"
          >
            <div className="flex-1 space-y-1.5">
              <Label>
                {t('admin.fabricChallan.fabric', { defaultValue: 'Fabric' })}{' '}
                <span className="text-[var(--color-muted-foreground)]">
                  #{idx + 1}
                </span>
              </Label>
              <FabricPicker
                fabrics={fabrics}
                fabricId={line.fabricId}
                fabricColourId={line.fabricColourId}
                onChange={(choice) =>
                  patchLine(line.key, {
                    fabricId: choice?.fabricId ?? null,
                    fabricColourId: choice?.fabricColourId ?? null,
                  })
                }
                onFabricCreated={(created) =>
                  setFabrics((fs) => [...fs, created])
                }
              />
            </div>
            <div className="w-full sm:w-40 space-y-1.5">
              <Label>
                {t('admin.fabricChallan.quantity', { defaultValue: 'Quantity' })}
                {uomFor(line.fabricId) ? ` (${uomFor(line.fabricId)})` : ''}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={line.quantity}
                onChange={(e) =>
                  patchLine(line.key, { quantity: e.target.value })
                }
                placeholder="22.5"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeLine(line.key)}
              disabled={lines.length <= 1}
              aria-label={t('admin.fabricChallan.removeLine', {
                defaultValue: 'Remove line',
              })}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
      </div>

      {/* ── Optional note + submit ─────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="note">
          {t('admin.fabricChallan.note', { defaultValue: 'Note (optional)' })}
        </Label>
        <Textarea
          id="note"
          rows={2}
          value={header.note}
          onChange={(e) => setHeader((h) => ({ ...h, note: e.target.value }))}
          placeholder={t('admin.fabricChallan.notePh', {
            defaultValue: 'Transport mode, vehicle no., anything off the slip…',
          })}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" onClick={() => navigate('/fabric-library')}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button disabled={!canSubmit} onClick={() => void submit()}>
          {saving
            ? t('admin.fabricChallan.saving', { defaultValue: 'Recording…' })
            : t('admin.fabricChallan.record', { defaultValue: 'Record challan' })}
        </Button>
      </div>
    </div>
  );
}
