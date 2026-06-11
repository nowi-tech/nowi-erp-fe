import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  Clock,
  Pencil,
  Plus,
  Upload,
  CheckCircle2,
  ExternalLink,
  Rocket,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import SamplingPipelineStepper from '@/components/styles/SamplingPipelineStepper';
import StyleImagePanel from '@/components/styles/StyleImagePanel';
import FabricSwatchThumb from '@/components/styles/FabricSwatchThumb';
import PatternCadPreview from '@/components/styles/PatternCadPreview';
import AddColourModal from '@/components/styles/AddColourModal';
import StyleEditModal from '@/components/styles/StyleEditModal';
import {
  CoreSpecsEditModal,
  BomEditModal,
  PatternCadEditModal,
} from '@/components/styles/ScopedStyleEditModals';
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
  startCataloguing,
  markCataloguingDone,
  goLive,
  setMarketplaceListing,
  type SamplingStatus,
  type SampleApprovalStatus,
  type SampleApproveStyleBody,
  type GoLiveChannel,
} from '@/api/styles';
import type {
  ChannelName,
  Fabric,
  Style,
  StyleAuditLog,
  StyleChannelListing,
  StyleLifecycle,
  UserRole,
} from '@/api/types';
import { useAuth } from '@/context/auth';
import { userAllRoles, PD_WRITE_ROLES } from '@/lib/userRoles';
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
  'cataloguing',
  'live',
  'in_pd',
  'qc',
  'dispatched',
]);

// Roles allowed to WRITE a new colour (spawn a sibling submission) —
// mirrors the BE variants write set via the shared PD_WRITE_ROLES.
const COLOUR_WRITE = PD_WRITE_ROLES;

// Roles allowed to "Withdraw" (re-park) a style that has already passed
// Approval #1. Drafts can be parked by anyone; post-approval is gated.
const POST_APPROVAL_PARK: readonly UserRole[] = ['admin'];

// Gender may arrive as a code (W/M/U) or long form (women/men/unisex)
// depending on the row — render the human label either way so the header /
// specs read "Women · Dress", never "W · JC".
const GENDER_LABEL: Record<string, string> = {
  W: 'Women',
  M: 'Men',
  U: 'Unisex',
  women: 'Women',
  men: 'Men',
  unisex: 'Unisex',
};
const genderLabel = (g: string | null | undefined) =>
  (g ? GENDER_LABEL[g] : null) ?? g ?? '—';

// Snapshot field → English label, for describing WHAT an audit entry
// changed (mirrors StylesService.diffSnapshot on the BE). Admin-facing
// only → English-only by design (no Hindi).
const AUDIT_FIELD_LABELS: Record<string, string> = {
  workingName: 'Working name',
  fabricId: 'Fabric',
  sampleFabricRequired: 'Sample fabric',
  primaryColour: 'Primary colour',
  referenceLink: 'Reference link',
  referenceImage: 'Reference image',
  referenceImageUrl: 'Reference image',
  samplingStatus: 'Stage',
  samplingTimeline: 'Timeline',
  patternCadPaths: 'CAD files',
  sampleApproval: 'Sample verdict',
  developmentReason: 'Dev reason',
  remark: 'Remark',
  gender: 'Gender',
  lifecycle: 'Lifecycle',
  styleId: 'Style #',
  familyCode: 'Colour family',
  basedOnStyleId: 'Based on',
  reason: 'Reason',
};

/**
 * Per-style deep page.
 *
 * Two lifecycle-conditional layouts, both 1:1 with the Stitch mocks:
 *
 *  - SAMPLING (`draft` / `in_sampling`): header (Park · Send back for
 *    corrections · Approve sample) → progress-stepper band (timeline /
 *    pattern-master meta + horizontal stepper) → 7/5 grid: left = Core
 *    specifications + Bill of materials; right = Pattern / CAD + Activity
 *    log.
 *  - PRODUCTION (`sample_approved`+): header (Park · Start production ·
 *    Add colour) → colour-family strip → 2-up grid: left = Core
 *    specifications (+ "Sample approved by …" footer) + Bill of materials;
 *    right = Pattern / CAD + Activity log.
 *
 * China Import keeps its single-approval shell inside the same chrome.
 *
 * `:styleId` URL param accepts either the numeric DB id or the Style #.
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
  // Scoped editors — the Core-specs pencil and the BOM edit affordance
  // open these small field-subset dialogs instead of the full form.
  const [coreSpecsEditOpen, setCoreSpecsEditOpen] = useState(false);
  const [bomEditOpen, setBomEditOpen] = useState(false);
  // Pattern/CAD upload affordance opens a scoped editor that ONLY
  // uploads CAD files (patternCadPaths) — not the full StyleEditModal.
  const [patternCadEditOpen, setPatternCadEditOpen] = useState(false);
  const [parkOpen, setParkOpen] = useState(false);
  // Go-live: opens a small dialog to pick channel(s) + paste a listing URL
  // before flipping the lifecycle to `live`.
  const [goLiveOpen, setGoLiveOpen] = useState(false);
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
        <button
          type="button"
          onClick={() => navigate('/styles')}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
        >
          <span>{t('admin.styles.title')}</span>
        </button>
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
  const canSampleApprove = !isChinaImport && style.lifecycle === 'in_sampling';

  // Add-Colour: only once the family has an approved sample to inherit
  // (POST_SAMPLING), never for china_import, and only for colour-WRITE
  // roles. A colour add is a SUBMISSION — the spawned draft re-enters the
  // Inbox for Approval #1 (NOT an inline approval here).
  const canAddColour =
    POST_SAMPLING.has(style.lifecycle) &&
    !isChinaImport &&
    roles.some((r) => COLOUR_WRITE.includes(r));

  // Whether the user may edit this style's fields at all — mirrors the BE
  // styles WRITE set (PD_WRITE_ROLES). Gates the scoped edit affordances
  // (core-specs pencil / BOM / pattern-CAD upload) and the Edit surface so
  // a read-only viewer never sees a control that 403s on save.
  const canWrite = roles.some((r) => PD_WRITE_ROLES.includes(r));

  // Park: inline button on drafts (anyone). Post-approval it becomes a
  // gated "Withdraw" — only admin can pull a committed design back out of
  // the pipeline.
  const isDraft = style.lifecycle === 'draft';
  const canPark =
    style.lifecycle !== 'parked' &&
    style.lifecycle !== 'archived' &&
    (isDraft || roles.some((r) => POST_APPROVAL_PARK.includes(r)));
  const isWithdraw = canPark && !isDraft;
  const canRevive = style.lifecycle === 'parked';
  const sourceLabel = t(`admin.styles.source.${style.source}`);

  // "Approve sample" is the primary action while a style is in sampling.
  const canSampleApproveAction = canSampleApprove;
  // "Start production" advances an approved sample into PD. Until the BE
  // exposes that transition we re-home it onto the existing Edit surface so
  // the button is never a dead end (no new endpoint introduced here).
  const canStartProduction =
    canWrite && !isChinaImport && style.lifecycle === 'sample_approved';

  // ── Go-to-market lifecycle actions (writers only, never china_import) ──
  // sample_approved → cataloguing (status=pending)
  const canStartCataloguing =
    canWrite && !isChinaImport && style.lifecycle === 'sample_approved';
  // cataloguing + pending → done
  const canMarkCataloguingDone =
    canWrite &&
    style.lifecycle === 'cataloguing' &&
    style.cataloguingStatus === 'pending';
  // cataloguing + done → live (opens channel-pick dialog)
  const canGoLive =
    canWrite &&
    style.lifecycle === 'cataloguing' &&
    style.cataloguingStatus === 'done';

  // Layout selector. The sampling layout (stepper band + 7/5 grid) covers
  // draft / in_sampling; the production layout (colour strip + 2-up grid)
  // covers sample_approved and beyond. China Import never samples — it
  // rides the sampling shell (no band) with its approval-record card.
  const isProductionLayout = POST_SAMPLING.has(style.lifecycle);
  const showSamplingBand = !isChinaImport && !isProductionLayout;

  // The second header pill names the current workflow stage. In sampling
  // it tracks the live sampling step ("Fabric sourcing"); in the go-to-market
  // states it names that stage (Cataloguing · pending/done / Live); otherwise
  // (sample_approved / in_pd / qc / dispatched) it reads "Ready for production".
  let stagePill = '';
  if (style.lifecycle === 'cataloguing') {
    stagePill = t(
      `admin.styles.cataloguingStatus.${style.cataloguingStatus ?? 'pending'}` as const,
      {
        defaultValue:
          style.cataloguingStatus === 'done'
            ? 'Cataloguing · done'
            : 'Cataloguing · pending',
      },
    );
  } else if (style.lifecycle === 'live') {
    stagePill = t('admin.styles.workspace.liveStage', {
      defaultValue: 'Live',
    });
  } else if (isProductionLayout) {
    stagePill = t('admin.styles.workspace.readyForProduction', {
      defaultValue: 'Ready for production',
    });
  } else if (style.samplingStatus) {
    stagePill = t(`admin.styles.samplingSteps.${style.samplingStatus}` as const, {
      defaultValue: '',
    });
  }

  // Section card chrome — Stitch's "surface card with header strip" look,
  // rendered in the app's tokens (surface / border / radius), not the
  // Stitch navy literals.
  const cardClasses =
    'bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden flex flex-col';

  // Shared cards — identical in both layouts, only the column wrapper and
  // a couple of header affordances differ.
  // Reference-image gallery + fabric swatch; renders nothing when the style
  // carries no images (legacy floor-intake styles), so the column is unchanged.
  const imagePanelCard = (
    <StyleImagePanel
      styleId={style.id}
      referenceImages={style.referenceImages}
      workingName={style.workingName}
      canWrite={canWrite}
      onUpdated={() => void load()}
    />
  );

  const coreSpecsCard = (
    <section className={cardClasses}>
      <CardHeader
        title={t('admin.styles.workspace.coreSpecs')}
        right={
          canWrite ? (
            <button
              type="button"
              aria-label={t('admin.styles.workspace.edit', {
                defaultValue: 'Edit',
              })}
              onClick={() => {
                void ensureMasterData();
                setCoreSpecsEditOpen(true);
              }}
              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Pencil size={18} />
            </button>
          ) : undefined
        }
      />
      <div className="p-5">
        <dl className="flex flex-col">
          <SpecRow label="Gender" value={genderLabel(style.gender)} />
          <SpecRow
            label="Category"
            value={style.category?.name ?? style.categoryCode ?? '—'}
          />
          <SpecRow
            label="Fabric"
            value={
              <span className="inline-flex items-center gap-2">
                {style.fabric?.name ?? '—'}
                <FabricSwatchThumb fabricImagePath={style.fabricImagePath} />
              </span>
            }
          />
          <SpecRow
            label="Primary colour"
            value={
              <span className="inline-flex items-center gap-2">
                <ColourSwatch colour={style.primaryColour} />
                {style.primaryColour ?? '—'}
              </span>
            }
            last={isProductionLayout}
          />
          {/* Sampling layout carries the sample-fabric requirement; the
              production layout drops it (mock has neither sampling row). */}
          {!isProductionLayout &&
            !isChinaImport &&
            style.sampleFabricRequired != null && (
              <SpecRow
                label="Sample fabric required"
                value={`${style.sampleFabricRequired} ${
                  style.fabric?.unitOfMeasure === 'meter'
                    ? 'm'
                    : (style.fabric?.unitOfMeasure ?? 'm')
                }`}
                last
              />
            )}
        </dl>
      </div>
      {/* Production layout footers the card with the sample sign-off
          record (e.g. "Sample approved by <approver> · 2 days ago"). */}
      {isProductionLayout && style.sampleApprovedAt && (
        <div className="px-3 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] text-right text-xs text-[var(--color-muted-foreground)]">
          {t('admin.styles.workspace.sampleApprovedBy', {
            defaultValue: 'Sample approved by {{name}} · {{when}}',
            name: style.approver?.name ?? '—',
            when: new Date(style.sampleApprovedAt).toLocaleDateString(),
          })}
        </div>
      )}
    </section>
  );

  const billOfMaterialsCard = (
    <BillOfMaterialsCard
      style={style}
      cardClasses={cardClasses}
      production={isProductionLayout}
      onEdit={
        canWrite
          ? () => {
              void ensureMasterData();
              setBomEditOpen(true);
            }
          : undefined
      }
    />
  );

  const patternCadCard = (
    <section className={cardClasses}>
      <CardHeader
        title={t('admin.styles.drawer.patternCad.label', {
          defaultValue: 'Pattern / CAD',
        })}
        right={
          // The sampling mock exposes an upload affordance in the header;
          // the production mock has none. Opens a scoped CAD-only editor.
          // Gated to writers so a read-only viewer sees no upload button.
          canWrite && !isProductionLayout ? (
            <button
              type="button"
              aria-label={t('admin.styles.drawer.patternCad.upload', {
                defaultValue: 'Upload CAD file',
              })}
              onClick={() => setPatternCadEditOpen(true)}
              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Upload size={18} />
            </button>
          ) : undefined
        }
      />
      <div className="p-5">
        {style.patternCadPaths && style.patternCadPaths.length > 0 ? (
          <PatternCadPreview patternCadPaths={style.patternCadPaths} />
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('admin.styles.drawer.patternCad.none', {
              defaultValue:
                'No pattern or CAD files uploaded yet. Use the upload button to add .dxf / .pdf / .png / .jpg.',
            })}
          </p>
        )}
      </div>
    </section>
  );

  const activityLogCard = (
    <ActivityTimelineCard style={style} cardClasses={cardClasses} />
  );

  // Channels / live-listings — surfaced once the style enters the
  // go-to-market lifecycle (cataloguing / live). Lists each channel listing
  // with its state and a clickable listing URL when present.
  const showChannels =
    style.lifecycle === 'cataloguing' || style.lifecycle === 'live';
  const channelsCard = showChannels ? (
    <ChannelsCard
      style={style}
      cardClasses={cardClasses}
      cataloguingStatus={style.cataloguingStatus}
      canManage={canWrite}
      onTakeOffline={(channel, reason) =>
        doAction('take-offline', () =>
          setMarketplaceListing(style.id, { channel, live: false, reason }),
        )
      }
    />
  ) : null;

  return (
    <div className="space-y-5">
      {/* ── Header: breadcrumb · large style code + status pills · subtitle ──
          Action bar (lifecycle-conditional) sits top-right. */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] mb-2"
          >
            <button
              type="button"
              onClick={() => navigate('/styles')}
              className="hover:text-[var(--color-primary)] transition-colors"
            >
              {t('admin.styles.title')}
            </button>
            <ChevronRight size={13} aria-hidden className="shrink-0" />
            <span className="text-[var(--color-foreground)] truncate max-w-[240px]">
              {formatStyleRef(style, style.workingName ?? '—')}
            </span>
          </nav>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-mono text-3xl font-semibold text-[var(--color-primary)] tracking-tight m-0">
              {formatStyleRef(style, `(${t('admin.styles.draft')})`)}
            </h1>
            {/* For China Import styles the source IS the story — surface it.
                For sampling styles the NOWI prefix already implies source,
                so the source chip is redundant and we omit it. */}
            {isChinaImport && <Badge variant="stitch">{sourceLabel}</Badge>}
            <Badge variant={isProductionLayout ? 'ready' : 'secondary'}>
              {t(`admin.styles.lifecycle.${style.lifecycle}`)}
            </Badge>
            {/* Stage pill — names the current workflow stage. */}
            {!isChinaImport && stagePill && (
              <Badge variant="outline">{stagePill}</Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm text-[var(--color-muted-foreground)]">
            {[
              style.workingName,
              style.gender ? genderLabel(style.gender) : null,
              style.category?.name ?? style.categoryCode,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>

        {/* Action bar — lifecycle-conditional, matching each mock exactly.
            in_sampling → Park · Send back for corrections · Approve sample
            sample_approved+ → Park · Start production · Add colour */}
        <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0">
          {canPark && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                isWithdraw ? setWithdrawConfirmOpen(true) : setParkOpen(true)
              }
            >
              {isWithdraw
                ? t('admin.styles.workspace.withdraw', {
                    defaultValue: 'Withdraw',
                  })
                : t('admin.styles.workspace.parkAction', {
                    defaultValue: 'Park',
                  })}
            </Button>
          )}
          {canRevive && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void doAction('revive', () => reviveStyle(style.id))
              }
            >
              {t('admin.styles.workspace.revive')}
            </Button>
          )}
          {/* Send back for corrections — sampling action bar only. Patches
              samplingStatus = corrections_needed (same wiring the stepper
              previously carried). */}
          {canSampleApprove && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void doAction('send-back', () =>
                  patchStyle(style.id, {
                    samplingStatus: 'corrections_needed',
                  }),
                )
              }
            >
              {t('admin.styles.workspace.sendBack', {
                defaultValue: 'Send back for corrections',
              })}
            </Button>
          )}
          {/* Start production — sample_approved+ only. Re-homed onto the
              Edit surface (no new BE transition introduced here). */}
          {canStartProduction && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void ensureMasterData();
                setEditOpen(true);
              }}
            >
              {t('admin.styles.workspace.startProduction', {
                defaultValue: 'Start production',
              })}
            </Button>
          )}
          {/* Start cataloguing — sample_approved → cataloguing (pending). */}
          {canStartCataloguing && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void doAction('start-cataloguing', () =>
                  startCataloguing(style.id),
                )
              }
            >
              {t('admin.styles.workspace.startCataloguing', {
                defaultValue: 'Start cataloguing',
              })}
            </Button>
          )}
          {/* Mark cataloguing done — cataloguing + pending → done. */}
          {canMarkCataloguingDone && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void doAction('cataloguing-done', () =>
                  markCataloguingDone(style.id),
                )
              }
            >
              {t('admin.styles.workspace.markCataloguingDone', {
                defaultValue: 'Mark cataloguing done',
              })}
            </Button>
          )}
          {/* Go live — cataloguing + done → live. Opens the channel dialog. */}
          {canGoLive && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => setGoLiveOpen(true)}
            >
              <Rocket size={16} />
              <span className="ml-1">
                {t('admin.styles.workspace.goLive', {
                  defaultValue: 'Go live',
                })}
              </span>
            </Button>
          )}
          {/* + Add colour — spawns a sibling Style that re-enters the Inbox
              for Approval #1. Gated to POST_SAMPLING + colour-WRITE roles. */}
          {canAddColour && (
            <Button size="sm" onClick={() => setColourModalOpen(true)}>
              <Plus size={16} />
              <span className="ml-1">
                {t('admin.styles.workspace.addColour', 'Add colour')}
              </span>
            </Button>
          )}
          {/* Approve intake (Approval #1) — drafts only. China Import keeps
              the lightweight single-click approve; sampling opens the
              checklist dialog. */}
          {canApproveIntake && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                if (isChinaImport) {
                  void doAction('approve', () => approveStyle(style.id));
                } else {
                  setApproveOpen(true);
                }
              }}
            >
              {t('admin.styles.workspace.approve')}
            </Button>
          )}
          {/* Approve sample (Approval #2) — primary action while in_sampling.
              Opens the SampleApproveDialog. */}
          {canSampleApproveAction && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => setSampleApproveOpen(true)}
            >
              {t('admin.styles.workspace.sampleApprove', {
                defaultValue: 'Approve sample',
              })}
            </Button>
          )}
        </div>
      </header>

      {/* ── Context band — lifecycle-conditional ──
          in_sampling (+ earlier): progress-stepper band (timeline /
            pattern-master meta line + horizontal stepper).
          sample_approved+: colour-family strip. */}
      {showSamplingBand && (
        <section className={cn(cardClasses, 'p-4')}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
              <Clock size={14} aria-hidden />
              <span>
                {t('admin.styles.workspace.samplingTimelineMeta', {
                  defaultValue: 'Sampling timeline: {{timeline}}',
                  timeline: renderSamplingTimeline(style.samplingTimeline),
                })}
              </span>
            </div>
            <p className="text-xs italic text-[var(--color-muted-foreground)]">
              {t('admin.styles.workspace.coloursAfterApproval', {
                defaultValue:
                  'Colours are added after sample approval — not during sampling.',
              })}
            </p>
          </div>
          {/* Horizontal sampling pipeline — driven by the live SamplingStatus
              enum. The terminal step opens the sample sign-off dialog. */}
          <SamplingPipelineStepper
            samplingStatus={style.samplingStatus as SamplingStatus | null}
            onStepClick={
              // Sampling status is editable only after intake is approved
              // (lifecycle = in_sampling). Drafts render the stepper read-only.
              style.lifecycle === 'in_sampling'
                ? (next) =>
                    void doAction('step', () =>
                      patchStyle(style.id, { samplingStatus: next }),
                    )
                : undefined
            }
            onApproveClick={
              canSampleApprove ? () => setSampleApproveOpen(true) : undefined
            }
          />
        </section>
      )}

      {isProductionLayout && (
        <ColourFamilyCard
          style={style}
          family={colourFamily}
          canAddColour={canAddColour}
          onAddColour={() => setColourModalOpen(true)}
        />
      )}

      {/* China Import: simple "Approved by X on DATE" record card. */}
      {isChinaImport && style.approvedAt && (
        <ChinaImportApprovalCard style={style} cardClasses={cardClasses} />
      )}

      {/* ── Main area — two columns ──
          LEFT: product image gallery (compact). RIGHT: Core specs → Bill of
          materials → Pattern/CAD → Activity log, stacked top-to-bottom.
          Same shape for both sampling + production layouts. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-4 space-y-4">{imagePanelCard}</div>
        <div className="lg:col-span-8 space-y-4">
          {coreSpecsCard}
          {billOfMaterialsCard}
          {patternCadCard}
          {channelsCard}
          {activityLogCard}
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
          page uses, wrapped in a centered modal. */}
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

      {/* Scoped Core-specifications editor — working name, gender,
          category, fabric, primary colour, sampling timeline only. */}
      <CoreSpecsEditModal
        open={coreSpecsEditOpen}
        style={style}
        fabrics={fabrics}
        onClose={() => setCoreSpecsEditOpen(false)}
        onSaved={(saved) => {
          if (saved.styleId && saved.styleId !== style.styleId) {
            navigate(`/styles/${saved.styleId}`);
          } else {
            void load();
          }
        }}
      />

      {/* Scoped Bill-of-materials editor — fabric + sample fabric
          required only. */}
      <BomEditModal
        open={bomEditOpen}
        style={style}
        fabrics={fabrics}
        onClose={() => setBomEditOpen(false)}
        onSaved={(saved) => {
          if (saved.styleId && saved.styleId !== style.styleId) {
            navigate(`/styles/${saved.styleId}`);
          } else {
            void load();
          }
        }}
      />

      {/* Scoped Pattern / CAD editor — uploads CAD files and patches
          patternCadPaths only (no full intake form). */}
      <PatternCadEditModal
        open={patternCadEditOpen}
        style={style}
        onClose={() => setPatternCadEditOpen(false)}
        onSaved={(saved) => {
          if (saved.styleId && saved.styleId !== style.styleId) {
            navigate(`/styles/${saved.styleId}`);
          } else {
            void load();
          }
        }}
      />

      {/* Withdraw confirmation — only for post-approval styles. */}
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
        styleLabel={
          style.styleId ??
          (style.draftNo != null ? `D-${style.draftNo}` : style.workingName) ??
          null
        }
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
        gender={style.gender}
        onClose={() => setApproveOpen(false)}
        onConfirm={(body) => {
          setApproveOpen(false);
          void doAction('approve', () => approveStyle(style.id, body));
        }}
      />

      {/* Approval #2 (sample sign-off) dialog */}
      <SampleApproveDialog
        open={sampleApproveOpen}
        busy={busy !== null}
        onClose={() => setSampleApproveOpen(false)}
        onConfirm={(body) => {
          setSampleApproveOpen(false);
          void doAction('sample-approve', () =>
            sampleApproveStyle(style.id, body),
          );
        }}
      />

      {/* Go-live channel picker — cataloguing + done → live */}
      <GoLiveDialog
        open={goLiveOpen}
        busy={busy !== null}
        existing={style.channelListings ?? []}
        onClose={() => setGoLiveOpen(false)}
        onConfirm={(channels) => {
          setGoLiveOpen(false);
          void doAction('go-live', () => goLive(style.id, { channels }));
        }}
      />
    </div>
  );
}

// Channels the go-live dialog can publish to. `nowi_shopify` first since
// it's the owned storefront; the marketplaces follow.
const GO_LIVE_CHANNELS: ChannelName[] = [
  'nowi_shopify',
  'myntra',
  'nykaa',
  'amazon',
  'other',
];

/**
 * Go-live dialog. Pick one or more channels and (optionally) paste the
 * public listing URL for each, then flip the style to `live`. At least one
 * channel must be selected. URLs are optional per channel.
 */
function GoLiveDialog({
  open,
  busy,
  existing,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  existing: StyleChannelListing[];
  onClose: () => void;
  onConfirm: (channels: GoLiveChannel[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<ChannelName>>(new Set());
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      // Pre-seed from any existing listing URLs so re-opening is non-destructive.
      const seedUrls: Record<string, string> = {};
      for (const l of existing) {
        if (l.listingUrl) seedUrls[l.channel] = l.listingUrl;
      }
      setUrls(seedUrls);
      setSelected(new Set());
    }
  }, [open, existing]);

  const toggle = (c: ChannelName) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const canSubmit = selected.size > 0 && !busy;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.goLive.dialogTitle', {
        defaultValue: 'Go live',
      })}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm(
                [...selected].map((channel) => {
                  const url = urls[channel]?.trim();
                  return url ? { channel, listingUrl: url } : { channel };
                }),
              )
            }
          >
            <Rocket size={14} />
            <span className="ml-1">
              {t('admin.styles.goLive.confirm', { defaultValue: 'Go live' })}
            </span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.goLive.dialogIntro', {
          defaultValue:
            'Select the channels this style is going live on and paste each public listing URL (optional). Selecting at least one channel is required.',
        })}
      </p>
      <div className="space-y-2">
        {GO_LIVE_CHANNELS.map((c) => {
          const checked = selected.has(c);
          return (
            <div
              key={c}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3"
            >
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                {t(`admin.styles.channel.${c}` as const, { defaultValue: c })}
              </label>
              {checked && (
                <Input
                  type="url"
                  className="mt-2 h-9 text-sm"
                  placeholder={t('admin.styles.goLive.urlPlaceholder', {
                    defaultValue: 'https://… (optional)',
                  })}
                  value={urls[c] ?? ''}
                  onChange={(e) =>
                    setUrls((prev) => ({ ...prev, [c]: e.target.value }))
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

/**
 * Channels / live-listings card. Surfaced in the go-to-market lifecycle
 * (cataloguing / live). Renders each StyleChannelListing with its state pill
 * and a clickable listing URL (new tab) when present.
 */
function ChannelsCard({
  style,
  cardClasses,
  cataloguingStatus,
  canManage,
  onTakeOffline,
}: {
  style: Style;
  cardClasses: string;
  cataloguingStatus: Style['cataloguingStatus'];
  canManage: boolean;
  onTakeOffline: (channel: ChannelName, reason: string) => void;
}) {
  const { t } = useTranslation();
  const listings = (style.channelListings ?? []).filter(
    (l) => l.state !== 'off',
  );
  const stateBadge = (s: StyleChannelListing['state']) =>
    s === 'live' ? 'success' : s === 'draft' ? 'warning' : 'outline';
  // Take-offline target + reason (the consequential un-publish lives here in
  // the workspace, not on the dashboard).
  const [offlineChannel, setOfflineChannel] = useState<ChannelName | null>(
    null,
  );
  const [offlineReason, setOfflineReason] = useState('');
  return (
    <section className={cardClasses}>
      <CardHeader
        title={t('admin.styles.workspace.channelsTitle', {
          defaultValue: 'Channels',
        })}
        right={
          style.lifecycle === 'cataloguing' ? (
            <Badge
              variant={cataloguingStatus === 'done' ? 'success' : 'warning'}
              className="text-[10px]"
            >
              {t(
                `admin.styles.cataloguingStatus.${cataloguingStatus ?? 'pending'}` as const,
                {
                  defaultValue:
                    cataloguingStatus === 'done'
                      ? 'Cataloguing · done'
                      : 'Cataloguing · pending',
                },
              )}
            </Badge>
          ) : (
            <Badge variant="success" className="text-[10px]">
              {t('admin.styles.workspace.liveStage', { defaultValue: 'Live' })}
            </Badge>
          )
        }
      />
      <div className="p-5">
        {listings.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('admin.styles.workspace.channelsNone', {
              defaultValue:
                'No channels are live yet. Use "Go live" to open listings.',
            })}
          </p>
        ) : (
          <ul className="space-y-2">
            {listings.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium">
                    {t(`admin.styles.channel.${l.channel}` as const, {
                      defaultValue: l.channel,
                    })}
                  </span>
                  <Badge variant={stateBadge(l.state)} className="text-[10px]">
                    {t(`admin.styles.channel.state.${l.state}` as const, {
                      defaultValue: l.state,
                    })}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {l.listingUrl ? (
                    <a
                      href={l.listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                    >
                      {t('admin.styles.workspace.viewListing', {
                        defaultValue: 'View listing',
                      })}
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {t('admin.styles.workspace.noListingUrl', {
                        defaultValue: 'No URL',
                      })}
                    </span>
                  )}
                  {/* Take-offline — only for live channels, write-gated. */}
                  {canManage && l.state === 'live' && (
                    <button
                      type="button"
                      onClick={() => {
                        setOfflineReason('');
                        setOfflineChannel(l.channel);
                      }}
                      className="text-xs text-[var(--color-destructive)] hover:underline"
                    >
                      {t('admin.styles.workspace.takeOffline', {
                        defaultValue: 'Take offline',
                      })}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Take-offline reason dialog. */}
      <Dialog
        open={offlineChannel !== null}
        onClose={() => setOfflineChannel(null)}
        title={t('admin.styles.workspace.takeOfflineTitle', {
          defaultValue: 'Take offline',
        })}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOfflineChannel(null)}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!offlineReason.trim()}
              onClick={() => {
                if (offlineChannel) {
                  onTakeOffline(offlineChannel, offlineReason.trim());
                }
                setOfflineChannel(null);
              }}
            >
              {t('admin.styles.workspace.takeOffline', {
                defaultValue: 'Take offline',
              })}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
          {t('admin.styles.workspace.takeOfflineIntro', {
            defaultValue:
              'This removes the live listing. If no other channel is live the style returns to cataloguing.',
          })}
        </p>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          {t('admin.styles.workspace.takeOfflineReason', {
            defaultValue: 'Reason (required)',
          })}
        </label>
        <Textarea
          value={offlineReason}
          onChange={(e) => setOfflineReason(e.target.value)}
        />
      </Dialog>
    </section>
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
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (body: SampleApproveStyleBody) => void;
}) {
  const { t } = useTranslation();
  const [verdict, setVerdict] = useState<SampleApprovalStatus>(
    'approved_for_production',
  );
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setVerdict('approved_for_production');
      setNote('');
    }
  }, [open]);

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

/**
 * Section card header strip — the Stitch "title bar on a tinted band"
 * look, rendered in the app's surface-2 / border tokens. Optional trailing
 * slot (e.g. an edit / upload affordance) sits on the right.
 */
function CardHeader({
  title,
  right,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
      <h3 className="font-serif text-base font-semibold m-0">{title}</h3>
      {right}
    </div>
  );
}

/**
 * Core-specs table row — label cell on a tinted band, value cell beside
 * it. Mirrors the mock's `<th>`/`<td>` row structure (uppercase caps
 * label + tabular value), rendered as a flex row in the app's tokens.
 */
function SpecRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 py-3',
        !last && 'border-b border-[var(--color-border)]',
      )}
    >
      <span className="w-1/3 shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-[var(--color-muted-foreground)]">
        {label}
      </span>
      <span className="flex-1 font-mono text-[13px] text-[var(--color-foreground)] break-words">
        {value}
      </span>
    </div>
  );
}

/**
 * Small round colour swatch. We only know `primaryColour` as a free-text
 * name; pass it straight to CSS (most catalogue names — Indigo, Black,
 * Sand — resolve), and fall back to a neutral filled dot otherwise so the
 * element is always present per the mock.
 */
function ColourSwatch({ colour }: { colour: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 rounded-full border border-[var(--color-border-strong)] shadow-sm"
      style={{
        backgroundColor: colour ?? 'var(--color-muted-foreground-2)',
      }}
    />
  );
}

/**
 * Bill of materials card. The mock lists a materials table (Main fabric,
 * trims …). The Style model only carries the main fabric today, so we
 * render the single derived "Main fabric" row from `style.fabric` (+ the
 * sample-fabric requirement as the quantity). The header affordance is an
 * "add" icon in the sampling mock and an "Edit BOM" button in production;
 * both route to the Edit surface (no inline BOM editor on this page).
 */
function BillOfMaterialsCard({
  style,
  cardClasses,
  production,
  onEdit,
}: {
  style: Style;
  cardClasses: string;
  production: boolean;
  // Absent for read-only viewers — the Edit/＋ affordance is then hidden.
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const fabricName = style.fabric?.name ?? '—';
  const qty =
    style.sampleFabricRequired != null
      ? `${style.sampleFabricRequired} ${
          style.fabric?.unitOfMeasure === 'meter'
            ? 'm'
            : (style.fabric?.unitOfMeasure ?? 'm')
        }`
      : '—';
  return (
    <section className={cardClasses}>
      <CardHeader
        title={t('admin.styles.workspace.billOfMaterials', {
          defaultValue: 'Bill of materials',
        })}
        right={
          !onEdit ? undefined : production ? (
            <button
              type="button"
              onClick={onEdit}
              className="px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] text-[var(--color-foreground)] text-xs hover:bg-[var(--color-surface-2)] transition-colors"
            >
              {t('admin.styles.workspace.editBom', {
                defaultValue: 'Edit BOM',
              })}
            </button>
          ) : (
            <button
              type="button"
              aria-label={t('admin.styles.workspace.editBom', {
                defaultValue: 'Edit BOM',
              })}
              onClick={onEdit}
              className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Plus size={18} />
            </button>
          )
        }
      />
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
              <th className="px-4 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold text-[var(--color-muted-foreground)]">
                {production
                  ? t('admin.styles.workspace.bomItem', {
                      defaultValue: 'Item',
                    })
                  : t('admin.styles.workspace.bomType', {
                      defaultValue: 'Type',
                    })}
              </th>
              <th className="px-4 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold text-[var(--color-muted-foreground)]">
                {production
                  ? t('admin.styles.workspace.bomSpec', {
                      defaultValue: 'Spec',
                    })
                  : t('admin.styles.workspace.bomDescription', {
                      defaultValue: 'Description',
                    })}
              </th>
              <th className="px-4 py-2 text-right text-[11px] uppercase tracking-[0.05em] font-semibold text-[var(--color-muted-foreground)]">
                {production
                  ? t('admin.styles.workspace.bomQty', { defaultValue: 'Qty' })
                  : t('admin.styles.workspace.bomQuantity', {
                      defaultValue: 'Quantity',
                    })}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-[var(--color-surface-2)] transition-colors">
              <td className="px-4 py-3 font-mono text-[13px] text-[var(--color-foreground)]">
                {t('admin.styles.workspace.bomMainFabric', {
                  defaultValue: 'Main fabric',
                })}
              </td>
              <td className="px-4 py-3 text-[13px] text-[var(--color-foreground-2)]">
                {fabricName}
              </td>
              <td className="px-4 py-3 font-mono text-[13px] text-[var(--color-foreground)] text-right">
                {qty}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Compact "Colour family" strip. Lists every sibling sharing this style's
 * `familyCode` — the marketplace "other colours" group — resolved off the
 * BE colour-group endpoint and passed in as `family`. The current style is
 * marked "this style"; the rest render as chips. The trailing "+ Add
 * colour" chip opens the AddColourModal (gated upstream).
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
  // Hide entirely when there's no family AND no add affordance.
  if (!hasFamily && !canAddColour) return null;
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
        <h2 className="font-serif text-base font-semibold m-0">
          {t('admin.styles.workspace.colourFamily', {
            defaultValue: 'Colour family',
          })}
          {hasFamily && (
            <span className="text-[var(--color-muted-foreground)] font-normal">
              {' · '}
              {family.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-[var(--color-muted-foreground)] m-0">
          {t('admin.styles.workspace.colourFamilySubtitle', {
            defaultValue:
              'Same design, different colours — grouped as "other colours" on marketplaces.',
          })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Current style — the highlighted "this style" chip. */}
        <span
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-3 py-1.5 text-xs text-[var(--color-primary)]"
          title={style.styleId ?? undefined}
        >
          <ColourSwatch colour={style.primaryColour} />
          <span className="font-mono">
            {style.primaryColour ?? '—'}
            {' · '}
            {t('admin.styles.workspace.colourFamilyThisStyle', {
              defaultValue: 'this style',
            })}
          </span>
        </span>
        {siblings.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => navigate(`/styles/${v.styleId ?? v.id}`)}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-foreground-2)] hover:bg-[var(--color-surface-2)] transition-colors"
            title={v.styleId ?? undefined}
          >
            <ColourSwatch colour={v.primaryColour} />
            <span className="font-mono">
              {v.primaryColour ?? '—'}
              {v.styleId ? ` → ${v.styleId}` : ''}
            </span>
          </button>
        ))}
        {canAddColour && (
          <button
            type="button"
            onClick={onAddColour}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--color-border-strong)] text-[var(--color-muted-foreground)] px-3 py-1.5 text-xs hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors"
          >
            <Plus size={16} />
            {t('admin.styles.workspace.addColour', {
              defaultValue: 'Add colour',
            })}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * China Import approval card. Gurukul flow has no sampling phase —
 * just a single intake approval that mints the NW- number
 * and takes the style to terminal lifecycle.
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
      <CardHeader
        title={t('admin.styles.workspace.chinaImportApproval.title', {
          defaultValue: 'Approval',
        })}
        right={
          <Badge variant="success" className="text-[10px]">
            <CheckCircle2 size={11} className="mr-1" />
            {t('admin.styles.workspace.chinaImportApproval.approved', {
              defaultValue: 'Approved',
            })}
          </Badge>
        }
      />
      <div className="p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <div className="min-w-0">
            <dt className="text-xs text-[var(--color-muted-foreground)] mb-0.5">
              {t('admin.styles.workspace.chinaImportApproval.approvedBy', {
                defaultValue: 'Approved by',
              })}
            </dt>
            <dd className="text-sm text-[var(--color-foreground)] break-words">
              {style.approver?.name ?? '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--color-muted-foreground)] mb-0.5">
              {t('admin.styles.workspace.chinaImportApproval.approvedOn', {
                defaultValue: 'Approved on',
              })}
            </dt>
            <dd className="text-sm text-[var(--color-foreground)] break-words">
              {approvedAt ? approvedAt.toLocaleString() : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--color-muted-foreground)] mb-0.5">
              {t('admin.styles.workspace.chinaImportApproval.styleNumber', {
                defaultValue: 'Style # minted',
              })}
            </dt>
            <dd className="text-sm text-[var(--color-foreground)] break-words">
              <span className="font-mono">{style.styleId ?? '—'}</span>
            </dd>
          </div>
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
      </div>
    </section>
  );
}

/**
 * Activity timeline — surfaces the audit log already hydrated by the
 * detail include. Compact list of "actor · action · time". The most-recent
 * entry's dot is brand-primary; older ones are muted, matching the mock's
 * activity-log treatment.
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

  // Describe WHAT each entry changed by diffing its before/after snapshots
  // (BE StylesService.diffSnapshot). `chips` = changed fields, showing the
  // new value for enum-ish fields (reusing the samplingSteps / sampleApproval
  // i18n labels); `note` = any free text (e.g. a park reason). `created` has
  // no `before`, so its verb label ("Created") stands on its own.
  const summarize = (
    log: StyleAuditLog,
  ): { chips: string[]; note: string | null } => {
    const note = log.notes ?? null;
    const before = log.before as Record<string, unknown> | null;
    const after = (log.after ?? {}) as Record<string, unknown>;
    if (!before) return { chips: [], note };
    const fmt = (k: string, v: unknown): string | null => {
      if (v === null || v === undefined || v === '') return null;
      switch (k) {
        case 'samplingStatus':
          return t(`admin.styles.samplingSteps.${String(v)}` as const, {
            defaultValue: String(v),
          });
        case 'sampleApproval':
          return t(`admin.styles.sampleApproval.${String(v)}` as const, {
            defaultValue: String(v),
          });
        case 'gender':
          return genderLabel(String(v));
        case 'lifecycle':
          return String(v).replace(/_/g, ' ');
        case 'samplingTimeline': {
          // Guard against non-ISO values (e.g. legacy day-count strings)
          // so the chip never reads "Invalid Date" — mirrors the guard in
          // renderSamplingTimeline.
          const d = new Date(String(v));
          return Number.isNaN(d.getTime())
            ? String(v)
            : d.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
        }
        case 'sampleFabricRequired':
          // A Decimal quantity in metres (serialized "2.50"), not a flag —
          // show the actual value that changed, not a boolean label.
          return `${String(v)} m`;
        case 'styleId':
        case 'primaryColour':
        case 'reason':
          return String(v);
        default:
          // Long/opaque text (working name, remark, links) → label only.
          return null;
      }
    };
    const chips: string[] = [];
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
      const label = AUDIT_FIELD_LABELS[k] ?? k;
      const v = fmt(k, after[k]);
      chips.push(v ? `${label}: ${v}` : label);
    }
    return { chips, note };
  };

  return (
    <section className={cardClasses}>
      <CardHeader
        title={t('admin.styles.workspace.activity', {
          defaultValue: 'Activity log',
        })}
      />
      {/* The log sits at the bottom of the right-hand stack (Core specs →
          BoM → Pattern/CAD → Activity log) and scrolls inside a capped
          height so a long history never pushes the page. A thin,
          always-visible scrollbar signals there's more to scroll (vs.
          macOS overlay bars that hide). */}
      <div className="relative">
        <div className="overflow-y-auto p-5 max-h-[480px] [scrollbar-width:thin] [scrollbar-color:var(--color-muted-foreground-2)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--color-muted-foreground-2)]">
          <ol className="relative ml-1.5 border-l border-[var(--color-border)] space-y-5">
            {logs.slice(0, 20).map((log, i) => {
              const { chips, note } = summarize(log);
              return (
                <li key={log.id} className="relative pl-5">
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-surface)]',
                      i === 0
                        ? 'bg-[var(--color-primary)]'
                        : 'bg-[var(--color-muted-foreground-2)]',
                    )}
                  />
                  <div className="text-sm text-[var(--color-foreground)]">
                    <span className="font-medium">
                      {log.actor?.name ?? '—'}
                    </span>
                    {' — '}
                    <span className="text-[var(--color-muted-foreground)]">
                      {t(`admin.styles.audit.${log.action}` as const, {
                        defaultValue: log.action,
                      })}
                    </span>
                  </div>
                  {/* What actually changed — chips of field → new value, so
                      the entry reads "Stage: QC" instead of a bare "Updated". */}
                  {chips.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {chips.map((c) => (
                        <span
                          key={c}
                          className="rounded-[6px] bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] text-[var(--color-foreground)]"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {note && (
                    <div className="mt-1.5 text-[12px] italic text-[var(--color-muted-foreground)]">
                      “{note}”
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)] tabular-nums">
                    {new Date(log.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
