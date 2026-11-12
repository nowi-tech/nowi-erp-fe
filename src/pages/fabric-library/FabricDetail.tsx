import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import { FilterRailSegments } from '@/components/ui/filter-rail';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import FabricColourPanel, { ActivityList, ColourActions, returnableOf, useFabricActivity } from '@/components/fabrics/FabricColourPanel';
import FabricEditorForm from '@/components/fabrics/FabricEditorForm';
import FabricOrderDialog from '@/components/fabrics/FabricOrderDialog';
import FabricOrdersTable from '@/components/fabrics/FabricOrdersTable';
import IssueSlipDialog from '@/components/fabrics/IssueSlipDialog';
import { ReturnDialog, SendBackDialog, StockCheckDialog } from '@/components/fabrics/StockActionDialogs';
import { apiErrorMessage } from '@/api/apiClient';
import { deleteFabric, getFabric, listFabrics } from '@/api/styles';
import { listFabricOrders } from '@/api/fabricOrders';
import { useSignedUrls } from '@/hooks/useSignedUrls';
import { useAuth } from '@/context/auth';
import {
  FABRIC_DELETE_ROLES,
  FABRIC_STOCK_CHECK_ROLES,
  FABRIC_WRITE_ROLES,
  hasAnyRole,
  PRODUCTION_BOARD_READ_ROLES,
  STYLE_VIEW_ROLES,
} from '@/lib/userRoles';
import type { Fabric, FabricColour, FabricOrder, FabricStockActivity } from '@/api/types';
import {
  colourState,
  COLOUR_STATE_LABEL,
  COLOUR_STATE_VARIANT,
  fmtQty,
  OPEN_ORDER_STATUSES,
  orderQtyForLots,
} from '@/lib/fabric';
import { cn } from '@/lib/utils';

type Kind = 'all' | 'stock' | 'orders' | 'edits';

/**
 * Fabric detail — the fabric, its colours (stock, held, on order), its orders,
 * and at the bottom one activity log of stock moves, order changes and edits.
 */
export default function FabricDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const fabricId = Number(id);
  const { user } = useAuth();
  const canEdit = hasAnyRole(user, FABRIC_WRITE_ROLES);
  const canCheck = hasAnyRole(user, FABRIC_STOCK_CHECK_ROLES);
  const links = { lot: hasAnyRole(user, PRODUCTION_BOARD_READ_ROLES), style: hasAnyRole(user, STYLE_VIEW_ROLES) };

  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [allFabrics, setAllFabrics] = useState<Fabric[]>([]);
  const [orders, setOrders] = useState<FabricOrder[]>([]);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [orderFor, setOrderFor] = useState<{ fabricColourId?: number; quantity?: number } | null>(null);
  const [issueFor, setIssueFor] = useState<{ fabricColourId?: number } | null>(null);
  const [checkOf, setCheckOf] = useState<FabricColour | null>(null);
  const [returnOf, setReturnOf] = useState<FabricStockActivity | null>(null);
  const [sendBackOf, setSendBackOf] = useState<FabricStockActivity | null>(null);

  const [kind, setKind] = useState<Kind>('all');
  const [colourFilter, setColourFilter] = useState<number | ''>('');
  // Bumped after any change so the activity feeds (page and panel) refetch.
  const [version, setVersion] = useState(0);
  const feed = useFabricActivity(fabricId, kind === 'all' ? undefined : kind, colourFilter === '' ? undefined : colourFilter, version);
  // The colour whose side panel is open; the Library links here with ?colour=<id>.
  const [params, setParams] = useSearchParams();
  const [panelId, setPanelId] = useState<number | null>(() => Number(params.get('colour')) || null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const toast = useToast();
  const canDelete = hasAnyRole(user, FABRIC_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!Number.isFinite(fabricId)) {
      setFabric(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [f, os, all] = await Promise.all([
        getFabric(fabricId),
        listFabricOrders({ fabricId }),
        listFabrics(),
      ]);
      setFabric(f);
      setOrders(os);
      setAllFabrics(all);
    } catch {
      setFabric(null);
    } finally {
      setLoading(false);
    }
  }, [fabricId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    void load();
    setVersion((v) => v + 1);
  };

  const onDelete = async () => {
    if (!fabric) return;
    setDeleteOpen(false);
    try {
      await deleteFabric(fabric.id);
      toast.show(t('admin.fabricLibrary.deletedToast', { defaultValue: '{{name}} deleted.', name: fabric.name }));
      navigate('/fabric-library');
    } catch (e) {
      toast.show(apiErrorMessage(e) ?? t('admin.fabricLibrary.deleteError', { defaultValue: 'Could not delete the fabric.' }), 'error');
    }
  };

  const imagePaths = useMemo(
    () => [fabric?.imagePath ?? null, ...(fabric?.colours ?? []).map((c) => c.imagePath ?? null)],
    [fabric],
  );
  const imageUrls = useSignedUrls(imagePaths);

  const unit = fabric?.unitOfMeasure ?? null;
  const colours = fabric?.colours ?? [];
  const sum = (pick: (c: FabricColour) => number | undefined) => colours.reduce((s, c) => s + (pick(c) ?? 0), 0);
  const stockValue = colours.reduce(
    (s, c) => (c.pricePerUnit != null && c.availableQuantity != null ? s + c.pricePerUnit * c.availableQuantity : s),
    0,
  );
  /** Order prefilled with what planning lots are short of. */
  const orderColour = (c: FabricColour) => setOrderFor({ fabricColourId: c.id, quantity: orderQtyForLots(c) });
  const panelColour = colours.find((c) => c.id === panelId) ?? null;
  // Dialogs sit under the drawer, so the panel steps aside while one is open and returns after.
  const dialogOpen = editOpen || orderFor != null || issueFor != null || checkOf != null || returnOf != null || sendBackOf != null;

  const shownOrders = orders.filter((o) => showAllOrders || OPEN_ORDER_STATUSES.includes(o.status));

  if (loading && !fabric) {
    return <div className="p-6 text-sm text-[var(--color-muted-foreground)]">{t('common.loading')}</div>;
  }
  if (!fabric) {
    return (
      <div className="space-y-3 p-6">
        <BackLink onClick={() => navigate('/fabric-library')} label={t('admin.fabricLibrary.detail.back')} />
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('admin.fabricLibrary.detail.notFound')}</p>
      </div>
    );
  }

  const parentImg = fabric.imagePath ? imageUrls[fabric.imagePath] : undefined;

  return (
    <div className="space-y-6 pb-10">
      <BackLink onClick={() => navigate('/fabric-library')} label={t('admin.fabricLibrary.detail.back')} />

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-start gap-4">
          {parentImg && (
            <img src={parentImg} alt={fabric.name} className="h-24 w-24 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{fabric.name}</h1>
              {fabric.isBlended && (
                <Badge variant="outline" className="text-[9px]">
                  {t('admin.fabricLibrary.blended')}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              {[
                fabric.code,
                fabric.unitOfMeasure && t(`admin.fabricLibrary.uom.${fabric.unitOfMeasure}`, { defaultValue: fabric.unitOfMeasure }),
                fabric.gsm != null ? `${fabric.gsm} GSM` : null,
                fabric.cuttableWidth != null ? `${Number(fabric.cuttableWidth)}″` : null,
                ...(fabric.compositions ?? []).map((c) => `${Number(c.percent)}% ${c.fibre}`),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {(canEdit || canDelete) && (
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil size={15} />
                    {t('admin.fabricLibrary.edit')}
                  </Button>
                  <Button size="sm" onClick={() => setIssueFor({})}>
                    <ArrowUpRight size={15} />
                    {t('admin.fabricLibrary.issue')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOrderFor({})}>
                    <ShoppingCart size={15} />
                    {t('admin.fabricLibrary.order', { defaultValue: 'Order' })}
                  </Button>
                </>
              )}
              {canDelete && (
                <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={15} />
                  {t('admin.fabricLibrary.delete', { defaultValue: 'Delete' })}
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('admin.fabricLibrary.detail.totalStock')} value={fmtQty(sum((c) => c.availableQuantity), unit)} />
        <Stat label={t('admin.fabricLibrary.cols.onOrder', { defaultValue: 'On order' })} value={fmtQty(sum((c) => c.onOrderQuantity), unit)} />
        <Stat label={t('admin.fabricLibrary.cols.held', { defaultValue: 'Held for lots' })} value={fmtQty(sum((c) => c.heldQuantity), unit)} />
        <Stat
          label={t('admin.fabricLibrary.detail.stockValue')}
          value={stockValue > 0 ? `₹${stockValue.toLocaleString('en-IN')}` : '—'}
        />
      </div>

      <Card title={t('admin.fabricLibrary.detail.colours')}>
        {colours.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--color-muted-foreground)]">{t('admin.fabricLibrary.detail.noColours')}</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Same columns and widths as the Library. */}
            <table className="w-full min-w-[1000px] table-fixed text-[13px]">
              <colgroup>
                <col className="w-[300px]" />
                <col className="w-[240px]" />
                <col className="w-[160px]" />
                <col />
              </colgroup>
              <thead className="bg-[var(--color-surface-2)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 text-left">{t('admin.fabricLibrary.cols.colour', { defaultValue: 'Colour' })}</th>
                  <th className="px-3 py-2 text-left">{t('admin.fabricLibrary.cols.stock', { defaultValue: 'Stock' })}</th>
                  <th className="px-3 py-2 text-right">{t('admin.fabricLibrary.cols.onOrder', { defaultValue: 'On order' })}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {colours.map((c) => {
                  const swatch = c.imagePath ?? fabric.imagePath;
                  const state = colourState(c);
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]/50"
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest('button, a, input, select')) setPanelId(c.id);
                      }}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {swatch && imageUrls[swatch] ? (
                            <img src={imageUrls[swatch]} alt="" className="h-8 w-8 rounded border border-[var(--color-border)] object-cover" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: c.hex || c.name.toLowerCase() }} />
                          )}
                          <div>
                            <button
                              type="button"
                              className="font-medium text-[var(--color-primary)] underline underline-offset-2 hover:opacity-80"
                              onClick={() => setPanelId(c.id)}
                            >
                              {c.name}
                            </button>
                            {c.code && <div className="text-xs text-[var(--color-muted-foreground)]">{c.code}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-right font-medium tabular-nums">
                            {fmtQty(c.availableQuantity ?? 0, unit)}
                          </span>
                          <Badge variant={COLOUR_STATE_VARIANT[state]}>
                            {t(`admin.fabricLibrary.states.${state}`, { defaultValue: COLOUR_STATE_LABEL[state] })}
                          </Badge>
                          {(c.needsReview ?? 0) > 0 && (
                            <Badge variant="warning">{t('admin.fabricLibrary.checkStock', { defaultValue: 'Check stock' })}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {(c.onOrderQuantity ?? 0) > 0 ? (
                          <>
                            <div className="font-medium">{fmtQty(c.onOrderQuantity!, unit)}</div>
                            {c.nextExpectedDate && (
                              <div
                                className={cn(
                                  'text-xs',
                                  (c.overdueOrders ?? 0) > 0
                                    ? 'font-semibold text-[var(--color-destructive)]'
                                    : 'text-[var(--color-muted-foreground)]',
                                )}
                              >
                                {t('admin.fabricOrders.dueOn', {
                                  defaultValue: 'due {{date}}',
                                  date: new Date(c.nextExpectedDate).toLocaleDateString(),
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[var(--color-muted-foreground)]">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <ColourActions
                          colour={c}
                          canEdit={canEdit}
                          canCheck={canCheck}
                          onIssue={(x) => setIssueFor({ fabricColourId: x.id })}
                          onOrder={orderColour}
                          onCheck={setCheckOf}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title={t('admin.fabricOrders.title', { defaultValue: 'Orders' })}
        right={
          <FilterRailSegments
            options={[
              { value: 'open', label: t('admin.fabricOrders.open', { defaultValue: 'Open' }) },
              { value: 'all', label: t('admin.fabricOrders.all', { defaultValue: 'All' }) },
            ]}
            value={showAllOrders ? 'all' : 'open'}
            onChange={(v) => setShowAllOrders(v === 'all')}
          />
        }
      >
        <FabricOrdersTable orders={shownOrders} fabrics={allFabrics} canEdit={canEdit} onChanged={refresh} />
      </Card>

      <Card
        title={t('admin.styles.workspace.activity', { defaultValue: 'Activity log' })}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <FilterRailSegments
              options={(['all', 'stock', 'orders', 'edits'] as Kind[]).map((k) => ({
                value: k,
                label: t(`admin.fabricActivity.kinds.${k}`, {
                  defaultValue: { all: 'All', stock: 'Stock', orders: 'Orders', edits: 'Edits' }[k],
                }),
              }))}
              value={kind}
              onChange={setKind}
            />
            <Select
              className="h-9 w-auto text-[13px]"
              value={colourFilter === '' ? '' : String(colourFilter)}
              onChange={(e) => setColourFilter(e.target.value ? Number(e.target.value) : '')}
              aria-label={t('admin.fabricLibrary.cols.colour', { defaultValue: 'Colour' })}
            >
              <option value="">{t('admin.fabricActivity.allColours', { defaultValue: 'All colours' })}</option>
              {colours.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        <ActivityList feed={feed} fabric={fabric} canEdit={canEdit} links={links} onReturn={setReturnOf} onSendBack={setSendBackOf} />
      </Card>

      {panelColour && (
        <FabricColourPanel
          fabric={fabric}
          colour={panelColour}
          open={!dialogOpen}
          version={version}
          orders={orders}
          allFabrics={allFabrics}
          canEdit={canEdit}
          canCheck={canCheck}
          links={links}
          onClose={() => {
            setPanelId(null);
            setParams((p) => { p.delete('colour'); return p; }, { replace: true });
          }}
          onIssue={(x) => setIssueFor({ fabricColourId: x.id })}
          onOrder={orderColour}
          onCheck={setCheckOf}
          onReturn={setReturnOf}
          onSendBack={setSendBackOf}
          onChanged={refresh}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        title={t('admin.fabricLibrary.deleteTitle', { defaultValue: 'Delete fabric' })}
        message={t('admin.fabricLibrary.deleteMsg', {
          defaultValue: "Delete {{name}}? Its colours are removed too. This can't be undone.",
          name: fabric.name,
        })}
        confirmLabel={t('admin.fabricLibrary.delete', { defaultValue: 'Delete' })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        destructive
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void onDelete()}
      />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidthClassName="max-w-3xl" title={`${t('admin.fabricLibrary.editFabric')} — ${fabric.name}`}>
        <FabricEditorForm
          editing={fabric}
          existing={allFabrics}
          onCancel={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            refresh();
          }}
        />
      </Dialog>

      <FabricOrderDialog
        open={orderFor != null}
        preset={orderFor ? { fabricId: fabric.id, ...orderFor } : undefined}
        fabrics={allFabrics}
        onClose={() => setOrderFor(null)}
        onSaved={() => {
          setOrderFor(null);
          refresh();
        }}
      />
      <IssueSlipDialog
        open={issueFor != null}
        preset={issueFor ? { fabricId: fabric.id, fabricColourId: issueFor.fabricColourId } : undefined}
        fabrics={allFabrics}
        onClose={() => setIssueFor(null)}
        onSaved={() => {
          setIssueFor(null);
          refresh();
        }}
      />
      <StockCheckDialog
        target={checkOf ? { fabricColourId: checkOf.id, name: checkOf.name, stock: checkOf.availableQuantity ?? 0, unit } : null}
        onClose={() => setCheckOf(null)}
        onSaved={() => {
          setCheckOf(null);
          refresh();
        }}
      />
      <ReturnDialog
        target={
          returnOf
            ? {
                entryId: returnOf.entryId,
                label: [returnOf.colour?.name, returnOf.challan?.challanNo].filter(Boolean).join(' · '),
                open: returnableOf(returnOf),
                unit,
              }
            : null
        }
        onClose={() => setReturnOf(null)}
        onSaved={() => {
          setReturnOf(null);
          refresh();
        }}
      />
      <SendBackDialog
        target={
          sendBackOf
            ? {
                entryId: sendBackOf.entryId,
                label: [sendBackOf.colour?.name, sendBackOf.challan?.challanNo].filter(Boolean).join(' · '),
                open: sendBackOf.quantity - sendBackOf.returnedQuantity,
                unit,
              }
            : null
        }
        onClose={() => setSendBackOf(null)}
        onSaved={() => {
          setSendBackOf(null);
          refresh();
        }}
      />
    </div>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
      <ArrowLeft size={14} />
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3">
        <h3 className="m-0 font-serif text-base font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
