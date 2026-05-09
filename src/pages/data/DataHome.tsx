import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DataHome() {
  const { t } = useTranslation();
  return (
    <div className="density-compact min-h-screen p-6 bg-[var(--color-background)] text-[var(--color-foreground)]">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t('nav.skus')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[var(--color-muted-foreground)]">{t('shell.dataHome')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
