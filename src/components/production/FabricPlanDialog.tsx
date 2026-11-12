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
 * for the whole lot. Shows the red / yellow / green check as you type.
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
  const [estimate, setEstimate] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!lot) return;
    let alive = true;
    setLoaded(false);
    setFabricId(null);
    setFabricColourId(null);
    setEstimate(lot.fabric?.fabricEstimate != null ? String(lot.fabric.fabricEstimate) : '');
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
      const perPiece = defaults?.fabricPerPiece;
      if (perPiece != null) {
        const planned = lot.sizes.reduce((s, l) => s + l.qtyPlanned, 0);
        setEstimate((e) => e || String(Math.round(perPiece * planned * 100) / 100));
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
  const needed = Number(estimate) || 0;

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
        fabricEstimate: estimate === '' ? null : Math.round(Number(estimate) * 100) / 100,
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

        <div>
          <label htmlFor="fabric-estimate" className="mb-1 block text-xs font-medium">
            {t('admin.production.fabricPlan.estimate', { defaultValue: 'Estimated fabric' })}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="fabric-estimate"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="h-9 w-32 text-sm font-semibold"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
            />
            <span className="text-sm">{uom}</span>
          </div>
        </div>

        {preview && <FabricCheckText check={preview} unit={fabric?.unitOfMeasure ?? null} />}
      </div>
    </Dialog>
  );
}
