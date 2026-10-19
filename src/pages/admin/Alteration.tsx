import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Scissors, Search, X } from 'lucide-react';
import {
  QueueTabs,
  StyleQueueTable,
  type QueueColumn,
} from '@/components/styles/StyleQueueTable';
import { HoverThumbnail } from '@/components/dashboard/StylesInFlightTable';
import { TruncText } from '@/components/ui/trunc-text';
import { FilterRail, RAIL_SELECT_CLASS } from '@/components/ui/filter-rail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useDebounced } from '@/lib/useDebounced';
import StartProductionIntakeDialog from '@/components/production/StartProductionIntakeDialog';
import ReasonDialog from '@/components/production/ReasonDialog';
import CompleteAlterationDialog from '@/components/alteration/CompleteAlterationDialog';
import SendAlterationDialog from '@/components/alteration/SendAlterationDialog';
import { useAuth } from '@/context/auth';
import { useAlterationLabels } from '@/lib/alteration';
import { hasAnyRole, ALTERATION_WRITE_ROLES } from '@/lib/userRoles';
import { apiErrorMessage } from '@/api/apiClient';
import type { CreateBatchBody } from '@/api/production';
import {
  ALTERATION_CHANNELS,
  ALTERATION_SOURCES,
  CHANNEL_SOURCES,
  cancelAlteration,
  completeAlteration,
  createAlteration,
  holdAlteration,
  listAlteration,
  resumeAlteration,
  sendToAlteration,
  type AlterationChannel,
  type AlterationEntry,
  type AlterationSource,
  type AlterationStatus,
} from '@/api/alteration';

const PAGE_SIZE = 50;
/** Held entries have no tab of their own — they stay in the one they were held from. */
type Tab = Exclude<AlterationStatus, 'on_hold'>;
const TABS: Tab[] = ['received', 'in_alteration', 'completed', 'cancelled'];
const tabOf = (e: AlterationEntry): Tab => ((e.status === 'on_hold' && e.heldFromStatus) || e.status) as Tab;

export default function Alteration() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canWrite = hasAnyRole(user, ALTERATION_WRITE_ROLES);

  const { statusLabel, sourceLabel, channelLabel } = useAlterationLabels();

  // ── tab, search and filters, mirrored into the URL ───────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t0 = searchParams.get('tab') as Tab | null;
    return t0 && TABS.includes(t0) ? t0 : 'received';
  });
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const debouncedSearch = useDebounced(search, 300);
  const [sourceFilter, setSourceFilter] = useState<AlterationSource | ''>(() => {
    const s = searchParams.get('source') as AlterationSource | null;
    return s && ALTERATION_SOURCES.includes(s) ? s : '';
  });
  const [channelFilter, setChannelFilter] = useState<AlterationChannel | ''>(() => {
    const c = searchParams.get('channel') as AlterationChannel | null;
    return c && ALTERATION_CHANNELS.includes(c) ? c : '';
  });

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const mirrored = {
      tab,
      q: debouncedSearch.trim(),
      source: sourceFilter,
      channel: channelFilter,
    };
    for (const [key, value] of Object.entries(mirrored)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [tab, debouncedSearch, sourceFilter, channelFilter, searchParams, setSearchParams]);

  // ── list ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState<AlterationEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<AlterationStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqRef = useRef(0);

  const fetchPage = useCallback(
    (skip: number) =>
      listAlteration({
        status: tab,
        search: debouncedSearch.trim() || undefined,
        source: sourceFilter || undefined,
        channel: channelFilter || undefined,
        skip,
        take: PAGE_SIZE,
      }),
    [tab, debouncedSearch, sourceFilter, channelFilter],
  );

  const load = useCallback(() => {
    const my = ++reqRef.current;
    setLoading(true);
    fetchPage(0)
      .then((r) => {
        if (reqRef.current !== my) return;
        setRows(r.rows);
        setTotal(r.total);
        setCounts(r.counts);
      })
      .catch(() => {
        if (reqRef.current === my) {
          toast.show(t('admin.alteration.loadFailed', { defaultValue: "Couldn't load alterations." }), 'error');
        }
      })
      .finally(() => {
        if (reqRef.current === my) setLoading(false);
      });
  }, [fetchPage, toast, t]);

  useEffect(load, [load]);

  const loadMore = () => {
    const my = reqRef.current;
    setLoadingMore(true);
    fetchPage(rows.length)
      .then((r) => {
        if (reqRef.current !== my) return;
        // An entry added meanwhile shifts the offset by one; skip what is already shown.
        setRows((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...r.rows.filter((x) => !seen.has(x.id))];
        });
        setTotal(r.total);
        setCounts(r.counts);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };

  // ── start ────────────────────────────────────────────────────────
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<AlterationSource | ''>('');
  const [channel, setChannel] = useState<AlterationChannel | ''>('');
  const [sourceRef, setSourceRef] = useState('');
  const hasChannel = source !== '' && CHANNEL_SOURCES.includes(source);
  const sourceValid = source !== '' && (source !== 'other' || sourceRef.trim().length > 0);

  const openIntake = () => {
    setSource('');
    setChannel('');
    setSourceRef('');
    setIntakeOpen(true);
  };

  const fail = (e: unknown, fallback: string) => toast.show(apiErrorMessage(e) ?? fallback, 'error');

  const onCreate = (body: CreateBatchBody) => {
    if (source === '') return;
    setBusy(true);
    createAlteration(body, {
      source,
      channel: hasChannel && channel ? channel : undefined,
      sourceRef: sourceRef.trim() || undefined,
    })
      .then((e) => {
        setIntakeOpen(false);
        toast.show(t('admin.alteration.created', { defaultValue: '{{no}} received.', no: e.entryNo }));
        if (tab === 'received') load();
        else setTab('received');
      })
      .catch((e) => fail(e, t('admin.alteration.createFailed', { defaultValue: "Couldn't record it." })))
      .finally(() => setBusy(false));
  };

  // ── row actions ──────────────────────────────────────────────────
  type Pending = { kind: 'send' | 'complete' | 'hold' | 'resume' | 'cancel'; entry: AlterationEntry };
  const [pending, setPending] = useState<Pending | null>(null);
  const open = (kind: Pending['kind'], entry: AlterationEntry) => setPending({ kind, entry });
  const target = (kind: Pending['kind']) => (pending?.kind === kind ? pending.entry : null);
  const close = () => setPending(null);

  // Patch the one row in place so a long scrolled list keeps its place.
  const runAction = (before: AlterationEntry, p: Promise<AlterationEntry>, done: string) => {
    setBusy(true);
    p.then((after) => {
      setPending(null);
      toast.show(done);
      const from = tabOf(before);
      const to = tabOf(after);
      if (from === to) {
        setRows((prev) => prev.map((r) => (r.id === after.id ? after : r)));
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== after.id));
      setTotal((n) => n - 1);
      setCounts((c) => ({ ...c, [from]: (c[from] ?? 0) - 1, [to]: (c[to] ?? 0) + 1 }));
    })
      .catch((e) => fail(e, t('admin.alteration.actionFailed', { defaultValue: "Couldn't update it." })))
      .finally(() => setBusy(false));
  };

  const openEntry = (e: AlterationEntry) =>
    navigate(`/admin/returns/alteration/${e.id}`, {
      state: { from: `/admin/returns/alteration?${searchParams}` },
    });

  const columns: QueueColumn<AlterationEntry>[] = [
    {
      key: 'img',
      width: '72px',
      header: t('admin.production.img', { defaultValue: 'Img' }),
      cell: (e) => <HoverThumbnail src={e.imageUrl} alt={e.styleRef ?? e.entryNo} size={40} />,
    },
    {
      key: 'style',
      width: '220px',
      header: t('admin.production.style', { defaultValue: 'Style' }),
      cell: (e) => (
        <div className="min-w-0">
          {/* Primary-coloured like production's style link, so the row reads as leading somewhere. */}
          <button
            type="button"
            title={e.styleRef ?? e.entryNo}
            onClick={(ev) => {
              ev.stopPropagation();
              openEntry(e);
            }}
            className="block max-w-full truncate text-left font-mono text-[13px] text-[var(--color-primary)] hover:underline"
          >
            {e.styleRef ?? e.entryNo}
          </button>
          <TruncText
            text={[e.brandName, e.colourName, e.name !== e.styleRef ? e.name : null].filter(Boolean).join(' · ')}
            className="text-[11px] text-[var(--color-muted-foreground)]"
          />
        </div>
      ),
    },
    {
      key: 'no',
      width: '130px',
      header: t('admin.alteration.entryNo', { defaultValue: 'Entry' }),
      cell: (e) => (
        <div className="space-y-1">
          <div className="font-mono text-xs">{e.entryNo}</div>
          {e.tailorName && (
            <div className="truncate text-[11px] text-[var(--color-muted-foreground)]">{e.tailorName}</div>
          )}
          {e.status === 'on_hold' && (
            <Badge variant="rework">{t('admin.alteration.status.onHold', { defaultValue: 'On hold' })}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'source',
      width: '180px',
      header: t('admin.alteration.sourceLabel', { defaultValue: 'Source' }),
      cell: (e) => (
        <div className="min-w-0">
          <div className="text-sm">
            {sourceLabel(e.source)}
            {e.channel && <span className="text-[var(--color-muted-foreground)]"> · {channelLabel(e.channel)}</span>}
          </div>
          {e.sourceRef && (
            <TruncText text={e.sourceRef} className="font-mono text-[11px] text-[var(--color-muted-foreground)]" />
          )}
        </div>
      ),
    },
    {
      key: 'sizes',
      width: '150px',
      header: t('admin.alteration.sizes', { defaultValue: 'Sizes' }),
      cell: (e) => (
        <span className="text-xs">
          {e.sizes
            .map((s) => (s.qtyOut != null ? `${s.size} ${s.qtyOut}/${s.qtyIn}` : `${s.size} ${s.qtyIn}`))
            .join(' · ')}
        </span>
      ),
    },
    // The remark is the hold reason, shown while the entry is held.
    {
      key: 'remark',
      header: t('admin.production.remark', { defaultValue: 'Remark' }),
      cell: (e) =>
        e.status === 'on_hold' && e.holdReason ? (
          <div
            title={e.holdReason}
            className="line-clamp-3 whitespace-pre-line break-words text-[13px] font-semibold text-amber-700"
          >
            {e.holdReason}
          </div>
        ) : (
          <span className="text-[var(--color-muted-foreground)]">—</span>
        ),
    },
  ];

  const actions = (e: AlterationEntry) => (
    // Buttons act on the row; the click must not also open the entry.
    <div className="flex flex-wrap justify-end gap-1.5" onClick={(ev) => ev.stopPropagation()}>
      {e.status === 'on_hold' && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => open('resume', e)}>
          {t('admin.production.resume.cta', { defaultValue: 'Resume' })}
        </Button>
      )}
      {(e.status === 'received' || e.status === 'in_alteration') && (
        <Button variant="warning" size="sm" disabled={busy} onClick={() => open('hold', e)}>
          {t('admin.production.hold.cta', { defaultValue: 'Hold' })}
        </Button>
      )}
      {e.status === 'received' && (
        <>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => open('cancel', e)}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => open('send', e)}>
            {t('admin.alteration.send', { defaultValue: 'Send' })}
          </Button>
        </>
      )}
      {e.status === 'in_alteration' && (
        <Button variant="success" size="sm" disabled={busy} onClick={() => open('complete', e)}>
          {t('admin.alteration.complete', { defaultValue: 'Complete' })}
        </Button>
      )}
    </div>
  );

  const confirming = pending?.kind === 'cancel' || pending?.kind === 'resume' ? pending : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {t('admin.alteration.title', { defaultValue: 'Alteration' })}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <FilterRail>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as AlterationSource | '')}
              className={RAIL_SELECT_CLASS}
              aria-label={t('admin.alteration.sourceLabel', { defaultValue: 'Source' })}
            >
              <option value="">{t('admin.alteration.sourceAll', { defaultValue: 'Source: All' })}</option>
              {ALTERATION_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as AlterationChannel | '')}
              className={RAIL_SELECT_CLASS}
              aria-label={t('admin.alteration.channel', { defaultValue: 'Channel' })}
            >
              <option value="">{t('admin.alteration.channelAll', { defaultValue: 'Channel: All' })}</option>
              {ALTERATION_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {channelLabel(c)}
                </option>
              ))}
            </select>
          </FilterRail>
          {canWrite && (
            <Button size="sm" onClick={openIntake}>
              <Scissors size={14} />
              <span className="ml-1">{t('admin.alteration.startCta', { defaultValue: 'Start alteration' })}</span>
            </Button>
          )}
        </div>
      </header>

      <QueueTabs
        tabs={TABS.map((s) => ({ key: s, label: statusLabel(s), count: counts[s] }))}
        active={tab}
        onSelect={setTab}
      />

      <div className="relative w-full max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-primary)]"
        />
        <Input
          className="h-9 text-[13px] pl-9 pr-9 border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/30 focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.alteration.searchPlaceholder', {
            defaultValue: 'Search entry, style, SKU, reference or tailor…',
          })}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={t('common.clear', { defaultValue: 'Clear' })}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <StyleQueueTable<AlterationEntry>
        columns={columns}
        rows={rows}
        getRowKey={(e) => e.id}
        onRowClick={openEntry}
        loading={loading}
        loadingLabel={t('common.loading', { defaultValue: 'Loading…' })}
        emptyLabel={t('admin.alteration.empty', { defaultValue: 'Nothing here.' })}
        actionsWidth="230px"
        renderActions={canWrite && (tab === 'received' || tab === 'in_alteration') ? actions : undefined}
      />

      {/* Hidden mid-reload: the old row count would be the wrong offset for the new query. */}
      {!loading && rows.length < total && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
            {t('common.loadMore', { defaultValue: 'Load more' })}
          </Button>
        </div>
      )}

      <StartProductionIntakeDialog
        purpose="alteration"
        title={t('admin.alteration.startCta', { defaultValue: 'Start alteration' })}
        renderFooter={({ canSubmit, total: n, confirm }) => (
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setIntakeOpen(false)}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button size="sm" disabled={busy || !canSubmit} onClick={confirm}>
              {t('admin.alteration.confirm', { defaultValue: 'Receive · {{n}}', n })}
            </Button>
          </>
        )}
        open={intakeOpen}
        busy={busy}
        onClose={() => setIntakeOpen(false)}
        onConfirm={onCreate}
        extraValid={sourceValid}
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div>
            <Label required>{t('admin.alteration.sourceLabel', { defaultValue: 'Source' })}</Label>
            <Select value={source} onChange={(e) => setSource(e.target.value as AlterationSource | '')}>
              <option value="">{t('admin.alteration.pickSource', { defaultValue: 'Choose…' })}</option>
              {ALTERATION_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </Select>
          </div>
          {hasChannel && (
            <div>
              <Label>{t('admin.alteration.channel', { defaultValue: 'Channel' })}</Label>
              <Select value={channel} onChange={(e) => setChannel(e.target.value as AlterationChannel | '')}>
                <option value="">—</option>
                {ALTERATION_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {channelLabel(c)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label required={source === 'other'}>
              {t('admin.alteration.sourceRef', { defaultValue: 'Reference' })}
            </Label>
            <Input
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              placeholder={t('admin.alteration.sourceRefPlaceholder', { defaultValue: 'Order / AWB / lot no.' })}
            />
          </div>
        </div>
      </StartProductionIntakeDialog>

      <SendAlterationDialog
        entry={target('send')}
        busy={busy}
        onClose={close}
        onConfirm={(tailorId) => {
          const e = target('send');
          if (e) {
            runAction(
              e,
              sendToAlteration(e.id, tailorId),
              t('admin.alteration.sent', { defaultValue: '{{no}} sent to alteration.', no: e.entryNo }),
            );
          }
        }}
      />

      <CompleteAlterationDialog
        entry={target('complete')}
        busy={busy}
        onClose={close}
        onConfirm={(items) => {
          const e = target('complete');
          if (e) {
            runAction(
              e,
              completeAlteration(e.id, items),
              t('admin.alteration.completed', { defaultValue: '{{no}} completed.', no: e.entryNo }),
            );
          }
        }}
      />

      <ReasonDialog
        open={pending?.kind === 'hold'}
        busy={busy}
        destructive={false}
        title={t('admin.alteration.holdTitle', {
          defaultValue: 'Put {{no}} on hold?',
          no: target('hold')?.entryNo ?? '',
        })}
        confirmLabel={t('admin.production.hold.cta', { defaultValue: 'Hold' })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        placeholder={t('admin.alteration.holdPlaceholder', { defaultValue: 'Why is this on hold?' })}
        maxLength={500}
        onClose={close}
        onConfirm={(reason) => {
          const e = target('hold');
          if (e) {
            runAction(
              e,
              holdAlteration(e.id, reason),
              t('admin.alteration.held', { defaultValue: '{{no}} on hold.', no: e.entryNo }),
            );
          }
        }}
      />

      <ConfirmDialog
        open={confirming != null}
        title={
          confirming?.kind === 'resume'
            ? t('admin.alteration.resumeTitle', { defaultValue: 'Resume {{no}}?', no: confirming.entry.entryNo })
            : t('admin.alteration.cancelTitle', { defaultValue: 'Cancel {{no}}?', no: confirming?.entry.entryNo ?? '' })
        }
        message={
          confirming
            ? t('admin.alteration.confirmMessage', {
                defaultValue: '{{style}} · {{n}} pieces',
                style: confirming.entry.styleRef ?? '',
                n: confirming.entry.qtyIn,
              })
            : ''
        }
        confirmLabel={
          confirming?.kind === 'resume'
            ? t('admin.production.resume.cta', { defaultValue: 'Resume' })
            : t('admin.alteration.cancelEntry', { defaultValue: 'Cancel entry' })
        }
        cancelLabel={t('admin.alteration.keep', { defaultValue: 'Back' })}
        destructive={confirming?.kind === 'cancel'}
        onCancel={close}
        onConfirm={() => {
          if (!confirming) return;
          const { kind, entry } = confirming;
          runAction(
            entry,
            kind === 'resume' ? resumeAlteration(entry.id) : cancelAlteration(entry.id),
            kind === 'resume'
              ? t('admin.alteration.resumed', { defaultValue: '{{no}} resumed.', no: entry.entryNo })
              : t('admin.alteration.cancelled', { defaultValue: '{{no}} cancelled.', no: entry.entryNo }),
          );
        }}
      />
    </div>
  );
}
