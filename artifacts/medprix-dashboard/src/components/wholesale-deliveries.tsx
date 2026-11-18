import { WholesaleStatusPill } from "./wholesale-status-pill";
import { SourceTableBody, SourceFeedback, SourceRefreshButton } from "./custom-ui/source-state";
import { createPortal } from "react-dom";
import { CalendarDays, ClipboardCheck, Eye, History, Truck } from "lucide-react";
import { useEffect } from "react";
import { TableEmptyState } from "./custom-ui/empty-state";
import {
  PageTableAction,
  PageTableScroll,
  PageTableValue,
} from "./page-table-context";
import { useWholesalePages } from "./use-receivable-pages";
import { formatDisplayDate } from "@/lib/business-date";
import { wholesalePeso } from "@/lib/wholesale-api";

export type DeliveryQueueStatus =
  "active" | "all" | "Ready" | "Scheduled" | "InTransit" | "Completed";
export type DeliveryRow = {
  id: string;
  orderNumber: string;
  clientName: string;
  total: string;
  date: string | null;
  status: Exclude<DeliveryQueueStatus, "active" | "all">;
};
const actions = {
  Ready: { label: "Schedule delivery", icon: CalendarDays },
  Scheduled: { label: "Dispatch delivery", icon: Truck },
  InTransit: { label: "Confirm client receipt", icon: ClipboardCheck },
  Completed: { label: "View delivery", icon: Eye },
};
export function WholesaleDeliveries({
  search,
  status,
  busy,
  open,
  refreshTarget,
}: {
  search: string;
  status: DeliveryQueueStatus;
  busy: boolean;
  open: (id: string, title: string, view?: "history") => void;
  refreshTarget?: HTMLElement | null;
}) {
  const list = useWholesalePages<DeliveryRow>(
    "/delivery-queue",
    true,
    search,
    status,
  );
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void list.refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [list.refresh]);
  return (
    <>
      {refreshTarget && createPortal(
        <SourceRefreshButton
          status={{ hasData: list.hasData, pending: list.pending, error: list.error }}
          label="deliveries"
          onRefresh={list.refresh}
        />,
        refreshTarget,
      )}
      <SourceFeedback status={{ hasData: list.hasData, pending: list.pending, error: list.error }} label="deliveries" onRetry={list.refresh} />
      <div className="table-scroll">
        <PageTableScroll>
          <table className="data-table" data-page-table="wholesale-deliveries">
            <thead>
              <tr>
                <th>Order</th>
                <th>Client</th>
                <th>Total</th>
                <th>Scheduled date</th>
                <th>Delivery status</th>
                <th className="table-action-head">Action</th>
              </tr>
            </thead>
            <SourceTableBody status={{ hasData: list.hasData, pending: list.pending, error: list.error }} label="Deliveries" colSpan={6}>
              {list.items.map((row) => {
                  const { label, icon: Icon } = actions[row.status];
                  return (
                    <tr key={row.id}>
                      <td>{row.orderNumber}</td>
                      <td>
                        <PageTableValue value={row.clientName} />
                      </td>
                      <td>{wholesalePeso(row.total)}</td>
                      <td>{row.date ? formatDisplayDate(row.date) : "—"}</td>
                      <td>
                        <WholesaleStatusPill status={row.status} />
                      </td>
                      <td className="table-action-cell">
                        <div className="table-actions">
                          <PageTableAction
                            type="button"
                            label={label}
                            aria-label={label}
                            icon={<Icon size={13} />}
                            className="button soft table-action-btn"
                            disabled={busy}
                            onClick={() => open(row.id, label)}
                          >
                            <Icon size={13} />
                          </PageTableAction>
                          <PageTableAction
                            type="button"
                            label="View delivery history"
                            aria-label="View delivery history"
                            icon={<History size={13} />}
                            className="button soft table-action-btn"
                            disabled={busy}
                            onClick={() => open(row.id, "Delivery history", "history")}
                          >
                            <History size={13} />
                          </PageTableAction>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!list.total && (
                <tr>
                  <TableEmptyState colSpan={6}>
                    {search || status !== "active"
                      ? "No matching deliveries."
                      : "No orders awaiting delivery."}
                  </TableEmptyState>
                </tr>
              )}
            </SourceTableBody>
          </table>
        </PageTableScroll>
      </div>
      <div
        className="table-pagination"
        role="navigation"
        aria-label="Deliveries pagination"
      >
        <span className="muted">
          {list.loading
            ? "Loading deliveries…"
            : `Page ${list.page} of ${list.pages} (${list.total} deliveries)`}
        </span>
        <button
          type="button"
          className="button soft"
          disabled={list.loading || list.page <= 1}
          onClick={() => list.go(list.page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="button soft"
          disabled={list.loading || list.page >= list.pages}
          onClick={() => list.go(list.page + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
