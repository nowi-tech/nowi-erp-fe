import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import ReferenceImageInput from '@/components/shared/ReferenceImageInput';
import FabricPicker from '@/components/styles/intake/FabricPicker';
import ColourPicker from '@/components/styles/intake/ColourPicker';
import PatternCadInput from '@/components/shared/PatternCadInput';
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
  // `collections` prop kept for API compat with callers but unused —
  // the collection picker was removed from the edit form.
  collections: _collections,
  fabrics,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Full style (with auditLogs) fetched for the history timeline. */
  const [, setDetail] = useState<Style | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (style) {
      setForm({ ...style });
      // Always open straight in edit mode — the view-then-edit two-step
      // was a UX wart. The detail page already shows the full read-only
      // summary; this modal is exclusively for editing.
      setDetail(style.auditLogs ? style : null);
    } else {
      setForm({
        source: defaults.source,
        lifecycle: 'draft',
        gender: 'women',
      });
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


  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      // Empty strings → null so the BE clears the column cleanly.
      const clean = <T,>(v: T): T | null =>
        v === '' || v === undefined ? null : v;

      // BE's ValidationPipe runs in `whitelist: true` strict mode and
      // rejects any property the DTO doesn't declare. Build the payload
      // from a tight allowlist of editable fields — `{...form}` would
      // leak id, lifecycle, auditLogs, etc. and 400 the request.
      //
      // Gender mapping: Style.gender stores W/M/U (StyleGender), but
      // the DTO accepts women/men/unisex (Gender). Translate before
      // sending. New-mode (`!style`) already initialises with the long
      // form so the conversion is only needed in edit mode.
      // Runtime is actually `W | M | U | women | men | unisex` because
      // Prisma's StyleGender (W/M/U) leaks through the include relations
      // while the FE Style.gender type pretends it's only the long form.
      // Compare as `unknown` then narrow.
      const genderToWire = (
        g: typeof form.gender,
      ): 'women' | 'men' | 'unisex' | undefined => {
        const v = g as unknown as string | null | undefined;
        if (v === 'W') return 'women';
        if (v === 'M') return 'men';
        if (v === 'U') return 'unisex';
        if (v === 'women' || v === 'men' || v === 'unisex') return v;
        return undefined;
      };

      const payload: Record<string, unknown> = {
        workingName: clean(form.workingName),
        developmentReason: clean(form.developmentReason),
        primaryColour: clean(form.primaryColour),
        referenceLink: clean(form.referenceLink),
        referenceImage: clean(form.referenceImage),
        referenceImageUrl: clean(form.referenceImageUrl),
        referenceImages: form.referenceImages ?? [],
        remark: clean(form.remark),
        patternCadPaths: form.patternCadPaths ?? [],
        fabricId: form.fabricId ?? null,
        collectionId: form.collectionId ?? null,
        // `categoryId` and `articleCategory` aren't on the FE Style type
        // but exist at runtime (Prisma serialises them via the include).
        // Cast to any/unknown to read them without polluting FormState.
        categoryId:
          (form as unknown as { categoryId?: number }).categoryId ??
          undefined,
        articleCategory:
          (form as unknown as { articleCategory?: string }).articleCategory ??
          undefined,
        samplingStatus: form.samplingStatus ?? null,
        samplingTimeline: clean(form.samplingTimeline),
        modelFitSession: form.modelFitSession ?? null,
        dxfApproved: form.dxfApproved ?? null,
        sampleApproval: form.sampleApproval ?? null,
        patternMasterId: form.patternMasterId ?? null,
        // `factoryId` and `pdNote` belong to the deferred PD-tracker
        // phase and aren't on the current UpdateStyleDto. Leave them
        // out so the BE doesn't 400 on whitelist mode.
        sampleFabricRequired:
          form.sampleFabricRequired === '' ||
          form.sampleFabricRequired === undefined ||
          form.sampleFabricRequired === null
            ? null
            : Number(form.sampleFabricRequired),
        gender: genderToWire(form.gender),
      };
      // Strip undefined so we don't send "key: undefined" → JSON drops
      // it anyway, but it keeps the wire payload clean for debugging.
      for (const k of Object.keys(payload)) {
        if (payload[k] === undefined) delete payload[k];
      }
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
      // Modal — close on save. Read-only display lives on the detail
      // page, which the host re-fetches via onSaved → load().
      onClose();
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
    // Modal — Cancel just closes the editor. Pre-existing edit state is
    // discarded on next open via the open-time effect.
    setErr(null);
    onClose();
  }, [onClose]);

  const tf = (k: string) => t(`admin.styles.drawer.fields.${k}`);

  // China Import is a simple flow — sampling-stage fields (timeline,
  // DXF, pattern CAD, sample approval, inspections) don't apply.
  const isChinaImport =
    (style?.source ?? form.source ?? defaults.source) === 'china_import';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidthClassName="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          {err && (
            <span className="text-xs text-[var(--status-stuck-ink)] truncate">
              {err}
            </span>
          )}
          <div className="ml-auto flex gap-2">
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
          </div>
        </div>
      }
    >
      {/* Read-only "view" body removed — modal is always an edit form
          now. The detail page handles the read-only display. */}
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
            <div className="sm:col-span-2">
              <Label>{tf('fabric')}</Label>
              {/* Same searchable + "+ Add new" combobox the intake form
                  uses, so the edit experience matches submission. */}
              <FabricPicker
                fabrics={fabrics}
                value={form.fabricId ?? null}
                onChange={(next) => set('fabricId', next)}
                onFabricCreated={(f) =>
                  setForm((cur) => ({ ...cur, fabricId: f.id }))
                }
              />
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
              {/* `inlineAdd` because this picker is itself nested in
                  a Dialog; the colour picker's own confirmation Dialog
                  would share window-level Esc handlers and double-close. */}
              <ColourPicker
                value={form.primaryColour ?? ''}
                onChange={(next) => set('primaryColour', next)}
                inlineAdd
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
    </Dialog>
  );
}

