import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

import SourceToggle from '@/components/styles/SourceToggle';
import PatternCadInput from '@/components/shared/PatternCadInput';
import IntakeCard from '@/components/styles/intake/IntakeCard';
import ReviewerCard from '@/components/styles/intake/ReviewerCard';
import GenderSegment from '@/components/styles/intake/GenderSegment';
import CategoryPicker from '@/components/styles/intake/CategoryPicker';
import FabricPicker from '@/components/styles/intake/FabricPicker';
import ColourPicker from '@/components/styles/intake/ColourPicker';
import ReferenceImageGrid from '@/components/styles/intake/ReferenceImageGrid';
import {
  GENDER_CATEGORIES,
  deriveArticleCategory,
  fineCategoryLabel,
  type FineCategoryCode,
} from '@/components/styles/intake/categoryOptions';

import { createStyle, listFabrics } from '@/api/styles';
import { listCategories } from '@/api/categories';
import type {
  CategoryWithStyleCode,
  Fabric,
  Gender,
  StyleSource,
} from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Resolved reviewer details for the top card and the submit button copy.
 * Mirrors the routing rule used by `StyleQuickEditDrawer` (women + unisex
 * → Parul, men → Pradyuman, china_import → Dheeraj). Same name flows into
 * the submit button.
 */
type Reviewer = {
  name: string;
  role: string;
  checks: string[];
  submitLabel: string;
};

function resolveReviewer(
  source: StyleSource,
  gender: Gender,
  t: ReturnType<typeof useTranslation>['t'],
): Reviewer {
  const checks = [
    t('admin.styles.intake.checkFabric'),
    t('admin.styles.intake.checkPrice'),
    t('admin.styles.intake.checkCad'),
  ];
  if (source === 'china_import') {
    return {
      name: t('admin.styles.intake.reviewerDheeraj'),
      role: t('admin.styles.intake.reviewerRoleChina'),
      checks,
      submitLabel: t('admin.styles.intake.submitToDheeraj'),
    };
  }
  if (gender === 'men') {
    return {
      name: t('admin.styles.intake.reviewerPradyuman'),
      role: t('admin.styles.intake.reviewerRoleM'),
      checks,
      submitLabel: t('admin.styles.intake.submitToPradyuman'),
    };
  }
  // women + unisex
  return {
    name: t('admin.styles.intake.reviewerParul'),
    role: t('admin.styles.intake.reviewerRoleW'),
    checks,
    submitLabel: t('admin.styles.intake.submitToParul'),
  };
}

type FormState = {
  workingName: string;
  developmentReason: string;
  fabricId: number | null;
  sampleFabricRequired: string;
  gender: Gender;
  /** Server-known category id (preferred). */
  categoryId: number | null;
  /** Seed/fallback code (DRESS / PANT / …). Used to derive the legacy
   *  `articleCategory` slug if `categoryId` is null on submit. */
  categoryCode: FineCategoryCode | string | null;
  primaryColour: string;
  referenceLink: string;
  referenceImages: string[];
  referenceImageUrl: string | null;
  patternCadPaths: string[];
  remark: string;
  /** Free-text sampling timeline (e.g. "5 days"). Not yet stored on the
   *  Style entity — appended to `developmentReason` until the BE
   *  exposes a dedicated field. */
  samplingTimeline: string;
};

/** Initial fine-category seed for a given gender. */
function defaultCategoryCode(gender: Gender): FineCategoryCode {
  return GENDER_CATEGORIES[gender][0];
}

/**
 * Style intake form — the locked-design rewrite.
 *
 * Layout (desktop):
 *   Breadcrumb + H1 + SourceToggle
 *   ReviewerCard (full width)
 *   Inspiration card | Article card        (12-col / two-up grid)
 *   Sampling specifics card               (full width — sampling only)
 *   Sticky footer (hint + Save draft + Submit)
 *
 * Behaviours:
 *   - Gender → category cascade. Switching gender resets category if
 *     the current one isn't valid for the new gender bucket.
 *   - Searchable Category + Fabric comboboxes, each with "+ Add new …"
 *     that inline-POSTs and auto-selects.
 *   - Reference grid (max 5). Paste-link auto-fetch (debounced 300ms),
 *     drag-to-reorder, × to remove. First tile = primary.
 *   - Sample qty input shows the selected fabric's `unitOfMeasure`
 *     suffix; disabled until a fabric is picked.
 *   - Sticky footer with live hint and both action buttons; gated on
 *     `workingName`.
 */
export default function NewIntake() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const initialSource: StyleSource =
    (params.get('source') as StyleSource | null) === 'china_import'
      ? 'china_import'
      : 'sampling';

  const [source, setSource] = useState<StyleSource>(initialSource);
  const isChinaImport = source === 'china_import';

  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [categories, setCategories] = useState<CategoryWithStyleCode[]>([]);

  const [form, setForm] = useState<FormState>(() => ({
    workingName: '',
    developmentReason: '',
    fabricId: null,
    sampleFabricRequired: '',
    gender: 'women',
    categoryId: null,
    categoryCode: defaultCategoryCode('women'),
    primaryColour: '',
    referenceLink: '',
    referenceImages: [],
    referenceImageUrl: null,
    patternCadPaths: [],
    remark: '',
    samplingTimeline: '',
  }));

  const [busy, setBusy] = useState<null | 'draft' | 'submit'>(null);
  const [err, setErr] = useState<string | null>(null);

  // Load master data once.
  useEffect(() => {
    void Promise.all([
      listFabrics().catch(() => [] as Fabric[]),
      listCategories().catch(() => [] as CategoryWithStyleCode[]),
    ]).then(([fb, cats]) => {
      setFabrics(fb);
      setCategories(cats);
    });
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Gender → category cascade. When gender changes, if the current
  // category is not valid for the new gender, snap to the first valid.
  const onGenderChange = (next: Gender) => {
    setForm((f) => {
      const allowed = GENDER_CATEGORIES[next];
      const currentCode = (f.categoryCode ?? '').toString().toUpperCase();
      const stillValid = (allowed as readonly string[]).includes(currentCode);
      if (stillValid) {
        return { ...f, gender: next };
      }
      const code = allowed[0];
      // Try to resolve a real category id from the freshly-picked code.
      const hit = categories.find(
        (c) => (c.code ?? '').toUpperCase() === code,
      );
      return {
        ...f,
        gender: next,
        categoryCode: code,
        categoryId: hit?.id ?? null,
      };
    });
  };

  // Selected fabric — for the unit suffix on the sample-qty input.
  const selectedFabric = useMemo(
    () => fabrics.find((f) => f.id === form.fabricId) ?? null,
    [fabrics, form.fabricId],
  );

  const reviewer = resolveReviewer(source, form.gender, t);

  const submitDisabled = !form.workingName.trim();
  const footerHint = submitDisabled
    ? t('admin.styles.intake.needsName')
    : t('admin.styles.intake.readyHint');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildPayload = (): any => {
    // Resolve the legacy articleCategory slug from the picked code+gender.
    const code =
      (form.categoryCode as string | null) ?? defaultCategoryCode(form.gender);
    const articleCategory = deriveArticleCategory(form.gender, code);

    const base: Record<string, unknown> = {
      source,
      // BE accepts both — send articleCategory (string slug) AND
      // categoryId (int) when available. `category` is the legacy field
      // name for the slug; we keep it because the FE's CreateStyleRequest
      // type still requires it.
      category: articleCategory,
      articleCategory,
      categoryId: form.categoryId,
      workingName: form.workingName.trim() || null,
      gender: form.gender,
      primaryColour: form.primaryColour.trim() || null,
      referenceLink: form.referenceLink.trim() || null,
      // New multi-image field. Server mirrors [0] into legacy
      // `referenceImage` for back-compat — we don't send it ourselves.
      referenceImages: form.referenceImages,
      referenceImageUrl: form.referenceImageUrl,
    };

    if (isChinaImport) {
      return {
        ...base,
        remark: form.remark.trim() || null,
      };
    }

    // Sampling — full body. Sampling timeline is appended to
    // developmentReason until the BE adds a dedicated column.
    const reason = [
      form.developmentReason.trim(),
      form.samplingTimeline.trim()
        ? `Sampling timeline: ${form.samplingTimeline.trim()}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      ...base,
      developmentReason: reason || null,
      fabricId: form.fabricId,
      sampleFabricRequired: form.sampleFabricRequired
        ? Number(form.sampleFabricRequired)
        : null,
      patternCadPaths: form.patternCadPaths,
    };
  };

  const save = async (mode: 'draft' | 'submit') => {
    if (submitDisabled) {
      setErr(t('admin.styles.intake.needsName'));
      return;
    }
    setBusy(mode);
    setErr(null);
    try {
      const created = await createStyle(buildPayload());
      toast.show(
        mode === 'draft'
          ? t('admin.styles.intake.createdToast')
          : t('admin.styles.intake.submittedToast'),
        'success',
      );
      navigate(`/styles/${created.styleId ?? created.id}`);
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? t('admin.styles.intake.saveError');
      setErr(Array.isArray(m) ? m.join(', ') : String(m));
    } finally {
      setBusy(null);
    }
  };

  const uomLabel = (u: Fabric['unitOfMeasure']) => {
    if (u === 'meter') return 'm';
    if (u === 'kg') return 'kg';
    if (u === 'oz') return 'oz';
    return '';
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 pb-32 sm:px-4">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 pt-4 text-[12px] text-[var(--color-muted-foreground)]"
      >
        <Link
          to="/styles"
          className="hover:text-[var(--color-foreground)] hover:underline"
        >
          {t('admin.styles.intake.breadcrumbStyles')}
        </Link>
        <ChevronRight size={12} />
        <span className="text-[var(--color-foreground)]">
          {t('admin.styles.intake.breadcrumbNewIntake')}
        </span>
      </nav>

      {/* Header row */}
      <header className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-[26px] leading-tight text-[var(--color-primary)] sm:text-[28px]">
          {t('admin.styles.intake.h1')}
        </h1>
        <SourceToggle value={source} onChange={setSource} />
      </header>

      {/* Reviewer card */}
      <div className="mt-4">
        <ReviewerCard
          name={reviewer.name}
          role={reviewer.role}
          checks={reviewer.checks}
        />
      </div>

      {/* Page-level error banner */}
      {err && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--status-stuck-ink)]/30 bg-[var(--status-stuck-bg)] px-3 py-2 text-[13px] text-[var(--status-stuck-ink)]">
          {err}
        </div>
      )}

      {/* Two-up grid: Inspiration | Article */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inspiration */}
        <IntakeCard
          title={t('admin.styles.intake.inspiration')}
          subtitle={t('admin.styles.intake.inspirationSubtitle')}
        >
          <div className="space-y-4">
            <div>
              <Label>{t('admin.styles.intake.referenceLink')}</Label>
              <Input
                value={form.referenceLink}
                onChange={(e) => set('referenceLink', e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div>
              <Label>{t('admin.styles.intake.referenceImage')}</Label>
              <ReferenceImageGrid
                entityId="new"
                value={form.referenceImages}
                referenceLink={form.referenceLink || null}
                onChange={(next) => set('referenceImages', next)}
                onPrimaryUrlChange={(u) => set('referenceImageUrl', u)}
              />
            </div>
            {isChinaImport && (
              <div>
                <Label>{t('admin.styles.intake.remark')}</Label>
                <Textarea
                  value={form.remark}
                  onChange={(e) => set('remark', e.target.value)}
                  placeholder={t('admin.styles.intake.remarkPh')}
                />
              </div>
            )}
          </div>
        </IntakeCard>

        {/* Article */}
        <IntakeCard
          title={t('admin.styles.intake.article')}
          subtitle={t('admin.styles.intake.articleSubtitle')}
        >
          <div className="space-y-4">
            <div>
              <Label>{t('admin.styles.intake.workingName')} *</Label>
              <Input
                value={form.workingName}
                onChange={(e) => set('workingName', e.target.value)}
                placeholder={t('admin.styles.intake.workingNamePh')}
                autoFocus
              />
            </div>
            <div>
              <Label>{t('admin.styles.intake.gender')}</Label>
              <GenderSegment
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
                fallbackCode={
                  (form.categoryCode as FineCategoryCode | null) ?? null
                }
                gender={form.gender}
                onChange={({ categoryId, code }) => {
                  setForm((f) => ({
                    ...f,
                    categoryId,
                    categoryCode: code,
                  }));
                }}
                onCategoryCreated={(c) =>
                  setCategories((all) => [...all, c])
                }
              />
            </div>
            <div>
              <Label>{t('admin.styles.intake.primaryColour')}</Label>
              <ColourPicker
                value={form.primaryColour}
                onChange={(next) => set('primaryColour', next)}
                placeholder={t('admin.styles.intake.primaryColourPh')}
              />
            </div>
            {!isChinaImport && (
              <div>
                <Label>{t('admin.styles.intake.developmentReason')}</Label>
                <Textarea
                  value={form.developmentReason}
                  onChange={(e) => set('developmentReason', e.target.value)}
                  placeholder={t('admin.styles.intake.developmentReasonPh')}
                />
              </div>
            )}
          </div>
        </IntakeCard>
      </div>

      {/* Sampling specifics — full-width row, sampling only */}
      {!isChinaImport && (
        <div className="mt-4">
          <IntakeCard
            title={t('admin.styles.intake.samplingSpecifics')}
            subtitle={t('admin.styles.intake.samplingSpecificsSubtitle')}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>{t('admin.styles.intake.fabric')}</Label>
                <FabricPicker
                  fabrics={fabrics}
                  value={form.fabricId}
                  onChange={(next) => set('fabricId', next)}
                  onFabricCreated={(f) =>
                    setFabrics((all) => [...all, f])
                  }
                />
              </div>
              <div>
                <Label>
                  {t('admin.styles.intake.sampleFabricRequired')}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.sampleFabricRequired}
                    onChange={(e) =>
                      set('sampleFabricRequired', e.target.value)
                    }
                    placeholder={t(
                      'admin.styles.intake.sampleFabricRequiredHelp',
                    )}
                    disabled={!selectedFabric}
                  />
                  {selectedFabric?.unitOfMeasure && (
                    <span
                      className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-[var(--color-muted-foreground)]"
                      aria-hidden
                    >
                      {uomLabel(selectedFabric.unitOfMeasure)}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <Label>{t('admin.styles.intake.samplingTimeline')}</Label>
                <Input
                  value={form.samplingTimeline}
                  onChange={(e) => set('samplingTimeline', e.target.value)}
                  placeholder={t('admin.styles.intake.samplingTimelinePh')}
                />
              </div>
              <div>
                <Label>{t('admin.styles.intake.patternMaster')}</Label>
                <div className="flex h-12 items-center rounded-[10px] border border-[var(--color-input)] bg-[var(--color-muted)] px-3.5 text-[14px] text-[var(--color-foreground)]">
                  {t('admin.styles.intake.patternMasterReadonly', {
                    name: reviewer.name,
                    role:
                      form.gender === 'men'
                        ? t('admin.styles.intake.reviewerRoleM')
                        : t('admin.styles.intake.reviewerRoleW'),
                  })}
                </div>
              </div>
              {/* Collection dropped from intake — the workbook doesn't track
                  it and the "family" grouping is handled by parentStyleId
                  via the Add Colour modal. Schema FK stays for legacy rows. */}
              <div className="md:col-span-2">
                <Label>
                  {t('admin.styles.drawer.fields.patternCad', 'Pattern / CAD')}
                </Label>
                <PatternCadInput
                  entityId="new"
                  patternCadPaths={form.patternCadPaths}
                  onChange={(p) => set('patternCadPaths', p)}
                />
              </div>
            </div>
          </IntakeCard>
        </div>
      )}

      {/* Sticky footer */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur',
        )}
      >
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <span
            className={cn(
              'text-[12px] sm:text-[13px]',
              submitDisabled
                ? 'text-[var(--color-muted-foreground)]'
                : 'text-[var(--color-foreground)]',
            )}
          >
            {!submitDisabled && form.categoryCode && (
              <span className="mr-2 inline-flex items-center rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-foreground)]">
                {fineCategoryLabel(String(form.categoryCode))}
              </span>
            )}
            {footerHint}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null || submitDisabled}
              onClick={() => void save('draft')}
            >
              {busy === 'draft'
                ? t('common.saving')
                : t('admin.styles.intake.saveDraft')}
            </Button>
            <Button
              size="sm"
              disabled={busy !== null || submitDisabled}
              onClick={() => void save('submit')}
            >
              {busy === 'submit' ? t('common.saving') : reviewer.submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
