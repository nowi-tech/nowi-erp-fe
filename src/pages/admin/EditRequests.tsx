import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  listEditRequests,
  patchLot,
  type EditRequestRow,
  type PatchLotPayload,
} from '@/api/lots';

/**
 * Admin queue for edit requests from the floor manager. Each request
 * shows the lot it belongs to, who asked, when, and the proposed diff.
 * The admin can Apply (PATCHes the lot with the requested after values)
 * which marks the request resolved (next list will hide it because a
 * lot_edited audit row now exists after the request).
 */
export default function EditRequests() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEditRequests();
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function apply(row: EditRequestRow) {
    if (!row.lot) return;
    setApplyingId(row.id);
    try {
      const body = toPatchPayload(row.after);
      if (Object.keys(body).length === 0) {
        sonnerToast.info('Nothing to apply.');
        return;
      }
      await patchLot(row.lot.id, body);
      sonnerToast.success(t('admin.editRequests.appliedToast', { defaultValue: 'Applied to lot' }));
      await refresh();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      sonnerToast.error(e.response?.data?.message ?? t('common.error'));
    } finally {
      setApplyingId(null);
    }
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const resolved = rows.filter((r) => r.status === 'resolved');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-2xl text-[var(--color-foreground)]">
          {t('admin.editRequests.title', { defaultValue: 'Edit requests' })}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t('admin.editRequests.subtitle', {
            defaultValue:
              "Floor managers route edits here when a lot's 24-hour direct-edit window has passed.",
          })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('admin.editRequests.pending', { defaultValue: 'Pending' })}{' '}
            <span className="ml-2 text-xs font-mono text-[var(--color-muted-foreground)]">
              {pending.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
          ) : pending.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('admin.editRequests.empty', { defaultValue: 'No pending requests.' })}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {pending.map((row) => (
                <RequestRow
                  key={row.id}
                  row={row}
                  busy={applyingId === row.id}
                  onApply={() => apply(row)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('admin.editRequests.resolved', { defaultValue: 'Resolved' })}{' '}
              <span className="ml-2 text-xs font-mono text-[var(--color-muted-foreground)]">
                {resolved.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--color-border)]">
              {resolved.map((row) => (
                <RequestRow
                  key={row.id}
                  row={row}
                  busy={false}
                  onApply={() => {}}
                  resolved
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function toPatchPayload(after: Record<string, unknown> | null): PatchLotPayload {
  if (!after) return {};
  const body: PatchLotPayload = {};
  if ('vendorLotNo' in after) {
    body.vendorLotNo = after.vendorLotNo as string | null;
  }
  if ('styleId' in after && typeof after.styleId === 'number') {
    body.styleId = after.styleId;
  }
  if ('qtyIn' in after && after.qtyIn && typeof after.qtyIn === 'object') {
    body.qtyIn = after.qtyIn as Record<string, number>;
  }
  return body;
}

function RequestRow({
  row,
  busy,
  onApply,
  resolved,
}: {
  row: EditRequestRow;
  busy: boolean;
  onApply: () => void;
  resolved?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li className="py-3 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[15px] font-semibold text-[var(--color-foreground)]">
            {row.lot?.lotNo ?? `#${row.lotId}`}
          </span>
          {row.lot?.style?.styleId && (
            <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
              {row.lot.style.styleId}
            </span>
          )}
          {resolved && <Badge variant="ready">resolved</Badge>}
        </div>
        <div className="mt-1 text-xs text-[var(--color-muted-foreground)] font-mono">
          {row.requestedByName ? `by ${row.requestedByName} · ` : ''}
          {new Date(row.requestedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
        <DiffTable before={row.before} after={row.after} />
      </div>
      {!resolved && (
        <Button onClick={onApply} disabled={busy}>
          {busy ? t('common.saving') : (
            <>
              <Check size={14} />
              {t('admin.editRequests.apply', { defaultValue: 'Apply' })}
            </>
          )}
        </Button>
      )}
    </li>
  );
}

function DiffTable({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!after) return null;
  const fields = Object.keys(after).filter((k) => after[k] !== undefined);
  if (fields.length === 0) return null;
  return (
    <table className="mt-2 text-xs">
      <tbody>
        {fields.map((k) => (
          <tr key={k}>
            <td className="pr-3 text-[var(--color-muted-foreground)] align-top">
              {k}
            </td>
            <td className="pr-3 align-top">
              <span className="line-through text-[var(--color-muted-foreground)]">
                {fmt(before?.[k])}
              </span>
            </td>
            <td className="align-top">
              <span className="font-semibold text-[var(--color-foreground)]">
                {fmt(after[k])}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmt(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
