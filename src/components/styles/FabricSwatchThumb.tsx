import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getReadUrls } from '@/api/storage';

/**
 * Tiny inline fabric-swatch thumbnail rendered next to the Fabric spec row
 * in the Style workspace. `fabricImagePath` is a GCS object path signed on
 * demand via the storage proxy. Renders nothing when there's no swatch.
 */
interface FabricSwatchThumbProps {
  fabricImagePath: string | null;
}

export default function FabricSwatchThumb({
  fabricImagePath,
}: FabricSwatchThumbProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!fabricImagePath) return;
    void getReadUrls([fabricImagePath])
      .then((map) => {
        if (!cancelled) setUrl(map[fabricImagePath]);
      })
      .catch(() => {
        /* soft-fail: leave the swatch unrendered on a signing hiccup */
      });
    return () => {
      cancelled = true;
    };
  }, [fabricImagePath]);

  if (!fabricImagePath || !url) return null;

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
