import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Power } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useDebounced } from '@/lib/useDebounced';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from '@/api/users';
import type { User, UserRole } from '@/api/types';

const ROLES: UserRole[] = [
  'admin',
  'floor_manager',
  'stitching_master',
  'finishing_master',
  'data_manager',
  'viewer',
];

interface ApiErrorShape {
  response?: { status?: number; data?: { error?: string; message?: string } };
}
function statusOf(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    return (err as ApiErrorShape).response?.status;
  }
  return undefined;
}

export default function UsersPage() {
  const { t } = useTranslation();
  const toast = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 250);

  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listUsers({
        search: debouncedSearch || undefined,
        take: 200,
      });
      setUsers(list);
    } catch {
      toast.show(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, t, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDeactivate = async (u: User) => {
    if (!window.confirm(t('admin.users.deactivateConfirm', { name: u.name }))) return;
    try {
      await deleteUser(u.id);
      toast.show(t('common.saved' as const, { defaultValue: 'Saved' }), 'success');
      void refresh();
    } catch {
      toast.show(t('common.error'), 'error');
    }
  };

  const onActivate = async (u: User) => {
    try {
      await updateUser(u.id, { isActive: true });
      void refresh();
    } catch {
      toast.show(t('common.error'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start sm:items-center justify-between gap-2 flex-col sm:flex-row">
        <div>
          <h1 className="font-serif text-2xl text-[var(--color-foreground)]">
            {t('admin.users.title')}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('admin.users.subtitle')}
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="w-full sm:w-auto">
          <Plus size={16} />
          {t('admin.users.add')}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Input
            placeholder={t('admin.users.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              {t('common.loading')}
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
              {t('admin.users.empty')}
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="text-left px-3 py-2">{t('admin.users.columns.name')}</th>
                    <th className="text-left px-3 py-2 hidden sm:table-cell">
                      {t('admin.users.columns.mobile')}
                    </th>
                    <th className="text-left px-3 py-2">{t('admin.users.columns.role')}</th>
                    <th className="text-left px-3 py-2 hidden md:table-cell">
                      {t('admin.users.columns.status')}
                    </th>
                    <th className="text-right px-3 py-2 w-1">{t('admin.users.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)]/50"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-[var(--color-foreground)]">
                          {u.name}
                        </div>
                        <div className="text-xs text-[var(--color-muted-foreground)] sm:hidden">
                          {u.mobileNumber}
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell tabular-nums">
                        {u.mobileNumber}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary">
                          {t(`roles.${u.role}` as const)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        {u.isActive === false ? (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {t('admin.users.inactive')}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--color-success)]">
                            {t('admin.users.active')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditing(u)}
                          className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                          aria-label="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        {u.isActive === false ? (
                          <button
                            type="button"
                            onClick={() => void onActivate(u)}
                            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-success)]"
                            aria-label={t('admin.users.activate')}
                            title={t('admin.users.activate')}
                          >
                            <Power size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onDeactivate(u)}
                            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-destructive)]"
                            aria-label={t('admin.users.deactivate')}
                            title={t('admin.users.deactivate')}
                          >
                            <Power size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <UserForm
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function UserForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const editing = Boolean(initial);

  const [name, setName] = useState(initial?.name ?? '');
  const [mobile, setMobile] = useState(
    initial?.mobileNumber ? initial.mobileNumber.replace(/^\+91/, '') : '',
  );
  const [role, setRole] = useState<UserRole>(initial?.role ?? 'viewer');
  const [trainingMode, setTrainingMode] = useState<boolean>(
    initial?.isTrainingMode ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (!editing && !/^\d{10}$/.test(mobile)) return false;
    return true;
  }, [name, mobile, editing]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (editing && initial) {
        await updateUser(initial.id, {
          name: name.trim(),
          role,
          isTrainingMode: trainingMode,
        });
      } else {
        await createUser({
          name: name.trim(),
          mobileNumber: `+91${mobile}`,
          role,
          isTrainingMode: trainingMode,
        });
      }
      toast.show(t('common.saved' as const, { defaultValue: 'Saved' }), 'success');
      onSaved();
    } catch (err) {
      const status = statusOf(err);
      if (status === 409) setError(t('admin.users.errors.duplicate'));
      else setError(t('admin.users.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(editing ? 'admin.users.form.editTitle' : 'admin.users.form.createTitle')}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {error && (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
          >
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="user-name">{t('admin.users.form.name')}</Label>
          <Input
            id="user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="user-mobile">{t('admin.users.form.mobile')}</Label>
          <div className="flex items-stretch gap-2">
            <span className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-input)] bg-[var(--color-muted)] px-3 text-sm text-[var(--color-muted-foreground)]">
              +91
            </span>
            <Input
              id="user-mobile"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={mobile}
              onChange={(e) =>
                setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))
              }
              disabled={editing}
              required={!editing}
            />
          </div>
          {editing && (
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {t('admin.users.form.mobileImmutable')}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="user-role">{t('admin.users.form.role')}</Label>
          <Select
            id="user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}` as const)}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
          <input
            type="checkbox"
            checked={trainingMode}
            onChange={(e) => setTrainingMode(e.target.checked)}
          />
          <span>{t('admin.users.form.trainingMode')}</span>
        </label>
        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)] -mx-4 px-4 -mb-4 pb-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {t('admin.users.form.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit || busy}>
            {busy ? t('common.saving') : t('admin.users.form.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
