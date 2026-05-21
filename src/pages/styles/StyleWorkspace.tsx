import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pause, Play, Send, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import SamplingPipelineStepper from '@/components/styles/SamplingPipelineStepper';
import VariantMatrix from '@/components/styles/VariantMatrix';
import ChannelListingsPanel from '@/components/styles/ChannelListingsPanel';
import InspectionTimeline from '@/components/styles/InspectionTimeline';
import {
  getStyle,
  parkStyle,
  reviveStyle,
  approveStyle,
  sampleApproveStyle,
  patchStyle,
  type SamplingStatus,
} from '@/api/styles';
import type { Style } from '@/api/types';
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

  const canApproveIntake = style.lifecycle === 'draft';
  const canSampleApprove = style.lifecycle === 'in_sampling';
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
              onClick={() => void doAction('approve', () => approveStyle(style.id))}
            >
              <CheckCircle2 size={14} />
              <span className="ml-1">{t('admin.styles.workspace.approve')}</span>
            </Button>
          )}
          {canSampleApprove && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void doAction('sample-approve', () =>
                  sampleApproveStyle(style.id),
                )
              }
            >
              <CheckCircle2 size={14} />
              <span className="ml-1">
                {t('admin.styles.workspace.sampleApprove')}
              </span>
            </Button>
          )}
          <Button variant="outline" size="sm" disabled>
            <Send size={14} />
            <span className="ml-1">{t('admin.styles.workspace.sendToPd')}</span>
          </Button>
        </div>
      </div>

      {/* Sampling pipeline */}
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
              <Spec
                label="Fabric type"
                value={style.fabricType?.name ?? '—'}
              />
              <Spec label="Fabric" value={style.fabric?.name ?? '—'} />
              <Spec
                label="Primary colour"
                value={style.primaryColour ?? '—'}
              />
              <Spec
                label="Sampling timeline"
                value={
                  style.samplingTimeline
                    ? new Date(style.samplingTimeline).toLocaleDateString()
                    : '—'
                }
              />
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

          {/* Pattern approval */}
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
              <Spec
                label="Sample approval"
                value={style.sampleApproval ?? '—'}
              />
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

          {/* Inspection history */}
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
