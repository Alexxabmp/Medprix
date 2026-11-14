import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { WholesaleOrderDetails } from "./wholesale-order-details";
import { DeliveryReceiptView } from "./delivery-receipt-view";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Eye,
  Search,
  Truck,
  Wallet,
} from "lucide-react";
import { WholesaleDialog } from "./wholesale-dialog";
import { ModalTableValue, useModalTableStandard, ModalTableFrame, ModalTableFooter, ModalTablePager, ModalTableHint } from "./modal-table-layout";
import { LoadingState } from "./custom-ui/loading-state";
import { safeError } from "@/lib/feedback";
import {
  wholesaleGet,
  getCachedWholesale,
  wholesalePeso,
  type WholesalePageResult,
  type WholesaleOrder,
  type WholesaleOrderDetail,
  type DeliveryReceipt,
} from "@/lib/wholesale-api";

function useWorkspaceList<T>(
  path: string,
  search: string,
  status = "",
  initialData?: WholesalePageResult<T>,
) {
  const [page, setPage] = useState(1);
  const initialQueryPath = path + "?search=" + encodeURIComponent(search) + "&page=1&status=" + encodeURIComponent(status);
  const [data, setData] = useState<WholesalePageResult<T> | null>(
    () => initialData ?? getCachedWholesale<WholesalePageResult<T>>(initialQueryPath),
  );
  const [loading, setLoading] = useState(() => !initialData && getCachedWholesale(initialQueryPath) === null);
  const firstLoad = useRef(true);
  const [error, setError] = useState("");
  useEffect(() => {
    setPage(1);
  }, [search, status]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setError("");
      try {
        const result = await wholesaleGet<WholesalePageResult<T>>(
          path +
            "?search=" +
            encodeURIComponent(search) +
            "&page=" +
            page +
            "&status=" +
            encodeURIComponent(status),
        );
        if (active) setData(result);
      } catch (failure) {
        if (active) setError(safeError(failure));
      } finally {
        if (active) setLoading(false);
      }
    };
    const reqPath = path + "?search=" + encodeURIComponent(search) + "&page=" + page + "&status=" + encodeURIComponent(status);
    const cached = getCachedWholesale<WholesalePageResult<T>>(reqPath);
    if (cached) setData(cached);
    const seeded = (firstLoad.current && initialData) || cached !== null;
    firstLoad.current = false;
    if (!seeded) setLoading(true);
    const timer = window.setTimeout(load, search ? 150 : 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [path, search, page, status]);
  return { page, setPage, data, loading, error };
}

function Pagination({
  page,
  total,
  loading,
  change,
}: {
  page: number;
  total: number;
  loading: boolean;
  change: (page: number) => void;
}) {
  if (total <= 50) return null;
  return (
    <div className="wholesale-pagination">
      <button
        className="button soft"
        disabled={loading || page === 1}
        onClick={() => change(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {Math.ceil(total / 50)}
      </span>
      <button
        className="button soft"
        disabled={loading || page * 50 >= total}
        onClick={() => change(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

export type WholesaleSummaryKind =
  "pending" | "deliveries" | "outstanding" | "overdue";
export type WholesaleSummaryRow = {
  id: string;
  orderId?: string;
  orderNumber: string;
  clientName: string;
  status: string;
  total?: string;
  balance?: string;
  dueDate?: string;
  date?: string;
  notes?: string | null;
};
const summaries = {
  pending: {
    title: "Pending orders",
    description: "Wholesale orders awaiting delivery.",
    path: "/pending-orders",
    status: "",
    icon: ClipboardList,
  },
  deliveries: {
    title: "Deliveries",
    description: "Delivery schedules, dispatch status and delivery history.",
    path: "/deliveries",
    status: "active",
    icon: Truck,
  },
  outstanding: {
    title: "Outstanding accounts",
    description: "Client accounts with an unpaid balance.",
    path: "/accounts-receivable",
    status: "outstanding",
    icon: Wallet,
  },
  overdue: {
    title: "Overdue accounts",
    description: "Unpaid client accounts past their payment due date.",
    path: "/accounts-receivable",
    status: "overdue",
    icon: AlertTriangle,
  },
};
export function wholesaleSummaryPath(kind: WholesaleSummaryKind) {
  const summary = summaries[kind];
  return summary.path + "?status=" + summary.status;
}

export function WholesaleSummaryModal({
  kind,
  initialData,
  busy,
  close,
  role,
  mutate,
  error,
  retry,
  viewAccount,
}: {
  kind: WholesaleSummaryKind;
  initialData: WholesalePageResult<WholesaleSummaryRow>;
  busy: boolean;
  close: () => void;
  role: string;
  mutate: (path: string, method: string, body: unknown) => void;
  error: string;
  retry?: () => void;
  viewAccount: (id: string) => void;
}) {
  const preview = useModalTableStandard();
  const [selectedOrder, setSelectedOrder] = useState<
    (WholesaleOrderDetail & { order: WholesaleOrder }) | null
  >(null);
  const [receipt, setReceipt] = useState<DeliveryReceipt | null>(null);
  const [opening, setOpening] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [openError, setOpenError] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef({ body: 0, table: 0, orderId: "" });
  async function reviewOrder(id: string) {
    setOpening(true);
    setOpenError("");
    const content = contentRef.current;
    listScroll.current = {
      body: content?.closest(".wholesale-dialog-body")?.scrollTop ?? 0,
      table: content?.querySelector(".wholesale-summary-table")?.scrollTop ?? 0,
      orderId: id,
    };
    try {
      setSelectedOrder(
        await wholesaleGet<WholesaleOrderDetail & { order: WholesaleOrder }>(
          "/orders/" + id,
        ),
      );
    } catch (failure) {
      setOpenError(safeError(failure));
    } finally {
      setOpening(false);
    }
  }
  useLayoutEffect(() => {
    const content = contentRef.current;
    const body = content?.closest(".wholesale-dialog-body");
    if (body) body.scrollTop = selectedOrder ? 0 : listScroll.current.body;
    if (!selectedOrder) {
      const table = content?.querySelector(".wholesale-summary-table");
      if (table) table.scrollTop = listScroll.current.table;
      content
        ?.querySelector<HTMLButtonElement>(
          '[data-order-id="' + listScroll.current.orderId + '"]',
        )
        ?.focus({ preventScroll: true });
    } else {
      body
        ?.closest(".wholesale-dialog")
        ?.querySelector<HTMLButtonElement>('[aria-label="Back"]')
        ?.focus({ preventScroll: true });
    }
  }, [selectedOrder, receipt]);
  const summary = summaries[kind];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(summary.status);
  const [previewPage, setPreviewPage] = useState(1);
  const list = useWorkspaceList<WholesaleSummaryRow>(
    summary.path,
    search,
    status,
    initialData,
  );
  const Icon = summary.icon;
  const deliveries = kind === "deliveries";
  const accounts = kind === "outstanding" || kind === "overdue";
  const columns = deliveries || accounts ? 5 : 4;
  useEffect(() => { if (preview) setPreviewPage(1); }, [search, status, preview]);
  useEffect(() => {
    if (preview) list.setPage(Math.ceil(previewPage / 5));
  }, [previewPage, preview]);
  const previewBlockPending = Boolean(preview && list.data?.page !== Math.ceil(previewPage / 5));
  const visibleRows = preview ? list.data?.items.slice(((previewPage - 1) % 5) * 10, ((previewPage - 1) % 5 + 1) * 10) : list.data?.items;
  return (
    <WholesaleDialog
      title={
        receipt
          ? "Delivery receipt details"
          : selectedOrder
            ? "Wholesale order"
            : summary.title +
              " (" +
              (list.data?.total ?? initialData.total) +
              ")"
      }
      titleIcon={!selectedOrder ? <Icon size={18} /> : undefined}
      description={
        receipt
          ? receipt.receiptNumber
          : selectedOrder
            ? selectedOrder.order.orderNumber +
              " \u00b7 " +
              selectedOrder.order.clientName
            : summary.description
      }
      busy={busy || opening || printing}
      close={close}
      back={
        receipt
          ? () => setReceipt(null)
          : selectedOrder
            ? () => setSelectedOrder(null)
            : undefined
      }
      className="wholesale-summary-dialog"
    >
      <div ref={contentRef}>
        {openError && (
          <div className="inline-error" role="alert">
            {openError}
          </div>
        )}
        {receipt ? (
          <DeliveryReceiptView
            receipt={receipt}
            close={() => setReceipt(null)}
            embedded
            onBusyChange={setPrinting}
          />
        ) : selectedOrder ? (
          <WholesaleOrderDetails
            order={selectedOrder.order}
            initialDetail={selectedOrder}
            role={role}
            busy={busy}
            error={error}
            retry={retry}
            close={close}
            mutate={mutate}
            embedded
            viewReceipt={setReceipt}
          />
        ) : (
          <>
            <div className="wholesale-summary-controls">
              <div className="search-wrap wholesale-summary-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  aria-label={"Search " + summary.title.toLowerCase()}
                  placeholder="Search order or client..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              {deliveries && (
                <select
                  aria-label="Delivery status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="active">Active deliveries</option>
                  <option value="all">All deliveries</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="InTransit">In transit</option>
                  <option value="Completed">Completed</option>
                  <option value="Failed">Failed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              )}
            </div>
            {list.error && (
              <div className="inline-error" role="alert">
                {list.error}
              </div>
            )}
            <ModalTableFrame>
            <div className="wholesale-summary-table" role={preview ? "region" : undefined} aria-label={preview ? "Summary records, scroll horizontally for more columns" : undefined} tabIndex={preview ? 0 : undefined}>
              <table className="data-table" data-modal-table={preview ? "summary" : undefined}>
                <thead>
                  <tr>
                    <th>Order / client</th>
                    <th>
                      {deliveries
                        ? "Scheduled date"
                        : accounts
                          ? "Balance"
                          : "Total"}
                    </th>
                    {accounts && <th>Due date</th>}
                    <th>Status</th>
                    {deliveries && <th>Notes</th>}
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.loading || previewBlockPending ? (
                    <tr>
                      <td colSpan={columns}>
                        <LoadingState label="Loading records..." />
                      </td>
                    </tr>
                  ) : (
                    !list.error &&
                    visibleRows?.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Order / client">
                          <strong>{row.orderNumber}</strong>
                          <span className="muted wholesale-summary-client">
                            <ModalTableValue value={row.clientName} />
                          </span>
                        </td>
                        <td
                          data-label={
                            deliveries
                              ? "Scheduled date"
                              : accounts
                                ? "Balance"
                                : "Total"
                          }
                        >
                          {deliveries
                            ? row.date
                            : accounts
                              ? row.balance
                                ? wholesalePeso(row.balance)
                                : "—"
                              : row.total
                                ? wholesalePeso(row.total)
                                : "—"}
                        </td>
                        {accounts && (
                          <td data-label="Due date">{row.dueDate}</td>
                        )}
                        <td data-label="Status">
                          <span
                            className={
                              "pill " +
                              (row.status === "Completed" ||
                              row.status === "Paid"
                                ? "success"
                                : row.status === "Failed" ||
                                    row.status === "Overdue"
                                  ? "danger"
                                  : "neutral")
                            }
                          >
                            {row.status === "Pending"
                              ? "Draft"
                              : row.status === "InTransit"
                                ? "In transit"
                                : row.status}
                          </span>
                        </td>
                        {deliveries && (
                          <td data-label="Notes"><ModalTableValue value={row.notes || "—"} /></td>
                        )}
                        <td data-label="Action" className="table-action-cell">
                          <div className="table-actions">
                            <ModalTableHint value={accounts ? "View account" : "Review order"}>
                            <button
                              className="button soft table-action-btn"
                              disabled={busy || opening}
                              aria-label={accounts ? "View account" : "Review order"}

                              data-order-id={
                                accounts ? undefined : (row.orderId ?? row.id)
                              }
                              onClick={() =>
                                accounts
                                  ? viewAccount(row.id)
                                  : reviewOrder(row.orderId ?? row.id)
                              }
                            >
                              <Eye size={13} />
                            </button>
                            </ModalTableHint>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                  {!list.loading && !list.error && !list.data?.items.length && (
                    <tr>
                      <TableEmptyState colSpan={columns}>
                        {search
                          ? "No matching records."
                          : deliveries
                            ? "No deliveries found."
                            : accounts
                              ? "No accounts found."
                              : "No orders awaiting delivery."}
                      </TableEmptyState>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </ModalTableFrame>
            {preview ? <ModalTableFooter><ModalTablePager page={previewPage} total={list.data?.total ?? 0} loading={list.loading || previewBlockPending} change={setPreviewPage} label="Deliveries" /></ModalTableFooter> : <Pagination
              page={list.page}
              total={list.data?.total ?? 0}
              loading={list.loading}
              change={list.setPage}
            />}
          </>
        )}
      </div>
    </WholesaleDialog>
  );
}
