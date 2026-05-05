import { useTranslation } from 'react-i18next';
import AdminShell from '@/components/layout/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DataHome() {
  const { t } = useTranslation();
  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('nav.skus')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[var(--color-muted-foreground)]">{t('shell.dataHome')}</p>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
