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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import SamplingPipelineStepper from '@/components/styles/SamplingPipelineStepper';
import PatternCadPreview from '@/components/styles/PatternCadPreview';
import AddColourModal from '@/components/styles/AddColourModal';
import StyleEditModal from '@/components/styles/StyleEditModal';
import Approval1Dialog from '@/components/styles/Approval1Dialog';
import ParkDialog from '@/components/styles/ParkDialog';
import {
  getStyle,
  parkStyle,
  reviveStyle,
  approveStyle,
  sampleApproveStyle,
  patchStyle,
  listFabrics,
  colourGroup,
  type SamplingStatus,
  type SampleApprovalStatus,
  type SampleApproveStyleBody,
} from '@/api/styles';
import { listUsers } from '@/api/users';
import type {
  Fabric,
  Style,
  StyleLifecycle,
  UserRole,
  User as ApiUser,
} from '@/api/types';
import { useAuth } from '@/context/auth';
import { userAllRoles } from '@/lib/userRoles';
import { cn } from '@/lib/utils';
import { formatStyleRef } from '@/lib/styleRef';

// Add-Colour is only meaningful once the family has an approved sample to
// inherit (a colour sibling skips sampling). `StyleLifecycle` is
// NON-ORDINAL — enumerate the post-sampling states explicitly, never `>=`.
// ⚠️ DRIFT HAZARD: this set is duplicated server-side as the spawn gate in
// `nowi-erp-api` (`spawnColourVariant`, styles-actions.service) and in the
// LLD §Phase 3 `POST_SAMPLING` list — keep all three in sync.
const POST_SAMPLING = new Set<StyleLifecycle>([
  'sample_approved',
  'in_pd',
  'qc',
  'dispatched',
]);

// Roles allowed to WRITE a new colour (spawn a sibling submission).
const COLOUR_WRITE: readonly UserRole[] = [
  'admin',
  'sampling_editor',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
  'china_import_approver',
];

// Roles allowed to "Withdraw" (re-park) a style that has already passed
// Approval #1. Drafts can be parked by anyone; post-approval is gated.
const POST_APPROVAL_PARK: readonly UserRole[] = [
  'admin',
  'sampling_lead',
  'pd_lead',
];

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
  const { user } = useAuth();
  const roles = userAllRoles(user);
  const { styleId: idParam } = useParams<{ styleId: string }>();

  const [style, setStyle] = useState<Style | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [sampleApproveOpen, setSampleApproveOpen] = useState(false);
  const [colourModalOpen, setColourModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [parkOpen, setParkOpen] = useState(false);
  // Two-step Withdraw: confirm pulling a committed (post-Approval-#1)
  // design out of the pipeline, then open ParkDialog to capture the
  // reason. Drafts skip this and open ParkDialog directly.
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  // Colour family (siblings sharing this style's familyCode). Sourced from
  // the BE colour-group resolver, NOT parent.colourVariants — so opening
  // Add-Colour from a SIBLING (not the root) still sees the whole family.
  // parentStyleId drives inbox NESTING; familyCode drives the marketplace
  // "other colours" GROUP — do NOT unify; based-on shares neither.
  const [colourFamily, setColourFamily] = useState<Style[]>([]);
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
      // Resolve the whole colour family (every sibling sharing familyCode)
      // off the canonical numeric id. A based-on style has no familyCode →
      // empty group → the ColourFamilyCard hides itself. Soft-fail: the
      // card just shows no siblings if the resolver errors.
      try {
        setColourFamily(await colourGroup(s.id));
      } catch {
        setColourFamily([]);
      }
    } catch {
      setStyle(null);
      setColourFamily([]);
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

  // Add-Colour: only once the family has an approved sample to inherit
  // (POST_SAMPLING), never for china_import, and only for colour-WRITE
  // roles. A colour add is a SUBMISSION — the spawned draft re-enters the
  // Inbox for Approval #1 (NOT an inline approval here).
  const canAddColour =
    POST_SAMPLING.has(style.lifecycle) &&
    !isChinaImport &&
    roles.some((r) => COLOUR_WRITE.includes(r));

  // Park: inline button on drafts (anyone). Post-approval it becomes a
  // gated "Withdraw" — only admin / sampling_lead / pd_lead can pull a
  // committed design back out of the pipeline.
  const isDraft = style.lifecycle === 'draft';
  const canPark =
    style.lifecycle !== 'parked' &&
    style.lifecycle !== 'archived' &&
    (isDraft || roles.some((r) => POST_APPROVAL_PARK.includes(r)));
  const isWithdraw = canPark && !isDraft;
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
            {formatStyleRef(style, `(${t('admin.styles.draft')})`)}
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
                isWithdraw ? setWithdrawConfirmOpen(true) : setParkOpen(true)
              }
            >
              <Pause size={14} />
              <span className="ml-1">
                {isWithdraw
                  ? t('admin.styles.workspace.withdraw', {
                      defaultValue: 'Withdraw',
                    })
                  : t('admin.styles.workspace.park')}
              </span>
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
          {/* + Add colour — spawns a sibling Style (a SUBMISSION) that
              inherits fabric/CAD from this family and re-enters the Inbox
              for Approval #1. Gated to POST_SAMPLING lifecycles + colour-
              WRITE roles (see canAddColour); hidden during sampling/draft
              and for china_import. */}
          {canAddColour && (
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
        // Whole colour family (every sibling sharing familyCode), resolved
        // off the BE — so the duplicate guard + "existing colours" strip
        // are correct even when Add-Colour is opened from a SIBLING rather
        // than the root. Not parent.colourVariants (root-only).
        family={colourFamily}
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

      {/* Colour family chips — siblings sharing this style's familyCode
          (the marketplace "other colours" group), resolved off the BE.
          Now on its own row so the CAD preview gets the full right
          column above. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <ColourFamilyCard
          style={style}
          family={colourFamily}
          canAddColour={canAddColour}
          onAddColour={() => setColourModalOpen(true)}
        />
      </div>

      {/* Activity timeline — surfaces who did what when. Reads straight
          from style.auditLogs (already hydrated by the detail include).
          Full-width section at the BOTTOM of the workspace: the log can
          grow long, so it spans the page rather than squeezing into the
          right column. */}
      <ActivityTimelineCard style={style} cardClasses={cardClasses} />

      {/* Withdraw confirmation — only for post-approval styles. Pulling a
          committed design out of the pipeline is a heavier action than
          parking a draft, so we warn first, then capture the reason in
          ParkDialog. Drafts skip straight to ParkDialog. */}
      <ConfirmDialog
        open={withdrawConfirmOpen}
        destructive
        title={t('admin.styles.workspace.withdrawConfirmTitle', {
          defaultValue: 'Withdraw this style?',
        })}
        message={t('admin.styles.workspace.withdrawConfirmBody', {
          defaultValue:
            'This style has already passed Approval #1. Withdrawing pulls a committed design out of the pipeline and parks it. You can revive it later. Continue?',
        })}
        confirmLabel={t('admin.styles.workspace.withdraw', {
          defaultValue: 'Withdraw',
        })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        onCancel={() => setWithdrawConfirmOpen(false)}
        onConfirm={() => {
          setWithdrawConfirmOpen(false);
          setParkOpen(true);
        }}
      />

      {/* Park confirmation — captures the reason for the audit log. */}
      <ParkDialog
        open={parkOpen}
        busy={busy !== null}
        approved={isWithdraw}
        styleLabel={style.styleId ?? (style.draftNo != null ? `D-${style.draftNo}` : style.workingName) ?? null}
        onClose={() => setParkOpen(false)}
        onConfirm={(reason) => {
          setParkOpen(false);
          void doAction('park', () => parkStyle(style.id, { reason }));
        }}
      />

      {/* Approval #1 checklist dialog — sampling flow only */}
      <Approval1Dialog
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

const SAMPLE_APPROVAL_OPTIONS: SampleApprovalStatus[] = [
  'approved_for_production',
  'under_review_corrections',
  'pattern_correction_approved',
];


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
 * Compact "Colour family" card. Lists every sibling sharing this style's
 * `familyCode` — the marketplace "other colours" group — resolved off the
 * BE colour-group endpoint (see StyleWorkspace's `colourFamily` state) and
 * passed in as `family`. The group is FLAT (familyCode is a denormalized
 * root stylecode, not a tree), so there is no parent/child framing here:
 * we mark the current style "This colour" and render the rest as chips.
 *
 * Why the BE group and NOT `parent.colourVariants`: parentStyleId drives
 * inbox NESTING; familyCode drives this "other colours" GROUP — they are
 * deliberately NOT unified. A based-on style shares neither, so its group
 * is just itself → the card hides (no siblings, no add affordance).
 *
 * The "+ Add colour" chip at the end of the strip opens the AddColourModal
 * — the primary entry point for adding a new colour to the family, more
 * discoverable than the header action button. Hidden for china_import and
 * during sampling/draft (canAddColour is gated upstream).
 */
function ColourFamilyCard({
  style,
  family,
  canAddColour,
  onAddColour,
}: {
  style: Style;
  /** Whole colour family from the BE — every sibling sharing familyCode,
   *  including `style` itself. Empty for a style with no family. */
  family: Style[];
  /** Gated POST_SAMPLING + colour-WRITE — see canAddColour upstream. */
  canAddColour: boolean;
  onAddColour: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Siblings = every family member that isn't the style we're viewing.
  const siblings = family.filter((f) => f.id !== style.id);
  const hasFamily = family.length > 1;
  // Hide entirely when there's no family AND no add affordance — keeps
  // based-on styles and non-colour-WRITE views uncluttered.
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
            {t('admin.styles.workspace.colourFamilyThis', {
              defaultValue: 'This colour',
            })}
          </div>
          <div className="w-full text-left rounded-[var(--radius-sm)] border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-3 py-2 mb-3">
            <div className="font-mono text-sm text-[var(--color-primary)]">
              {style.styleId ?? `#${style.id}`}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {style.workingName ?? '—'} · {style.primaryColour ?? '—'}
            </div>
          </div>
        </>
      )}

      <div className="text-[11px] uppercase tracking-[0.06em] text-[var(--color-muted-foreground)] mb-1.5">
        {siblings.length > 0
          ? t('admin.styles.workspace.colourFamilyVariants', {
              defaultValue: 'Other colours ({{count}})',
              count: siblings.length,
            })
          : t('admin.styles.workspace.colourFamilyNoVariants', {
              defaultValue: 'No other colours yet',
            })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {siblings.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => navigate(`/styles/${v.styleId ?? v.id}`)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-muted)]"
            title={v.styleId ?? undefined}
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
