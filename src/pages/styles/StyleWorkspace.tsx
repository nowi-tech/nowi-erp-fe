import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Palette, Pause, Play, Send, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import SamplingPipelineStepper from '@/components/styles/SamplingPipelineStepper';
import VariantMatrix from '@/components/styles/VariantMatrix';
import ChannelListingsPanel from '@/components/styles/ChannelListingsPanel';
import InspectionTimeline from '@/components/styles/InspectionTimeline';
import AddColourModal from '@/components/styles/AddColourModal';
import {
  getStyle,
  parkStyle,
  reviveStyle,
  approveStyle,
  sampleApproveStyle,
  patchStyle,
  type SamplingStatus,
  type SampleApprovalStatus,
  type ApproveStyleBody,
  type SampleApproveStyleBody,
} from '@/api/styles';
import { listUsers } from '@/api/users';
import type { Style, User as ApiUser } from '@/api/types';
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
  const isWomen = style.gender === 'women' || style.gender === 'unisex';
  const isMen = style.gender === 'men';

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
          <h1 className="font-serif text-2xl text-[var(--color-primary)] mt-1">
            {style.styleId ?? `(${t('admin.styles.draft')})`}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {style.collection && (
              <Badge variant="outline">{style.collection.name}</Badge>
            )}
            <Badge variant="stitch">{sourceLabel}</Badge>
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
          {canSampleApprove && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => setSampleApproveOpen(true)}
            >
              <CheckCircle2 size={14} />
              <span className="ml-1">
                {t('admin.styles.workspace.sampleApprove')}
              </span>
            </Button>
          )}
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
          <Button variant="outline" size="sm" disabled>
            <Send size={14} />
            <span className="ml-1">{t('admin.styles.workspace.sendToPd')}</span>
          </Button>
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

      {/* Sampling pipeline — not applicable to China Import styles */}
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

      {/* Bento grid: left (specs + variants + pattern approval), right (production + channels + inspections) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-4">
          {/* Core specifications */}
          <section className={cardClasses}>
            <h2 className="font-serif text-lg mb-3">
              {t('admin.styles.workspace.coreSpecs')}
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
                  value={
                    style.samplingTimeline
                      ? new Date(style.samplingTimeline).toLocaleDateString()
                      : '—'
                  }
                />
              )}
            </dl>
          </section>

          {/* Variants matrix */}
          <section className={cardClasses}>
            <h2 className="font-serif text-lg mb-3">
              {t('admin.styles.workspace.variantsMatrix')}
            </h2>
            <VariantMatrix
              variants={style.variants ?? []}
              onAddVariant={() => toast.show('Add variant — coming soon.', 'info')}
            />
          </section>

          {/* Pattern approval — sampling-only */}
          {!isChinaImport && (
            <section className={cardClasses}>
              <h2 className="font-serif text-lg mb-3">
                {t('admin.styles.workspace.patternApproval')}
              </h2>
              <div className="space-y-2">
                <PatternRow
                  label={t('admin.styles.workspace.patternApprovalWomen')}
                  active={isWomen}
                  value={style.dxfApproved}
                />
                <PatternRow
                  label={t('admin.styles.workspace.patternApprovalMen')}
                  active={isMen}
                  value={style.dxfApproved}
                />
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-7 space-y-4">
          {/* Production status */}
          <section className={cardClasses}>
            <h2 className="font-serif text-lg mb-3">
              {t('admin.styles.workspace.productionStatus')}
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Spec
                label="Status"
                value={style.productionStatus ?? '—'}
              />
              <Spec
                label="Timeline"
                value={
                  style.productionTimeline
                    ? new Date(style.productionTimeline).toLocaleDateString()
                    : '—'
                }
              />
              <Spec
                label="Factory"
                value={style.factoryId ? `#${style.factoryId}` : '—'}
              />
              {!isChinaImport && (
                <Spec
                  label="Sample approval"
                  value={style.sampleApproval ?? '—'}
                />
              )}
            </dl>
          </section>

          {/* Channels & virtual inventory */}
          <section className={cardClasses}>
            <h2 className="font-serif text-lg mb-3">
              {t('admin.styles.workspace.channels')}
            </h2>
            <ChannelListingsPanel
              styleId={style.id}
              listings={style.channelListings ?? []}
              onChanged={() => void load()}
            />
          </section>

          {/* Inspection history — sampling-only */}
          {!isChinaImport && (
            <section className={cardClasses}>
              <h2 className="font-serif text-lg mb-3">
                {t('admin.styles.workspace.inspectionHistory')}
              </h2>
              <InspectionTimeline
                styleId={style.id}
                inspections={style.inspections ?? []}
                onAdded={() => void load()}
              />
            </section>
          )}
        </div>
      </div>

      {/* Fabric quality + inspiration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={cardClasses}>
          <h2 className="font-serif text-lg mb-3">
            {t('admin.styles.workspace.techNotes')}
          </h2>
          <p className="text-sm whitespace-pre-wrap text-[var(--color-foreground-2)]">
            {style.pdNote ?? '—'}
          </p>
        </section>
        <section className={cardClasses}>
          <h2 className="font-serif text-lg mb-3">
            {t('admin.styles.workspace.inspiration')}
          </h2>
          {style.referenceImageUrl ? (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img
              src={style.referenceImageUrl}
              alt="Reference"
              className="max-h-64 w-auto rounded-md object-contain"
            />
          ) : style.referenceLink ? (
            <a
              href={style.referenceLink}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[var(--color-primary)] hover:underline break-all"
            >
              {style.referenceLink}
            </a>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">—</p>
          )}
        </section>
      </div>

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
          {t('admin.styles.workspace.sampleWorkflow', {
            defaultValue: 'Sample workflow',
          })}
        </h2>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">
          {t('admin.styles.workspace.sampleWorkflowHint', {
            defaultValue: 'Picks save instantly',
          })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <FieldDropdown
          label={t('admin.styles.workspace.samplingStatus', {
            defaultValue: 'Sampling status',
          })}
          value={(style.samplingStatus as SamplingStatus | null) ?? ''}
          options={SAMPLING_STATUS_OPTIONS.map((s) => ({
            value: s,
            label: t(`admin.styles.samplingStatus.${s}` as const, {
              defaultValue: s,
            }),
          }))}
          flashing={!!savedFlash.samplingStatus}
          onChange={(v) => {
            onSave({
              samplingStatus: (v as SamplingStatus) || null,
            });
            flash('samplingStatus');
          }}
        />
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

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-[var(--color-muted-foreground)] mt-1">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </>
  );
}

function PatternRow({
  label,
  active,
  value,
}: {
  label: string;
  active: boolean;
  value: 'yes' | 'no' | null;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 border',
        active
          ? 'border-[var(--color-border)] bg-[var(--color-surface-2)]/40'
          : 'border-[var(--color-border)] opacity-40',
      )}
    >
      <span className="text-sm">{label}</span>
      <Badge variant={value === 'yes' ? 'success' : 'outline'}>
        {value === 'yes' ? 'Approved' : value === 'no' ? 'Rejected' : '—'}
      </Badge>
    </div>
  );
}
