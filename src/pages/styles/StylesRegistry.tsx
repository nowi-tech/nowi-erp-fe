import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  StyleQueueTable,
  QueueTabs,
  StyleRefLink,
  TypePill,
  ColourCell,
  ApproverOrPanelCell,
  AgeCell,
  ApproveButton,
  GhostActionButton,
  RowChevron,
  type QueueColumn,
} from "@/components/styles/StyleQueueTable";
import Approval1Dialog from "@/components/styles/Approval1Dialog";
import ParkDialog from "@/components/styles/ParkDialog";
import { useAuth } from "@/context/auth";
import { hasAnyRole } from "@/lib/userRoles";
import {
  approveStyle,
  listStyles,
  parkStyle,
  reviveStyle,
  type ListStylesParams,
  type SamplingStatus,
  type StyleTab,
} from "@/api/styles";
import { listReviewers } from "@/api/users";
import type { Reviewer, Style, UserRole } from "@/api/types";

const TABS: StyleTab[] = ["inbox", "in_sampling", "parked", "in_pd", "all"];

// Row-action role gates — mirror the legacy StylesTable `RowActions`
// (and the BE guards) so the queue never shows a button that 403s.
//  • Park / Revive reuse the styles WRITE set.
//  • Approve (Approval #1) uses the narrower APPROVE set (Option A drops
//    sampling_editor; china_import_approver kept for parity).
const WRITE_ROLES: readonly UserRole[] = [
  "admin",
  "sampling_editor",
  "sampling_lead",
  "pattern_master_w",
  "pattern_master_m",
] as const;

const APPROVER_ROLES: readonly UserRole[] = [
  "admin",
  "sampling_lead",
  "pattern_master_w",
  "pattern_master_m",
  "china_import_approver",
] as const;

// Sampling-status filter — the 5 live stages plus the "Corrections"
// off-ramp. Labels render via the `admin.styles.samplingSteps.*` i18n
// keys (so `ready_for_inspection` shows "QC"). The removed
// `in_progress_stitching` / `handed_over_for_inspection` statuses are
// intentionally absent.
const SAMPLING_STATUS_FILTER_OPTIONS: SamplingStatus[] = [
  "in_progress_pattern_dev",
  "in_progress_fabric_sourcing",
  "in_progress_cutting",
  "ready_for_inspection",
  "approved_for_production",
  "corrections_needed",
];

// Read the initial tab from the `?tab=` deep-link param (the Home summary
// cards land here with a filter pre-applied). Falls back to the inbox.
function tabFromParam(value: string | null): StyleTab {
  return TABS.includes(value as StyleTab) ? (value as StyleTab) : "inbox";
}

/**
 * Sampling registry — the "View more" drill-down target from the unified Home.
 *
 * The header summary (attention chips + KPI strip) moved to the Home page.
 * Body: tabs + filter bar + parent/variant grouped table + Submit design.
 *
 * Sampling-only — China Import has its own dedicated page (`/china-import`).
 */
// "women" → "Women". Mirrors the lower-cased-gender capitalize approach
// the legacy table used for its gender label.
function genderLabel(gender: string | null | undefined): string | null {
  if (!gender) return null;
  return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
}

export default function StylesRegistry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<StyleTab>(() =>
    tabFromParam(searchParams.get("tab")),
  );
  const [rows, setRows] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  // Fixed reviewer panel (active approver-role users). The Reviewer column
  // shows a row's approver when present, else this panel. Tolerate failure
  // (e.g. role can't list reviewers) → empty array renders "—".
  const [reviewerPanel, setReviewerPanel] = useState<Reviewer[]>([]);

  const [searchText, setSearchText] = useState("");
  const [samplingStatus, setSamplingStatus] = useState<string>("");
  // Selected row for the Approval #1 modal — clicking the inline ✓
  // opens the dialog with the row's gender + suggested pattern master.
  const [approvalTarget, setApprovalTarget] = useState<Style | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [parkTarget, setParkTarget] = useState<Style | null>(null);
  const [parkBusy, setParkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: ListStylesParams = {
        tab,
        search: searchText.trim() || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        samplingStatus: (samplingStatus || undefined) as any,
        take: 200,
      };
      const res = await listStyles(params);
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, searchText, samplingStatus]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  // Fetch the reviewer panel once. Failures are non-fatal — the column
  // falls back to "—" when no approver is set.
  useEffect(() => {
    let cancelled = false;
    listReviewers()
      .then((panel) => {
        if (!cancelled) setReviewerPanel(panel);
      })
      .catch(() => {
        if (!cancelled) setReviewerPanel([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Honor a deep-link `?tab=` change (e.g. back/forward navigation or a
  // fresh card click while already on the page) by re-syncing the tab.
  useEffect(() => {
    setTab(tabFromParam(searchParams.get("tab")));
  }, [searchParams]);

  // Tab selection mirrors the active tab into the URL so the page is
  // shareable/back-button friendly and stays consistent with deep links.
  const selectTab = (next: StyleTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const openCreateDesign = () => navigate("/styles/new");

  // Inline row actions — Approve now opens the Approval #1 dialog so
  // the approver explicitly ticks fabric / price / collection checks
  // before the Style # is minted. Park / Revive remain one-click.
  const onRowApprove = (s: Style) => {
    setApprovalTarget(s);
  };
  const onRowPark = (s: Style) => {
    setParkTarget(s);
  };
  const onRowRevive = async (s: Style) => {
    try {
      await reviveStyle(s.id);
      toast.show("Revived.", "success");
      void load();
    } catch {
      toast.show("Could not revive.", "error");
    }
  };

  // Column set for the flat Sampling Queue — Compact View. Built from the
  // shared cell helpers so the registry reads identically to the
  // dashboard "Styles in flight" surface.
  const columns = useMemo<QueueColumn<Style>[]>(
    () => [
      {
        key: "ref",
        header: t("admin.styles.table.draftNo", { defaultValue: "Draft #" }),
        cell: (row) => (
          <StyleRefLink
            style={row}
            onClick={() => navigate(`/styles/${row.styleId ?? row.id}`)}
          />
        ),
      },
      {
        key: "type",
        header: t("admin.styles.table.type.label", { defaultValue: "Type" }),
        className: "hidden sm:table-cell",
        headerClassName: "hidden sm:table-cell",
        cell: (row) => <TypePill style={row} />,
      },
      {
        key: "name",
        header: t("admin.styles.table.workingName", {
          defaultValue: "Working name",
        }),
        cell: (row) =>
          row.workingName ? (
            <span className="font-medium">{row.workingName}</span>
          ) : (
            "—"
          ),
      },
      {
        key: "genderCat",
        header: t("admin.styles.table.genderCategory", {
          defaultValue: "Gender · Category",
        }),
        className: "hidden md:table-cell",
        headerClassName: "hidden md:table-cell",
        cell: (row) => {
          const g = genderLabel(row.gender);
          const c = row.category?.name ?? row.categoryCode ?? null;
          const parts = [g, c].filter(Boolean);
          return parts.length > 0 ? parts.join(" · ") : "—";
        },
      },
      {
        key: "fabric",
        header: t("admin.styles.table.fabric", { defaultValue: "Fabric" }),
        className: "hidden lg:table-cell",
        headerClassName: "hidden lg:table-cell",
        cell: (row) => {
          const name = row.fabric?.name ?? "—";
          return (
            <span className="block truncate max-w-[140px]" title={name}>
              {name}
            </span>
          );
        },
      },
      {
        key: "colour",
        header: t("admin.styles.table.colour", { defaultValue: "Colour" }),
        className: "hidden sm:table-cell",
        headerClassName: "hidden sm:table-cell",
        cell: (row) => <ColourCell name={row.primaryColour} />,
      },
      {
        key: "reviewer",
        header: t("admin.styles.table.reviewer", { defaultValue: "Reviewer" }),
        className: "hidden lg:table-cell",
        headerClassName: "hidden lg:table-cell",
        cell: (row) => (
          <ApproverOrPanelCell approver={row.approver} panel={reviewerPanel} />
        ),
      },
      {
        key: "age",
        header: t("admin.styles.table.age", { defaultValue: "Age" }),
        align: "right",
        cell: (row) => <AgeCell iso={row.createdAt} />,
      },
    ],
    [t, navigate, reviewerPanel],
  );

  // Role + lifecycle gated row actions — replicated from the legacy
  // StylesTable `RowActions`. Order matches the Stitch right-aligned
  // cluster: Park then Approve. Buttons stop propagation internally.
  const renderActions = useCallback(
    (row: Style) => {
      const canApprove =
        row.lifecycle === "draft" && hasAnyRole(user, APPROVER_ROLES);
      const canRevive =
        row.lifecycle === "parked" && hasAnyRole(user, WRITE_ROLES);
      const canPark =
        row.lifecycle === "draft" && hasAnyRole(user, WRITE_ROLES);

      if (!canApprove && !canRevive && !canPark) return <RowChevron />;

      return (
        <>
          {canRevive && (
            <GhostActionButton icon="revive" onClick={() => onRowRevive(row)}>
              {t("admin.styles.table.actions.revive", {
                defaultValue: "Revive",
              })}
            </GhostActionButton>
          )}
          {canPark && (
            <GhostActionButton icon="park" onClick={() => onRowPark(row)}>
              {t("admin.styles.table.actions.park", { defaultValue: "Park" })}
            </GhostActionButton>
          )}
          {canApprove && <ApproveButton onClick={() => onRowApprove(row)} />}
        </>
      );
    },
    // onRowApprove/onRowPark/onRowRevive are stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, t],
  );

  const tabDefs = useMemo(
    () =>
      TABS.map((tk) => ({
        key: tk,
        label: t(`admin.styles.tabs.${tk}`),
        count: tk === "all" ? rows.length : undefined,
      })),
    [t, rows.length],
  );

  return (
    <div className="space-y-6">
      {/* Header: title + actions */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-[var(--color-primary)]">
            {t("admin.styles.title")}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            {t("admin.styles.subtitle")}
          </p>
        </div>
        <Button onClick={openCreateDesign}>
          <Plus size={16} />
          <span className="ml-1">{t("admin.styles.newDesign")}</span>
        </Button>
      </div>

      {/* Tabs + filter bar + flat queue table */}
      <div className="space-y-3">
        <QueueTabs tabs={tabDefs} active={tab} onSelect={selectTab} />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
            />
            <Input
              className="h-9 text-[13px] pl-9"
              placeholder={t("admin.styles.filters.search")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <Select
            className="h-9 text-[13px] w-auto"
            value={samplingStatus}
            onChange={(e) => setSamplingStatus(e.target.value)}
          >
            <option value="">{t("admin.styles.filters.samplingStatus")}</option>
            {SAMPLING_STATUS_FILTER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`admin.styles.samplingSteps.${s}` as const, {
                  defaultValue: s,
                })}
              </option>
            ))}
          </Select>
        </div>

        <StyleQueueTable<Style>
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          loading={loading}
          loadingLabel={t("common.loading", { defaultValue: "Loading…" })}
          emptyLabel={t("admin.styles.table.empty")}
          // Single click target: every click (row OR draft #) opens the
          // full Style detail page.
          onRowClick={(s) => navigate(`/styles/${s.styleId ?? s.id}`)}
          renderActions={renderActions}
          rowAccent={(row) => row.lifecycle === "draft"}
          footerNote={t("admin.styles.table.queueNote", {
            defaultValue:
              "Approve opens the Approval #1 checks. New designs go to sampling; colour & based-on skip to production.",
          })}
        />
      </div>

      {/* Hidden link kept for screen-reader / route prefetching. */}
      <Link to="/styles/new" className="sr-only">
        New design submission
      </Link>

      {/* Park confirmation — captures the reason for the audit log
          instead of the old hardcoded "Paused from inbox" string. */}
      <ParkDialog
        open={parkTarget !== null}
        busy={parkBusy}
        styleLabel={
          parkTarget?.styleId ??
          (parkTarget?.draftNo != null
            ? `D-${parkTarget.draftNo}`
            : parkTarget?.workingName) ??
          null
        }
        approved={parkTarget ? parkTarget.lifecycle !== "draft" : false}
        onClose={() => setParkTarget(null)}
        onConfirm={async (reason) => {
          if (!parkTarget) return;
          setParkBusy(true);
          try {
            await parkStyle(parkTarget.id, { reason });
            toast.show("Parked.", "success");
            setParkTarget(null);
            void load();
          } catch {
            toast.show("Could not park.", "error");
          } finally {
            setParkBusy(false);
          }
        }}
      />

      {/* Approval #1 confirmation — same dialog the detail page uses.
          All three intake checks must be ticked before Confirm enables. */}
      <Approval1Dialog
        open={approvalTarget !== null}
        busy={approvalBusy}
        gender={approvalTarget?.gender ?? null}
        onClose={() => setApprovalTarget(null)}
        onConfirm={async (body) => {
          if (!approvalTarget) return;
          setApprovalBusy(true);
          try {
            await approveStyle(approvalTarget.id, body);
            toast.show("Approved.", "success");
            setApprovalTarget(null);
            void load();
          } catch (e: unknown) {
            const m =
              (e as { response?: { data?: { message?: string | string[] } } })
                ?.response?.data?.message ?? "Could not approve.";
            toast.show(Array.isArray(m) ? m.join(", ") : String(m), "error");
          } finally {
            setApprovalBusy(false);
          }
        }}
      />
    </div>
  );
}
