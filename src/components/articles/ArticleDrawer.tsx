import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import ReferenceImageInput from './ReferenceImageInput';
import {
  createArticle,
  updateArticle,
  type Article,
  type ArticleCategory,
  type ArticleInput,
  type ArticleOptions,
  type Fabric,
} from '@/api/articles';

type Form = Partial<ArticleInput>;

interface Props {
  open: boolean;
  /** null → create mode. */
  article: Article | null;
  /** Preselected category in create mode. */
  category: ArticleCategory;
  options: ArticleOptions;
  fabrics: Fabric[];
  onClose: () => void;
  onSaved: () => void;
}

function dateInput(v: string | null | undefined): string {
  if (!v) return '';
  return v.slice(0, 10);
}

export default function ArticleDrawer({
  open,
  article,
  category,
  options,
  fabrics,
  onClose,
  onSaved,
}: Props) {
  const toast = useToast();
  const [form, setForm] = useState<Form>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setForm(
      article
        ? { ...article }
        : { category, sku: '', websiteLive: 'not_live' },
    );
  }, [open, article, category]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const title = article ? article.sku : 'New article';
  const entityId = article?.id ?? 'new';

  const fabricOpts = useMemo(
    () => fabrics.map((f) => ({ value: String(f.id), label: f.name })),
    [fabrics],
  );

  const submit = async () => {
    if (!form.sku?.trim()) {
      setErr('SKU is required.');
      return;
    }
    setSaving(true);
    setErr(null);
    // Empty strings → null so the BE clears the column cleanly.
    const clean = <T,>(v: T): T | null =>
      v === '' || v === undefined ? null : v;
    const payload: Partial<ArticleInput> = {
      ...form,
      sku: form.sku.trim(),
      category: form.category ?? category,
      colour: clean(form.colour),
      parentSku: clean(form.parentSku),
      remark: clean(form.remark),
      inspectionV1: clean(form.inspectionV1),
      inspectionV2: clean(form.inspectionV2),
      patternMaster: clean(form.patternMaster),
      samplingTimeline: clean(form.samplingTimeline),
      productionTimeline: clean(form.productionTimeline),
    };
    try {
      if (article) await updateArticle(article.id, payload);
      else await createArticle(payload as ArticleInput);
      toast.show(article ? 'Article updated.' : 'Article created.', 'success');
      onSaved();
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

  const enumSelect = (
    key: keyof Form,
    label: string,
    opts: { value: string; label: string }[],
  ) => (
    <div>
      <Label>{label}</Label>
      <Select
        value={(form[key] as string) ?? ''}
        onChange={(e) =>
          set(key, (e.target.value || null) as Form[typeof key])
        }
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );

  const numField = (key: keyof Form, label: string) => (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={(form[key] as number | undefined) ?? ''}
        onChange={(e) =>
          set(
            key,
            (e.target.value === ''
              ? null
              : Number(e.target.value)) as Form[typeof key],
          )
        }
      />
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={article ? options.category.find((c) => c.value === article.category)?.label : 'Create'}
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
              {saving ? 'Saving…' : article ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>SKU *</Label>
            <Input
              value={form.sku ?? ''}
              onChange={(e) => set('sku', e.target.value)}
              autoFocus={!article}
            />
          </div>
          <div>
            <Label>Parent SKU (variant of)</Label>
            <Input
              value={form.parentSku ?? ''}
              onChange={(e) => set('parentSku', e.target.value)}
              placeholder="blank = parent style"
            />
          </div>
          {enumSelect('category', 'Category', options.category)}
          <div>
            <Label>Colour</Label>
            <Input
              value={form.colour ?? ''}
              onChange={(e) => set('colour', e.target.value)}
            />
          </div>
          <div>
            <Label>Fabric</Label>
            <Select
              value={form.fabricId ? String(form.fabricId) : ''}
              onChange={(e) =>
                set(
                  'fabricId',
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            >
              <option value="">—</option>
              {fabricOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Pattern Master</Label>
            <Input
              value={form.patternMaster ?? ''}
              onChange={(e) => set('patternMaster', e.target.value)}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {enumSelect('samplingStatus', 'Sampling status', options.samplingStatus)}
          <div>
            <Label>Sampling timeline</Label>
            <Input
              type="date"
              value={dateInput(form.samplingTimeline)}
              onChange={(e) =>
                set('samplingTimeline', e.target.value || null)
              }
            />
          </div>
          {enumSelect('modelFitSession', 'Model / fit session', options.modelFitSession)}
          {enumSelect('dxfApproved', 'Pattern (DXF) approved', options.dxfApproved)}
          {enumSelect('sampleApproval', 'Sample approval', options.sampleApproval)}
          {enumSelect('productionStatus', 'Production status', options.productionStatus)}
          <div>
            <Label>Production timeline</Label>
            <Input
              type="date"
              value={dateInput(form.productionTimeline)}
              onChange={(e) =>
                set('productionTimeline', e.target.value || null)
              }
            />
          </div>
          {enumSelect('websiteLive', 'Website live', options.websiteLive)}
          {numField('cuttingQty', 'Cutting qty')}
          {numField('stitchingOutput', 'Stitching output')}
          {numField('packagingQty', 'Packaging qty')}
        </div>

        <div>
          <Label>Sample inspection remarks — v1</Label>
          <Textarea
            value={form.inspectionV1 ?? ''}
            onChange={(e) => set('inspectionV1', e.target.value)}
          />
        </div>
        <div>
          <Label>Sample inspection remarks — v2</Label>
          <Textarea
            value={form.inspectionV2 ?? ''}
            onChange={(e) => set('inspectionV2', e.target.value)}
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
