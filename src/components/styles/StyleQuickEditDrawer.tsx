import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import ReferenceImageInput from '@/components/shared/ReferenceImageInput';
import { createStyle, patchStyle } from '@/api/styles';
import type {
  Style,
  Collection,
  Fabric,
  FabricType,
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
  fabricTypes: FabricType[];
  fabrics: Fabric[];
  onClose: () => void;
  onSaved: (saved: Style) => void;
}

type FormState = Partial<Omit<Style, 'id' | 'createdAt' | 'updatedAt' | 'variants' | 'inspections' | 'channelListings'>>;

const GENDERS: Gender[] = ['women', 'men', 'unisex'];

function dateInput(v: string | null | undefined): string {
  if (!v) return '';
  return v.slice(0, 10);
}

/**
 * Quick-edit drawer — a subset of fields available in the full Style
 * Workspace. Opens from any row click in the Styles Registry table.
 *
 * Reuses the salvaged ReferenceImageInput component for paste / drop /
 * fetch-from-link image attachment.
 */
export default function StyleQuickEditDrawer({
  open,
  style,
  defaults,
  collections,
  fabricTypes,
  fabrics,
  onClose,
  onSaved,
}: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (style) {
      setForm({ ...style });
    } else {
      setForm({
        source: defaults.source,
        lifecycle: 'draft',
        gender: 'women',
      });
    }
  }, [open, style, defaults]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const title = style?.styleId ?? style?.workingName ?? 'New style';
  const entityId = style?.id ?? 'new';

  const filteredFabrics = useMemo(() => {
    if (!form.fabricTypeId) return fabrics;
    return fabrics.filter((f) => f.fabricTypeId === form.fabricTypeId);
  }, [fabrics, form.fabricTypeId]);

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
        primaryColour: clean(form.primaryColour),
        referenceLink: clean(form.referenceLink),
        remark: clean(form.remark),
      };
      let saved: Style;
      if (style) {
        saved = await patchStyle(style.id, payload);
      } else {
        saved = await createStyle({
          source: defaults.source,
          category: defaults.category,
          ...payload,
        });
      }
      toast.show(style ? 'Style updated.' : 'Style created.', 'success');
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'Save failed.';
      setErr(Array.isArray(m) ? m.join(', ') : String(m));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={style?.collection?.name ?? defaults.source}
      accent="stitch"
      width="560px"
      footer={
        <div className="flex items-center justify-between gap-3">
          {err && (
            <span className="text-xs text-[var(--status-stuck-ink)] truncate">
              {err}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void submit()}>
              {saving ? 'Saving…' : style ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Working name</Label>
            <Input
              value={form.workingName ?? ''}
              onChange={(e) => set('workingName', e.target.value)}
              autoFocus={!style}
            />
          </div>
          <div>
            <Label>Gender</Label>
            <Select
              value={form.gender ?? ''}
              onChange={(e) =>
                set('gender', (e.target.value || null) as Gender | null)
              }
            >
              <option value="">—</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Collection</Label>
            <Select
              value={form.collectionId ? String(form.collectionId) : ''}
              onChange={(e) =>
                set('collectionId', e.target.value ? Number(e.target.value) : null)
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
          <div>
            <Label>Fabric type</Label>
            <Select
              value={form.fabricTypeId ? String(form.fabricTypeId) : ''}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                set('fabricTypeId', next);
                // Reset fabric when type changes
                set('fabricId', null);
              }}
            >
              <option value="">—</option>
              {fabricTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Fabric</Label>
            <Select
              value={form.fabricId ? String(form.fabricId) : ''}
              onChange={(e) =>
                set('fabricId', e.target.value ? Number(e.target.value) : null)
              }
              disabled={!form.fabricTypeId}
            >
              <option value="">
                {form.fabricTypeId ? '—' : 'Pick a fabric type first'}
              </option>
              {filteredFabrics.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Primary colour</Label>
            <Input
              value={form.primaryColour ?? ''}
              onChange={(e) => set('primaryColour', e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Reference link</Label>
          <Input
            value={form.referenceLink ?? ''}
            onChange={(e) => set('referenceLink', e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div>
          <Label>Reference image</Label>
          <ReferenceImageInput
            entityId={entityId}
            referenceImage={form.referenceImage ?? null}
            referenceImageUrl={form.referenceImageUrl ?? null}
            referenceLink={form.referenceLink ?? null}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          />
        </div>

        <div>
          <Label>Sampling timeline</Label>
          <Input
            type="date"
            value={dateInput(form.samplingTimeline)}
            onChange={(e) => set('samplingTimeline', e.target.value || null)}
          />
        </div>

        <div>
          <Label>Remark</Label>
          <Textarea
            value={form.remark ?? ''}
            onChange={(e) => set('remark', e.target.value)}
          />
        </div>
      </div>
    </Drawer>
  );
}
