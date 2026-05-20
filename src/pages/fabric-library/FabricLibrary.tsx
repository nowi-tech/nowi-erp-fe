import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import {
  listFabricTypes,
  listFabrics,
  createFabric,
  patchFabric,
} from '@/api/styles';
import type { Fabric, FabricType } from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Two-pane master data screen (canonical_fabric_library.html).
 *
 * Left: fabric types tree (with all-count).
 * Right: filtered fabrics table + "New fabric" CTA.
 */
export default function FabricLibrary() {
  const { t } = useTranslation();
  const toast = useToast();

  const [types, setTypes] = useState<FabricType[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fabric | null>(null);
  const [form, setForm] = useState({
    name: '',
    fabricTypeId: '',
    pricePerUnit: '',
    status: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ts, fs] = await Promise.all([listFabricTypes(), listFabrics()]);
      setTypes(ts);
      setFabrics(fs);
    } catch {
      // graceful empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let xs = fabrics;
    if (activeTypeId != null) xs = xs.filter((f) => f.fabricTypeId === activeTypeId);
    const q = search.trim().toLowerCase();
    if (q) xs = xs.filter((f) => f.name.toLowerCase().includes(q));
    return xs;
  }, [fabrics, activeTypeId, search]);

  const countByType = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of fabrics)
      if (f.fabricTypeId != null)
        m.set(f.fabricTypeId, (m.get(f.fabricTypeId) ?? 0) + 1);
    return m;
  }, [fabrics]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      fabricTypeId: activeTypeId ? String(activeTypeId) : '',
      pricePerUnit: '',
      status: '',
      notes: '',
    });
    setDialogOpen(true);
  };
  const openEdit = (f: Fabric) => {
    setEditing(f);
    setForm({
      name: f.name,
      fabricTypeId: f.fabricTypeId ? String(f.fabricTypeId) : '',
      pricePerUnit: f.pricePerUnit ?? '',
      status: f.status ?? '',
      notes: f.notes ?? '',
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        fabricTypeId: form.fabricTypeId ? Number(form.fabricTypeId) : null,
        pricePerUnit: form.pricePerUnit || null,
        status: form.status || null,
        notes: form.notes || null,
      };
      if (editing) {
        await patchFabric(editing.id, payload);
        toast.show(t('admin.fabricLibrary.updatedToast'), 'success');
      } else {
        await createFabric(payload);
        toast.show(t('admin.fabricLibrary.addedToast'), 'success');
      }
      setDialogOpen(false);
      await load();
    } catch {
      toast.show(t('admin.fabricLibrary.addError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-[var(--color-primary)]">
            {t('admin.fabricLibrary.title')}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            {t('admin.fabricLibrary.subtitle')}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          <span className="ml-1">{t('admin.fabricLibrary.newFabric')}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left pane: type tree */}
        <aside className="md:col-span-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-3">
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] font-semibold px-2 py-1">
            {t('admin.fabricLibrary.types')}
          </h2>
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => setActiveTypeId(null)}
                className={cn(
                  'w-full flex items-center justify-between px-2 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors',
                  activeTypeId == null
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium'
                    : 'text-[var(--color-foreground-3)] hover:bg-[var(--color-muted)]',
                )}
              >
                <span>{t('admin.fabricLibrary.all')}</span>
                <span className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
                  {fabrics.length}
                </span>
              </button>
            </li>
            {types.map((tp) => (
              <li key={tp.id}>
                <button
                  type="button"
                  onClick={() => setActiveTypeId(tp.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors',
                    activeTypeId === tp.id
                      ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium'
                      : 'text-[var(--color-foreground-3)] hover:bg-[var(--color-muted)]',
                  )}
                >
                  <span>{tp.name}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
                    {countByType.get(tp.id) ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Right pane: fabrics table */}
        <section className="md:col-span-9 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)]">
          <div className="p-3 border-b border-[var(--color-border)] flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-base mr-2">
              {activeTypeId == null
                ? t('admin.fabricLibrary.allFabrics')
                : types.find((tp) => tp.id === activeTypeId)?.name}
            </h2>
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
              />
              <Input
                className="h-9 text-[13px] pl-9"
                placeholder="Search fabric…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)] text-xs">
                <tr>
                  <th className="text-left font-medium px-3 py-2">
                    {t('admin.fabricLibrary.cols.name')}
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    {t('admin.fabricLibrary.cols.type')}
                  </th>
                  <th className="text-right font-medium px-3 py-2">
                    {t('admin.fabricLibrary.cols.price')}
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">
                    {t('admin.fabricLibrary.cols.status')}
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                    {t('admin.fabricLibrary.cols.updated')}
                  </th>
                  <th className="text-right font-medium px-3 py-2">
                    {t('admin.fabricLibrary.cols.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-[var(--color-muted-foreground)]"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-[var(--color-muted-foreground)]"
                    >
                      {t('admin.fabricLibrary.empty')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  filtered.map((f) => (
                    <tr
                      key={f.id}
                      className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer"
                      onClick={() => openEdit(f)}
                    >
                      <td className="px-3 py-2 font-medium">{f.name}</td>
                      <td className="px-3 py-2 text-[var(--color-muted-foreground)]">
                        {f.fabricType?.name ??
                          types.find((tp) => tp.id === f.fabricTypeId)?.name ??
                          '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {f.pricePerUnit ? `₹${f.pricePerUnit}` : '—'}
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        {f.status ? (
                          <Badge variant="outline" className="text-[10px]">
                            {f.status}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell text-xs text-[var(--color-muted-foreground)] tabular-nums">
                        {f.updatedAt
                          ? new Date(f.updatedAt).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(f);
                          }}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New fabric'}
      >
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select
              value={form.fabricTypeId}
              onChange={(e) =>
                setForm((f) => ({ ...f, fabricTypeId: e.target.value }))
              }
            >
              <option value="">—</option>
              {types.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price per unit (₹)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.pricePerUnit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pricePerUnit: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Status</Label>
              <Input
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
                placeholder="e.g. Active"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saving || !form.name.trim()}
              onClick={() => void submit()}
            >
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
