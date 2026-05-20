import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import SourceToggle from '@/components/styles/SourceToggle';
import ReferenceImageInput from '@/components/shared/ReferenceImageInput';
import {
  createStyle,
  listCollections,
  listFabricTypes,
  listFabrics,
} from '@/api/styles';
import type {
  StyleSource,
  Collection,
  FabricType,
  Fabric,
  Gender,
} from '@/api/types';
import { cn } from '@/lib/utils';

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'winterwear', label: 'Winterwear' },
  { value: 'womens_bottom_wear', label: "Women's bottom wear" },
  { value: 'mens_bottom_wear', label: "Men's bottom wear" },
  { value: 'womens_top_wear', label: "Women's top wear" },
  { value: 'mens_top_wear', label: "Men's top wear" },
  { value: 'mens_suit', label: "Men's suit" },
  { value: 'china_reverse', label: 'China Reverse' },
];

type FormState = {
  workingName: string;
  fabricTypeId: string;
  fabricId: string;
  collectionId: string;
  gender: Gender;
  category: string;
  primaryColour: string;
  referenceLink: string;
  referenceImage: string | null;
  referenceImageUrl: string | null;
};

/**
 * Single consolidated intake form (canonical_new_intake.html).
 *
 * The top-level Source toggle switches the visible sections (the
 * Pattern Master block is hidden for China Reverse) and the approval
 * reviewer label/button.
 */
export default function NewIntake() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const initialSource: StyleSource =
    (params.get('source') as StyleSource | null) === 'china_reverse'
      ? 'china_reverse'
      : 'sampling';

  const [source, setSource] = useState<StyleSource>(initialSource);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [fabricTypes, setFabricTypes] = useState<FabricType[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [form, setForm] = useState<FormState>({
    workingName: '',
    fabricTypeId: '',
    fabricId: '',
    collectionId: '',
    gender: 'women',
    category: 'womens_top_wear',
    primaryColour: '',
    referenceLink: '',
    referenceImage: null,
    referenceImageUrl: null,
  });
  const [busy, setBusy] = useState<null | 'draft' | 'submit'>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      listCollections().catch(() => [] as Collection[]),
      listFabricTypes().catch(() => [] as FabricType[]),
      listFabrics().catch(() => [] as Fabric[]),
    ]).then(([c, ft, fb]) => {
      setCollections(c);
      setFabricTypes(ft);
      setFabrics(fb);
    });
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const filteredFabrics = useMemo(() => {
    if (!form.fabricTypeId) return fabrics;
    return fabrics.filter((f) => f.fabricTypeId === Number(form.fabricTypeId));
  }, [fabrics, form.fabricTypeId]);

  const reviewerLabel =
    source === 'china_reverse'
      ? t('admin.styles.intake.reviewerDheeraj')
      : t('admin.styles.intake.reviewerParul');
  const submitLabel =
    source === 'china_reverse'
      ? t('admin.styles.intake.submitToDheeraj')
      : t('admin.styles.intake.submitToParul');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildPayload = (): any => ({
    source,
    category: source === 'china_reverse' ? 'china_reverse' : form.category,
    workingName: form.workingName.trim() || null,
    fabricTypeId: form.fabricTypeId ? Number(form.fabricTypeId) : null,
    fabricId: form.fabricId ? Number(form.fabricId) : null,
    collectionId: form.collectionId ? Number(form.collectionId) : null,
    gender: form.gender,
    primaryColour: form.primaryColour.trim() || null,
    referenceLink: form.referenceLink.trim() || null,
    referenceImage: form.referenceImage,
    referenceImageUrl: form.referenceImageUrl,
  });

  const save = async (mode: 'draft' | 'submit') => {
    if (!form.workingName.trim()) {
      setErr('Working name is required.');
      return;
    }
    setBusy(mode);
    setErr(null);
    try {
      const created = await createStyle(buildPayload());
      toast.show(
        mode === 'draft'
          ? t('admin.styles.intake.createdToast')
          : t('admin.styles.intake.submittedToast'),
        'success',
      );
      navigate(`/styles/${created.styleId ?? created.id}`);
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? t('admin.styles.intake.saveError');
      setErr(Array.isArray(m) ? m.join(', ') : String(m));
    } finally {
      setBusy(null);
    }
  };

  const sectionClasses =
    'bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-6 shadow-sm';

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-[var(--color-primary)]">
          {t('admin.styles.intake.title')}
        </h1>
      </div>

      {/* Source toggle */}
      <section className={cn(sectionClasses, 'flex flex-col gap-2')}>
        <Label>{t('admin.styles.intake.sourceToggle')}</Label>
        <SourceToggle value={source} onChange={setSource} />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {t('admin.styles.intake.sourceHelp')}
        </p>
      </section>

      {/* Section 1: Article details */}
      <section className={sectionClasses}>
        <h3 className="font-serif text-lg border-b border-[var(--color-border)] pb-3 mb-5">
          {t('admin.styles.intake.articleDetails')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>{t('admin.styles.intake.workingName')} *</Label>
            <Input
              value={form.workingName}
              onChange={(e) => set('workingName', e.target.value)}
              placeholder={t('admin.styles.intake.workingNamePh')}
              autoFocus
            />
          </div>
          <div>
            <Label>{t('admin.styles.intake.fabricType')}</Label>
            <Select
              value={form.fabricTypeId}
              onChange={(e) => {
                set('fabricTypeId', e.target.value);
                set('fabricId', '');
              }}
            >
              <option value="">—</option>
              {fabricTypes.map((ft) => (
                <option key={ft.id} value={ft.id}>
                  {ft.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.styles.intake.fabric')}</Label>
            <Select
              value={form.fabricId}
              onChange={(e) => set('fabricId', e.target.value)}
              disabled={!form.fabricTypeId}
            >
              <option value="">
                {form.fabricTypeId
                  ? '—'
                  : t('admin.styles.intake.fabricHelp')}
              </option>
              {filteredFabrics.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.styles.intake.collection')}</Label>
            <Select
              value={form.collectionId}
              onChange={(e) => set('collectionId', e.target.value)}
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
            <Label>{t('admin.styles.intake.gender')}</Label>
            <div className="flex gap-1.5 mt-1">
              {(['women', 'men', 'unisex'] as Gender[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('gender', g)}
                  className={cn(
                    'px-3 py-1.5 rounded-[var(--radius-sm)] text-sm border transition-colors',
                    form.gender === g
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] border-[var(--color-primary)] font-medium'
                      : 'bg-[var(--color-surface)] text-[var(--color-foreground-3)] border-[var(--color-border)] hover:bg-[var(--color-muted)]',
                  )}
                >
                  {g === 'women'
                    ? t('admin.styles.intake.genderWomen')
                    : g === 'men'
                      ? t('admin.styles.intake.genderMen')
                      : t('admin.styles.intake.genderUnisex')}
                </button>
              ))}
            </div>
          </div>
          {source === 'sampling' && (
            <div>
              <Label>{t('admin.styles.intake.category')}</Label>
              <Select
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {CATEGORY_OPTIONS.filter(
                  (o) => o.value !== 'china_reverse',
                ).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="md:col-span-2">
            <Label>{t('admin.styles.intake.primaryColour')}</Label>
            <Input
              value={form.primaryColour}
              onChange={(e) => set('primaryColour', e.target.value)}
              placeholder="e.g. Indigo / Black-pink Weaved"
            />
          </div>
        </div>
      </section>

      {/* Section 2: References */}
      <section className={sectionClasses}>
        <h3 className="font-serif text-lg border-b border-[var(--color-border)] pb-3 mb-5">
          {t('admin.styles.intake.references')}
        </h3>
        <div className="space-y-4">
          <div>
            <Label>{t('admin.styles.intake.referenceLink')}</Label>
            <Input
              value={form.referenceLink}
              onChange={(e) => set('referenceLink', e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label>{t('admin.styles.intake.referenceImage')}</Label>
            <ReferenceImageInput
              entityId="new"
              referenceImage={form.referenceImage}
              referenceImageUrl={form.referenceImageUrl}
              referenceLink={form.referenceLink || null}
              onChange={(patch) =>
                setForm((f) => ({
                  ...f,
                  referenceImage:
                    patch.referenceImage !== undefined
                      ? patch.referenceImage
                      : f.referenceImage,
                  referenceImageUrl:
                    patch.referenceImageUrl !== undefined
                      ? patch.referenceImageUrl
                      : f.referenceImageUrl,
                }))
              }
            />
          </div>
        </div>
      </section>

      {/* Section 3: Pattern Master — only shown for sampling */}
      {source === 'sampling' && (
        <section className={sectionClasses}>
          <h3 className="font-serif text-lg border-b border-[var(--color-border)] pb-3 mb-5">
            {t('admin.styles.intake.patternMaster')}
          </h3>
          <p className="text-sm text-[var(--color-muted-foreground)] mb-3">
            {t('admin.styles.intake.patternMasterHelp')}
          </p>
          <div className="bg-[var(--color-surface-2)] rounded-[var(--radius-sm)] p-3 text-sm">
            {form.gender === 'women' &&
              t('admin.styles.intake.patternMasterRoutedW')}
            {form.gender === 'men' &&
              t('admin.styles.intake.patternMasterRoutedM')}
            {form.gender === 'unisex' &&
              t('admin.styles.intake.patternMasterUnisex')}
          </div>
        </section>
      )}

      {/* Section 4: Review & approval */}
      <section className={sectionClasses}>
        <h3 className="font-serif text-lg border-b border-[var(--color-border)] pb-3 mb-5">
          {t('admin.styles.intake.reviewApproval')}
        </h3>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-3">
          {t('admin.styles.intake.reviewerNote', { name: reviewerLabel })}
        </p>
        {err && (
          <p className="text-sm text-[var(--status-stuck-ink)] bg-[var(--status-stuck-bg)] rounded-[var(--radius-sm)] px-3 py-2 mb-3">
            {err}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void save('draft')}
          >
            {busy === 'draft'
              ? 'Saving…'
              : t('admin.styles.intake.saveDraft')}
          </Button>
          <Button
            disabled={busy !== null}
            onClick={() => void save('submit')}
          >
            {busy === 'submit' ? 'Submitting…' : submitLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
