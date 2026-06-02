import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import Approval1Dialog from "@/components/styles/Approval1Dialog";
import ParkDialog from "@/components/styles/ParkDialog";
import {
  StyleQueueTable,
  QueueTabs,
  StyleRefLink,
  Thumbnail,
  LifecycleBadge,
  ColourCell,
  AgeCell,
  ApproveButton,
  GhostActionButton,
  RowChevron,
  type QueueColumn,
} from "@/components/styles/StyleQueueTable";
import {
  getDashboardStyles,
  type DashboardStyleRow,
  type DashboardStyleTab,
} from "@/api/dashboard";
import { approveStyle, parkStyle } from "@/api/styles";
import { useAuth } from "@/context/auth";
import { hasAnyRole } from "@/lib/userRoles";
import { useDebounced } from "@/lib/useDebounced";
import { formatStyleRef } from "@/lib/styleRef";

/**
 * Self-contained Home content surface — the per-style "Styles in flight"
 * table. Owns its own tab + (debounced) search state and fetches its own
 * data via `getDashboardStyles`. Renders the shared `StyleQueueTable` so
 * the dashboard and the Sampling registry share one table design; PD
 * styles carry no lots, so STAGE is a coarse lifecycle/sampling/production
 * pill — never a unit-level X/Y (see docs/DASHBOARD_REDESIGN.md).
 */

interface Props {
  /** Seed the starting tab — Home passes it from a `?tab=` query param. */
  initialTab?: DashboardStyleTab;
  /**
   * Called after a successful inline approve/park (in addition to the
   * table's own refetch) so the Home can refresh its summary cards.
   */
  onActionDone?: () => void;
}

const TABS: DashboardStyleTab[] = [
  "all",
  "sampling",
  "in_production",
  "live",
  "needs_attention",
];

// Roles allowed to Park a style once it's past `draft` (Approval #1 has
// minted the Style #). Mirrors the post-approval park guard in the spec.
const POST_APPROVAL_PARK_ROLES = ["admin", "sampling_lead"] as const;

// Roles allowed to Approve (Approval #1) — mirrors the BE APPROVER_ROLES
// set in dashboard.service.ts. Home's allow-list is wide (viewers,
// data managers, etc. all land here), so the inline Approve button must
// be role-gated, not just lifecycle-gated, or non-approvers 403.
const APPROVER_ROLES = [
  "admin",
  "sampling_lead",
  "pattern_master_w",
  "pattern_master_m",
  "china_import_approver",
] as const;

// Roles allowed to Park a draft (pre-approval) — mirrors StylesTable.tsx
// WRITE_ROLES (the styles write set on the BE).
const PARK_WRITE_ROLES = [
  "admin",
  "sampling_editor",
  "sampling_lead",
  "pattern_master_w",
  "pattern_master_m",
  "operator",
] as const;

export default function StylesInFlightTable({
  initialTab = "all",
  onActionDone,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<DashboardStyleTab>(initialTab);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounced(searchText, 300);

  const [rows, setRows] = useState<DashboardStyleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Inline action targets — opening either dialog stashes the row.
  const [approvalTarget, setApprovalTarget] =
    useState<DashboardStyleRow | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [parkTarget, setParkTarget] = useState<DashboardStyleRow | null>(null);
  const [parkBusy, setParkBusy] = useState(false);

  // If Home re-seeds the tab from a fresh `?tab=` deep link, follow it.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getDashboardStyles({
        tab,
        search: debouncedSearch.trim() || undefined,
        take: 100,
      });
      setRows(res.rows);
    } catch {
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch the table AND let the Home refresh its cards.
  const afterAction = () => {
    void load();
    onActionDone?.();
  };

  // The Style detail route — matches StylesRegistry.tsx's row link.
  const openStyle = (row: DashboardStyleRow) =>
    navigate(`/styles/${row.styleId ?? row.id}`);

  // Mirror the active tab into ?tab= so a refresh or shared link reopens
  // the selected bucket (not the stale deep-linked one) — matches the
  // Sampling registry's behaviour.
  const selectTab = (next: DashboardStyleTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const canApprove = (row: DashboardStyleRow) =>
    row.lifecycle === "draft" && hasAnyRole(user, APPROVER_ROLES);

  // Park is open while in `draft` (write roles only); post-approval
  // (anything else) only admins + sampling leads may park inline.
  const canPark = (row: DashboardStyleRow) => {
    if (
      row.lifecycle === "parked" ||
      row.lifecycle === "archived" ||
      row.lifecycle === "dispatched"
    ) {
      return false;
    }
    if (row.lifecycle === "draft") return hasAnyRole(user, PARK_WRITE_ROLES);
    return hasAnyRole(user, POST_APPROVAL_PARK_ROLES);
  };

  const stageLabel = (row: DashboardStyleRow): string => {
    if (row.lifecycle === "in_sampling" && row.samplingStatus) {
      return t(`admin.styles.samplingSteps.${row.samplingStatus}` as const, {
        defaultValue: row.samplingStatus.replace(/_/g, " "),
      });
    }
    if (row.lifecycle === "in_pd" && row.productionStatus) {
      return t(
        `dashboard.table.productionStatus.${row.productionStatus}` as const,
        {
          defaultValue: row.productionStatus.replace(/_/g, " "),
        },
      );
    }
    return "";
  };

  const columns: QueueColumn<DashboardStyleRow>[] = [
    {
      key: "style",
      header: t("dashboard.table.columns.style", { defaultValue: "Style" }),
      cell: (row) => {
        // Colour has its own column now; the subline only surfaces the
        // colour-family fan-out count when there are variants.
        const subLine =
          row.colourVariantCount > 0
            ? t("dashboard.table.colourCount", {
                count: row.colourVariantCount,
              })
            : "";
        return (
          <div className="flex items-center gap-2.5">
            <Thumbnail
              src={row.thumbnail}
              alt={row.workingName ?? formatStyleRef(row)}
            />
            <div className="flex flex-col">
              <StyleRefLink style={row} onClick={() => openStyle(row)} />
              {row.workingName && (
                <span className="text-[var(--color-foreground)]">
                  {row.workingName}
                </span>
              )}
              {subLine && (
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {subLine}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "lifecycle",
      header: t("dashboard.table.columns.lifecycle", {
        defaultValue: "Lifecycle",
      }),
      cell: (row) => <LifecycleBadge lifecycle={row.lifecycle} />,
    },
    {
      key: "stage",
      header: t("dashboard.table.columns.stage", { defaultValue: "Stage" }),
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (row) => {
        const stage = stageLabel(row);
        return stage ? (
          <Badge variant="stitch" className="text-[10px]">
            {stage}
          </Badge>
        ) : (
          <span className="text-[var(--color-muted-foreground)]">—</span>
        );
      },
    },
    {
      key: "colour",
      header: t("dashboard.table.columns.colour", { defaultValue: "Colour" }),
      className: "hidden sm:table-cell",
      headerClassName: "hidden sm:table-cell",
      cell: (row) => <ColourCell name={row.primaryColour} />,
    },
    {
      key: "age",
      header: t("dashboard.table.columns.updated", { defaultValue: "Updated" }),
      align: "right",
      cell: (row) => <AgeCell iso={row.updatedAt} />,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <QueueTabs
        tabs={TABS.map((tk) => ({
          key: tk,
          label: t(`dashboard.table.tabs.${tk}` as const),
        }))}
        active={tab}
        onSelect={selectTab}
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
        />
        <Input
          className="h-9 text-[13px] pl-9"
          placeholder={t("dashboard.table.searchPlaceholder")}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <StyleQueueTable<DashboardStyleRow>
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        loading={loading}
        error={error}
        loadingLabel={t("dashboard.table.loading")}
        emptyLabel={t("dashboard.table.empty")}
        errorLabel={t("dashboard.table.error")}
        onRowClick={openStyle}
        rowAccent={(row) => row.lifecycle === "draft"}
        renderActions={(row) => {
          if (canApprove(row)) {
            return <ApproveButton onClick={() => setApprovalTarget(row)} />;
          }
          if (canPark(row)) {
            return (
              <GhostActionButton icon="park" onClick={() => setParkTarget(row)}>
                {t("dashboard.table.actions.park")}
              </GhostActionButton>
            );
          }
          return <RowChevron />;
        }}
      />

      {/* Approval #1 — reuses the same dialog as the Sampling registry. */}
      <Approval1Dialog
        open={approvalTarget !== null}
        busy={approvalBusy}
        gender={null}
        onClose={() => setApprovalTarget(null)}
        onConfirm={async (body) => {
          if (!approvalTarget) return;
          setApprovalBusy(true);
          try {
            await approveStyle(approvalTarget.id, body);
            toast.show(t("dashboard.table.toast.approved"), "success");
            setApprovalTarget(null);
            afterAction();
          } catch (e: unknown) {
            const m =
              (e as { response?: { data?: { message?: string | string[] } } })
                ?.response?.data?.message ??
              t("dashboard.table.toast.approveError");
            toast.show(Array.isArray(m) ? m.join(", ") : String(m), "error");
          } finally {
            setApprovalBusy(false);
          }
        }}
      />

      {/* Park — captures a reason for the audit log. */}
      <ParkDialog
        open={parkTarget !== null}
        busy={parkBusy}
        styleLabel={parkTarget ? formatStyleRef(parkTarget) : null}
        approved={parkTarget ? parkTarget.lifecycle !== "draft" : false}
        onClose={() => setParkTarget(null)}
        onConfirm={async (reason) => {
          if (!parkTarget) return;
          setParkBusy(true);
          try {
            await parkStyle(parkTarget.id, { reason });
            toast.show(t("dashboard.table.toast.parked"), "success");
            setParkTarget(null);
            afterAction();
          } catch (e: unknown) {
            const m =
              (e as { response?: { data?: { message?: string | string[] } } })
                ?.response?.data?.message ??
              t("dashboard.table.toast.parkError");
            toast.show(Array.isArray(m) ? m.join(", ") : String(m), "error");
          } finally {
            setParkBusy(false);
          }
        }}
      />
    </div>
  );
}
