import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { listVendorOptions, type VendorOption } from '@/api/vendors';
import { createFabricChallan, getLastIssueVendor } from '@/api/fabricChallans';
import { getBatches, type ProductionBatch } from '@/api/production';
import { listSampleStyles, type SampleStyleOption } from '@/api/styles';
import { useSignedUrls } from '@/hooks/useSignedUrls';
import type { Fabric, FabricIssuePurpose } from '@/api/types';
import { useAuth } from '@/context/auth';
import { hasAnyRole, PRODUCTION_BOARD_READ_ROLES, STYLE_VIEW_ROLES } from '@/lib/userRoles';
import { fmtQty, PURPOSE_LABEL, UOM_SHORT } from '@/lib/fabric';
import { statusLabel } from '@/lib/production';
import { todayISO } from '@/lib/date';

interface Line {
  key: number;
  fabricId: number | null;
  fabricColourId: number | null;
  quantity: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  fabrics: Fabric[];
  /** Prefill a fabric colour. */
  preset?: { fabricId?: number; fabricColourId?: number };
}

// vendor_return is written only from a receipt line's Send back.
const PURPOSES = ['production', 'sample', 'wastage', 'other'] as const;

/**
 * Issue slip: fabric leaving the store to a factory, for a lot, a sample, or
 * as wastage. Several fabric lines go out on one slip; the server numbers it
 * (`ISS-00001`) and refuses any line the colour can't cover.
 */
export default function IssueSlipDialog({ open, onClose, onSaved, fabrics, preset }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const nextKey = useRef(2);
  const { user } = useAuth();
  // Lots live on the production board — offer them only to roles that can read it.
  const canPickLot = hasAnyRole(user, PRODUCTION_BOARD_READ_ROLES);
  const canOpenStyle = hasAnyRole(user, STYLE_VIEW_ROLES);
  const purposes = PURPOSES.filter((p) => p !== 'production' || canPickLot);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<FabricIssuePurpose>('production');
  const [lot, setLot] = useState<ProductionBatch | null>(null);
  const [lots, setLots] = useState<ProductionBatch[]>([]);
  const [lotQuery, setLotQuery] = useState('');
  const [style, setStyle] = useState<SampleStyleOption | null>(null);
  const [styles, setStyles] = useState<SampleStyleOption[]>([]);
  const [styleQuery, setStyleQuery] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const loadError = () =>
      toast.show(t('admin.issueSlip.loadError', { defaultValue: 'Could not load the lists. Reload to try again.' }), 'error');
    void listVendorOptions().then(setVendors).catch(loadError);
    const f = fabrics.find((x) => x.id === preset?.fabricId);
    setLines([
      {
        key: 1,
        fabricId: preset?.fabricId ?? null,
        fabricColourId:
          preset?.fabricColourId ?? (f?.colours?.length === 1 ? f.colours[0].id : null),
        quantity: '',
      },
    ]);
    setVendorId(null);
    setPurpose(canPickLot ? 'production' : 'sample');
    setLot(null);
    setStyle(null);
    setNote('');
    // From a colour row: the factory this colour last went to.
    if (preset?.fabricColourId != null) {
      void getLastIssueVendor({ fabricColourId: preset.fabricColourId })
        .then((r) => {
          if (r.vendorId != null) setVendorId((v) => v ?? r.vendorId);
        })
        .catch(() => undefined);
    }
    // `fabrics`, `t`, `toast` are read once on open; preset fields are primitives on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset?.fabricId, preset?.fabricColourId]);

  /** Picking a lot fills its fabric, what it still needs, and the factory it last went to — only where blank. */
  const chooseLot = (b: ProductionBatch | null) => {
    setLot(b);
    if (!b) return;
    if (b.fabric) {
      const f = b.fabric;
      const need = Math.max(0, Math.round((f.needed - f.issued) * 100) / 100);
      setLines((ls) =>
        ls.map((l, i) =>
          i === 0 && l.fabricColourId == null
            ? { ...l, fabricId: f.fabricId, fabricColourId: f.fabricColourId, quantity: need > 0 ? String(need) : '' }
            : l,
        ),
      );
    }
    void getLastIssueVendor({ productionBatchId: b.id })
      .then((r) => {
        if (r.vendorId != null) setVendorId((v) => v ?? r.vendorId);
      })
      .catch(() => undefined);
  };

  // Open lots only: still planning, or on the floor.
  useEffect(() => {
    if (!open || purpose !== 'production') return;
    let alive = true;
    const search = lotQuery.trim() || undefined;
    void Promise.all([
      getBatches({ tab: 'planning', search, take: 20 }),
      getBatches({ tab: 'in_production', search, take: 20 }),
    ])
      .then(([a, b]) => {
        if (alive) setLots([...a.rows, ...b.rows]);
      })
      .catch(() => {
        if (alive) toast.show(t('admin.issueSlip.loadError', { defaultValue: 'Could not load the lists. Reload to try again.' }), 'error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purpose, lotQuery]);

  useEffect(() => {
    if (!open || purpose !== 'sample') return;
    let alive = true;
    void listSampleStyles(styleQuery.trim() || undefined)
      .then((r) => {
        if (alive) setStyles(r);
      })
      .catch(() => {
        if (alive) toast.show(t('admin.issueSlip.loadError', { defaultValue: 'Could not load the lists. Reload to try again.' }), 'error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purpose, styleQuery]);

  const styleImages = useSignedUrls(styles.map((s) => s.imagePath));

  const fabricById = useMemo(() => new Map(fabrics.map((f) => [f.id, f])), [fabrics]);
  const patch = (key: number, p: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  // Lots cut from the first line's colour come first.
  const firstColour = lines[0]?.fabricColourId ?? null;
  const lotOptions = [...lots]
    .sort(
      (a, b) =>
        Number(b.fabric?.fabricColourId === firstColour) - Number(a.fabric?.fabricColourId === firstColour),
    )
    .map((b) => ({
      value: b.id,
      label: [b.batchNo, b.styleRef, b.colourName ?? b.fabric?.colourName].filter(Boolean).join(' · '),
      sublabel: b.fabric
        ? t('admin.issueSlip.lotFabric', {
            defaultValue: '{{fabric}} {{colour}} · needs {{needed}} · issued {{issued}}',
            fabric: b.fabric.fabricName,
            colour: b.fabric.colourName,
            needed: fmtQty(b.fabric.needed, b.fabric.unit),
            issued: fmtQty(b.fabric.issued, b.fabric.unit),
          })
        : undefined,
      leading: b.imageUrl ? (
        <img src={b.imageUrl} alt="" className="h-8 w-8 rounded object-cover border border-[var(--color-border)]" />
      ) : undefined,
      trailing: (
        <span className="text-[10px] uppercase text-[var(--color-muted-foreground)]">{statusLabel(t, b.status)}</span>
      ),
      searchText: `${b.batchNo} ${b.styleRef ?? ''} ${b.name ?? ''}`,
    }));

  const styleOptions = styles.map((s) => {
    const path = s.imagePath;
    return {
      value: s.id,
      label: s.styleId ?? s.workingName ?? `#${s.id}`,
      sublabel: s.workingName ?? undefined,
      leading:
        path && styleImages[path] ? (
          <img src={styleImages[path]} alt="" className="h-8 w-8 rounded object-cover border border-[var(--color-border)]" />
        ) : undefined,
      searchText: `${s.styleId ?? ''} ${s.workingName ?? ''}`,
    };
  });

  // Factories first — they're who fabric is usually issued to.
  const vendorOptions = [...vendors]
    .sort((a, b) => Number(!!b.isFactory) - Number(!!a.isFactory) || a.name.localeCompare(b.name))
    .map((v) => ({ value: v.id, label: v.name }));

  const lineReady = (l: Line) => l.fabricColourId != null && Number(l.quantity) > 0;
  const ready =
    vendorId != null &&
    lines.length > 0 &&
    lines.every(lineReady) &&
    (purpose !== 'production' || lot != null) &&
    (purpose !== 'sample' || style != null);

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await createFabricChallan({
        direction: 'out',
        challanDate: todayISO(),
        vendorId,
        note: note.trim() || null,
        lines: lines.map((l) => ({
          fabricColourId: l.fabricColourId!,
          quantity: Number(l.quantity),
          purpose,
          productionBatchId: purpose === 'production' ? lot?.id ?? null : null,
          styleId: purpose === 'sample' ? style?.id ?? null : null,
        })),
      });
      toast.show(t('admin.issueSlip.saved', { defaultValue: 'Fabric issued — stock updated.' }));
      onSaved();
    } catch (e) {
      toast.show(
        apiErrorMessage(e) ?? t('admin.issueSlip.saveError', { defaultValue: 'Could not issue the fabric.' }),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={t('admin.issueSlip.title', { defaultValue: 'Issue fabric' })}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" disabled={!ready || saving} onClick={() => void submit()}>
            {saving ? t('common.saving', 'Saving…') : t('admin.fabricLibrary.issue')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('admin.issueSlip.issuedTo', { defaultValue: 'Issued to' })} *</Label>
            <Combobox
              value={vendorId}
              options={vendorOptions}
              onChange={(id) => setVendorId((id as number) ?? null)}
              placeholder={t('admin.issueSlip.issuedToPh', { defaultValue: 'Choose a factory…' })}
              ariaLabel={t('admin.issueSlip.issuedTo', { defaultValue: 'Issued to' })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('admin.issueSlip.purpose', { defaultValue: 'For' })}</Label>
            <Select value={purpose} onChange={(e) => setPurpose(e.target.value as FabricIssuePurpose)}>
              {purposes.map((p) => (
                <option key={p} value={p}>
                  {t(`admin.issueSlip.purposes.${p}`, { defaultValue: PURPOSE_LABEL[p] })}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {purpose === 'production' && (
          <div className="space-y-1.5">
            <Label>{t('admin.issueSlip.lot', { defaultValue: 'Lot' })} *</Label>
            <Combobox
              value={lot?.id ?? null}
              options={lotOptions}
              onChange={(id) => chooseLot(lots.find((b) => b.id === id) ?? null)}
              onQueryChange={setLotQuery}
              serverFiltered
              placeholder={t('admin.issueSlip.lotPh', { defaultValue: 'Search lot no. or style…' })}
              ariaLabel={t('admin.issueSlip.lot', { defaultValue: 'Lot' })}
            />
            {lot && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                {lot.imageUrl && (
                  <img src={lot.imageUrl} alt="" className="h-8 w-8 rounded object-cover border border-[var(--color-border)]" />
                )}
                {/* New tab — leaving would lose the half-filled slip. */}
                <a
                  href={`/admin/production/lots/${lot.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[var(--color-primary)] hover:underline"
                >
                  {lot.batchNo} <ExternalLink size={12} />
                </a>
                <span>
                  {[
                    lot.styleRef,
                    lot.colourName,
                    t('admin.issueSlip.pieces', { defaultValue: '{{n}} pcs', n: lot.qtyPlanned }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {lot.fabric
                    ? ` · ${t('admin.issueSlip.needsIssued', {
                        defaultValue: 'needs {{needed}} · issued {{issued}}',
                        needed: fmtQty(lot.fabric.needed, lot.fabric.unit),
                        issued: fmtQty(lot.fabric.issued, lot.fabric.unit),
                      })}`
                    : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {purpose === 'sample' && (
          <div className="space-y-1.5">
            <Label>{t('admin.issueSlip.style', { defaultValue: 'Style' })} *</Label>
            <Combobox
              value={style?.id ?? null}
              options={styleOptions}
              onChange={(id) => setStyle(styles.find((s) => s.id === id) ?? null)}
              onQueryChange={setStyleQuery}
              serverFiltered
              placeholder={t('admin.issueSlip.stylePh', { defaultValue: 'Search style…' })}
              ariaLabel={t('admin.issueSlip.style', { defaultValue: 'Style' })}
            />
            {style && !canOpenStyle && (
              <span className="text-xs font-medium">{style.styleId ?? style.workingName}</span>
            )}
            {style && canOpenStyle && (
              <a
                href={`/styles/${style.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
              >
                {style.styleId ?? style.workingName} <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('admin.issueSlip.lines', { defaultValue: 'Fabric going out' })}</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setLines((ls) => [...ls, { key: nextKey.current++, fabricId: null, fabricColourId: null, quantity: '' }])
              }
            >
              <Plus size={14} />
              <span className="ml-1">{t('admin.fabricChallan.addLine', { defaultValue: 'Add line' })}</span>
            </Button>
          </div>
          {lines.map((l) => {
            const f = l.fabricId != null ? fabricById.get(l.fabricId) : undefined;
            const uom = f?.unitOfMeasure ? UOM_SHORT[f.unitOfMeasure] : '';
            return (
              <div key={l.key} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Combobox
                    value={l.fabricId}
                    options={fabrics
                      .filter((x) => (x.colours?.length ?? 0) > 0)
                      .map((x) => ({ value: x.id, label: x.name, sublabel: x.code ?? undefined }))}
                    onChange={(id) => {
                      const nf = fabricById.get(id as number);
                      patch(l.key, {
                        fabricId: (id as number) ?? null,
                        fabricColourId: nf?.colours?.length === 1 ? nf.colours[0].id : null,
                      });
                    }}
                    placeholder={t('admin.fabricChallan.fabricPh', { defaultValue: 'Choose a fabric…' })}
                    ariaLabel={t('admin.fabricChallan.fabric', { defaultValue: 'Fabric' })}
                  />
                </div>
                <div className="w-full sm:w-48">
                  <Combobox
                    value={l.fabricColourId}
                    options={(f?.colours ?? []).map((c) => ({
                      value: c.id,
                      label: c.name,
                      sublabel: t('admin.fabric.inStock', {
                        defaultValue: '{{qty}} in stock',
                        qty: fmtQty(c.availableQuantity ?? 0, f?.unitOfMeasure),
                      }),
                    }))}
                    onChange={(id) => patch(l.key, { fabricColourId: (id as number) ?? null })}
                    disabled={!f}
                    placeholder={t('admin.fabricChallan.colourPh', { defaultValue: 'Choose a colour…' })}
                    ariaLabel={t('admin.fabricChallan.colour', { defaultValue: 'Colour' })}
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={l.quantity}
                    onChange={(e) => patch(l.key, { quantity: e.target.value })}
                    placeholder={uom || t('admin.fabricChallan.quantity', { defaultValue: 'Quantity' })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={lines.length <= 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  aria-label={t('admin.fabricChallan.removeLine', { defaultValue: 'Remove line' })}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label>{t('admin.fabricLibrary.stock.note')}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
