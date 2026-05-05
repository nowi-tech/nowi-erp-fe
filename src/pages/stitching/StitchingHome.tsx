import { useTranslation } from 'react-i18next';
import FloorShell from '@/components/layout/FloorShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StitchingHome() {
  const { t } = useTranslation();
  return (
    <FloorShell title={t('stitching.title')}>
      <Card>
        <CardHeader>
          <CardTitle>{t('stitching.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[var(--color-muted-foreground)]">{t('shell.stitchingHome')}</p>
        </CardContent>
      </Card>
    </FloorShell>
  );
}
