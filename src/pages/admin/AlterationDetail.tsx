import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverThumbnail } from '@/components/dashboard/StylesInFlightTable';
import { useAlterationLabels } from '@/lib/alteration';
import {
  getAlteration,
  type AlterationEntry,
  type AlterationTimelineEntry,
} from '@/api/alteration';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One alteration entry: what came in, who has it, and every step it took. */
export default function AlterationDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // The list as the user left it; a deep link has no state.
  const backTo = (location.state as { from?: string } | null)?.from ?? '/admin/returns/alteration';
  const { statusLabel, sourceLabel, channelLabel } = useAlterationLabels();
  const [data, setData] = useState<{ entry: AlterationEntry; timeline: AlterationTimelineEntry[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    getAlteration(Number(id))
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const back = (
    <Button variant="outline" size="sm" onClick={() => navigate(backTo)}>
      <ArrowLeft size={14} />
      <span className="ml-1">{t('common.back', { defaultValue: 'Back' })}</span>
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        {back}
        <div className="text-sm text-[var(--color-muted-foreground)]">
          {t('admin.alteration.notFound', { defaultValue: "That entry doesn't exist." })}
        </div>
      </div>
    );
  }

  const { entry: e, timeline } = data;

  const stepLabel = (s: AlterationTimelineEntry) => {
    if (s.from == null) return t('admin.alteration.step.received', { defaultValue: 'Received' });
    if (s.to === 'in_alteration' && s.from === 'received') {
      return t('admin.alteration.step.sent', {
        defaultValue: 'Sent to {{tailor}}',
        tailor: e.tailorName ?? t('admin.alteration.tailor', { defaultValue: 'Tailor' }),
      });
    }
    if (s.to === 'on_hold') return t('admin.alteration.step.held', { defaultValue: 'On hold' });
    if (s.from === 'on_hold') return t('admin.alteration.step.resumed', { defaultValue: 'Resumed' });
    if (s.to === 'completed') {
      return t('admin.alteration.step.completed', {
        defaultValue: 'Completed · {{n}} of {{of}} back',
        n: s.qtyOut ?? 0,
        of: e.qtyIn,
      });
    }
    return statusLabel(s.to);
  };

  const facts: [string, string | null][] = [
    [t('admin.alteration.sourceLabel', { defaultValue: 'Source' }), sourceLabel(e.source)],
    [t('admin.alteration.channel', { defaultValue: 'Channel' }), e.channel ? channelLabel(e.channel) : null],
    [t('admin.alteration.sourceRef', { defaultValue: 'Reference' }), e.sourceRef],
    [t('admin.alteration.tailor', { defaultValue: 'Tailor' }), e.tailorName],
    [t('admin.alteration.createdBy', { defaultValue: 'Received by' }), e.createdBy?.name ?? null],
  ];

  return (
    <div className="space-y-6">
      {back}

      <header className="flex flex-wrap items-center gap-4">
        <HoverThumbnail src={e.imageUrl} alt={e.styleRef ?? e.entryNo} size={64} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{e.entryNo}</h1>
            <Badge variant={e.status === 'on_hold' ? 'rework' : 'outline'}>{statusLabel(e.status)}</Badge>
          </div>
          <div className="text-sm font-semibold">{e.styleRef ?? '—'}</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            {[e.brandName, e.colourName, e.name !== e.styleRef ? e.name : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </header>

      {e.status === 'on_hold' && e.holdReason && (
        <div className="rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {e.holdReason}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.alteration.details', { defaultValue: 'Details' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
                  <dd>{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.alteration.sizes', { defaultValue: 'Sizes' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  <th className="py-2 pr-3 text-left font-semibold">
                    {t('admin.production.size', { defaultValue: 'Size' })}
                  </th>
                  <th className="py-2 pr-3 text-left font-semibold">SKU</th>
                  <th className="py-2 pr-3 text-right font-semibold">
                    {t('admin.alteration.in', { defaultValue: 'In' })}
                  </th>
                  <th className="py-2 text-right font-semibold">
                    {t('admin.alteration.out', { defaultValue: 'Back' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.sizes.map((s) => (
                  <tr key={s.sku} className="border-b border-[var(--color-border)]/60 last:border-b-0">
                    <td className="py-2 pr-3 font-semibold">{s.size}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-[var(--color-muted-foreground)]">{s.sku}</td>
                    <td className="py-2 pr-3 text-right">{s.qtyIn}</td>
                    <td className="py-2 text-right">{s.qtyOut ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.alteration.history', { defaultValue: 'History' })}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {[...timeline].reverse().map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)]/60 pb-2 text-sm last:border-b-0 last:pb-0"
              >
                <span className="font-semibold">{stepLabel(s)}</span>
                {s.holdReason && <span className="font-semibold text-amber-700">· {s.holdReason}</span>}
                <span className="text-[var(--color-muted-foreground)]">· {fmtDateTime(s.at)}</span>
                {s.by && <span className="text-[var(--color-muted-foreground)]">· {s.by}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
