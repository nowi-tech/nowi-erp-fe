import { useTranslation } from 'react-i18next';
import FloorShell from '@/components/layout/FloorShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function FinishingHome() {
  const { t } = useTranslation();
  return (
    <FloorShell title={t('finishing.title')}>
      <Card>
        <CardHeader>
          <CardTitle>{t('finishing.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[var(--color-muted-foreground)]">{t('shell.finishingHome')}</p>
        </CardContent>
      </Card>
    </FloorShell>
  );
}
