import { useTranslation } from 'react-i18next';
import AdminShell from '@/components/layout/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminHome() {
  const { t } = useTranslation();
  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <CardTitle>{t('nav.dashboard')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[var(--color-muted-foreground)]">{t('shell.adminHome')}</p>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
