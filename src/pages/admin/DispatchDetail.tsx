import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/auth';
import { editItemQty, getDispatch, retrySync } from '@/api/dispatches';
import { FeatureUnavailableError } from '@/api/_errors';
import { dispatchStatusVariant } from '@/lib/statusBadge';
import type { DispatchDetail as DispatchDetailT, DispatchItem } from '@/api/types';

const EDIT_REASONS = [
  'shortShipment',
  'lostInTransit',
  'damagedInTransit',
  'countingError',
  'other',
] as const;
type EditReason = (typeof EDIT_REASONS)[number];

interface EditState {
  open: boolean;
  item: DispatchItem | null;
  qty: number;
  reason: EditReason;
  note: string;
  saving: boolean;
}

const INITIAL_EDIT: EditState = {
  open: false,
  item: null,
  qty: 0,
  reason: 'shortShipment',
  note: '',
  saving: false,
};

export default function DispatchDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [data, setData] = useState<DispatchDetailT | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [edit, setEdit] = useState<EditState>(INITIAL_EDIT);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const canEdit =
    !!user && (user.role === 'admin' || user.role === 'finishing_master');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDispatch(id);
      setData(res);
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        toast.show(t('common.featureUnavailable'), 'info');
      } else {
        toast.show(t('common.error'), 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [id, t, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRetry() {
    if (!data) return;
    setRetrying(true);
    try {
      const res = await retrySync(data.id);
      setData(res);
      toast.show(t('admin.dispatchDetail.retryQueued'), 'success');
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        toast.show(t('common.featureUnavailable'), 'info');
      } else {
        toast.show(t('common.error'), 'error');
      }
    } finally {
      setRetrying(false);
    }
  }

  function openEdit(item: DispatchItem) {
    setEdit({
      open: true,
      item,
      qty: item.qtyReceived ?? item.qtySent,
      reason: 'shortShipment',
      note: '',
      saving: false,
    });
  }

  function closeEdit() {
    setEdit((s) => ({ ...s, open: false }));
  }

  async function submitEdit() {
    if (!data || !edit.item) return;
    const reasonText =
      edit.reason === 'other'
        ? edit.note.trim() || t('admin.dispatchDetail.editDialog.reasons.other')
        : t(`admin.dispatchDetail.editDialog.reasons.${edit.reason}`);
    setEdit((s) => ({ ...s, saving: true }));
    try {
      const res = await editItemQty(data.id, edit.item.id, {
        qty: edit.qty,
        reason: reasonText,
        note: edit.note || undefined,
      });
      setData(res);
      toast.show(t('admin.dispatchDetail.editDialog.success'), 'success');
      setEdit(INITIAL_EDIT);
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        toast.show(t('common.featureUnavailable'), 'info');
      } else {
        toast.show(t('common.error'), 'error');
      }
      setEdit((s) => ({ ...s, saving: false }));
    }
  }

  const showRetry =
    data &&
    (data.status === 'awaiting_confirmation' || data.status === 'sync_failed');

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={() => navigate('/admin/dispatches')}>
        ← {t('common.back')}
      </Button>

      {loading ? (
        <div className="h-32 animate-pulse rounded bg-[var(--color-muted)]" />
      ) : data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                <span className="font-mono">{data.dispatchNo}</span>
                {(() => {
                  const v = dispatchStatusVariant(data.status);
                  return (
                    <Badge variant={v} dot={v !== 'outline'}>
                      {t(`admin.dispatches.status.${data.status}`)}
                    </Badge>
                  );
                })()}
                {showRetry && canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRetry()}
                    disabled={retrying}
                  >
                    {retrying
                      ? t('common.saving')
                      : t('admin.dispatchDetail.retrySync')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                <span className="text-[var(--color-muted-foreground)]">
                  {t('admin.dispatchDetail.warehouse')}:
                </span>{' '}
                {data.destWarehouse?.name ?? data.destWarehouseId}
              </div>
              <div>
                <span className="text-[var(--color-muted-foreground)]">
                  {t('admin.dispatchDetail.dispatchedAt')}:
                </span>{' '}
                {data.dispatchedAt
                  ? new Date(data.dispatchedAt).toLocaleString()
                  : '—'}
              </div>
              <div>
                <span className="text-[var(--color-muted-foreground)]">
                  {t('admin.dispatchDetail.syncMode')}:
                </span>{' '}
                {t(`admin.dispatches.syncMode.${data.syncMode}`)}
              </div>
              {data.order && (
                <div>
                  <span className="text-[var(--color-muted-foreground)]">
                    {t('admin.dispatchDetail.order')}:
                  </span>{' '}
                  {data.order.orderNo}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.dispatchDetail.items')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto border border-[var(--color-border)] rounded-[var(--radius-md)]">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                    <tr>
                      <th className="text-left px-3 py-2">
                        {t('admin.dispatchDetail.cols.lot')}
                      </th>
                      <th className="text-left px-3 py-2">
                        {t('admin.dispatchDetail.cols.sku')}
                      </th>
                      <th className="text-left px-3 py-2">
                        {t('admin.dispatchDetail.cols.size')}
                      </th>
                      <th className="text-right px-3 py-2">
                        {t('admin.dispatchDetail.cols.qtySent')}
                      </th>
                      <th className="text-right px-3 py-2">
                        {t('admin.dispatchDetail.cols.qtyReceived')}
                      </th>
                      <th className="text-left px-3 py-2">
                        {t('admin.dispatchDetail.cols.mismatch')}
                      </th>
                      <th className="text-left px-3 py-2">
                        {t('admin.dispatchDetail.cols.lastEdit')}
                      </th>
                      {canEdit && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={canEdit ? 8 : 7}
                          className="px-3 py-6 text-center text-[var(--color-muted-foreground)]"
                        >
                          {t('admin.dispatchDetail.noItems')}
                        </td>
                      </tr>
                    )}
                    {data.items.map((it) => (
                      <tr
                        key={it.id}
                        className="border-t border-[var(--color-border)]"
                      >
                        <td className="px-3 py-2 font-mono text-xs">
                          {it.lotNo ?? it.lotId}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
                        <td className="px-3 py-2">{it.sizeLabel}</td>
                        <td className="px-3 py-2 text-right">{it.qtySent}</td>
                        <td className="px-3 py-2 text-right">
                          {it.qtyReceived ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          {it.mismatch ? (
                            <Badge variant="destructive">
                              {t('admin.dispatchDetail.mismatchYes')}
                            </Badge>
                          ) : (
                            <span className="text-[var(--color-muted-foreground)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                          {it.lastEditAt ? (
                            <>
                              {new Date(it.lastEditAt).toLocaleString()}
                              {it.lastEditReason ? ` · ${it.lastEditReason}` : ''}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(it)}
                            >
                              {t('admin.dispatchDetail.editQty')}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.dispatchDetail.grnEvents')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.grnEvents.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {t('admin.dispatchDetail.noGrnEvents')}
                </p>
              ) : (
                data.grnEvents.map((ev) => {
                  const json = JSON.stringify(ev.payload, null, 2);
                  const truncated =
                    json.length > 1000 ? `${json.slice(0, 1000)}…` : json;
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2"
                    >
                      <div className="text-xs text-[var(--color-muted-foreground)] mb-1">
                        {new Date(ev.receivedAt).toLocaleString()}
                      </div>
                      <pre className="text-xs whitespace-pre-wrap break-all">
                        {truncated}
                      </pre>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('admin.dispatchDetail.syncQueue')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.syncQueue.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {t('admin.dispatchDetail.noSyncEntries')}
                </p>
              ) : (
                data.syncQueue.map((q) => (
                  <div
                    key={q.id}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2 text-sm"
                  >
                    <div>
                      <span className="text-[var(--color-muted-foreground)]">
                        {t('admin.dispatchDetail.syncAttempts')}:
                      </span>{' '}
                      {q.attempts}
                    </div>
                    {q.lastAttemptAt && (
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        {new Date(q.lastAttemptAt).toLocaleString()}
                      </div>
                    )}
                    {q.lastError && (
                      <div className="text-xs text-[var(--color-destructive)] mt-1">
                        {q.lastError}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog
        open={edit.open}
        onClose={closeEdit}
        title={t('admin.dispatchDetail.editDialog.title')}
        initialFocusRef={cancelRef}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="outline"
              onClick={closeEdit}
              disabled={edit.saving}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitEdit()} disabled={edit.saving}>
              {edit.saving ? t('common.saving') : t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>{t('admin.dispatchDetail.editDialog.qty')}</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={edit.qty}
              onChange={(e) =>
                setEdit((s) => ({
                  ...s,
                  qty: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
            />
          </div>
          <div>
            <Label>{t('admin.dispatchDetail.editDialog.reason')}</Label>
            <Select
              value={edit.reason}
              onChange={(e) =>
                setEdit((s) => ({ ...s, reason: e.target.value as EditReason }))
              }
            >
              {EDIT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`admin.dispatchDetail.editDialog.reasons.${r}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.dispatchDetail.editDialog.note')}</Label>
            <Textarea
              rows={3}
              value={edit.note}
              onChange={(e) => setEdit((s) => ({ ...s, note: e.target.value }))}
            />
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('admin.dispatchDetail.editDialog.confirmHint')}
          </p>
        </div>
      </Dialog>
    </div>
  );
}
