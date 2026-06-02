import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import PatternCadInput from '@/components/shared/PatternCadInput';
import IntakeCard from '@/components/styles/intake/IntakeCard';
import GenderSegment from '@/components/styles/intake/GenderSegment';
import CategoryPicker from '@/components/styles/intake/CategoryPicker';
import FabricPicker from '@/components/styles/intake/FabricPicker';
import ColourPicker from '@/components/styles/intake/ColourPicker';
import ReferenceImageGrid from '@/components/styles/intake/ReferenceImageGrid';
import {
  GENDER_CATEGORIES,
  deriveArticleCategory,
  type FineCategoryCode,
} from '@/components/styles/intake/categoryOptions';

import type {
  CategoryWithStyleCode,
  Fabric,
  Gender,
  Style,
  StyleSource,
} from '@/api/types';

/**
 * Shared intake / edit form for the Product Development module.
 *
 * Used by both the `/styles/new` page (create flow) and the edit
 * modal opened from the Style workspace / China Import registry. The
 * markup is the same in both places so users see one form, not two
 * variants of the same fields.
 *
 * State + payload-builder live INSIDE this component. The parent
 * page / modal owns the chrome (breadcrumb + sticky footer for the
 * page, Dialog + footer buttons for the modal) and drives the
 * submit through the imperative handle below.
 *
 *   const formRef = useRef<StyleIntakeFormHandle>(null);
 *   <Button onClick={() => void formRef.current?.submit()} />
 *   <StyleIntakeForm ref={formRef} source={source} onSaved={...} />
 *
 * `onSaved` fires with the created/updated Style when the submit
 * succeeds; the parent decides where to navigate next.
 */
export interface StyleIntakeFormHandle {
  /** Trigger submit. Returns the saved Style on success. */
  submit: () => Promise<Style | null>;
  /** Read live validity for footer button enable/disable. */
  isValid: () => boolean;
  /** Current fine-category code (e.g. "DR") — feeds the page footer chip. */
  getCategoryCode: () => string | null;
}

export interface StyleIntakeFormProps {
  /** `sampling` or `china_import`. The page toggles this; the modal
   *  pins it to the style's existing source. */
  source: StyleSource;
  /** When provided, the form opens in EDIT mode (PATCH on submit,
   *  prefilled from the style). When null/undefined, CREATE mode. */
  style?: Style | null;
  /** Display name shown in the read-only "Pattern Master" cell.
   *  Resolved by the parent via the same routing rule used elsewhere
   *  (women + unisex → Parul, men → Pradyuman, china_import →
   *  Dheeraj). Keeping it as a prop avoids importing the user list
   *  here just for the label. */
  patternMasterName: string;
  patternMasterRoleLabel: string;
  /** Master data — fetched by parent so the same lists power the
   *  page and the modal without double-loading. */
  fabrics: Fabric[];
  categories: CategoryWithStyleCode[];
  onFabricsChanged: (next: Fabric[]) => void;
  onCategoriesChanged: (next: CategoryWithStyleCode[]) => void;
  /** Notified when the form becomes valid / invalid, so the parent
   *  can enable/disable its submit button without polling. */
  onValidityChange?: (valid: boolean) => void;
  /** Notified when the user changes gender — the page's ReviewerCard
   *  + sticky footer label depend on it. */
  onGenderChange?: (next: Gender) => void;
  /** Callback the imperative `submit` calls on success. */
  onSaved: (style: Style) => Promise<void> | void;
  /**
   * Builds the actual API call. The form has all the data; the parent
   * supplies the verb (createStyle vs patchStyle) plus any extra
   * wiring it needs (route navigation, refetch, etc.).
   */
  apiCall: (payload: unknown) => Promise<Style>;
}

type FormState = {
  workingName: string;
  developmentReason: string;
  fabricId: number | null;
  sampleFabricRequired: string;
  gender: Gender;
  categoryId: number | null;
  categoryCode: FineCategoryCode | string | null;
  primaryColour: string;
  referenceLink: string;
  referenceImages: string[];
  referenceImageUrl: string | null;
  patternCadPaths: string[];
  remark: string;
  /** Days, kept as a string so an empty input distinguishes from `0`. */
  samplingTimeline: string;
};

function defaultCategoryCode(gender: Gender): FineCategoryCode {
  return GENDER_CATEGORIES[gender][0];
}

/**
 * Map the BE's StyleGender (`W`/`M`/`U`) back to the long-form Gender
 * (`women`/`men`/`unisex`) the FE form uses. Falls back to `women`
 * when the value is missing or unrecognised so the form is always in
 * a known state.
 */
function toFormGender(g: unknown): Gender {
  if (g === 'W' || g === 'women') return 'women';
  if (g === 'M' || g === 'men') return 'men';
  if (g === 'U' || g === 'unisex') return 'unisex';
  return 'women';
}

/**
 * Hoist the legacy "Sampling timeline: 5" suffix from
 * `developmentReason` (where the create flow stashes it) back into
 * its own field for edit mode, then strip it from the body so we
 * don't double-write on save.
 */
function splitTimelineFromReason(reason: string | null | undefined): {
  reason: string;
  timeline: string;
} {
  if (!reason) return { reason: '', timeline: '' };
  const match = /\n?\s*Sampling timeline:\s*([0-9]+)\s*$/.exec(reason);
  if (!match) return { reason, timeline: '' };
  return {
    reason: reason.slice(0, match.index).trimEnd(),
    timeline: match[1],
  };
}

function buildInitialForm(style: Style | null | undefined): FormState {
  if (!style) {
    return {
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
    };
  }
  const { reason, timeline } = splitTimelineFromReason(style.developmentReason);
  // Style fields don't expose categoryId on the FE type today but it's
  // present at runtime (Prisma include); read defensively.
  const categoryId =
    (style as unknown as { categoryId?: number }).categoryId ?? null;
  return {
    workingName: style.workingName ?? '',
    developmentReason: reason,
    fabricId: style.fabricId ?? null,
    sampleFabricRequired:
      style.sampleFabricRequired == null
        ? ''
        : String(style.sampleFabricRequired),
    gender: toFormGender(style.gender),
    categoryId,
    categoryCode:
      (style.categoryCode as FineCategoryCode | null) ??
      defaultCategoryCode(toFormGender(style.gender)),
    primaryColour: style.primaryColour ?? '',
    referenceLink: style.referenceLink ?? '',
    referenceImages: style.referenceImages ?? [],
    referenceImageUrl: style.referenceImageUrl ?? null,
    patternCadPaths: style.patternCadPaths ?? [],
    remark: style.remark ?? '',
    samplingTimeline: timeline,
  };
}

const StyleIntakeForm = forwardRef<StyleIntakeFormHandle, StyleIntakeFormProps>(
  function StyleIntakeForm(
    {
      source,
      style,
      patternMasterName,
      patternMasterRoleLabel,
      fabrics,
      categories,
      onFabricsChanged,
      onCategoriesChanged,
      onValidityChange,
      onGenderChange: notifyGenderChange,
      onSaved,
      apiCall,
    },
    handleRef,
  ) {
    const { t } = useTranslation();
    const isChinaImport = source === 'china_import';
    const isEdit = !!style;

    const [form, setForm] = useState<FormState>(() => buildInitialForm(style));

    // Re-seed when the parent swaps the style under us (e.g. modal
    // reopened for a different row). We deliberately don't re-seed on
    // every render — only when the underlying style identity changes.
    useEffect(() => {
      setForm(buildInitialForm(style));
      // Style.id is the stable identity; falsy when create mode.
    }, [style?.id]);

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

    // Gender → category cascade. Switching gender resets category if
    // the current one isn't valid for the new gender bucket.
    const onGenderChange = (next: Gender) => {
      setForm((f) => {
        const allowed = GENDER_CATEGORIES[next];
        const currentCode = (f.categoryCode ?? '').toString().toUpperCase();
        const stillValid = (allowed as readonly string[]).includes(currentCode);
        if (stillValid) return { ...f, gender: next };
        const code = allowed[0];
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
      notifyGenderChange?.(next);
    };

    // Notify on initial mount + on style swap so the parent's
    // reviewer label tracks the prefilled gender too.
    useEffect(() => {
      notifyGenderChange?.(form.gender);
      // notifyGenderChange is a stable callback in practice; we only
      // re-run when the form's authoritative gender flips.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.gender]);

    const selectedFabric = useMemo(
      () => fabrics.find((f) => f.id === form.fabricId) ?? null,
      [fabrics, form.fabricId],
    );

    // When the chosen fabric stocks exactly one colour, default the (empty)
    // product colour to it — the common cut-and-sew case. Multiple-colour
    // fabrics surface their colours as the picker's top suggestions instead,
    // and an existing colour is never overwritten.
    useEffect(() => {
      if (selectedFabric?.colours?.length === 1 && !form.primaryColour.trim()) {
        set('primaryColour', selectedFabric.colours[0].name);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFabric]);

    const isValid = form.workingName.trim().length > 0;

    // Notify the parent on every validity flip so it can enable / disable
    // its submit button without subscribing to form state changes.
    useEffect(() => {
      onValidityChange?.(isValid);
    }, [isValid, onValidityChange]);

    const buildPayload = (): Record<string, unknown> => {
      const code =
        (form.categoryCode as string | null) ??
        defaultCategoryCode(form.gender);
      const articleCategory = deriveArticleCategory(form.gender, code);

      const base: Record<string, unknown> = {
        category: articleCategory,
        articleCategory,
        categoryId: form.categoryId ?? undefined,
        workingName: form.workingName.trim() || null,
        gender: form.gender,
        primaryColour: form.primaryColour.trim() || null,
        referenceLink: form.referenceLink.trim() || null,
        referenceImages: form.referenceImages,
        referenceImageUrl: form.referenceImageUrl,
      };
      // Source only travels on create. PATCH already knows it.
      if (!isEdit) base.source = source;

      if (isChinaImport) {
        return { ...base, remark: form.remark.trim() || null };
      }

      // Sampling body. samplingTimeline rides on developmentReason as
      // a tagged suffix until the BE adds a dedicated column.
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

    useImperativeHandle(
      handleRef,
      () => ({
        async submit() {
          if (!isValid) return null;
          const saved = await apiCall(buildPayload());
          await onSaved(saved);
          return saved;
        },
        isValid: () => isValid,
        getCategoryCode: () =>
          (form.categoryCode as string | null) ?? null,
      }),
      // intentional dep list: rebuild whenever the form or wiring
      // changes so submit() reads the latest values.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isValid, form, source, isEdit, apiCall, onSaved],
    );

    const uomLabel = (u: Fabric['unitOfMeasure']) => {
      if (u === 'meter') return 'm';
      if (u === 'kg') return 'kg';
      if (u === 'oz') return 'oz';
      return 'm';
    };

    return (
      <>
        {/* Two-up grid: Inspiration | Article */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                  entityId={style?.id ?? 'new'}
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
                  autoFocus={!isEdit}
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
                    onCategoriesChanged([...categories, c])
                  }
                />
              </div>
              <div>
                <Label>{t('admin.styles.intake.primaryColour')}</Label>
                <ColourPicker
                  value={form.primaryColour}
                  onChange={(next) => set('primaryColour', next)}
                  placeholder={t('admin.styles.intake.primaryColourPh')}
                  fabricColours={selectedFabric?.colours ?? []}
                />
              </div>
              {!isChinaImport && (
                <div>
                  <Label>
                    {t('admin.styles.intake.developmentReason')}
                  </Label>
                  <Textarea
                    value={form.developmentReason}
                    onChange={(e) =>
                      set('developmentReason', e.target.value)
                    }
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
                      onFabricsChanged([...fabrics, f])
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
                    <span
                      className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-medium text-[var(--color-muted-foreground)]"
                      aria-hidden
                    >
                      {uomLabel(selectedFabric?.unitOfMeasure ?? null)}
                    </span>
                  </div>
                </div>
                <div>
                  <Label>
                    {t('admin.styles.intake.samplingTimeline')}
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={form.samplingTimeline}
                      onChange={(e) =>
                        set('samplingTimeline', e.target.value)
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
                  <Label>{t('admin.styles.intake.patternMaster')}</Label>
                  <div className="flex h-12 items-center rounded-[10px] border border-[var(--color-input)] bg-[var(--color-muted)] px-3.5 text-[14px] text-[var(--color-foreground)]">
                    {t('admin.styles.intake.patternMasterReadonly', {
                      name: patternMasterName,
                      role: patternMasterRoleLabel,
                    })}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label>
                    {t(
                      'admin.styles.drawer.fields.patternCad',
                      'Pattern / CAD',
                    )}
                  </Label>
                  <PatternCadInput
                    entityId={style?.id ?? 'new'}
                    patternCadPaths={form.patternCadPaths}
                    onChange={(p) => set('patternCadPaths', p)}
                  />
                </div>
              </div>
            </IntakeCard>
          </div>
        )}
      </>
    );
  },
);

export default StyleIntakeForm;
