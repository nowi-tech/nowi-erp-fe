import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import ReferenceImageInput from '@/components/shared/ReferenceImageInput';
import PatternCadInput from '@/components/shared/PatternCadInput';
import PatternCadPreview from '@/components/styles/PatternCadPreview';
import StyleHistoryTimeline from '@/components/styles/StyleHistoryTimeline';
import { createStyle, patchStyle, getStyle } from '@/api/styles';
import type {
  Style,
  Collection,
  Fabric,
  Gender,
  StyleSource,
} from '@/api/types';
import type { ArticleCategory } from '@/api/styles';

interface Props {
  open: boolean;
  /** null → create mode. */
  style: Style | null;
  /** Defaults when creating. */
  defaults: {
    source: StyleSource;
    category: ArticleCategory;
  };
  collections: Collection[];
  fabrics: Fabric[];
  onClose: () => void;
  onSaved: (saved: Style) => void;
}

type FormState = Partial<
  Omit<Style, 'id' | 'createdAt' | 'updatedAt' | 'variants' | 'inspections' | 'channelListings'>
>;

const GENDERS: Gender[] = ['women', 'men', 'unisex'];

function dateInput(v: string | null | undefined): string {
  if (!v) return '';
  return v.slice(0, 10);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Quick-edit drawer — a subset of fields available in the full Style
 * Workspace. Opens from any row click in the Styles Registry table.
 *
 * Two modes share one drawer:
 *  - VIEW (default for an existing style): read-only field summary, a
 *    Pattern/CAD preview, and the audit-log history timeline.
 *  - EDIT (default when creating): the editable form, also reached from
 *    VIEW via the header "Edit" button.
 *
 * Reuses the salvaged ReferenceImageInput component for paste / drop /
 * fetch-from-link image attachment.
 */
export default function StyleQuickEditDrawer({
  open,
  style,
  defaults,
  collections,
  fabrics,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Create always starts in edit mode; an existing style opens read-only.
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  /** Full style (with auditLogs) fetched for the history timeline. */
  const [detail, setDetail] = useState<Style | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (style) {
      setForm({ ...style });
      setMode('view');
      setDetail(style.auditLogs ? style : null);
    } else {
      setForm({
        source: defaults.source,
        lifecycle: 'draft',
        gender: 'women',
      });
      setMode('edit');
      setDetail(null);
    }
  }, [open, style, defaults]);

  // Fetch the full Style (with auditLogs) for the history timeline.
  useEffect(() => {
    if (!open || !style) return;
    let cancelled = false;
    getStyle(style.id)
      .then((full) => !cancelled && setDetail(full))
      .catch(() => {
        if (!cancelled) setErr(t('admin.styles.drawer.loadError'));
      });
    return () => {
      cancelled = true;
    };
  }, [open, style, t]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const title = style?.styleId ?? style?.workingName ?? t('admin.styles.drawer.newStyle');
  const entityId = style?.id ?? 'new';

  /** "Cotton Twill — 240 meter available" / "Cotton Twill — no stock". */
  const fabricOptionLabel = (f: Fabric) => {
    const qty = f.availableQuantity;
    if (qty === undefined || qty === null || qty <= 0) {
      return `${f.name} — ${t('admin.fabricLibrary.noStock')}`;
    }
    const unit = f.unitOfMeasure ?? '';
    return `${f.name} — ${qty} ${unit} ${t('admin.fabricLibrary.available')}`.trim();
  };

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      // Empty strings → null so the BE clears the column cleanly.
      const clean = <T,>(v: T): T | null =>
        v === '' || v === undefined ? null : v;
      const payload: Record<string, unknown> = {
        ...form,
        workingName: clean(form.workingName),
        developmentReason: clean(form.developmentReason),
        primaryColour: clean(form.primaryColour),
        referenceLink: clean(form.referenceLink),
        remark: clean(form.remark),
        patternCadPaths: form.patternCadPaths ?? [],
        sampleFabricRequired:
          form.sampleFabricRequired === '' ||
          form.sampleFabricRequired === undefined ||
          form.sampleFabricRequired === null
            ? null
            : Number(form.sampleFabricRequired),
      };
      let saved: Style;
      if (style) {
        saved = await patchStyle(style.id, payload);
        // Refresh the full style (with auditLogs) for the timeline.
        try {
          saved = await getStyle(style.id);
        } catch {
          // Non-fatal — fall back to the PATCH response.
        }
      } else {
        saved = await createStyle({
          source: defaults.source,
          category: defaults.category,
          ...payload,
        });
      }
      toast.show(
        style
          ? t('admin.styles.drawer.updatedToast')
          : t('admin.styles.drawer.createdToast'),
        'success',
      );
      onSaved(saved);
      if (style) {
        // Stay in the drawer, drop back to the refreshed view.
        setForm({ ...saved });
        setDetail(saved);
        setMode('view');
      } else {
        onClose();
      }
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? t('admin.styles.drawer.saveError');
      setErr(Array.isArray(m) ? m.join(', ') : String(m));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = useCallback(() => {
    if (style) {
      // Revert any in-progress edits and return to view mode.
      setForm({ ...(detail ?? style) });
      setErr(null);
      setMode('view');
    } else {
      onClose();
    }
  }, [style, detail, onClose]);

  const tf = (k: string) => t(`admin.styles.drawer.fields.${k}`);

  // China Import is a simple flow — sampling-stage fields (timeline,
  // DXF, pattern CAD, sample approval, inspections) don't apply.
  const isChinaImport =
    (style?.source ?? form.source ?? defaults.source) === 'china_import';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={style?.collection?.name ?? defaults.source}
      accent="stitch"
      headerAction={
        style && mode === 'view' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setForm({ ...(detail ?? style) });
              setMode('edit');
            }}
          >
            <Pencil size={14} />
            <span className="ml-1.5">{t('admin.styles.drawer.edit')}</span>
          </Button>
        ) : undefined
      }
      width="560px"
      footer={
        <div className="flex items-center justify-between gap-3">
          {err && (
            <span className="text-xs text-[var(--status-stuck-ink)] truncate">
              {err}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {mode === 'edit' ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  {t('admin.styles.drawer.cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => void submit()}
                >
                  {saving
                    ? t('admin.styles.drawer.saving')
                    : style
                      ? t('admin.styles.drawer.save')
                      : t('admin.styles.drawer.create')}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={onClose}>
                {t('admin.styles.drawer.cancel')}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {mode === 'view' ? (
        // `detail ?? style` can briefly be null — the Drawer renders its
        // children even while closed (open=false, no style selected yet).
        detail ?? style ? (
          <ViewBody
            style={(detail ?? style)!}
            tf={tf}
            t={t}
            isChinaImport={isChinaImport}
          />
        ) : null
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{tf('workingName')}</Label>
              <Input
                value={form.workingName ?? ''}
                onChange={(e) => set('workingName', e.target.value)}
                autoFocus={!style}
              />
            </div>
            <div>
              <Label>{tf('gender')}</Label>
              <Select
                value={form.gender ?? ''}
                onChange={(e) =>
                  set('gender', (e.target.value || null) as Gender | null)
                }
              >
                <option value="">—</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {cap(g)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{tf('collection')}</Label>
              <Select
                value={form.collectionId ? String(form.collectionId) : ''}
                onChange={(e) =>
                  set(
                    'collectionId',
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">—</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>{tf('fabric')}</Label>
              <Select
                value={form.fabricId ? String(form.fabricId) : ''}
                onChange={(e) =>
                  set('fabricId', e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">—</option>
                {fabrics.map((f) => (
                  <option key={f.id} value={f.id}>
                    {fabricOptionLabel(f)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>{tf('sampleFabricRequired')}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={
                  form.sampleFabricRequired === null ||
                  form.sampleFabricRequired === undefined
                    ? ''
                    : String(form.sampleFabricRequired)
                }
                onChange={(e) => set('sampleFabricRequired', e.target.value)}
                placeholder={tf('sampleFabricRequiredHelp')}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{tf('primaryColour')}</Label>
              <Input
                value={form.primaryColour ?? ''}
                onChange={(e) => set('primaryColour', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>{tf('referenceLink')}</Label>
            <Input
              value={form.referenceLink ?? ''}
              onChange={(e) => set('referenceLink', e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div>
            <Label>{tf('referenceImage')}</Label>
            <ReferenceImageInput
              entityId={entityId}
              referenceImage={form.referenceImage ?? null}
              referenceImageUrl={form.referenceImageUrl ?? null}
              referenceLink={form.referenceLink ?? null}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
          </div>

          {!isChinaImport && (
            <div>
              <Label>{tf('samplingTimeline')}</Label>
              <Input
                type="date"
                value={dateInput(form.samplingTimeline)}
                onChange={(e) =>
                  set('samplingTimeline', e.target.value || null)
                }
              />
            </div>
          )}

          {!isChinaImport && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{tf('dxfApproved')}</Label>
                <Select
                  value={form.dxfApproved ?? ''}
                  onChange={(e) =>
                    set(
                      'dxfApproved',
                      (e.target.value || null) as Style['dxfApproved'],
                    )
                  }
                >
                  <option value="">—</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </div>
              <div>
                <Label>{tf('patternCad')}</Label>
                <PatternCadInput
                  entityId={entityId}
                  patternCadPaths={form.patternCadPaths ?? []}
                  onChange={(p) => set('patternCadPaths', p)}
                />
              </div>
            </div>
          )}

          {!isChinaImport && (
            <div>
              <Label>{tf('developmentReason')}</Label>
              <Textarea
                value={form.developmentReason ?? ''}
                onChange={(e) => set('developmentReason', e.target.value)}
              />
            </div>
          )}

          <div>
            <Label>{tf('remark')}</Label>
            <Textarea
              value={form.remark ?? ''}
              onChange={(e) => set('remark', e.target.value)}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ─── View mode ────────────────────────────────────────────────────────

interface ViewBodyProps {
  style: Style;
  tf: (k: string) => string;
  t: (k: string, opts?: Record<string, unknown>) => string;
  isChinaImport: boolean;
}

/** A single read-only field row. */
function ViewField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-[var(--color-foreground)] break-words">
        {value}
      </div>
    </div>
  );
}

function ViewBody({ style, tf, t, isChinaImport }: ViewBodyProps) {
  const dash = t('admin.styles.drawer.empty');
  const v = (s: string | null | undefined) => (s ? cap(String(s).replace(/_/g, ' ')) : dash);

  return (
    <div className="space-y-6">
      {/* Reference image */}
      {(style.referenceImageUrl || style.referenceImage) && (
        <div>
          <div className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
            {tf('referenceImage')}
          </div>
          <ReferenceImageInput
            entityId={style.id}
            referenceImage={style.referenceImage ?? null}
            referenceImageUrl={style.referenceImageUrl ?? null}
            referenceLink={style.referenceLink ?? null}
            onChange={() => {
              /* read-only in view mode */
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <ViewField
          label={tf('styleNo')}
          value={style.styleId ?? style.workingName ?? dash}
        />
        <ViewField label={tf('workingName')} value={style.workingName ?? dash} />
        <ViewField label={tf('gender')} value={v(style.gender)} />
        <ViewField
          label={tf('collection')}
          value={style.collection?.name ?? dash}
        />
        <ViewField label={tf('fabric')} value={style.fabric?.name ?? dash} />
        <ViewField
          label={tf('primaryColour')}
          value={style.primaryColour ?? dash}
        />
        {!isChinaImport && (
          <>
            <ViewField
              label={tf('samplingStatus')}
              value={v(style.samplingStatus)}
            />
            <ViewField
              label={tf('samplingTimeline')}
              value={
                style.samplingTimeline
                  ? new Date(style.samplingTimeline).toLocaleDateString()
                  : dash
              }
            />
            <ViewField
              label={tf('patternMaster')}
              value={style.patternMaster?.name ?? dash}
            />
            <ViewField label={tf('dxfApproved')} value={v(style.dxfApproved)} />
            <ViewField
              label={tf('sampleApproval')}
              value={v(style.sampleApproval)}
            />
          </>
        )}
        <ViewField
          label={tf('productionStatus')}
          value={v(style.productionStatus)}
        />
      </div>

      {style.developmentReason && (
        <ViewField label={tf('developmentReason')} value={style.developmentReason} />
      )}

      {style.remark && (
        <ViewField label={tf('remark')} value={style.remark} />
      )}

      {/* Pattern / CAD file — sampling-only */}
      {!isChinaImport && (
        <div>
          <div className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
            {tf('patternCad')}
          </div>
          {style.patternCadPaths && style.patternCadPaths.length > 0 ? (
            <PatternCadPreview patternCadPaths={style.patternCadPaths} />
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('admin.styles.drawer.patternCad.none')}
            </p>
          )}
        </div>
      )}

      {/* History timeline */}
      <div>
        <div className="text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
          {t('admin.styles.drawer.sections.history')}
        </div>
        <StyleHistoryTimeline auditLogs={style.auditLogs ?? []} />
      </div>
    </div>
  );
}
