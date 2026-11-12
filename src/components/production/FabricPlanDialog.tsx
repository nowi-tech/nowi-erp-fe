import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { listFabrics } from '@/api/styles';
import {
  getFabricDefaults,
  setFabricPlan,
  type FabricPlanCheck,
  type ProductionBatch,
} from '@/api/production';
import type { Fabric } from '@/api/types';
import { fmtQty, UOM_SHORT } from '@/lib/fabric';
import FabricCheckText from './FabricCheckText';

// ponytail: preview uses the default; the saved lot shows the server check, which reads the setting.
const PREVIEW_LOW_PERCENT = 20;

/**
 * A lot's fabric: which fabric colour it's cut from and the estimated fabric
 * per piece for each size. Shows the red / yellow / green check as you type.
 */
export default function FabricPlanDialog({
  lot,
  onClose,
  onSaved,
}: {
  lot: ProductionBatch | null;
  onClose: () => void;
  onSaved: (updated: ProductionBatch) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [fabricId, setFabricId] = useState<number | null>(null);
  const [fabricColourId, setFabricColourId] = useState<number | null>(null);
  const [perPiece, setPerPiece] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!lot) return;
    let alive = true;
    setLoaded(false);
    setFabricId(null);
    setFabricColourId(null);
    setPerPiece(
      Object.fromEntries(lot.sizes.map((s) => [s.sku, s.fabricPerPiece != null ? String(s.fabricPerPiece) : ''])),
    );
    void Promise.all([
      listFabrics(),
      // A lot with no plan yet starts from the last lot of the same style.
      lot.fabric ? Promise.resolve(null) : getFabricDefaults({ styleId: lot.styleId, styleKey: lot.styleKey }).catch(() => null),
    ])
      .then(([fs, defaults]) => {
      if (!alive) return;
      setFabrics(fs);
      const fcId = lot.fabric?.fabricColourId ?? defaults?.fabricColourId ?? null;
      setFabricColourId(fcId);
      setFabricId(fs.find((f) => f.colours?.some((c) => c.id === fcId))?.id ?? null);
      if (defaults) {
        setPerPiece((p) =>
          Object.fromEntries(
            lot.sizes.map((s) => [s.sku, p[s.sku] || (defaults.perPieceBySize[s.size] != null ? String(defaults.perPieceBySize[s.size]) : '')]),
          ),
        );
      }
      setLoaded(true);
      })
      .catch(() => {
        if (alive) toast.show(t('admin.production.fabricPlan.loadError', { defaultValue: 'Could not load fabrics.' }), 'error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot]);

  const fabric = fabrics.find((f) => f.id === fabricId);
  const colour = fabric?.colours?.find((c) => c.id === fabricColourId);
  const uom = fabric?.unitOfMeasure ? UOM_SHORT[fabric.unitOfMeasure] : '';
  const needed = useMemo(
    () =>
      Math.round(
        (lot?.sizes ?? []).reduce((s, l) => s + l.qtyPlanned * (Number(perPiece[l.sku]) || 0), 0) * 100,
      ) / 100,
    [lot, perPiece],
  );

  // Same rule as the server: free = stock less what OTHER planning lots hold.
  const preview: FabricPlanCheck | null = useMemo(() => {
    if (!colour || needed <= 0) return null;
    const ownHold = lot?.fabric?.fabricColourId === colour.id && lot.status === 'planning' ? lot.fabric.needed : 0;
    const free = (colour.availableQuantity ?? 0) - ((colour.heldQuantity ?? 0) - ownHold);
    const left = free - needed;
    return {
      state: left < 0 ? 'short' : left < (needed * PREVIEW_LOW_PERCENT) / 100 ? 'low' : 'enough',
      needed,
      stock: colour.availableQuantity ?? 0,
      free,
      onOrder: colour.onOrderQuantity ?? 0,
      nextExpectedDate: colour.nextExpectedDate ?? null,
    };
  }, [colour, needed, lot]);

  if (!lot) return null;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await setFabricPlan(lot.id, {
        fabricColourId,
        items: lot.sizes.map((s) => ({
          sku: s.sku,
          fabricPerPiece: perPiece[s.sku] === '' || perPiece[s.sku] == null ? null : Number(perPiece[s.sku]),
        })),
      });
      onSaved(updated);
    } catch (e) {
      toast.show(apiErrorMessage(e) ?? t('common.saveError', 'Could not save.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={lot != null}
      onClose={onClose}
      maxWidthClassName="max-w-xl"
      title={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {t('admin.production.fabricPlan.title', { defaultValue: 'Fabric' })}
          </div>
          <div className="truncate text-base font-semibold">{lot.name ?? lot.styleRef ?? lot.batchNo}</div>
          <div className="truncate font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">{lot.batchNo}</div>
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" disabled={saving || !loaded || fabricColourId == null} onClick={() => void save()}>
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium">{t('admin.fabricOrders.fabric', { defaultValue: 'Fabric' })}</label>
            <Combobox
              value={fabricId}
              options={fabrics
                .filter((f) => (f.colours?.length ?? 0) > 0)
                .map((f) => ({ value: f.id, label: f.name, sublabel: f.code ?? undefined }))}
              onChange={(id) => {
                const f = fabrics.find((x) => x.id === id);
                setFabricId((id as number) ?? null);
                setFabricColourId(f?.colours?.length === 1 ? f.colours[0].id : null);
              }}
              placeholder={t('admin.fabricChallan.fabricPh', { defaultValue: 'Choose a fabric…' })}
              ariaLabel={t('admin.fabricOrders.fabric', { defaultValue: 'Fabric' })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">{t('admin.fabricOrders.colour', { defaultValue: 'Colour' })}</label>
            <Combobox
              value={fabricColourId}
              options={(fabric?.colours ?? []).map((c) => ({
                value: c.id,
                label: c.name,
                sublabel: t('admin.fabric.inStock', {
                  defaultValue: '{{qty}} in stock',
                  qty: fmtQty(c.availableQuantity ?? 0, fabric?.unitOfMeasure),
                }),
              }))}
              onChange={(id) => setFabricColourId((id as number) ?? null)}
              disabled={!fabric}
              placeholder={t('admin.fabricChallan.colourPh', { defaultValue: 'Choose a colour…' })}
              ariaLabel={t('admin.fabricOrders.colour', { defaultValue: 'Colour' })}
            />
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <th className="py-2 pr-3 text-left font-semibold">{t('admin.production.size', { defaultValue: 'Size' })}</th>
              <th className="py-2 pr-3 text-right font-semibold">{t('admin.production.planned', { defaultValue: 'Planned' })}</th>
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.fabricPlan.perPiece', { defaultValue: 'Fabric / piece' })}
                {uom ? ` (${uom})` : ''}
              </th>
              <th className="py-2 pr-3 text-right font-semibold">{t('admin.production.fabricPlan.fabric', { defaultValue: 'Fabric' })}</th>
            </tr>
          </thead>
          <tbody>
            {lot.sizes.map((s) => (
              <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                <td className="py-2 pr-3 font-semibold">{s.size}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.qtyPlanned}</td>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className="h-9 w-24 text-center text-sm font-semibold"
                    value={perPiece[s.sku] ?? ''}
                    onChange={(e) => setPerPiece((p) => ({ ...p, [s.sku]: e.target.value }))}
                    aria-label={t('admin.production.fabricPlan.perPieceFor', {
                      defaultValue: 'Fabric per piece for size {{size}}',
                      size: s.size,
                    })}
                  />
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {fmtQty(s.qtyPlanned * (Number(perPiece[s.sku]) || 0), fabric?.unitOfMeasure)}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="py-2 pr-3 text-right text-xs font-semibold uppercase text-[var(--color-muted-foreground)]">
                {t('admin.production.fabricPlan.total', { defaultValue: 'Total' })}
              </td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums">{fmtQty(needed, fabric?.unitOfMeasure)}</td>
            </tr>
          </tbody>
        </table>

        {preview && <FabricCheckText check={preview} unit={fabric?.unitOfMeasure ?? null} />}
      </div>
    </Dialog>
  );
}
