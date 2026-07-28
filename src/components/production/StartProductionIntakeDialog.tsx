import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Factory, X, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import QtyTable from '@/components/production/QtyTable';
import { useToast } from '@/components/ui/toast';
import { listStyles, type Style } from '@/api/styles';
import { getStyleSizes, type CreateBatchBody } from '@/api/production';
import { getBrands, createBrand, type Brand } from '@/api/brands';

type Mode = 'existing' | 'external';

/** Common apparel size presets for external entries — one alpha row, one numeric. */
const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40'];

interface ExistingSel {
  styleId: number;
  styleRef: string | null;
  name: string | null;
  imageUrl: string | null;
  sizes: { sku: string; size: string; inFlightQty: number }[];
  alreadyInProduction: boolean;
}

/**
 * The header "Start production" intake — modelled on the intake form's
 * "relive an old style" search: one combobox finds an existing Nowi style,
 * and its "+ Add" row switches to the new-item (another brand's SKU) form,
 * carrying the typed text over as the SKU. Quantities are captured here;
 * "Add to pipeline" stages it, "Send to production" opens it on the floor.
 */
export default function StartProductionIntakeDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (body: CreateBatchBody) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('existing');

  // ── existing-style search (one page loaded once; combobox filters it) ──
  const [styles, setStyles] = useState<Style[]>([]);
  const [sel, setSel] = useState<ExistingSel | null>(null);
  const [loadingSizes, setLoadingSizes] = useState(false);

  // ── external brand ───────────────────────────────────────────────
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<number | ''>('');
  const [externalSku, setExternalSku] = useState('');
  const [extSizes, setExtSizes] = useState<Record<string, boolean>>({});

  // ── shared qty map (keyed by item sku) ───────────────────────────
  const [qty, setQty] = useState<Record<string, number>>({});

  // Reset everything when the dialog opens; load the picker's data once.
  useEffect(() => {
    if (!open) return;
    setMode('existing');
    setSel(null);
    setBrandId('');
    setExternalSku('');
    setExtSizes({});
    setQty({});
    void getBrands().then(setBrands).catch(() => undefined);
    // ponytail: load one page (BE caps take at 500) and let the Combobox filter
    // client-side — same shape as the intake "relive" picker. Ceiling = 500
    // styles; swap to a server-search-backed Combobox if the catalog outgrows it.
    void listStyles({ take: 500 })
      .then((r) => setStyles(r.data))
      .catch(() => setStyles([]));
  }, [open]);

  const styleOptions = useMemo<ComboboxOption<number>[]>(
    () =>
      styles.map((s) => {
        const img = s.referenceImages?.[0] ?? s.referenceImage ?? null;
        const label = s.styleId ?? s.workingName ?? `#${s.id}`;
        return {
          value: s.id,
          label,
          sublabel: s.workingName && s.workingName !== label ? s.workingName : undefined,
          searchText: [s.styleId, s.workingName].filter(Boolean).join(' '),
          leading: img ? (
            <img src={img} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
          ) : (
            <div className="h-7 w-7 shrink-0 rounded bg-[var(--color-muted)]" />
          ),
        };
      }),
    [styles],
  );

  const pickStyle = async (style: Style) => {
    setLoadingSizes(true);
    try {
      const s = await getStyleSizes(style.id);
      setSel({
        styleId: s.styleId,
        styleRef: s.styleRef,
        name: s.name,
        imageUrl: s.imageUrl,
        sizes: s.sizes,
        alreadyInProduction: s.alreadyInProduction,
      });
      const seeded: Record<string, number> = {};
      for (const z of s.sizes) seeded[z.sku] = 0;
      setQty(seeded);
    } catch {
      toast.show(
        t('admin.production.intake.sizesFailed', {
          defaultValue: "Couldn't load that style's sizes.",
        }),
        'error',
      );
    } finally {
      setLoadingSizes(false);
    }
  };

  // "+ Add" on the combobox → switch to the new-item form, carrying the typed
  // text over as the SKU (mirrors relive's typed-code path).
  const startExternal = (typed: string) => {
    setMode('external');
    setExternalSku(typed.trim());
    setExtSizes({});
    setQty({});
  };

  const backToPicker = () => {
    setMode('existing');
    setExternalSku('');
    setExtSizes({});
    setBrandId('');
    setQty({});
  };

  // "+ Add" inside the brand dropdown creates the typed brand and selects it.
  const addBrand = (typed: string) => {
    const name = typed.trim();
    if (!name) return;
    void createBrand(name)
      .then((b) => {
        setBrands((prev) =>
          [...prev.filter((x) => x.id !== b.id), b].sort((a, z) => a.name.localeCompare(z.name)),
        );
        setBrandId(b.id);
      })
      .catch(() =>
        toast.show(
          t('admin.production.intake.brandFailed', { defaultValue: "Couldn't add that brand." }),
          'error',
        ),
      );
  };

  const setQtyFor = (sku: string, raw: string) =>
    setQty((prev) => ({ ...prev, [sku]: Math.max(0, Number.parseInt(raw, 10) || 0) }));

  const toggleExtSize = (size: string) =>
    setExtSizes((prev) => ({ ...prev, [size]: !prev[size] }));

  const extActiveSizes = useMemo(() => SIZE_PRESETS.filter((s) => extSizes[s]), [extSizes]);
  const extSku = (size: string) => `${externalSku.trim()}-${size}`;

  const total = useMemo(() => {
    if (mode === 'existing') {
      return sel ? sel.sizes.reduce((a, z) => a + (qty[z.sku] ?? 0), 0) : 0;
    }
    return extActiveSizes.reduce((a, s) => a + (qty[extSku(s)] ?? 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sel, qty, extActiveSizes, externalSku]);

  const canSubmit =
    total > 0 &&
    (mode === 'existing'
      ? sel != null
      : brandId !== '' && externalSku.trim().length > 0 && extActiveSizes.length > 0);

  const build = (directToProduction: boolean): CreateBatchBody | null => {
    if (mode === 'existing') {
      if (!sel) return null;
      return {
        origin: 'style',
        styleId: sel.styleId,
        directToProduction,
        items: sel.sizes
          .filter((z) => (qty[z.sku] ?? 0) > 0)
          .map((z) => ({ sku: z.sku, size: z.size, qtyPlanned: qty[z.sku] ?? 0 })),
      };
    }
    if (brandId === '') return null;
    return {
      origin: 'external',
      brandId,
      externalSku: externalSku.trim(),
      directToProduction,
      items: extActiveSizes
        .filter((s) => (qty[extSku(s)] ?? 0) > 0)
        .map((s) => ({ sku: extSku(s), size: s, qtyPlanned: qty[extSku(s)] ?? 0 })),
    };
  };

  const submit = (directToProduction: boolean) => {
    const body = build(directToProduction);
    if (body) onConfirm(body);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          {t('admin.production.intake.title', { defaultValue: 'Start production' })}
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !canSubmit}
            onClick={() => submit(false)}
          >
            {t('admin.production.intake.addToPlanning', {
              defaultValue: 'Add to pipeline · {{n}}',
              n: total,
            })}
          </Button>
          <Button size="sm" disabled={busy || !canSubmit} onClick={() => submit(true)}>
            <Factory size={14} />
            <span className="ml-1">
              {t('admin.production.intake.sendDirect', {
                defaultValue: 'Send to production · {{n}}',
                n: total,
              })}
            </span>
          </Button>
        </>
      }
    >
      {mode === 'existing' ? (
        <div className="space-y-3">
          {!sel && (
            <>
              <Label>{t('admin.production.intake.styleLabel', { defaultValue: 'Style' })}</Label>
              <Combobox<number>
                value={null}
                options={styleOptions}
                onChange={(id) => {
                  const s = id != null ? styles.find((x) => x.id === id) : null;
                  if (s) void pickStyle(s);
                }}
                onAddNew={startExternal}
                addNewLabel={t('admin.production.intake.addExternal', {
                  defaultValue: "Add another brand's SKU",
                })}
                placeholder={
                  loadingSizes
                    ? t('common.loading', { defaultValue: 'Loading…' })
                    : t('admin.production.intake.searchStyle', {
                        defaultValue: 'Search a style by name or ID…',
                      })
                }
                ariaLabel={t('admin.production.intake.styleLabel', { defaultValue: 'Style' })}
              />
            </>
          )}

          {sel && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-2.5">
                {sel.imageUrl ? (
                  <img src={sel.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded bg-[var(--color-muted)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{sel.styleRef ?? sel.name}</div>
                  {sel.name && sel.name !== sel.styleRef && (
                    <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                      {sel.name}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSel(null)}
                  className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  aria-label={t('admin.production.intake.change', { defaultValue: 'Change style' })}
                >
                  <X size={16} />
                </button>
              </div>

              {sel.alreadyInProduction && (
                <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                  <AlertTriangle size={14} className="shrink-0" />
                  {t('admin.production.intake.alreadyInProduction', {
                    defaultValue: 'Already in production',
                  })}
                </div>
              )}

              <QtyTable
                showInFlight
                rows={sel.sizes.map((z) => ({
                  key: z.sku,
                  size: z.size,
                  sku: z.sku,
                  inFlight: z.inFlightQty,
                  qty: qty[z.sku] ?? 0,
                }))}
                onQty={setQtyFor}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={backToPicker}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            <ArrowLeft size={13} />
            {t('admin.production.intake.backToStyles', { defaultValue: 'Back to styles' })}
          </button>

          <div>
            <Label>{t('admin.production.intake.brand', { defaultValue: 'Brand' })}</Label>
            <Combobox<number>
              value={brandId === '' ? null : brandId}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(id) => setBrandId(id ?? '')}
              onAddNew={addBrand}
              addNewLabel={t('admin.production.intake.addBrand', { defaultValue: 'Add a new brand' })}
              placeholder={t('admin.production.intake.pickBrand', { defaultValue: 'Choose a brand…' })}
              ariaLabel={t('admin.production.intake.brand', { defaultValue: 'Brand' })}
            />
          </div>

          <div>
            <Label>{t('admin.production.intake.sku', { defaultValue: 'SKU code' })}</Label>
            <Input
              value={externalSku}
              onChange={(e) => setExternalSku(e.target.value)}
              placeholder={t('admin.production.intake.skuPlaceholder', {
                defaultValue: 'e.g. AZRT-SHIRT-2201',
              })}
            />
          </div>

          <div>
            <Label>{t('admin.production.intake.sizes', { defaultValue: 'Sizes to make' })}</Label>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleExtSize(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    extSizes[s]
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {extActiveSizes.length > 0 && (
            <QtyTable
              rows={extActiveSizes.map((s) => ({
                key: extSku(s),
                size: s,
                sku: externalSku.trim() ? extSku(s) : '—',
                inFlight: 0,
                qty: qty[extSku(s)] ?? 0,
              }))}
              onQty={setQtyFor}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}
