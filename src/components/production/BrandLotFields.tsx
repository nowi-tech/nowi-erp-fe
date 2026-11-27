import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/components/ui/toast';
import ImageUploadTile from '@/components/shared/ImageUploadTile';
import { keepAdded, useQuickAddParty } from '@/components/shared/useQuickAddParty';
import { getBrands, type Brand } from '@/api/brands';
import { listColourMaster, createColourMaster } from '@/api/styles';
import { uploadPhoto } from '@/api/storage';
import type { Colour } from '@/api/types';

export interface BrandLotValue {
  brandId: number | '';
  colourId: number | '';
  /** GCS object path of the uploaded image; empty until one is uploaded. */
  imagePath: string;
}

export const EMPTY_BRAND_LOT: BrandLotValue = { brandId: '', colourId: '', imagePath: '' };

/** Brand, colour and image of a brand lot. Remount (new `key`) to clear the image preview. */
export default function BrandLotFields({
  value,
  onChange,
  showImage = true,
  imageUrl,
  lotId,
  onUploading,
}: {
  value: BrandLotValue;
  onChange: (patch: Partial<BrandLotValue>) => void;
  showImage?: boolean;
  /** The image already on the lot, shown until a new one is uploaded. */
  imageUrl?: string | null;
  /** Files the upload under this lot; a lot not yet created uploads as `new`. */
  lotId?: number;
  onUploading?: (uploading: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [colours, setColours] = useState<Colour[]>([]);
  const [preview, setPreview] = useState(imageUrl ?? '');
  const [uploading, setUploading] = useState(false);
  // Bumped on unmount, so an upload finishing after it can't land on the next lot.
  const uploadSeq = useRef(0);

  useEffect(() => {
    void getBrands().then((rows) => setBrands(keepAdded(rows))).catch(() => undefined);
    void listColourMaster().then((rows) => setColours(keepAdded(rows))).catch(() => undefined);
    return () => {
      uploadSeq.current += 1;
    };
  }, []);

  useEffect(() => onUploading?.(uploading), [uploading, onUploading]);

  // "+ Add" inside the brand dropdown creates the typed brand (or reuses that party) and selects it.
  const addBrand = useQuickAddParty(
    'brand',
    (b) => {
      setBrands((prev) =>
        [...prev.filter((x) => x.id !== b.id), { ...b, code: null, isActive: true }].sort((a, z) =>
          a.name.localeCompare(z.name),
        ),
      );
      onChange({ brandId: b.id });
    },
    value.brandId,
  );

  // "+ Add" inside the colour dropdown creates the typed colour and selects it.
  const addColour = (typed: string) => {
    const name = typed.trim();
    if (!name) return;
    void createColourMaster({ name })
      .then((c) => {
        setColours((prev) =>
          [...prev.filter((x) => x.id !== c.id), c].sort((a, z) => a.name.localeCompare(z.name)),
        );
        onChange({ colourId: c.id });
      })
      .catch(() =>
        toast.show(
          t('admin.production.intake.colourFailed', { defaultValue: "Couldn't add that colour." }),
          'error',
        ),
      );
  };

  const onImageFile = (file: File | undefined) => {
    if (!file) return;
    const seq = ++uploadSeq.current;
    // A failed re-upload falls back to the last good image, which imagePath still holds.
    const previous = preview;
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    void uploadPhoto('production_batch', lotId ?? 'new', file)
      .then(({ objectPath }) => {
        if (seq === uploadSeq.current) onChange({ imagePath: objectPath });
      })
      .catch(() => {
        if (seq !== uploadSeq.current) return;
        setPreview(previous);
        toast.show(
          t('admin.production.intake.imageFailed', { defaultValue: "Couldn't upload that image." }),
          'error',
        );
      })
      .finally(() => {
        if (seq === uploadSeq.current) setUploading(false);
      });
  };

  return (
    <>
      <div>
        <Label>{t('admin.production.intake.brand', { defaultValue: 'Brand' })}</Label>
        <Combobox<number>
          value={value.brandId === '' ? null : value.brandId}
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
          onChange={(id) => onChange({ brandId: id ?? '' })}
          onAddNew={(typed) => void addBrand(typed)}
          addOnEnter={false}
          addNewLabel={t('admin.production.intake.addBrand', { defaultValue: 'Add a new brand' })}
          placeholder={t('admin.production.intake.pickBrand', { defaultValue: 'Choose a brand…' })}
          ariaLabel={t('admin.production.intake.brand', { defaultValue: 'Brand' })}
        />
      </div>

      <div>
        <Label required>{t('admin.production.intake.colour', { defaultValue: 'Colour' })}</Label>
        <Combobox<number>
          value={value.colourId === '' ? null : value.colourId}
          options={colours.map((c) => ({
            value: c.id,
            label: c.name,
            leading: (
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-[var(--color-border)]"
                style={{ background: c.hex ?? c.name.toLowerCase() }}
              />
            ),
          }))}
          onChange={(id) => onChange({ colourId: id ?? '' })}
          onAddNew={addColour}
          addNewLabel={t('admin.production.intake.addColour', { defaultValue: 'Add a new colour' })}
          placeholder={t('admin.production.intake.pickColour', { defaultValue: 'Choose a colour…' })}
          ariaLabel={t('admin.production.intake.colour', { defaultValue: 'Colour' })}
        />
      </div>

      {showImage && (
        <div>
          <Label>{t('admin.production.intake.imageRequired', { defaultValue: 'Image *' })}</Label>
          <ImageUploadTile preview={preview} uploading={uploading} onFile={onImageFile} />
        </div>
      )}
    </>
  );
}
