import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Palette,
  Pause,
  Pencil,
  Play,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import SamplingPipelineStepper from '@/components/styles/SamplingPipelineStepper';
import PatternCadPreview from '@/components/styles/PatternCadPreview';
import AddColourModal from '@/components/styles/AddColourModal';
import StyleEditModal from '@/components/styles/StyleEditModal';
import {
  getStyle,
  parkStyle,
  reviveStyle,
  approveStyle,
  sampleApproveStyle,
  patchStyle,
  listFabrics,
  type SamplingStatus,
  type SampleApprovalStatus,
  type ApproveStyleBody,
  type SampleApproveStyleBody,
} from '@/api/styles';
import { listUsers } from '@/api/users';
import type {
  Fabric,
  Style,
  User as ApiUser,
} from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Per-style deep page (canonical_style_workspace.html).
 *
 * Header: style # + collection + source chip + last-updated.
 * Action bar: Edit · Print Tech Pack · Park/Revive · Send to PD (v2)
 *             + Approve / Sample-approve when lifecycle allows.
 * Body: sampling pipeline stepper · core specs · variants matrix ·
 *       pattern approval (gender-routed) · channels & virtual inventory ·
 *       inspection history · fabric notes · inspiration.
 *
 * `:styleId` URL param accepts either the numeric DB id or the Style #
 * (e.g. `NOWI-W-DR-1001`). The BE getStyle endpoint is expected to
 * resolve both.
 */
export default function StyleWorkspace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { styleId: idParam } = useParams<{ styleId: string }>();

  const [style, setStyle] = useState<Style | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [sampleApproveOpen, setSampleApproveOpen] = useState(false);
  const [colourModalOpen, setColourModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // StyleEditModal lazy-loads its own fabric master on first open;
  // we still pre-warm it here so the user doesn't see the modal
  // flicker into pickers. Collection was dropped from the schema.
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const ensureMasterData = useCallback(async () => {
    if (fabrics.length === 0) {
      try {
        const f = await listFabrics();
        setFabrics(f);
      } catch {
        /* soft-fail — modal will refetch itself */
      }
    }
  }, [fabrics.length]);


  const load = useCallback(async () => {
    if (!idParam) return;
    setLoading(true);
    try {
      const s = await getStyle(idParam);
      setStyle(s);
    } catch {
      setStyle(null);
    } finally {
      setLoading(false);
    }
  }, [idParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const doAction = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      toast.show('Saved.', 'success');
      await load();
    } catch {
      toast.show('Action failed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-[var(--color-muted-foreground)]">
        Loading…
      </div>
    );
  }

  if (!style) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/styles')}>
          <ArrowLeft size={14} />
          <span className="ml-1">{t('admin.styles.title')}</span>
        </Button>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t('admin.styles.workspace.notFound')}
        </p>
      </div>
    );
  }

  // China Import is a simple single-approval flow — no sampling stage,
  // no Approval #2, no inspections. Sampling-only UI is hidden for it.
  const isChinaImport = style.source === 'china_import';
  const canApproveIntake = style.lifecycle === 'draft';
  const canSampleApprove =
    !isChinaImport && style.lifecycle === 'in_sampling';
  const canPark = style.lifecycle !== 'parked' && style.lifecycle !== 'archived';
  const canRevive = style.lifecycle === 'parked';
  const sourceLabel = t(`admin.styles.source.${style.source}`);

  const cardClasses =
    'bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-5 shadow-sm';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <button
              type="button"
              onClick={() => navigate('/styles')}
              className="hover:underline inline-flex items-center"
            >
              <ArrowLeft size={12} />
              <span className="ml-1">{t('admin.styles.title')}</span>
            </button>
            <span>/</span>
            <span>{style.workingName ?? '—'}</span>
          </div>
          <h1 className="font-mono text-2xl font-semibold text-[var(--color-primary)] mt-1 tracking-wide">
            {style.styleId ?? `(${t('admin.styles.draft')})`}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* For China Import styles the source IS the story — surface
                it. For sampling styles the NOWI prefix already implies
                source, and the lifecycle chip below carries the same
                "in sampling" signal, so the source chip is redundant
                and we omit it. */}
            {isChinaImport && (
              <Badge variant="stitch">{sourceLabel}</Badge>
            )}
            <Badge variant="secondary">
              {t(`admin.styles.lifecycle.${style.lifecycle}`)}
            </Badge>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {t('admin.styles.workspace.lastUpdated', {
                when: new Date(style.updatedAt).toLocaleString(),
              })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void ensureMasterData();
              setEditOpen(true);
            }}
          >
            <Pencil size={14} />
            <span className="ml-1">
              {t('admin.styles.workspace.edit', { defaultValue: 'Edit' })}
            </span>
          </Button>
          {canPark && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void doAction('park', () =>
                  parkStyle(style.id, { reason: 'Paused from Workspace' }),
                )
              }
            >
              <Pause size={14} />
              <span className="ml-1">{t('admin.styles.workspace.park')}</span>
            </Button>
          )}
          {canRevive && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void doAction('revive', () => reviveStyle(style.id))}
            >
              <Play size={14} />
              <span className="ml-1">{t('admin.styles.workspace.revive')}</span>
            </Button>
          )}
          {canApproveIntake && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                if (isChinaImport) {
                  // China Import keeps the lightweight single-click approve.
                  void doAction('approve', () => approveStyle(style.id));
                } else {
                  setApproveOpen(true);
                }
              }}
            >
              <CheckCircle2 size={14} />
              <span className="ml-1">{t('admin.styles.workspace.approve')}</span>
            </Button>
          )}
          {/* Sample sign-off ("Approve sample") used to live as a header
              button here. It now lives inside the pipeline stepper —
              clicking the locked "Approved" pill opens the same dialog.
              Keeping it in one place avoids the orphaned-floating-button
              feel and reinforces that approval is the terminal step of
              the pipeline, not a separate action. */}
          {/* + Add colour — spawns a sibling Style inheriting fabric/CAD
              from this one. Only meaningful once the parent style number
              is minted (i.e. past draft). */}
          {style.styleId && !isChinaImport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColourModalOpen(true)}
            >
              <Palette size={14} />
              <span className="ml-1">
                {t('admin.styles.workspace.addColour', 'Add colour')}
              </span>
            </Button>
          )}
        </div>
      </div>

      <AddColourModal
        parent={style}
        open={colourModalOpen}
        onClose={() => setColourModalOpen(false)}
        onCreated={(created) => {
          // Navigate to the new variant so the designer can pick up the
          // sample flow from there. Use numeric id when no styleId is
          // minted yet (it's a draft).
          navigate(`/styles/${created.styleId ?? created.id}`);
        }}
      />

      {/* Full editor — renders the SAME shared form the /styles/new
          page uses, wrapped in a centered modal. One UX surface for
          create + edit; the page chrome (breadcrumb / source toggle /
          reviewer card) just gets swapped for a Dialog + Save button. */}
      <StyleEditModal
        open={editOpen}
        style={style}
        onClose={() => setEditOpen(false)}
        onSaved={(saved) => {
          // If the styleId changed (e.g. after first approval mints
          // it) route to the new canonical URL; otherwise just
          // refresh the current page.
          if (saved.styleId && saved.styleId !== style.styleId) {
            navigate(`/styles/${saved.styleId}`);
          } else {
            void load();
          }
        }}
      />

      {/* Inspiration — visual anchor at the top of the body, above the
          workflow state. Empty when the style has no images / link. */}
      <InspirationCard style={style} cardClasses={cardClasses} />

      {/* China Import: simple "Approved by X on DATE" record card.
          Gurukul flow has no sampling phase — just the single intake
          approval by Dheeraj that mints the NW- number. Shown only
          after approval; pre-approval the only thing on the page is
          Inspiration + Specs + Activity. */}
      {isChinaImport && style.approvedAt && (
        <ChinaImportApprovalCard style={style} cardClasses={cardClasses} />
      )}

      {/* Recorded intake approval checks — sampling flow, already approved */}
      {!isChinaImport && style.approvedAt && (
        <section className={cardClasses}>
          <h2 className="font-serif text-lg mb-3">
            {t('admin.styles.approval1.recordedTitle')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <ApprovalCheckRow
              label={t('admin.styles.approval1.fabricFeasible')}
              value={style.approval1FabricFeasible}
            />
            <ApprovalCheckRow
              label={t('admin.styles.approval1.priceOk')}
              value={style.approval1PriceOk}
            />
            <ApprovalCheckRow
              label={t('admin.styles.approval1.collectionFit')}
              value={style.approval1CollectionFit}
            />
          </div>
          {style.approval1Note && (
            <p className="mt-3 text-sm whitespace-pre-wrap text-[var(--color-foreground-2)]">
              {style.approval1Note}
            </p>
          )}
        </section>
      )}

      {/* Sampling pipeline — not applicable to China Import styles.
          Approved pill in the stepper opens the sample sign-off dialog
          (same one the explicit "Approve sample" button would have
          opened); "Send back" sets samplingStatus = corrections_needed
          via patchStyle so the audit log + side-effects stay clean. */}
      {!isChinaImport && (
        <section className={cardClasses}>
          <h2 className="font-serif text-lg mb-3">
            {t('admin.styles.workspace.samplingPipeline')}
          </h2>
          <SamplingPipelineStepper
            samplingStatus={style.samplingStatus as SamplingStatus | null}
            onStepClick={(next) =>
              void doAction('step', () =>
                patchStyle(style.id, { samplingStatus: next }),
              )
            }
            onApproveClick={
              canSampleApprove ? () => setSampleApproveOpen(true) : undefined
            }
            onSendBack={() =>
              void doAction('send-back', () =>
                patchStyle(style.id, {
                  samplingStatus: 'corrections_needed',
                }),
              )
            }
          />
        </section>
      )}

      {/* Inline sample-workflow state editor. Pattern Master updates
          Sampling Status / DXF / Fit Session without going through
          either approval dialog. Sampling source only. */}
      {!isChinaImport && (
        <section className={cardClasses}>
          <SampleStateCard
            style={style}
            busy={busy !== null}
            onSave={(patch) =>
              void doAction('state', () => patchStyle(style.id, patch))
            }
          />
        </section>
      )}

      {/* Specs (left) + Pattern/CAD preview (right). Two-up on lg.
          The CAD card always renders so the designer can see at a
          glance whether files have been uploaded — empty state nudges
          them to the edit drawer. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className={cn(cardClasses, 'lg:col-span-6')}>
          <h2 className="font-serif text-lg mb-3">
            {t('admin.styles.workspace.coreSpecs')}
          </h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <Spec label="Gender" value={style.gender ?? '—'} />
            <Spec label="Category" value={style.categoryCode ?? '—'} />
            <Spec label="Fabric" value={style.fabric?.name ?? '—'} />
            <Spec
              label="Primary colour"
              value={style.primaryColour ?? '—'}
            />
            {!isChinaImport && (
              <Spec
                label="Sampling timeline"
                value={renderSamplingTimeline(style.samplingTimeline)}
              />
            )}
            {!isChinaImport &&
              style.sampleFabricRequired != null && (
                <Spec
                  label="Sample fabric required"
                  value={`${style.sampleFabricRequired} ${
                    // Default to "m" when the fabric record has no
                    // unit-of-measure set, so the spec never reads as a
                    // bare number.
                    style.fabric?.unitOfMeasure === 'meter'
                      ? 'm'
                      : (style.fabric?.unitOfMeasure ?? 'm')
                  }`}
                />
              )}
          </dl>
        </section>

        <section className={cn(cardClasses, 'lg:col-span-6')}>
          <h2 className="font-serif text-lg mb-3">
            {t('admin.styles.drawer.patternCad.label', {
              defaultValue: 'Pattern / CAD',
            })}
          </h2>
          {style.patternCadPaths && style.patternCadPaths.length > 0 ? (
            <PatternCadPreview patternCadPaths={style.patternCadPaths} />
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('admin.styles.drawer.patternCad.none', {
                defaultValue:
                  'No pattern or CAD files uploaded yet. Use Edit to upload .dxf / .pdf / .png / .jpg.',
              })}
            </p>
          )}
        </section>
      </div>

      {/* Colour family chips — siblings + parent linked via
          parentStyleId. Now on its own row so the CAD preview gets
          the full right column above. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <ColourFamilyCard
          style={style}
          canAddColour={!!style.styleId && !isChinaImport}
          onAddColour={() => setColourModalOpen(true)}
        />
      </div>

      {/* Activity timeline — surfaces who did what when. Reads
          straight from style.auditLogs (already hydrated by the
          detail include). Replaces the old InspectionTimeline. */}
      <ActivityTimelineCard style={style} cardClasses={cardClasses} />

      {/* Approval #1 checklist dialog — sampling flow only */}
      <ApproveIntakeDialog
        open={approveOpen}
        busy={busy !== null}
        defaultPatternMasterId={style.patternMasterId}
        gender={style.gender}
        onClose={() => setApproveOpen(false)}
        onConfirm={(body) => {
          setApproveOpen(false);
          void doAction('approve', () => approveStyle(style.id, body));
        }}
      />

      {/* Approval #2 (sample sign-off) dialog — captures the Gurukul
          enums: verdict, DXF, fit session. Replaces the old single-
          click sample-approve. */}
      <SampleApproveDialog
        open={sampleApproveOpen}
        busy={busy !== null}
        currentDxfApproved={style.dxfApproved}
        currentModelFitSession={style.modelFitSession}
        onClose={() => setSampleApproveOpen(false)}
        onConfirm={(body) => {
          setSampleApproveOpen(false);
          void doAction('sample-approve', () =>
            sampleApproveStyle(style.id, body),
          );
        }}
      />
    </div>
  );
}

// Enum dropdown options — match the Gurukul workbook + BE Prisma enums.
const SAMPLING_STATUS_OPTIONS: SamplingStatus[] = [
  'in_progress_pattern_dev',
  'in_progress_fabric_sourcing',
  'in_progress_cutting',
  'in_progress_stitching',
  'ready_for_inspection',
  'handed_over_for_inspection',
  'corrections_needed',
  'approved_for_production',
];

const SAMPLE_APPROVAL_OPTIONS: SampleApprovalStatus[] = [
  'approved_for_production',
  'under_review_corrections',
  'pattern_correction_approved',
];

function ApproveIntakeDialog({
  open,
  busy,
  gender,
  defaultPatternMasterId,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  gender: Style['gender'];
  defaultPatternMasterId: number | null;
  onClose: () => void;
  onConfirm: (body: ApproveStyleBody) => void;
}) {
  const { t } = useTranslation();
  const [fabricFeasible, setFabricFeasible] = useState(false);
  const [priceOk, setPriceOk] = useState(false);
  const [collectionFit, setCollectionFit] = useState(false);
  const [note, setNote] = useState('');
  const [samplingStatus, setSamplingStatus] = useState<SamplingStatus | ''>('');
  const [patternMasterId, setPatternMasterId] = useState<number | null>(
    defaultPatternMasterId,
  );
  // Pattern Master picker fetched lazily on open — narrow to the two
  // PM roles + admin so override choices are sensible.
  const [pmCandidates, setPmCandidates] = useState<ApiUser[]>([]);

  // Reset the checklist each time the dialog opens, and seed the
  // Pattern Master dropdown with the auto-routed user.
  useEffect(() => {
    if (open) {
      setFabricFeasible(false);
      setPriceOk(false);
      setCollectionFit(false);
      setNote('');
      setSamplingStatus('');
      setPatternMasterId(defaultPatternMasterId);
    }
  }, [open, defaultPatternMasterId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listUsers({ take: 200 })
      .then((rows) => {
        if (cancelled) return;
        // Filter to Pattern Masters; show w/m matching the style's
        // gender first, then everyone else as fallback.
        const isPm = (u: ApiUser) =>
          u.role === 'pattern_master_w' ||
          u.role === 'pattern_master_m' ||
          u.role === 'admin';
        const matchesGender = (u: ApiUser) =>
          (gender === 'women' && u.role === 'pattern_master_w') ||
          (gender === 'men' && u.role === 'pattern_master_m') ||
          gender === 'unisex';
        const ordered = rows
          .filter(isPm)
          .sort((a, b) =>
            matchesGender(a) === matchesGender(b)
              ? a.name.localeCompare(b.name)
              : matchesGender(a)
                ? -1
                : 1,
          );
        setPmCandidates(ordered);
      })
      .catch(() => {
        if (!cancelled) setPmCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gender]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.approval1.dialogTitle')}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('admin.styles.approval1.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              onConfirm({
                approval1FabricFeasible: fabricFeasible,
                approval1PriceOk: priceOk,
                approval1CollectionFit: collectionFit,
                approval1Note: note.trim() || undefined,
                samplingStatus: samplingStatus || undefined,
                patternMasterId,
              })
            }
          >
            <CheckCircle2 size={14} />
            <span className="ml-1">{t('admin.styles.approval1.confirm')}</span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.approval1.dialogIntro')}
      </p>

      <div className="space-y-2">
        <CheckboxRow
          label={t('admin.styles.approval1.fabricFeasible')}
          checked={fabricFeasible}
          onChange={setFabricFeasible}
        />
        <CheckboxRow
          label={t('admin.styles.approval1.priceOk')}
          checked={priceOk}
          onChange={setPriceOk}
        />
        <CheckboxRow
          label={t('admin.styles.approval1.collectionFit')}
          checked={collectionFit}
          onChange={setCollectionFit}
        />
      </div>

      {/* Workflow state set at Approval #1 — both optional. */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval1.samplingStatus', {
              defaultValue: 'Initial sampling status',
            })}
          </label>
          <select
            value={samplingStatus}
            onChange={(e) =>
              setSamplingStatus(e.target.value as SamplingStatus | '')
            }
            className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <option value="">
              {t('admin.styles.approval1.samplingStatusUnset', {
                defaultValue: '—',
              })}
            </option>
            {SAMPLING_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`admin.styles.samplingStatus.${s}` as const, {
                  defaultValue: s,
                })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval1.patternMaster', {
              defaultValue: 'Pattern Master',
            })}
          </label>
          <select
            value={patternMasterId ?? ''}
            onChange={(e) =>
              setPatternMasterId(
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <option value="">
              {t('admin.styles.approval1.patternMasterUnset', {
                defaultValue: '— Unassigned',
              })}
            </option>
            {pmCandidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.role === 'pattern_master_w' ? " (Women's)" : ''}
                {u.role === 'pattern_master_m' ? " (Men's)" : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
          {t('admin.styles.approval1.note')}
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('admin.styles.approval1.notePlaceholder')}
        />
      </div>
    </Dialog>
  );
}

function SampleApproveDialog({
  open,
  busy,
  currentDxfApproved,
  currentModelFitSession,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  currentDxfApproved: Style['dxfApproved'];
  currentModelFitSession: Style['modelFitSession'];
  onClose: () => void;
  onConfirm: (body: SampleApproveStyleBody) => void;
}) {
  const { t } = useTranslation();
  const [verdict, setVerdict] = useState<SampleApprovalStatus>(
    'approved_for_production',
  );
  const [dxfApproved, setDxfApproved] = useState<'yes' | 'no' | ''>('');
  const [modelFitSession, setModelFitSession] = useState<
    'yes' | 'pending' | 'no' | ''
  >('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setVerdict('approved_for_production');
      setDxfApproved((currentDxfApproved as 'yes' | 'no' | null) ?? '');
      setModelFitSession(
        (currentModelFitSession as 'yes' | 'pending' | 'no' | null) ?? '',
      );
      setNote('');
    }
  }, [open, currentDxfApproved, currentModelFitSession]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.approval2.dialogTitle', {
        defaultValue: 'Approve sample',
      })}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('admin.styles.approval2.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              onConfirm({
                sampleApproval: verdict,
                dxfApproved: dxfApproved || undefined,
                modelFitSession: modelFitSession || undefined,
                note: note.trim() || undefined,
              })
            }
          >
            <CheckCircle2 size={14} />
            <span className="ml-1">
              {t('admin.styles.approval2.confirm', {
                defaultValue: 'Sign off',
              })}
            </span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.approval2.dialogIntro', {
          defaultValue:
            'Record the sample verdict. Only "Approved for production" advances the lifecycle — other verdicts log the state and keep the style in sampling for rework.',
        })}
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval2.verdict', {
              defaultValue: 'Sample verdict',
            })}
          </label>
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as SampleApprovalStatus)}
            className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {SAMPLE_APPROVAL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {t(`admin.styles.sampleApproval.${v}` as const, {
                  defaultValue: v,
                })}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
              {t('admin.styles.approval2.dxfApproved', {
                defaultValue: 'DXF approved (Karan)',
              })}
            </label>
            <select
              value={dxfApproved}
              onChange={(e) =>
                setDxfApproved(e.target.value as 'yes' | 'no' | '')
              }
              className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
              {t('admin.styles.approval2.modelFitSession', {
                defaultValue: 'Model / live fit session',
              })}
            </label>
            <select
              value={modelFitSession}
              onChange={(e) =>
                setModelFitSession(
                  e.target.value as 'yes' | 'pending' | 'no' | '',
                )
              }
              className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="pending">Pending</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval2.note', { defaultValue: 'Note' })}
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.styles.approval2.notePlaceholder', {
              defaultValue: 'Optional context — defects, corrections, …',
            })}
          />
        </div>
      </div>
    </Dialog>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-2)]/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-primary)]"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function ApprovalCheckRow({
  label,
  value,
}: {
  label: string;
  value: boolean | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 bg-[var(--color-surface-2)]/40">
      <span className="text-sm">{label}</span>
      <Badge
        variant={
          value === true ? 'success' : value === false ? 'outline' : 'outline'
        }
      >
        {value === true
          ? t('admin.styles.approval1.checkYes')
          : value === false
            ? t('admin.styles.approval1.checkNo')
            : t('admin.styles.approval1.checkUnset')}
      </Badge>
    </div>
  );
}

/**
 * Inline "Sample workflow" card — Excel-style. Every field is a live
 * dropdown; picking a value PATCHes immediately. No edit/save mode.
 *
 * Per-field saved/saving status lives next to each dropdown so the user
 * gets feedback without a blocking spinner. The Sampling Status field
 * also drives the SamplingPipelineStepper above (same column).
 */
function SampleStateCard({
  style,
  busy: _busy,
  onSave,
}: {
  style: Style;
  busy: boolean;
  onSave: (patch: {
    samplingStatus?: SamplingStatus | null;
    dxfApproved?: 'yes' | 'no' | null;
    modelFitSession?: 'yes' | 'pending' | 'no' | null;
    patternMasterId?: number | null;
  }) => void;
}) {
  const { t } = useTranslation();
  // Per-field saving / just-saved state — Excel-like ✓ flash after a
  // successful PATCH. We track by field key so two simultaneous saves
  // (e.g. clicking Sampling Status while DXF is still flashing) don't
  // step on each other.
  const [savedFlash, setSavedFlash] = useState<Record<string, true>>({});
  const flash = (key: string) => {
    setSavedFlash((cur) => ({ ...cur, [key]: true }));
    window.setTimeout(
      () =>
        setSavedFlash((cur) => {
          const next = { ...cur };
          delete next[key];
          return next;
        }),
      1500,
    );
  };

  const [pmCandidates, setPmCandidates] = useState<ApiUser[]>([]);
  useEffect(() => {
    let cancelled = false;
    void listUsers({ take: 200 })
      .then((rows) => {
        if (cancelled) return;
        setPmCandidates(
          rows.filter(
            (u) =>
              u.role === 'pattern_master_w' ||
              u.role === 'pattern_master_m' ||
              u.role === 'admin',
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setPmCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-lg">
          {t('admin.styles.workspace.sampleDetails', {
            defaultValue: 'Sample details',
          })}
        </h2>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">
          {t('admin.styles.workspace.sampleWorkflowHint', {
            defaultValue: 'Picks save instantly',
          })}
        </span>
      </div>

      {/* Sampling status is owned by the pipeline stepper above —
          dropping the dropdown here removes the redundant control
          and leaves only the independent fields (DXF / fit session /
          pattern master) in this card. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <FieldDropdown
          label="DXF approved"
          value={style.dxfApproved ?? ''}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          flashing={!!savedFlash.dxfApproved}
          onChange={(v) => {
            onSave({ dxfApproved: (v as 'yes' | 'no') || null });
            flash('dxfApproved');
          }}
        />
        <FieldDropdown
          label="Model / live fit session"
          value={style.modelFitSession ?? ''}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'pending', label: 'Pending' },
            { value: 'no', label: 'No' },
          ]}
          flashing={!!savedFlash.modelFitSession}
          onChange={(v) => {
            onSave({
              modelFitSession:
                (v as 'yes' | 'pending' | 'no') || null,
            });
            flash('modelFitSession');
          }}
        />
        <FieldDropdown
          label="Pattern Master"
          value={style.patternMasterId != null ? String(style.patternMasterId) : ''}
          options={pmCandidates.map((u) => ({
            value: String(u.id),
            label: `${u.name}${
              u.role === 'pattern_master_w'
                ? " (Women's)"
                : u.role === 'pattern_master_m'
                  ? " (Men's)"
                  : ''
            }`,
          }))}
          unsetLabel="— Unassigned"
          flashing={!!savedFlash.patternMasterId}
          onChange={(v) => {
            onSave({ patternMasterId: v ? Number(v) : null });
            flash('patternMasterId');
          }}
        />
      </div>
    </div>
  );
}

/**
 * Single labelled dropdown that PATCHes on change. Renders a small
 * "Saved ✓" pill for 1.5s after a successful pick, then fades. Empty
 * string is the "unset" sentinel — picking it sends null.
 */
function FieldDropdown({
  label,
  value,
  options,
  unsetLabel = '— Unset',
  flashing,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  unsetLabel?: string;
  flashing: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-[var(--color-muted-foreground)]">
          {label}
        </label>
        {flashing && (
          <span className="text-[10px] text-[var(--status-ready-acc)] inline-flex items-center gap-0.5 transition-opacity">
            <CheckCircle2 size={11} /> Saved
          </span>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex h-10 w-full rounded-[var(--radius-sm)] border bg-white px-2.5 transition-colors',
          flashing
            ? 'border-[var(--status-ready-acc)]'
            : 'border-[var(--color-border)]',
        )}
      >
        <option value="">{unsetLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Sampling timeline is stored as a free-form string at the moment
 * (legacy column shape). The intake form writes a plain integer count
 * of days now ("5"); some older rows still hold ISO dates from the
 * pre-revamp UI. Render both cases sanely:
 *   - integer → "5 days" / "1 day"
 *   - ISO     → localized date
 *   - other   → as-is
 */
function renderSamplingTimeline(value: string | null | undefined): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return `${n} ${n === 1 ? 'day' : 'days'}`;
  }
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  return trimmed;
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  // Wrap each label/value pair in a single grid cell so the parent
  // `grid-cols-N` lays out pairs side-by-side instead of splitting
  // dt/dd into separate cells (which made values drift one column to
  // the right of their label).
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--color-muted-foreground)] mb-0.5">
        {label}
      </dt>
      <dd className="text-sm text-[var(--color-foreground)] break-words">
        {value}
      </dd>
    </div>
  );
}

/**
 * Inspiration card — visual anchor for the page. Shows the multi-image
 * grid (referenceImages[] up to 5) with the primary tile larger, plus
 * the reference link. Replaces the small bottom-row "Inspiration"
 * section that was easy to miss.
 */
function InspirationCard({
  style,
  cardClasses,
}: {
  style: Style;
  cardClasses: string;
}) {
  const { t } = useTranslation();
  const images = (
    style.referenceImages && style.referenceImages.length > 0
      ? style.referenceImages
      : style.referenceImageUrl
        ? [style.referenceImageUrl]
        : []
  ).slice(0, 5);
  if (images.length === 0 && !style.referenceLink) return null;
  const [primary, ...rest] = images;
  return (
    <section className={cardClasses}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-lg">
          {t('admin.styles.workspace.inspiration', {
            defaultValue: 'Inspiration & references',
          })}
        </h2>
        {style.referenceLink && (
          <a
            href={style.referenceLink}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--color-primary)] hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink size={12} />
            <span className="truncate max-w-[280px]">
              {style.referenceLink.replace(/^https?:\/\//, '')}
            </span>
          </a>
        )}
      </div>
      {images.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-2">
          {primary && (
            <a
              href={primary}
              target="_blank"
              rel="noreferrer"
              className="block aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40"
            >
              {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
              <img
                src={primary}
                alt="Primary reference"
                className="h-full w-full object-cover"
              />
            </a>
          )}
          {rest.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-1 sm:col-span-2 gap-2">
              {rest.map((u) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40"
                >
                  <img src={u} alt="Reference" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">—</p>
      )}
    </section>
  );
}

/**
 * Compact "Colour family" card. Lists this style + its sibling colour
 * variants (linked via parentStyleId / colourVariants). Click a chip
 * to navigate to that variant's detail page. Replaces the old
 * fabric-×-colour Variants matrix which was the pre-Gurukul model.
 *
 * The "+ Add colour" chip at the end of the variant strip opens the
 * AddColourModal — the primary entry point for adding a new colour
 * to the family, more discoverable than the header action button.
 * Hidden for china_import (no colour-family flow there) and pre-mint
 * drafts (need a styleId on the parent to spawn).
 */
function ColourFamilyCard({
  style,
  canAddColour,
  onAddColour,
}: {
  style: Style;
  /** True for sample-approved sampling styles with a minted styleId. */
  canAddColour: boolean;
  onAddColour: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Family = the parent's family if I'm a variant, else my own.
  const parent = style.parentStyle ?? {
    id: style.id,
    styleId: style.styleId,
    workingName: style.workingName,
    primaryColour: style.primaryColour,
  };
  const variants = style.colourVariants ?? [];
  const hasFamily = variants.length > 0 || !!style.parentStyleId;
  // Hide entirely when there's no family AND no add affordance — keeps
  // pre-approval drafts uncluttered.
  if (!hasFamily && !canAddColour) return null;
  return (
    <section className="lg:col-span-5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="font-serif text-lg mb-3">
        {t('admin.styles.workspace.colourFamily', {
          defaultValue: 'Colour family',
        })}
      </h2>
      {hasFamily && (
        <>
          <div className="text-[11px] uppercase tracking-[0.06em] text-[var(--color-muted-foreground)] mb-1.5">
            {t('admin.styles.workspace.colourFamilyParent', {
              defaultValue: 'Parent',
            })}
          </div>
          <button
            type="button"
            onClick={() => parent.styleId && navigate(`/styles/${parent.styleId}`)}
            className="w-full text-left rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2 hover:bg-[var(--color-muted)] mb-3"
          >
            <div className="font-mono text-sm text-[var(--color-primary)]">
              {parent.styleId ?? `#${parent.id}`}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {parent.workingName ?? '—'} · {parent.primaryColour ?? '—'}
            </div>
          </button>
        </>
      )}

      <div className="text-[11px] uppercase tracking-[0.06em] text-[var(--color-muted-foreground)] mb-1.5">
        {variants.length > 0
          ? t('admin.styles.workspace.colourFamilyVariants', {
              defaultValue: 'Variants ({{count}})',
              count: variants.length,
            })
          : t('admin.styles.workspace.colourFamilyNoVariants', {
              defaultValue: 'No variants yet',
            })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => v.styleId && navigate(`/styles/${v.styleId}`)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-muted)]"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-muted-foreground)]" />
            {v.primaryColour ?? '—'}
          </button>
        ))}
        {canAddColour && (
          // Primary add-colour entry point — sits inline with the
          // existing colour chips so it reads as "add another one"
          // contextually. Header still has the same button for users
          // who haven't scrolled to this card yet.
          <button
            type="button"
            onClick={onAddColour}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--color-primary)]/60 bg-[var(--color-primary)]/5 text-[var(--color-primary)] px-2.5 py-1 text-xs hover:bg-[var(--color-primary)]/10"
          >
            <Palette size={12} />
            {t('admin.styles.workspace.addColour', { defaultValue: 'Add colour' })}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * China Import approval card. Gurukul flow has no sampling phase —
 * just a single intake approval by Dheeraj that mints the NW- number
 * and takes the style to terminal lifecycle. This card surfaces the
 * approver + when + the (optional) remark; that's the entire workflow
 * record for a china_import style.
 */
function ChinaImportApprovalCard({
  style,
  cardClasses,
}: {
  style: Style;
  cardClasses: string;
}) {
  const { t } = useTranslation();
  const approvedAt = style.approvedAt ? new Date(style.approvedAt) : null;
  return (
    <section className={cardClasses}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-lg">
          {t('admin.styles.workspace.chinaImportApproval.title', {
            defaultValue: 'Approval',
          })}
        </h2>
        <Badge variant="success" className="text-[10px]">
          <CheckCircle2 size={11} className="mr-1" />
          {t('admin.styles.workspace.chinaImportApproval.approved', {
            defaultValue: 'Approved',
          })}
        </Badge>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
        <Spec
          label={t('admin.styles.workspace.chinaImportApproval.approvedBy', {
            defaultValue: 'Approved by',
          })}
          value={style.approver?.name ?? '—'}
        />
        <Spec
          label={t('admin.styles.workspace.chinaImportApproval.approvedOn', {
            defaultValue: 'Approved on',
          })}
          value={approvedAt ? approvedAt.toLocaleString() : '—'}
        />
        <Spec
          label={t('admin.styles.workspace.chinaImportApproval.styleNumber', {
            defaultValue: 'Style # minted',
          })}
          value={
            <span className="font-mono">{style.styleId ?? '—'}</span>
          }
        />
      </dl>
      {style.remark && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
          <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.workspace.chinaImportApproval.remark', {
              defaultValue: 'Remark',
            })}
          </div>
          <p className="text-sm italic whitespace-pre-wrap text-[var(--color-foreground-2)]">
            {style.remark}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Activity timeline — surfaces the audit log already hydrated by the
 * detail include. Compact list of "actor · action · time". Replaces
 * the old structured InspectionTimeline component (which assumed a
 * model the Gurukul flow doesn't have).
 */
function ActivityTimelineCard({
  style,
  cardClasses,
}: {
  style: Style;
  cardClasses: string;
}) {
  const { t } = useTranslation();
  const logs = style.auditLogs ?? [];
  if (logs.length === 0) return null;
  return (
    <section className={cardClasses}>
      <h2 className="font-serif text-lg mb-3">
        {t('admin.styles.workspace.activity', {
          defaultValue: 'Activity',
        })}
      </h2>
      <ol className="space-y-2">
        {logs.slice(0, 20).map((log) => (
          <li
            key={log.id}
            className="flex items-baseline gap-3 text-sm border-b border-[var(--color-border)] last:border-0 pb-2 last:pb-0"
          >
            <span className="text-[11px] text-[var(--color-muted-foreground)] tabular-nums shrink-0 w-32">
              {new Date(log.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="font-medium text-[var(--color-foreground)] shrink-0">
              {log.actor?.name ?? '—'}
            </span>
            <span className="text-[var(--color-muted-foreground)]">
              {t(`admin.styles.audit.${log.action}` as const, {
                defaultValue: log.action,
              })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
