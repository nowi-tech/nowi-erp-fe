import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

import GenderSelect from '@/components/styles/intake/GenderSelect';
import CategoryPicker from '@/components/styles/intake/CategoryPicker';
import CollectionPicker from '@/components/styles/intake/CollectionPicker';
import FabricPicker from '@/components/styles/intake/FabricPicker';
import ColourPicker from '@/components/styles/intake/ColourPicker';
import PatternCadInput from '@/components/shared/PatternCadInput';
import {
  GENDER_CATEGORIES,
  deriveArticleCategory,
  type FineCategoryCode,
} from '@/components/styles/intake/categoryOptions';

import { listFabrics, patchStyle, setMarketplaceListing } from '@/api/styles';
import { listCategories } from '@/api/categories';
import { listCollections } from '@/api/collections';
import type {
  CategoryWithStyleCode,
  Collection,
  Fabric,
  Gender,
  Style,
} from '@/api/types';

/**
 * Scoped edit dialogs for the Style workspace.
 *
 * The workspace's Core-specifications card and Bill-of-materials card
 * each expose a pencil / edit affordance. Rather than re-open the full
 * `<StyleEditModal>` (every intake field), these two small dialogs edit
 * ONLY the fields that belong to their card, then persist through the
 * same `patchStyle(id, …)` client. They reuse the shared intake field
 * components (GenderSelect / CategoryPicker / FabricPicker /
 * ColourPicker) so the controls stay identical to the full form.
 */

/** Map the BE's StyleGender (`W`/`M`/`U`) or long-form back to `Gender`. */
function toFormGender(g: unknown): Gender {
  if (g === 'W' || g === 'women') return 'women';
  if (g === 'M' || g === 'men') return 'men';
  if (g === 'U' || g === 'unisex') return 'unisex';
  return 'women';
}

/** Pull the runtime-only `categoryId` off a Style (present via Prisma include). */
function readCategoryId(style: Style): number | null {
  return (style as unknown as { categoryId?: number }).categoryId ?? null;
}

/** Human suffix for the sample-fabric quantity input. */
function uomLabel(u: Fabric['unitOfMeasure']): string {
  if (u === 'kg') return 'kg';
  if (u === 'oz') return 'oz';
  return 'm';
}

/** Extract an API error message into a string. */
function errMessage(e: unknown, fallback: string): string {
  const m =
    (e as { response?: { data?: { message?: string | string[] } } })?.response
      ?.data?.message ?? fallback;
  return Array.isArray(m) ? m.join(', ') : String(m);
}

// ─── Core specifications editor ───────────────────────────────────────
// Fields: working name · gender · category · fabric · primary colour ·
// sampling timeline.

interface CoreSpecsState {
  workingName: string;
  gender: Gender;
  categoryId: number | null;
  categoryCode: FineCategoryCode | string | null;
  collectionId: number | null;
  fabricId: number | null;
  primaryColour: string;
  /** Days, kept as a string so an empty input distinguishes from `0`. */
  samplingTimeline: string;
  /** Source product URL captured at intake. */
  referenceLink: string;
  /** Per-style cost price, kept as a string so empty ≠ 0. */
  costPrice: string;
  /** Per-channel MRP keyed by channel name, as strings (empty ≠ 0). Only
   *  active (non-off) channels with a listing URL are editable here. */
  mrps: Record<string, string>;
}

/** Active channel listings (state ≠ off) that carry a URL — the only ones whose
 *  MRP we can update via the marketplace-listing endpoint (it requires a link).
 */
function pricedChannels(style: Style) {
  return (style.channelListings ?? []).filter(
    (l) => l.state !== 'off' && !!l.listingUrl,
  );
}

function buildCoreSpecsState(style: Style): CoreSpecsState {
  const gender = toFormGender(style.gender);
  return {
    workingName: style.workingName ?? '',
    gender,
    categoryId: readCategoryId(style),
    categoryCode:
      (style.categoryCode as FineCategoryCode | null) ??
      GENDER_CATEGORIES[gender][0],
    collectionId: style.collectionId ?? null,
    fabricId: style.fabricId ?? null,
    primaryColour: style.primaryColour ?? '',
    samplingTimeline:
      style.samplingTimeline && /^\d+$/.test(style.samplingTimeline.trim())
        ? style.samplingTimeline.trim()
        : '',
    referenceLink: style.referenceLink ?? '',
    costPrice: style.costPrice != null ? String(style.costPrice) : '',
    mrps: Object.fromEntries(
      pricedChannels(style).map((l) => [
        l.channel,
        l.mrp != null ? String(l.mrp) : '',
      ]),
    ),
  };
}

export function CoreSpecsEditModal({
  open,
  style,
  fabrics: fabricsProp,
  onClose,
  onSaved,
}: {
  open: boolean;
  style: Style;
  /** Pre-warmed fabric master from the parent; the modal still
   *  self-loads on first open if the parent passed an empty list. */
  fabrics?: Fabric[];
  onClose: () => void;
  onSaved: (saved: Style) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const [form, setForm] = useState<CoreSpecsState>(() =>
    buildCoreSpecsState(style),
  );
  const [fabrics, setFabrics] = useState<Fabric[]>(fabricsProp ?? []);
  const [categories, setCategories] = useState<CategoryWithStyleCode[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-seed whenever the modal opens for a (possibly different) style.
  useEffect(() => {
    if (open) {
      setForm(buildCoreSpecsState(style));
      setErr(null);
    }
    // style.id is the stable identity for the row being edited.
  }, [open, style.id]);

  // Lazy-load master data the first time the modal opens.
  useEffect(() => {
    if (!open) return;
    if (fabrics.length === 0) {
      void listFabrics()
        .then(setFabrics)
        .catch(() => setFabrics([]));
    }
    if (categories.length === 0) {
      void listCategories()
        .then(setCategories)
        .catch(() => setCategories([]));
    }
    if (collections.length === 0) {
      void listCollections()
        .then(setCollections)
        .catch(() => setCollections([]));
    }
  }, [open, fabrics.length, categories.length, collections.length]);

  // Gender is a free attribute — switching it never disturbs the chosen
  // category. The same Category row maps to a gender-appropriate
  // `articleCategory` at save time via `deriveArticleCategory`, so there's
  // no reason to reset (which used to surprise users by snapping back to
  // the default "Jacket" or silently keeping the previous selection).
  const onGenderChange = (next: Gender) =>
    setForm((f) => ({ ...f, gender: next }));

  const valid = form.workingName.trim().length > 0;

  const onSave = async () => {
    if (!valid) {
      setErr(t('admin.styles.intake.needsName'));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const code =
        (form.categoryCode as string | null) ??
        GENDER_CATEGORIES[form.gender][0];
      const articleCategory = deriveArticleCategory(form.gender, code);
      const saved = await patchStyle(style.id, {
        workingName: form.workingName.trim() || null,
        gender: form.gender,
        category: articleCategory,
        categoryId: form.categoryId ?? undefined,
        // Send only when set — a legacy style with no collection stays
        // unchanged (the BE patch rejects an explicit null since collection
        // is required) rather than blocking a core-specs save.
        collectionId: form.collectionId ?? undefined,
        fabricId: form.fabricId,
        primaryColour: form.primaryColour.trim() || null,
        samplingTimeline: form.samplingTimeline.trim() || null,
        referenceLink: form.referenceLink.trim() || null,
        costPrice: form.costPrice.trim() ? Number(form.costPrice) : null,
      } as Parameters<typeof patchStyle>[1]);
      // Per-channel MRP — persisted via the marketplace-listing endpoint (MRP
      // is per channel, not a style scalar). Push only channels whose value
      // actually changed and is set; the existing URL keeps the listing intact.
      // The workspace refetches via onSaved → load(), so the new MRPs show.
      for (const l of pricedChannels(style)) {
        const raw = form.mrps[l.channel]?.trim();
        const parsed = raw ? Number(raw) : NaN;
        // Skip empty/invalid input (NaN) — only push a real, changed number.
        const next = Number.isFinite(parsed) ? parsed : null;
        const prev = l.mrp != null ? Number(l.mrp) : null;
        if (next != null && next !== prev) {
          await setMarketplaceListing(style.id, {
            channel: l.channel,
            listed: true,
            listingUrl: l.listingUrl ?? undefined,
            mrp: next,
          });
        }
      }
      toast.show(t('admin.styles.drawer.updatedToast', { defaultValue: 'Saved.' }), 'success');
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setErr(errMessage(e, t('admin.styles.intake.saveError')));
    } finally {
      setSaving(false);
    }
  };

  // Highlight the active fabric-colour row by matching the product colour
  // text back to the chosen fabric's colours (Style stores colour as text).
  const selectedFabricColourId = useMemo(() => {
    const fabric = fabrics.find((f) => f.id === form.fabricId);
    const name = form.primaryColour.trim().toLowerCase();
    if (!name || !fabric?.colours?.length) return null;
    return fabric.colours.find((c) => c.name.toLowerCase() === name)?.id ?? null;
  }, [fabrics, form.fabricId, form.primaryColour]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      title={
        <span className="font-serif text-lg">
          {t('admin.styles.workspace.editCoreSpecs', {
            defaultValue: 'Edit core specifications',
          })}
        </span>
      }
      footer={
        <>
          {err && (
            <span className="mr-auto truncate text-xs text-[var(--status-stuck-ink)]">
              {err}
            </span>
          )}
          <Button variant="outline" size="sm" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={saving || !valid} onClick={() => void onSave()}>
            {saving
              ? t('common.saving')
              : t('admin.styles.drawer.save', { defaultValue: 'Save' })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t('admin.styles.intake.workingName')} *</Label>
          <Input
            value={form.workingName}
            onChange={(e) =>
              setForm((f) => ({ ...f, workingName: e.target.value }))
            }
            placeholder={t('admin.styles.intake.workingNamePh')}
            autoFocus
          />
        </div>
        <div>
          <Label>{t('admin.styles.intake.gender')}</Label>
          <GenderSelect
            value={form.gender}
            onChange={onGenderChange}
            labels={{
              women: t('admin.styles.intake.genderWomen'),
              men: t('admin.styles.intake.genderMen'),
              unisex: t('admin.styles.intake.genderUnisex'),
            }}
          />
        </div>
        <div>
          <Label>{t('admin.styles.intake.category')}</Label>
          <CategoryPicker
            categories={categories}
            value={form.categoryId}
            fallbackCode={(form.categoryCode as FineCategoryCode | null) ?? null}
            gender={form.gender}
            onChange={({ categoryId, code }) =>
              setForm((f) => ({ ...f, categoryId, categoryCode: code }))
            }
            onCategoryCreated={(c) => setCategories([...categories, c])}
          />
        </div>
        <div>
          <Label>{t('admin.styles.intake.collection')}</Label>
          <CollectionPicker
            collections={collections}
            value={form.collectionId}
            onChange={(collectionId) =>
              setForm((f) => ({ ...f, collectionId }))
            }
            onCollectionCreated={(c) => setCollections([...collections, c])}
          />
        </div>
        <div>
          <Label>{t('admin.styles.intake.fabric')}</Label>
          <FabricPicker
            fabrics={fabrics}
            fabricId={form.fabricId}
            fabricColourId={selectedFabricColourId}
            onChange={(choice) =>
              setForm((f) => ({
                ...f,
                fabricId: choice?.fabricId ?? null,
                // Auto-fill the product colour from the chosen fabric-colour
                // (still overridable in the colour field below).
                primaryColour: choice?.colourName ?? f.primaryColour,
              }))
            }
            onFabricCreated={(f) => setFabrics([...fabrics, f])}
          />
        </div>
        <div>
          <Label>{t('admin.styles.intake.primaryColour')}</Label>
          <ColourPicker
            value={form.primaryColour}
            onChange={(next) => setForm((f) => ({ ...f, primaryColour: next }))}
            placeholder={t('admin.styles.intake.primaryColourPh')}
            fabricColours={
              fabrics.find((f) => f.id === form.fabricId)?.colours ?? []
            }
            inlineAdd
          />
        </div>
        <div>
          <Label>{t('admin.styles.intake.samplingTimeline')}</Label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.samplingTimeline}
              onChange={(e) =>
                setForm((f) => ({ ...f, samplingTimeline: e.target.value }))
              }
              placeholder="0"
            />
            <span
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-medium text-[var(--color-muted-foreground)]"
              aria-hidden
            >
              {Number(form.samplingTimeline) === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>
        <div>
          <Label>
            {t('admin.styles.intake.referenceLink', {
              defaultValue: 'Reference link',
            })}
          </Label>
          <Input
            type="url"
            value={form.referenceLink}
            onChange={(e) =>
              setForm((f) => ({ ...f, referenceLink: e.target.value }))
            }
            placeholder="https://…"
          />
        </div>
        <div>
          <Label>
            {t('admin.styles.workspace.costPrice', {
              defaultValue: 'Cost price (₹)',
            })}
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)]">
              ₹
            </span>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="pl-6"
              value={form.costPrice}
              onChange={(e) =>
                setForm((f) => ({ ...f, costPrice: e.target.value }))
              }
              placeholder={t('admin.styles.workspace.costPricePh', {
                defaultValue: 'e.g. 450',
              })}
            />
          </div>
        </div>
        {/* Per-channel MRP — only for active listed channels (MRP is per
            channel). Hidden entirely for styles with no listed channel yet. */}
        {pricedChannels(style).length > 0 && (
          <div>
            <Label>
              {t('admin.styles.workspace.channelMrp', {
                defaultValue: 'Channel MRP (₹)',
              })}
            </Label>
            <div className="space-y-2">
              {pricedChannels(style).map((l) => (
                <div key={l.channel} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm text-[var(--color-muted-foreground)]">
                    {t(`admin.styles.channel.${l.channel}` as const, {
                      defaultValue: l.channel,
                    })}
                  </span>
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)]">
                      ₹
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className="pl-6"
                      value={form.mrps[l.channel] ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          mrps: { ...f.mrps, [l.channel]: e.target.value },
                        }))
                      }
                      placeholder={t('admin.styles.workspace.mrpPh', {
                        defaultValue: 'MRP',
                      })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ─── Bill of materials editor ─────────────────────────────────────────
// Fields: fabric · sample fabric required.

interface BomState {
  fabricId: number | null;
  sampleFabricRequired: string;
}

function buildBomState(style: Style): BomState {
  return {
    fabricId: style.fabricId ?? null,
    sampleFabricRequired:
      style.sampleFabricRequired == null
        ? ''
        : String(style.sampleFabricRequired),
  };
}

export function BomEditModal({
  open,
  style,
  fabrics: fabricsProp,
  onClose,
  onSaved,
}: {
  open: boolean;
  style: Style;
  fabrics?: Fabric[];
  onClose: () => void;
  onSaved: (saved: Style) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const [form, setForm] = useState<BomState>(() => buildBomState(style));
  const [fabrics, setFabrics] = useState<Fabric[]>(fabricsProp ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(buildBomState(style));
      setErr(null);
    }
  }, [open, style.id]);

  useEffect(() => {
    if (!open) return;
    if (fabrics.length === 0) {
      void listFabrics()
        .then(setFabrics)
        .catch(() => setFabrics([]));
    }
  }, [open, fabrics.length]);

  const selectedFabric = useMemo(
    () => fabrics.find((f) => f.id === form.fabricId) ?? null,
    [fabrics, form.fabricId],
  );

  const onSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const saved = await patchStyle(style.id, {
        fabricId: form.fabricId,
        sampleFabricRequired: form.sampleFabricRequired
          ? Number(form.sampleFabricRequired)
          : null,
      } as Parameters<typeof patchStyle>[1]);
      toast.show(t('admin.styles.drawer.updatedToast', { defaultValue: 'Saved.' }), 'success');
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setErr(errMessage(e, t('admin.styles.intake.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      title={
        <span className="font-serif text-lg">
          {t('admin.styles.workspace.editBomTitle', {
            defaultValue: 'Edit bill of materials',
          })}
        </span>
      }
      footer={
        <>
          {err && (
            <span className="mr-auto truncate text-xs text-[var(--status-stuck-ink)]">
              {err}
            </span>
          )}
          <Button variant="outline" size="sm" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void onSave()}>
            {saving
              ? t('common.saving')
              : t('admin.styles.drawer.save', { defaultValue: 'Save' })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t('admin.styles.intake.fabric')}</Label>
          <FabricPicker
            fabrics={fabrics}
            fabricId={form.fabricId}
            onChange={(choice) =>
              setForm((f) => ({ ...f, fabricId: choice?.fabricId ?? null }))
            }
            onFabricCreated={(f) => setFabrics([...fabrics, f])}
          />
        </div>
        <div>
          <Label>{t('admin.styles.intake.sampleFabricRequired')}</Label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.sampleFabricRequired}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  sampleFabricRequired: e.target.value,
                }))
              }
              placeholder={t('admin.styles.intake.sampleFabricRequiredHelp')}
              disabled={!selectedFabric}
            />
            <span
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-medium text-[var(--color-muted-foreground)]"
              aria-hidden
            >
              {uomLabel(selectedFabric?.unitOfMeasure ?? null)}
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Pattern / CAD editor ─────────────────────────────────────────────
// Scoped single-field editor: ONLY uploads CAD files and persists the
// `patternCadPaths` list. Opened from the workspace's Pattern/CAD card
// upload affordance instead of the full StyleEditModal. Reuses the
// shared <PatternCadInput> (the same control the full intake form uses).

export function PatternCadEditModal({
  open,
  style,
  onClose,
  onSaved,
}: {
  open: boolean;
  style: Style;
  onClose: () => void;
  onSaved: (saved: Style) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const [paths, setPaths] = useState<string[]>(style.patternCadPaths ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-seed whenever the modal opens for a (possibly different) style.
  useEffect(() => {
    if (open) {
      setPaths(style.patternCadPaths ?? []);
      setErr(null);
    }
  }, [open, style.id, style.patternCadPaths]);

  const onSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const saved = await patchStyle(style.id, {
        patternCadPaths: paths,
      } as Parameters<typeof patchStyle>[1]);
      toast.show(
        t('admin.styles.drawer.updatedToast', { defaultValue: 'Saved.' }),
        'success',
      );
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setErr(errMessage(e, t('admin.styles.intake.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      title={
        <span className="font-serif text-lg">
          {t('admin.styles.drawer.patternCad.label', {
            defaultValue: 'Pattern / CAD',
          })}
        </span>
      }
      footer={
        <>
          {err && (
            <span className="mr-auto truncate text-xs text-[var(--status-stuck-ink)]">
              {err}
            </span>
          )}
          <Button variant="outline" size="sm" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void onSave()}>
            {saving
              ? t('common.saving')
              : t('admin.styles.drawer.save', { defaultValue: 'Save' })}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label>
          {t('admin.styles.drawer.patternCad.label', {
            defaultValue: 'Pattern / CAD',
          })}
        </Label>
        <PatternCadInput
          patternCadPaths={paths}
          entityId={style.id}
          onChange={setPaths}
        />
      </div>
    </Dialog>
  );
}
