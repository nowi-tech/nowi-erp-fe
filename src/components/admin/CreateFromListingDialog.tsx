import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { listCategories } from '@/api/categories';
import { listCollections } from '@/api/collections';
import { createStyleFromListing } from '@/api/styles';
import type { CategoryWithStyleCode, Collection, Gender } from '@/api/types';
import type { InventoryStyle } from '@/api/inventoryHealth';
import { meaningfulName } from '@/lib/production';

const GENDERS: Gender[] = ['women', 'men', 'unisex', 'boys', 'girls'];

function guessGender(text: string): Gender {
  if (/\b(wom[ae]ns?|ladies)\b/.test(text)) return 'women';
  if (/\bgirls?\b/.test(text)) return 'girls';
  if (/\bboys?\b/.test(text)) return 'boys';
  if (/\bmens?\b/.test(text)) return 'men';
  return 'women';
}

/** The category whose code reads in the listing's category (else its name); the longest match wins, so T-shirt beats Shirt. */
function guessCategory(cats: CategoryWithStyleCode[], ...texts: string[]): number | null {
  for (const text of texts) {
    const flat = text.toLowerCase().replace(/[^a-z]/g, '');
    const hit = cats
      .filter((c) => flat.includes(c.code.toLowerCase()))
      .sort((a, b) => b.code.length - a.code.length)[0];
    if (hit) return hit.id;
  }
  return null;
}

/** A remote image worth keeping: absolute, and not a signed link that expires. */
function keepableImage(url: string | null): string | undefined {
  return url && /^https?:\/\//.test(url) && !url.includes('X-Goog-Signature') ? url : undefined;
}

export default function CreateFromListingDialog({
  style,
  onClose,
  onCreated,
}: {
  style: InventoryStyle | null;
  onClose: () => void;
  onCreated: (styleId: string) => void;
}) {
  const { t } = useTranslation();
  const [cats, setCats] = useState<CategoryWithStyleCode[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [gender, setGender] = useState<Gender>('women');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [myntraUrl, setMyntraUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!style) return;
    const text = `${style.category ?? ''} ${style.name ?? ''}`.toLowerCase();
    setGender(guessGender(text));
    setCollectionId(null);
    setMyntraUrl(style.marketplaceLinks.find((l) => l.channel === 'Myntra')?.url ?? '');
    setError(null);
    let live = true;
    Promise.all([listCategories(), listCollections()])
      .then(([c, k]) => {
        if (!live) return;
        const usable = c.filter((x) => x.isActive && x.styleCode);
        setCats(usable);
        setCollections(k);
        setCategoryId(guessCategory(usable, style.category ?? '', style.name ?? ''));
      })
      .catch(() => live && setError(t('admin.inventoryHealth.createErp.loadFailed', { defaultValue: 'Couldn’t load categories.' })));
    return () => {
      live = false;
    };
  }, [style, t]);

  const submit = async () => {
    if (!style || categoryId == null || collectionId == null) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createStyleFromListing({
        styleKey: style.styleKey,
        gender,
        categoryId,
        collectionId,
        workingName: meaningfulName(style) ?? undefined,
        imageUrl: keepableImage(style.imageUrl),
        myntraUrl: myntraUrl.trim() || undefined,
      });
      onCreated(created.styleId ?? style.styleKey);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg ?? t('admin.inventoryHealth.createErp.failed', { defaultValue: 'Couldn’t create the style.' }));
    } finally {
      setBusy(false);
    }
  };

  const field = 'mb-1 block text-xs text-[var(--color-muted-foreground)]';
  return (
    <Dialog
      open={style != null}
      onClose={busy ? () => undefined : onClose}
      title={t('admin.inventoryHealth.createErp.title', { defaultValue: 'Create {{code}} in ERP', code: style?.styleKey ?? '' })}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('admin.inventoryHealth.createErp.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button size="sm" disabled={busy || categoryId == null || collectionId == null} onClick={submit}>
            {t('admin.inventoryHealth.createErp.confirm', { defaultValue: 'Create' })}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={field}>{t('admin.inventoryHealth.createErp.collection', { defaultValue: 'Collection' })}</label>
          <Select value={collectionId ?? ''} onChange={(e) => setCollectionId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('admin.inventoryHealth.createErp.pick', { defaultValue: 'Select…' })}</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={field}>{t('admin.inventoryHealth.createErp.category', { defaultValue: 'Category' })}</label>
          <Select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('admin.inventoryHealth.createErp.pick', { defaultValue: 'Select…' })}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={field}>{t('admin.inventoryHealth.createErp.gender', { defaultValue: 'Gender' })}</label>
          <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{t(`admin.inventoryHealth.createErp.genders.${g}`, { defaultValue: g[0].toUpperCase() + g.slice(1) })}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={field}>{t('admin.inventoryHealth.createErp.myntra', { defaultValue: 'Myntra link' })}</label>
          <Input value={myntraUrl} onChange={(e) => setMyntraUrl(e.target.value)} placeholder="https://www.myntra.com/…" />
        </div>
        {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
      </div>
    </Dialog>
  );
}
