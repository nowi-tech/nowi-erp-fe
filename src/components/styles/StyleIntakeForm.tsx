import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

import PatternCadInput from "@/components/shared/PatternCadInput";
import IntakeCard from "@/components/styles/intake/IntakeCard";
import GenderSegment from "@/components/styles/intake/GenderSegment";
import CategoryPicker from "@/components/styles/intake/CategoryPicker";
import FabricPicker from "@/components/styles/intake/FabricPicker";
import ColourPicker from "@/components/styles/intake/ColourPicker";
import ReferenceImageGrid from "@/components/styles/intake/ReferenceImageGrid";
import {
  GENDER_CATEGORIES,
  deriveArticleCategory,
  type FineCategoryCode,
} from "@/components/styles/intake/categoryOptions";

import {
  listStyles,
  spawnColourVariant,
  type LinkExtractResult,
} from "@/api/styles";
import { cn } from "@/lib/utils";

import type {
  CategoryWithStyleCode,
  Fabric,
  Gender,
  Style,
  StyleSource,
} from "@/api/types";

/**
 * The three submission paths offered at the top of a *new* sampling
 * intake (the A/B/C fork from the workspace submission-flow spec,
 * docs/STYLE_SUBMISSION_FLOWS.md in the erp workspace root):
 *   - `new`       — net-new design → full sampling.
 *   - `colour`    — a colour of an existing style → spawned as a colour
 *                   variant (skips sampling, inherits the family).
 *   - `based_on`  — a *different* design that reused an existing approved
 *                   sample to skip sampling → carries `basedOnStyleId`.
 *
 * The fork only exists in create mode; edit never re-forks a style.
 */
export type SubmissionForkMode = "new" | "colour" | "based_on";

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

/** Resolved fork target — either an existing Style row picked from the
 *  list, or a free-typed style code the BE will resolve. Exactly one of
 *  `style` / `code` is populated; null when nothing is picked yet. */
type ForkTarget =
  | { style: Style; code: null }
  | { style: null; code: string }
  | null;

export interface StyleIntakeFormProps {
  /** `sampling` or `china_import`. The page toggles this; the modal
   *  pins it to the style's existing source. */
  source: StyleSource;
  /** When provided, the form opens in EDIT mode (PATCH on submit,
   *  prefilled from the style). When null/undefined, CREATE mode. */
  style?: Style | null;
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
  /** Notified when the user switches the submission fork (new / colour /
   *  based-on) so the page can adapt its copy. Create mode only. */
  onForkModeChange?: (next: SubmissionForkMode) => void;
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
  if (g === "W" || g === "women") return "women";
  if (g === "M" || g === "men") return "men";
  if (g === "U" || g === "unisex") return "unisex";
  return "women";
}

/**
 * Tiny inline pill shown next to a field the AI pre-filled from the pasted
 * link / uploaded image. `low` flips it to an amber "please confirm" state
 * when the model's confidence was weak. Suggestions are always editable —
 * this is just provenance, not a lock.
 */
function AiFilledBadge({ low }: { low?: boolean }) {
  return (
    <span
      className={cn(
        "ml-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-medium",
        low ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700",
      )}
    >
      ✨ {low ? "check this" : "from link"}
    </span>
  );
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
  if (!reason) return { reason: "", timeline: "" };
  const match = /\n?\s*Sampling timeline:\s*([0-9]+)\s*$/.exec(reason);
  if (!match) return { reason, timeline: "" };
  return {
    reason: reason.slice(0, match.index).trimEnd(),
    timeline: match[1],
  };
}

function buildInitialForm(style: Style | null | undefined): FormState {
  if (!style) {
    return {
      workingName: "",
      developmentReason: "",
      fabricId: null,
      sampleFabricRequired: "",
      gender: "women",
      categoryId: null,
      categoryCode: defaultCategoryCode("women"),
      primaryColour: "",
      referenceLink: "",
      referenceImages: [],
      referenceImageUrl: null,
      patternCadPaths: [],
      remark: "",
      samplingTimeline: "",
    };
  }
  const { reason, timeline } = splitTimelineFromReason(style.developmentReason);
  // Style fields don't expose categoryId on the FE type today but it's
  // present at runtime (Prisma include); read defensively.
  const categoryId =
    (style as unknown as { categoryId?: number }).categoryId ?? null;
  return {
    workingName: style.workingName ?? "",
    developmentReason: reason,
    fabricId: style.fabricId ?? null,
    sampleFabricRequired:
      style.sampleFabricRequired == null
        ? ""
        : String(style.sampleFabricRequired),
    gender: toFormGender(style.gender),
    categoryId,
    categoryCode:
      (style.categoryCode as FineCategoryCode | null) ??
      defaultCategoryCode(toFormGender(style.gender)),
    primaryColour: style.primaryColour ?? "",
    referenceLink: style.referenceLink ?? "",
    referenceImages: style.referenceImages ?? [],
    referenceImageUrl: style.referenceImageUrl ?? null,
    patternCadPaths: style.patternCadPaths ?? [],
    remark: style.remark ?? "",
    samplingTimeline: timeline,
  };
}

/** One selectable radio-card in the submission fork (New / Colour / Based-on). */
function ForkCard({
  active,
  title,
  description,
  onSelect,
}: {
  active: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-md)] border p-3.5 text-left transition-colors",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-sm"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          active
            ? "border-[var(--color-primary)]"
            : "border-[var(--color-input)]",
        )}
      >
        {active && (
          <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[var(--color-foreground)]">
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] text-[var(--color-muted-foreground)]">
          {description}
        </span>
      </span>
    </button>
  );
}

/** Sentinel id for the synthetic "typed style code" option — never
 *  collides with a real (positive) Style.id. */
const TYPED_CODE_ID = -1;

/**
 * Picker for the colour / based-on fork. Loads one page of existing
 * sampling products once (`listStyles({ source: "sampling", take: 100 })`)
 * and filters them client-side through the Combobox, OR — when `allowCode`
 * (the based-on branch) — lets the user type a free-text style code the BE
 * will resolve. The colour branch needs a real row (the spawn endpoint
 * addresses the parent by id), so it never enables the free-text path.
 */
function StyleRefPicker({
  value,
  onChange,
  allowCode,
  placeholder,
  emptyLabel,
  addCodeLabel,
}: {
  value: ForkTarget;
  onChange: (next: ForkTarget) => void;
  allowCode: boolean;
  placeholder: string;
  emptyLabel: string;
  addCodeLabel: string;
}) {
  const [results, setResults] = useState<Style[]>([]);
  // Keep the picked style around so its row keeps rendering even when it
  // isn't in the loaded page.
  const pickedRef = useRef<Style | null>(value?.style ?? null);
  pickedRef.current = value?.style ?? pickedRef.current;

  // Load a generous page of existing styles once; the Combobox filters
  // them client-side as the user types. Soft-fails to an empty list so a
  // flaky search never blocks the form (same pattern as ColourPicker).
  useEffect(() => {
    let mounted = true;
    void listStyles({ source: "sampling", take: 100 })
      .then((res) => {
        if (mounted) setResults(res.data);
      })
      .catch(() => {
        if (mounted) setResults([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const styleLabel = (s: Style) =>
    s.styleId ?? s.workingName ?? `D-${s.draftNo ?? s.id}`;

  const options = useMemo<ComboboxOption<number>[]>(() => {
    const rows = [...results];
    const picked = pickedRef.current;
    if (picked && !rows.some((r) => r.id === picked.id)) rows.unshift(picked);
    const mapped = rows.map<ComboboxOption<number>>((s) => ({
      value: s.id,
      label: styleLabel(s),
      sublabel: [s.workingName, s.primaryColour].filter(Boolean).join(" · "),
      searchText: [s.styleId, s.workingName, s.primaryColour]
        .filter(Boolean)
        .join(" "),
    }));
    // A typed-only code (based-on) shows as a synthetic selected option
    // so the closed trigger reflects the choice.
    if (value?.code != null && !value.style) {
      mapped.unshift({ value: TYPED_CODE_ID, label: value.code });
    }
    return mapped;
  }, [results, value]);

  const comboValue: number | null = value?.style
    ? value.style.id
    : value?.code != null
      ? TYPED_CODE_ID
      : null;

  return (
    <Combobox<number>
      value={comboValue}
      options={options}
      onChange={(next) => {
        if (next == null || next === TYPED_CODE_ID) {
          // Clearing, or re-selecting the synthetic code row, is a no-op
          // beyond keeping the current value.
          if (next == null) onChange(null);
          return;
        }
        const hit =
          results.find((r) => r.id === next) ??
          (pickedRef.current?.id === next ? pickedRef.current : null);
        if (hit) onChange({ style: hit, code: null });
      }}
      onAddNew={
        allowCode
          ? (typed) => {
              const code = typed.trim();
              if (code) onChange({ style: null, code });
            }
          : undefined
      }
      addNewLabel={addCodeLabel}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
    />
  );
}

const StyleIntakeForm = forwardRef<StyleIntakeFormHandle, StyleIntakeFormProps>(
  function StyleIntakeForm(
    {
      source,
      style,
      fabrics,
      categories,
      onFabricsChanged,
      onCategoriesChanged,
      onValidityChange,
      onGenderChange: notifyGenderChange,
      onForkModeChange: notifyForkModeChange,
      onSaved,
      apiCall,
    },
    handleRef,
  ) {
    const { t } = useTranslation();
    const isChinaImport = source === "china_import";
    const isEdit = !!style;
    // The A/B/C submission fork only applies to a NEW sampling intake.
    // China-import has its own simplified path; edit never re-forks.
    const showFork = !isEdit && !isChinaImport;

    const [form, setForm] = useState<FormState>(() => buildInitialForm(style));
    // Submission fork (create + sampling only). Defaults to the net-new path.
    const [forkMode, setForkMode] = useState<SubmissionForkMode>("new");
    const [forkTarget, setForkTarget] = useState<ForkTarget>(null);

    // Re-seed when the parent swaps the style under us (e.g. modal
    // reopened for a different row). We deliberately don't re-seed on
    // every render — only when the underlying style identity changes.
    useEffect(() => {
      setForm(buildInitialForm(style));
      // Style.id is the stable identity; falsy when create mode.
    }, [style?.id]);

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

    // ── Link / image auto-fill (Gemini) ─────────────────────────────
    // `genderTouched` guards against clobbering a deliberate gender choice;
    // category/colour are only filled when still empty. `aiFilled` drives
    // the per-field "from link" badge and is cleared when the user edits.
    const genderTouched = useRef(false);
    const [aiFilled, setAiFilled] = useState<Record<string, boolean>>({});
    const [aiLowConfidence, setAiLowConfidence] = useState(false);

    const clearAiBadge = (k: string) =>
      setAiFilled((prev) => (prev[k] ? { ...prev, [k]: false } : prev));

    const handleExtracted = (r: LinkExtractResult) => {
      if (!r.ok) return;
      setAiLowConfidence(
        typeof r.confidence === "number" && r.confidence < 0.5,
      );
      const filled: string[] = [];
      setForm((f) => {
        const patch: Partial<FormState> = {};
        if (!genderTouched.current && r.gender) {
          patch.gender = toFormGender(r.gender);
          filled.push("gender");
        }
        // Drive category off the resolved categoryId (unambiguous), then
        // mirror its `code` into the form's categoryCode. Only when empty.
        if (f.categoryId == null && r.categoryId != null) {
          const cat = categories.find((c) => c.id === r.categoryId);
          if (cat) {
            patch.categoryId = cat.id;
            patch.categoryCode = (cat.code ?? "")
              .toUpperCase() as FineCategoryCode;
            filled.push("category");
          }
        }
        if (!f.primaryColour.trim() && r.colour) {
          patch.primaryColour = r.colour;
          filled.push("colour");
        }
        return Object.keys(patch).length ? { ...f, ...patch } : f;
      });
      if (filled.length) {
        setAiFilled((prev) => {
          const next = { ...prev };
          for (const k of filled) next[k] = true;
          return next;
        });
      }
    };

    // Gender → category cascade. Switching gender resets category if
    // the current one isn't valid for the new gender bucket.
    const onGenderChange = (next: Gender) => {
      genderTouched.current = true;
      clearAiBadge("gender");
      setForm((f) => {
        const allowed = GENDER_CATEGORIES[next];
        const currentCode = (f.categoryCode ?? "").toString().toUpperCase();
        const stillValid = (allowed as readonly string[]).includes(currentCode);
        if (stillValid) return { ...f, gender: next };
        const code = allowed[0];
        const hit = categories.find(
          (c) => (c.code ?? "").toUpperCase() === code,
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

    // Switching the fork is a hard reset of the link target so a stale
    // pick from another branch can never travel on submit.
    const onForkModeChange = (next: SubmissionForkMode) => {
      setForkMode(next);
      setForkTarget(null);
      notifyForkModeChange?.(next);
    };

    // Notify on mount so the page's submit label matches the default.
    useEffect(() => {
      if (showFork) notifyForkModeChange?.(forkMode);
      // Run once for the initial fork; subsequent changes flow through
      // onForkModeChange above.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showFork]);

    // Linking branches (colour / based-on) need a resolved target before
    // they can submit. The net-new branch only needs a working name.
    // Colour MUST resolve to a real row (the spawn endpoint addresses the
    // parent by id); based-on also accepts a typed code.
    // The colour branch ALSO needs a non-empty primary colour — a colour
    // variant whose defining attribute is blank is meaningless, and the
    // spawn endpoint would otherwise persist an empty string.
    const forkTargetOk =
      forkMode === "colour"
        ? forkTarget?.style != null && form.primaryColour.trim().length > 0
        : forkTarget != null;
    const needsForkTarget = showFork && forkMode !== "new";
    const isValid =
      form.workingName.trim().length > 0 && (!needsForkTarget || forkTargetOk);

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
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const samplingBody: Record<string, unknown> = {
        ...base,
        developmentReason: reason || null,
        fabricId: form.fabricId,
        sampleFabricRequired: form.sampleFabricRequired
          ? Number(form.sampleFabricRequired)
          : null,
        patternCadPaths: form.patternCadPaths,
      };

      // Fork hard-switch: emit EXACTLY ONE branch's link fields so a
      // stale target from a different branch can never leak onto the
      // payload. The `colour` branch never reaches createStyle() — it
      // goes through spawnColourVariant() in submit() below — so only
      // the `based_on` branch decorates the create payload, and it
      // sends `basedOnStyleId` / `basedOnStyleCode` ONLY (never
      // familyCode / parentStyleId; those belong to the colour path).
      if (showFork && forkMode === "based_on" && forkTarget) {
        if (forkTarget.style) {
          samplingBody.basedOnStyleId = forkTarget.style.id;
        } else {
          samplingBody.basedOnStyleCode = forkTarget.code;
        }
      }

      return samplingBody;
    };

    useImperativeHandle(
      handleRef,
      () => ({
        async submit() {
          if (!isValid) return null;
          // Colour-of-X must NOT use the normal create() — create()
          // ignores parentStyleId and would birth a standalone style.
          // Route through the colour-variant spawn so the child links
          // to its parent and inherits the family (skips sampling on
          // Approval #1). Requires a resolved parent *id* (the spawn
          // endpoint is /styles/:id/colour-variants); a typed-only
          // code can't address it, so the picker disables submit until
          // a row is resolved for this branch.
          if (showFork && forkMode === "colour" && forkTarget?.style) {
            const saved = await spawnColourVariant(forkTarget.style.id, {
              primaryColour: form.primaryColour.trim(),
              referenceLink: form.referenceLink.trim() || null,
              referenceImages: form.referenceImages,
              referenceImageUrl: form.referenceImageUrl,
            });
            await onSaved(saved);
            return saved;
          }
          // New design + Based-on both ride the normal create() path;
          // buildPayload() decides whether basedOnStyleId/Code travels.
          const saved = await apiCall(buildPayload());
          await onSaved(saved);
          return saved;
        },
        isValid: () => isValid,
        getCategoryCode: () => (form.categoryCode as string | null) ?? null,
      }),
      // intentional dep list: rebuild whenever the form or wiring
      // changes so submit() reads the latest values.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        isValid,
        form,
        source,
        isEdit,
        showFork,
        forkMode,
        forkTarget,
        apiCall,
        onSaved,
      ],
    );

    const uomLabel = (u: Fabric["unitOfMeasure"]) => {
      if (u === "meter") return "m";
      if (u === "kg") return "kg";
      if (u === "oz") return "oz";
      return "m";
    };

    return (
      <>
        {/* Submission fork — create + sampling only (A/B/C). */}
        {showFork && (
          <div className="mb-4">
            <IntakeCard
              title={t("admin.styles.intake.fork.title")}
              subtitle={t("admin.styles.intake.fork.subtitle")}
            >
              <div
                role="radiogroup"
                aria-label={t("admin.styles.intake.fork.title")}
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
              >
                <ForkCard
                  active={forkMode === "new"}
                  title={t("admin.styles.intake.fork.newTitle")}
                  description={t("admin.styles.intake.fork.newDesc")}
                  onSelect={() => onForkModeChange("new")}
                />
                <ForkCard
                  active={forkMode === "colour"}
                  title={t("admin.styles.intake.fork.colourTitle")}
                  description={t("admin.styles.intake.fork.colourDesc")}
                  onSelect={() => onForkModeChange("colour")}
                />
                <ForkCard
                  active={forkMode === "based_on"}
                  title={t("admin.styles.intake.fork.basedOnTitle")}
                  description={t("admin.styles.intake.fork.basedOnDesc")}
                  onSelect={() => onForkModeChange("based_on")}
                />
              </div>

              {forkMode !== "new" && (
                <div className="mt-4">
                  <Label>
                    {forkMode === "colour"
                      ? t("admin.styles.intake.fork.colourPickLabel")
                      : t("admin.styles.intake.fork.basedOnPickLabel")}
                  </Label>
                  <StyleRefPicker
                    value={forkTarget}
                    onChange={setForkTarget}
                    allowCode={forkMode === "based_on"}
                    placeholder={t("admin.styles.intake.fork.pickPlaceholder")}
                    emptyLabel={t("admin.styles.intake.fork.pickEmpty")}
                    addCodeLabel={t("admin.styles.intake.fork.addCode")}
                  />
                  <p className="mt-1.5 text-[12px] text-[var(--color-muted-foreground)]">
                    {forkMode === "colour"
                      ? t("admin.styles.intake.fork.colourHelp")
                      : t("admin.styles.intake.fork.basedOnHelp")}
                  </p>
                </div>
              )}
            </IntakeCard>
          </div>
        )}

        {/* Two-up grid: Inspiration | Article */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <IntakeCard
            title={t("admin.styles.intake.inspiration")}
            subtitle={t("admin.styles.intake.inspirationSubtitle")}
          >
            <div className="space-y-4">
              <div>
                <Label>{t("admin.styles.intake.referenceLink")}</Label>
                <Input
                  value={form.referenceLink}
                  onChange={(e) => set("referenceLink", e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div>
                <Label>{t("admin.styles.intake.referenceImage")}</Label>
                <ReferenceImageGrid
                  entityId={style?.id ?? "new"}
                  value={form.referenceImages}
                  referenceLink={form.referenceLink || null}
                  onChange={(next) => set("referenceImages", next)}
                  onPrimaryUrlChange={(u) => set("referenceImageUrl", u)}
                  onExtracted={handleExtracted}
                />
              </div>
              {isChinaImport && (
                <div>
                  <Label>{t("admin.styles.intake.remark")}</Label>
                  <Textarea
                    value={form.remark}
                    onChange={(e) => set("remark", e.target.value)}
                    placeholder={t("admin.styles.intake.remarkPh")}
                  />
                </div>
              )}
            </div>
          </IntakeCard>

          <IntakeCard
            title={t("admin.styles.intake.article")}
            subtitle={t("admin.styles.intake.articleSubtitle")}
          >
            <div className="space-y-4">
              <div>
                <Label>{t("admin.styles.intake.workingName")} *</Label>
                <Input
                  value={form.workingName}
                  onChange={(e) => set("workingName", e.target.value)}
                  placeholder={t("admin.styles.intake.workingNamePh")}
                  autoFocus={!isEdit}
                />
              </div>
              <div>
                <Label>
                  {t("admin.styles.intake.gender")}
                  {aiFilled.gender && <AiFilledBadge />}
                </Label>
                <GenderSegment
                  value={form.gender}
                  onChange={onGenderChange}
                  labels={{
                    women: t("admin.styles.intake.genderWomen"),
                    men: t("admin.styles.intake.genderMen"),
                    unisex: t("admin.styles.intake.genderUnisex"),
                  }}
                />
              </div>
              <div>
                <Label>
                  {t("admin.styles.intake.category")}
                  {aiFilled.category && (
                    <AiFilledBadge low={aiLowConfidence} />
                  )}
                </Label>
                <CategoryPicker
                  categories={categories}
                  value={form.categoryId}
                  fallbackCode={
                    (form.categoryCode as FineCategoryCode | null) ?? null
                  }
                  gender={form.gender}
                  onChange={({ categoryId, code }) => {
                    clearAiBadge("category");
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
                <Label>
                  {t("admin.styles.intake.primaryColour")}
                  {aiFilled.colour && <AiFilledBadge />}
                </Label>
                <ColourPicker
                  value={form.primaryColour}
                  onChange={(next) => {
                    clearAiBadge("colour");
                    set("primaryColour", next);
                  }}
                  placeholder={t("admin.styles.intake.primaryColourPh")}
                />
              </div>
              {!isChinaImport && (
                <div>
                  <Label>{t("admin.styles.intake.developmentReason")}</Label>
                  <Textarea
                    value={form.developmentReason}
                    onChange={(e) => set("developmentReason", e.target.value)}
                    placeholder={t("admin.styles.intake.developmentReasonPh")}
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
              title={t("admin.styles.intake.samplingSpecifics")}
              subtitle={t("admin.styles.intake.samplingSpecificsSubtitle")}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>{t("admin.styles.intake.fabric")}</Label>
                  <FabricPicker
                    fabrics={fabrics}
                    value={form.fabricId}
                    onChange={(next) => set("fabricId", next)}
                    onFabricCreated={(f) => onFabricsChanged([...fabrics, f])}
                  />
                </div>
                <div>
                  <Label>{t("admin.styles.intake.sampleFabricRequired")}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.sampleFabricRequired}
                      onChange={(e) =>
                        set("sampleFabricRequired", e.target.value)
                      }
                      placeholder={t(
                        "admin.styles.intake.sampleFabricRequiredHelp",
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
                  <Label>{t("admin.styles.intake.samplingTimeline")}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={form.samplingTimeline}
                      onChange={(e) => set("samplingTimeline", e.target.value)}
                      placeholder="0"
                    />
                    <span
                      className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-medium text-[var(--color-muted-foreground)]"
                      aria-hidden
                    >
                      {Number(form.samplingTimeline) === 1 ? "day" : "days"}
                    </span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label>
                    {t(
                      "admin.styles.drawer.fields.patternCad",
                      "Pattern / CAD",
                    )}
                  </Label>
                  <PatternCadInput
                    entityId={style?.id ?? "new"}
                    patternCadPaths={form.patternCadPaths}
                    onChange={(p) => set("patternCadPaths", p)}
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
