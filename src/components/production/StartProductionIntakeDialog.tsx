import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Factory, Loader2, Plus, Search, X, AlertTriangle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import QtyTable from '@/components/production/QtyTable';
import { useToast } from '@/components/ui/toast';
import { useDebounced } from '@/lib/useDebounced';
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
 * The header "Start production" intake. Two sources converge on the Planning
 * stage: an existing Nowi style not in the forecast, or another brand's SKU
 * that isn't in our system. Quantities are captured here; "Add to planning"
 * stages it, "Send to production" opens it straight on the floor (both stamp
 * the Planning timestamp so history reads correctly).
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

  // ── existing-style search ────────────────────────────────────────
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [results, setResults] = useState<Style[]>([]);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState<ExistingSel | null>(null);
  const [loadingSizes, setLoadingSizes] = useState(false);

  // ── external brand ───────────────────────────────────────────────
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<number | ''>('');
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [externalSku, setExternalSku] = useState('');
  const [extSizes, setExtSizes] = useState<Record<string, boolean>>({});

  // ── shared qty map (keyed by item sku) ───────────────────────────
  const [qty, setQty] = useState<Record<string, number>>({});

  // Reset everything when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setMode('existing');
    setSearch('');
    setResults([]);
    setSel(null);
    setBrandId('');
    setNewBrand('');
    setAddingBrand(false);
    setExternalSku('');
    setExtSizes({});
    setQty({});
    void getBrands().then(setBrands).catch(() => undefined);
  }, [open]);

  // Live style search.
  useEffect(() => {
    if (!open || mode !== 'existing') return;
    const q = debounced.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    listStyles({ search: q, take: 8 })
      .then((r) => {
        if (!cancelled) setResults(r.data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, mode]);

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
      setResults([]);
      setSearch('');
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

  const onAddBrand = async () => {
    const name = newBrand.trim();
    if (!name) return;
    setAddingBrand(true);
    try {
      const b = await createBrand(name);
      setBrands((prev) => [...prev.filter((x) => x.id !== b.id), b].sort((a, z) => a.name.localeCompare(z.name)));
      setBrandId(b.id);
      setNewBrand('');
    } catch {
      toast.show(
        t('admin.production.intake.brandFailed', { defaultValue: "Couldn't add that brand." }),
        'error',
      );
    } finally {
      setAddingBrand(false);
    }
  };

  const setQtyFor = (sku: string, raw: string) =>
    setQty((prev) => ({ ...prev, [sku]: Math.max(0, Number.parseInt(raw, 10) || 0) }));

  const toggleExtSize = (size: string) =>
    setExtSizes((prev) => ({ ...prev, [size]: !prev[size] }));

  // The item list depends on mode. For external, each active size becomes an
  // item whose sku is derived from the free-text SKU so it's unique per size.
  const extActiveSizes = useMemo(
    () => SIZE_PRESETS.filter((s) => extSizes[s]),
    [extSizes],
  );
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
      {/* Path picker — mirrors the style-intake "What are you submitting?" fork:
          a dropdown that decides which fields show below. */}
      <div className="mb-4 max-w-md">
        <Label>{t('admin.production.intake.pathLabel', { defaultValue: 'What are you making?' })}</Label>
        <Select
          aria-label={t('admin.production.intake.pathLabel', { defaultValue: 'What are you making?' })}
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
        >
          <option value="existing">
            {t('admin.production.intake.existing', { defaultValue: 'A Nowi style' })}
          </option>
          <option value="external">
            {t('admin.production.intake.external', { defaultValue: "Another brand's SKU" })}
          </option>
        </Select>
      </div>

      {mode === 'existing' ? (
        <div className="space-y-3">
          {!sel && <Label>{t('admin.production.intake.styleLabel', { defaultValue: 'Style' })}</Label>}
          {!sel && (
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-primary)]"
              />
              <Input
                autoFocus
                className="h-10 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin.production.intake.searchStyle', {
                  defaultValue: 'Search a style by name or ID…',
                })}
              />
              {(searching || loadingSizes) && (
                <Loader2
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--color-muted-foreground)]"
                />
              )}
            </div>
          )}

          {!sel && results.length > 0 && (
            <div className="max-h-64 divide-y divide-[var(--color-border)] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)]">
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void pickStyle(s)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-2)]/60"
                >
                  {s.referenceImage || s.referenceImages?.[0] ? (
                    <img
                      src={s.referenceImages?.[0] ?? s.referenceImage ?? ''}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded bg-[var(--color-muted)]" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {s.styleId ?? s.workingName ?? `#${s.id}`}
                    </div>
                    {s.workingName && (
                      <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {s.workingName}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
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
          <div>
            <Label>{t('admin.production.intake.brand', { defaultValue: 'Brand' })}</Label>
            {addingBrand ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onAddBrand();
                  }}
                  placeholder={t('admin.production.intake.newBrand', { defaultValue: 'New brand name' })}
                />
                <Button size="sm" disabled={!newBrand.trim()} onClick={() => void onAddBrand()}>
                  {t('common.add', { defaultValue: 'Add' })}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAddingBrand(false)}>
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : '')}
                  className="h-10 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                >
                  <option value="">
                    {t('admin.production.intake.pickBrand', { defaultValue: 'Choose a brand…' })}
                  </option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={() => setAddingBrand(true)}>
                  <Plus size={14} />
                  <span className="ml-1">{t('common.new', { defaultValue: 'New' })}</span>
                </Button>
              </div>
            )}
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
