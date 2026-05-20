import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Power } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  createDestinationWarehouse,
  disableDestinationWarehouse,
  listDestinationWarehouses,
  updateDestinationWarehouse,
} from '@/api/destinationWarehouses';
import type { DestinationWarehouse } from '@/api/types';

interface DraftState {
  code: string;
  name: string;
  easyecomWarehouseId: string;
  easyecomEnabled: boolean;
}

const EMPTY_DRAFT: DraftState = {
  code: '',
  name: '',
  easyecomWarehouseId: '',
  easyecomEnabled: false,
};

interface ApiErrorShape {
  response?: { data?: { error?: string; message?: string } };
}
function errMessage(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const data = (err as ApiErrorShape).response?.data;
    return data?.error ?? data?.message;
  }
  return undefined;
}

export default function Warehouses() {
  const { t } = useTranslation();
  const toast = useToast();

  const [rows, setRows] = useState<DestinationWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Per-row "busy" flag so the toggle button doesn't get pressed twice.
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listDestinationWarehouses();
      setRows(data);
    } catch {
      toast.show(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submitAdd(e?: FormEvent) {
    e?.preventDefault();
    const code = draft.code.trim();
    const name = draft.name.trim();
    if (!code || !name) return;
    setSaving(true);
    try {
      await createDestinationWarehouse({
        code,
        name,
        easyecomWarehouseId: draft.easyecomWarehouseId.trim() || undefined,
        easyecomEnabled: draft.easyecomEnabled,
      });
      toast.show(
        t('admin.warehouses.createdToast', { defaultValue: 'Warehouse added' }),
        'success',
      );
      setDraft(EMPTY_DRAFT);
      setAddOpen(false);
      await refresh();
    } catch (err) {
      toast.show(errMessage(err) ?? t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: DestinationWarehouse) {
    setTogglingId(row.id);
    try {
      if (row.isActive) {
        await disableDestinationWarehouse(row.id);
      } else {
        await updateDestinationWarehouse(row.id, { isActive: true });
      }
      await refresh();
    } catch (err) {
      toast.show(errMessage(err) ?? t('common.error'), 'error');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>
            {t('admin.warehouses.title', { defaultValue: 'Destination warehouses' })}
          </CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} />
            {t('admin.warehouses.add', { defaultValue: 'Add warehouse' })}
          </Button>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              {t('admin.warehouses.empty', {
                defaultValue: 'No destination warehouses yet.',
              })}
            </p>
          ) : (
            <div className="overflow-auto border border-[var(--color-border)] rounded-[var(--radius-md)]">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="text-left px-3 py-2">
                      {t('admin.warehouses.code', { defaultValue: 'Code' })}
                    </th>
                    <th className="text-left px-3 py-2">
                      {t('admin.warehouses.name', { defaultValue: 'Name' })}
                    </th>
                    <th className="text-left px-3 py-2">
                      {t('admin.warehouses.easyecom', { defaultValue: 'EasyEcom' })}
                    </th>
                    <th className="text-left px-3 py-2">
                      {t('admin.warehouses.status', { defaultValue: 'Status' })}
                    </th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--color-border)]"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">
                        {r.easyecomEnabled ? (
                          <Badge variant="success" dot>
                            {r.easyecomWarehouseId
                              ? r.easyecomWarehouseId
                              : t('admin.warehouses.enabled', {
                                  defaultValue: 'Enabled',
                                })}
                          </Badge>
                        ) : (
                          <span className="text-[var(--color-muted-foreground)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.isActive ? (
                          <Badge variant="success" dot>
                            {t('admin.warehouses.active', { defaultValue: 'Active' })}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            {t('admin.warehouses.inactive', {
                              defaultValue: 'Inactive',
                            })}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void toggleActive(r)}
                          disabled={togglingId === r.id}
                        >
                          <Power size={14} />
                          {r.isActive
                            ? t('admin.warehouses.deactivate', {
                                defaultValue: 'Deactivate',
                              })
                            : t('admin.warehouses.activate', {
                                defaultValue: 'Activate',
                              })}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onClose={() => (saving ? undefined : setAddOpen(false))}
        title={t('admin.warehouses.addTitle', {
          defaultValue: 'Add destination warehouse',
        })}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void submitAdd()}
              disabled={saving || !draft.code.trim() || !draft.name.trim()}
            >
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <form onSubmit={submitAdd} className="space-y-3">
          <div>
            <Label required htmlFor="wh-code">
              {t('admin.warehouses.code', { defaultValue: 'Code' })}
            </Label>
            <Input
              id="wh-code"
              value={draft.code}
              onChange={(e) =>
                setDraft((s) => ({ ...s, code: e.target.value.toUpperCase() }))
              }
              maxLength={50}
              autoFocus
            />
          </div>
          <div>
            <Label required htmlFor="wh-name">
              {t('admin.warehouses.name', { defaultValue: 'Name' })}
            </Label>
            <Input
              id="wh-name"
              value={draft.name}
              onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="wh-eee-id">
              {t('admin.warehouses.easyecomId', {
                defaultValue: 'EasyEcom warehouse id (optional)',
              })}
            </Label>
            <Input
              id="wh-eee-id"
              value={draft.easyecomWarehouseId}
              onChange={(e) =>
                setDraft((s) => ({ ...s, easyecomWarehouseId: e.target.value }))
              }
              maxLength={100}
              placeholder=""
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.easyecomEnabled}
              onChange={(e) =>
                setDraft((s) => ({ ...s, easyecomEnabled: e.target.checked }))
              }
            />
            {t('admin.warehouses.easyecomEnabled', {
              defaultValue: 'Sync dispatches to EasyEcom for this warehouse',
            })}
          </label>
        </form>
      </Dialog>
    </div>
  );
}
