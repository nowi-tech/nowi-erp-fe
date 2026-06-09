import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSignedUrls } from '@/hooks/useSignedUrls';

/**
 * Tiny inline fabric-swatch thumbnail rendered next to the Fabric spec row
 * in the Style workspace. `fabricImagePath` is a GCS object path signed on
 * demand. Renders nothing when there's no swatch or it can't be resolved.
 */
interface FabricSwatchThumbProps {
  fabricImagePath: string | null;
}

export default function FabricSwatchThumb({
  fabricImagePath,
}: FabricSwatchThumbProps) {
  const { t } = useTranslation();
  const paths = useMemo(
    () => (fabricImagePath ? [fabricImagePath] : []),
    [fabricImagePath],
  );
  const urls = useSignedUrls(paths);
  const url = fabricImagePath ? urls[fabricImagePath] : undefined;

  if (!url) return null;

  const label = t('admin.styles.workspace.fabricSwatch', {
    defaultValue: 'Fabric swatch',
  });
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className="inline-block h-8 w-8 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] align-middle"
    >
      <img src={url} alt={label} className="h-full w-full object-cover" loading="lazy" />
    </a>
  );
}
