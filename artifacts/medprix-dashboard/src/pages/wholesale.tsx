import { AppTooltip } from "@/components/ui/tooltip";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import {
  WholesaleSummaryModal,
  wholesaleSummaryPath,
  type WholesaleSummaryKind,
  type WholesaleSummaryRow,
} from "@/components/wholesale-workspace-tables";
import { WholesaleReceivables } from "@/components/wholesale-receivables";
import { Summary } from "@/components/custom-ui/summary-card";
import { LoadingState } from "@/components/custom-ui/loading-state";
import { WholesaleDeliveryReceipts } from "@/components/wholesale-delivery-receipts";
import { WholesaleOrderDetails } from "@/components/wholesale-order-details";
import { useEffect, useState } from "react";
import { Eye, Pencil, Plus, Search } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { WholesaleOrderEditor } from "@/components/wholesale-order-editor";
import { safeError } from "@/lib/feedback";
import {
  wholesaleGet,
  wholesaleWrite,
  getCachedWholesale,
  wholesalePeso,
  type DeliveryReceiptSummary,
  type WholesaleClient,
  type WholesaleOrder,
  type WholesaleProduct,
  type WholesaleRequest,
  type WholesaleLine,
  type WholesaleOverview,
  type WholesaleReceivableDetail,
  type WholesalePageResult,
  type WholesaleAccountFilter,
} from "@/lib/wholesale-api";
import type { ToastFn } from "@/lib/types";

type Dialog =
  | { kind: "client"; client?: WholesaleClient }
  | { kind: "price"; product: WholesaleProduct }
  | { kind: "order"; order: WholesaleOrder | null }
  | { kind: "details"; order: WholesaleOrder };

export default function WholesalePage({
  onToast,
  role,
}: {
  onToast: ToastFn;
  role: string;
}) {
  const storageKey =
    "medprix-wholesale-request:" +
    (localStorage.getItem("medprix-username") ?? "");
  const [clients, setClients] = useState<WholesaleClient[]>(() => getCachedWholesale<WholesaleClient[]>("/clients") ?? []);
  const [products, setProducts] = useState<WholesaleProduct[]>(() => getCachedWholesale<WholesaleProduct[]>("/catalog") ?? []);
  const [orders, setOrders] = useState<WholesaleOrder[]>(() => getCachedWholesale<WholesaleOrder[]>("/orders") ?? []);
  const [receipts, setReceipts] = useState<DeliveryReceiptSummary[]>(() => getCachedWholesale<DeliveryReceiptSummary[]>("/delivery-receipts") ?? []);
  const [overview, setOverview] = useState<WholesaleOverview | null>(() => getCachedWholesale<WholesaleOverview>("/overview"));
  const [overviewError, setOverviewError] = useState("");
  const [summary, setSummary] = useState<{
    kind: WholesaleSummaryKind;
    data: WholesalePageResult<WholesaleSummaryRow>;
  } | null>(null);
  const [openingSummary, setOpeningSummary] =
    useState<WholesaleSummaryKind | null>(null);
  const [summaryAccount, setSummaryAccount] =
    useState<WholesaleReceivableDetail | null>(null);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [accountStatus, setAccountStatus] =
    useState<WholesaleAccountFilter>("all");
  const [orderStatus, setOrderStatus] = useState("All statuses");
  const [vatFilter, setVatFilter] = useState("All VAT classifications");
  const [orderPage, setOrderPage] = useState(1);
  const [clientPage, setClientPage] = useState(1);
  const [pricePage, setPricePage] = useState(1);
  const [tab, setTab] = useState<
    "orders" | "clients" | "prices" | "receipts" | "accounts"
  >("orders");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState<WholesaleRequest | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  });

  async function load(background = false) {
    if (!background) setLoading(true);
    setError("");
    try {
      const [
        nextClients,
        nextProducts,
        nextOrders,
        nextReceipts,
        nextOverview,
      ] = await Promise.all([
        wholesaleGet<WholesaleClient[]>("/clients"),
        wholesaleGet<WholesaleProduct[]>("/catalog"),
        wholesaleGet<WholesaleOrder[]>("/orders"),
        wholesaleGet<DeliveryReceiptSummary[]>("/delivery-receipts"),
        wholesaleGet<WholesaleOverview>("/overview"),
      ]);
      setOverview(nextOverview);
      setOverviewError("");
      setClients(nextClients);
      setProducts(nextProducts);
      setOrders(nextOrders);
      setReceipts(nextReceipts);
      setReady(true);
    } catch (failure) {
      if (!background) setReady(false);
      setOverview(null);
      setError(safeError(failure));
    } finally {
      if (!background) setLoading(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, []);

  async function refreshOverview() {
    try {
      setOverview(await wholesaleGet<WholesaleOverview>("/overview"));
      setOverviewError("");
    } catch (failure) {
      setOverview(null);
      setOverviewError(safeError(failure));
    }
  }
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  async function openSummary(kind: WholesaleSummaryKind) {
    setOpeningSummary(kind);
    setError("");
    try {
      const data = await wholesaleGet<WholesalePageResult<WholesaleSummaryRow>>(
        wholesaleSummaryPath(kind),
      );
      setSummary({ kind, data });
    } catch (failure) {
      setError(safeError(failure));
    } finally {
      setOpeningSummary(null);
    }
  }
  async function viewSummaryAccount(id: string) {
    setOpeningAccount(true);
    try {
      const detail = await wholesaleGet<WholesaleReceivableDetail>(
        "/accounts-receivable/" + id,
      );
      setSummary(null);
      setSummaryAccount(detail);
    } catch (failure) {
      setError(safeError(failure));
    } finally {
      setOpeningAccount(false);
    }
  }
  async function submit(request: WholesaleRequest) {
    setBusy(true);
    setFormError("");
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      await wholesaleWrite(request);
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setDialog(null);
      setSummary(null);
      onToast("Wholesale record saved.");
      await load();
    } catch (failure) {
      const definitive = (failure as { definitive?: boolean }).definitive;
      if (definitive) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
      }
      const message = safeError(failure);
      setFormError(message);
      if (!dialog) setError(message);
    } finally {
      setBusy(false);
    }
  }
  function mutate(path: string, method: string, body: unknown) {
    void submit({ key: crypto.randomUUID(), path, method, body });
  }
  function open(next: Dialog) {
    if (
      next.kind === "order" &&
      next.order &&
      next.order.status !== "Pending"
    ) {
      onToast({
        message:
          next.order.status === "Confirmed"
            ? "Confirmed orders cannot be edited. Use Review order to cancel it and release stock, then create a new draft."
            : "This order can no longer be edited. Use Review order to view its saved details.",
        variant: "warning",
      });
      return;
    }
    setFormError("");
    setDialog(next);
  }
  function saveDraft(draft: { clientId: string; lines: WholesaleLine[] }) {
    const order = dialog?.kind === "order" ? dialog.order : null;
    mutate(
      order ? "/orders/" + order.id : "/orders",
      order ? "PUT" : "POST",
      order ? { revision: order.revision, draft } : draft,
    );
  }
  const locked =
    busy || pending !== null || openingAccount || openingSummary !== null;
  const query = search.toLocaleLowerCase();
  const visibleOrders = orders.filter((order) => {
    const displayStatus = order.status === "Pending" ? "Draft" : order.status;
    const matchesStatus =
      orderStatus === "All statuses" ||
      order.status === orderStatus ||
      displayStatus === orderStatus;
    const matchesQuery = (order.orderNumber + " " + order.clientName)
      .toLocaleLowerCase()
      .includes(query);
    return matchesStatus && matchesQuery;
  });
  const visibleClients = clients.filter((client) =>
    (client.name + " " + (client.address ?? ""))
      .toLocaleLowerCase()
      .includes(query),
  );
  const visibleProducts = products.filter((product) => {
    const vatLabel =
      product.isVatExempt === null
        ? "Needs classification"
        : product.isVatExempt
          ? "Exempt"
          : "VATable";
    const matchesVat =
      vatFilter === "All VAT classifications" || vatLabel === vatFilter;
    const matchesQuery = (product.name + " " + product.sku)
      .toLocaleLowerCase()
      .includes(query);
    return matchesVat && matchesQuery;
  });

  const WHOLESALE_PAGE_SIZE = 15;
  const totalOrderPages = Math.max(1, Math.ceil(visibleOrders.length / WHOLESALE_PAGE_SIZE));
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const paginatedOrders = visibleOrders.slice(
    (safeOrderPage - 1) * WHOLESALE_PAGE_SIZE,
    safeOrderPage * WHOLESALE_PAGE_SIZE,
  );

  const totalClientPages = Math.max(1, Math.ceil(visibleClients.length / WHOLESALE_PAGE_SIZE));
  const safeClientPage = Math.min(clientPage, totalClientPages);
  const paginatedClients = visibleClients.slice(
    (safeClientPage - 1) * WHOLESALE_PAGE_SIZE,
    safeClientPage * WHOLESALE_PAGE_SIZE,
  );

  const totalPricePages = Math.max(1, Math.ceil(visibleProducts.length / WHOLESALE_PAGE_SIZE));
  const safePricePage = Math.min(pricePage, totalPricePages);
  const paginatedProducts = visibleProducts.slice(
    (safePricePage - 1) * WHOLESALE_PAGE_SIZE,
    safePricePage * WHOLESALE_PAGE_SIZE,
  );

  const section = {
    orders: {
      title: "Wholesale orders",
      description: "Drafts, agreed prices and delivery status",
      placeholder: "Search order or client",
    },
    clients: {
      title: "Wholesale clients",
      description: "Client details and delivery addresses",
      placeholder: "Search client or address",
    },
    prices: {
      title: "Wholesale prices",
      description:
        "VAT-inclusive prices and physical, reserved and available stock",
      placeholder: "Search product or SKU",
    },
    accounts: {
      title: "Accounts receivable",
      description: "Delivered orders, client collections and payment history",
      placeholder: "Search order or client",
    },
    receipts: {
      title: "Delivery receipts",
      description: "View and reprint saved delivery receipts",
      placeholder: "Search receipt, order or client",
    },
  }[tab];

  return (
    <div className="wholesale-workspace">
      <PageHeading
        title="Wholesale"
        description="Clients, orders, deliveries and client collections."
        action={
          <button
            className="button primary-action"
            disabled={locked || !ready || loading || !clients.length}
            onClick={() => open({ kind: "order", order: null })}
          >
            <Plus size={14} /> New draft
          </button>
        }
      />
      {error && (
        <div role="alert" className="inline-error">
          {error}
          {!loading && (
            <button className="button soft" onClick={() => void load()}>
              Retry loading
            </button>
          )}
        </div>
      )}
      {pending && (
        <div className="inline-error" role="status">
          <span>
            A saved request needs confirmation. Retry it before starting another
            change.
          </span>
          <button
            className="button dark"
            disabled={busy}
            onClick={() => void submit(pending)}
          >
            Retry saved request
          </button>
        </div>
      )}
      <div
        className="summary-strip wholesale-summary-strip"
        aria-label="Wholesale summary"
        aria-busy={loading}
      >
        <Summary
          label="Pending Orders"
          value={overview ? String(overview.openOrders) : "—"}
          caption="Orders awaiting delivery"
          action={
            <button
              className="button soft wholesale-summary-action"
              disabled={locked || !overview}
              onClick={() => void openSummary("pending")}
            >
              {openingSummary === "pending" ? "Opening..." : "View"}
            </button>
          }
        />
        <Summary
          label="Deliveries"
          value={overview ? String(overview.activeDeliveries) : "—"}
          caption="Scheduled or in transit"
          action={
            <button
              className="button soft wholesale-summary-action"
              disabled={locked || !overview}
              onClick={() => void openSummary("deliveries")}
            >
              {openingSummary === "deliveries" ? "Opening..." : "View"}
            </button>
          }
        />
        <Summary
          label="Outstanding Balance"
          value={overview ? wholesalePeso(overview.outstanding) : "—"}
          caption="Unpaid client balances"
          action={
            <button
              className="button soft wholesale-summary-action"
              disabled={locked || !overview}
              onClick={() => void openSummary("outstanding")}
            >
              {openingSummary === "outstanding" ? "Opening..." : "View"}
            </button>
          }
        />
        <Summary
          label="Overdue Balance"
          value={overview ? wholesalePeso(overview.overdue) : "—"}
          caption={
            overview
              ? overview.overdueCount
                ? overview.overdueCount +
                  (overview.overdueCount === 1
                    ? " overdue account"
                    : " overdue accounts")
                : "No overdue accounts"
              : "Unavailable"
          }
          tone="warning"
          action={
            <button
              className="button soft wholesale-summary-action"
              disabled={locked || !overview}
              onClick={() => void openSummary("overdue")}
            >
              {openingSummary === "overdue" ? "Opening..." : "View"}
            </button>
          }
        />
      </div>
      {overviewError && (
        <div role="alert" className="inline-error">
          {overviewError}
        </div>
      )}
      {summary && (
        <WholesaleSummaryModal
          kind={summary.kind}
          initialData={summary.data}
          busy={busy || pending !== null || openingAccount}
          close={() => setSummary(null)}
          role={role}
          mutate={mutate}
          error={formError}
          retry={pending ? () => void submit(pending) : undefined}
          viewAccount={(id) => void viewSummaryAccount(id)}
        />
      )}
      {summaryAccount && (
        <WholesaleReceivables
          key={summaryAccount.id}
          search=""
          role={role}
          initialDetail={summaryAccount}
          detailsOnly
          onClose={() => setSummaryAccount(null)}
          onChanged={() => void refreshOverview()}
        />
      )}
      <div
        className="page-tabs"
        role="group"
        aria-label="Wholesale sections"
      >
        {(["orders", "clients", "prices", "receipts", "accounts"] as const).map(
          (item) => (
            <button
              key={item}
              className={"button " + (tab === item ? "dark" : "soft")}
              aria-pressed={tab === item}
              onClick={() => {
                setTab(item);
                setSearch("");
                setAccountStatus("all");
                setOrderStatus("All statuses");
                setVatFilter("All VAT classifications");
                setOrderPage(1);
                setClientPage(1);
                setPricePage(1);
              }}
            >
              {item === "orders"
                ? "Orders"
                : item === "clients"
                  ? "Clients"
                  : item === "prices"
                    ? "Wholesale prices"
                    : item === "receipts"
                      ? "Delivery receipts"
                      : "Receivables"}
            </button>
          ),
        )}
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div className="search-wrap">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search wholesale records"
              placeholder={section.placeholder}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOrderPage(1);
                setClientPage(1);
                setPricePage(1);
              }}
            />
          </div>
          <div className="table-tools-right">
            {tab === "orders" && (
              <select
                className="select"
                aria-label="Filter wholesale orders by status"
                value={orderStatus}
                onChange={(event) => {
                  setOrderStatus(event.target.value);
                  setOrderPage(1);
                }}
                data-testid="select-wholesale-order-status"
              >
                <option value="All statuses">All statuses</option>
                <option value="Draft">Draft</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            )}
            {tab === "prices" && (
              <select
                className="select"
                aria-label="Filter wholesale prices by VAT classification"
                value={vatFilter}
                onChange={(event) => {
                  setVatFilter(event.target.value);
                  setPricePage(1);
                }}
                data-testid="select-wholesale-vat-filter"
              >
                <option value="All VAT classifications">All VAT classifications</option>
                <option value="VATable">VATable</option>
                <option value="Exempt">Exempt</option>
                <option value="Needs classification">Needs classification</option>
              </select>
            )}
            {tab === "accounts" && (
              <select
                className="select"
                aria-label="Payment status"
                value={accountStatus}
                onChange={(event) =>
                  setAccountStatus(event.target.value as WholesaleAccountFilter)
                }
              >
                <option value="all">All statuses</option>
                <option value="outstanding">Outstanding</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
              </select>
            )}
            {tab === "clients" && (
              <button
                className="button primary-action"
                disabled={locked || !ready || loading}
                onClick={() => open({ kind: "client" })}
              >
                <Plus size={14} /> Add client
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <LoadingState label="Loading wholesale records…" />
        ) : (
          ready && (
            <>
              <div className="table-scroll">
                {tab === "accounts" && (
                  <WholesaleReceivables
                    search={search}
                    role={role}
                    status={accountStatus}
                    onChanged={() => void refreshOverview()}
                  />
                )}
                {tab === "receipts" && (
                  <WholesaleDeliveryReceipts
                    receipts={receipts}
                    search={search}
                    disabled={locked}
                  />
                )}
                {tab === "orders" && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Client</th>
                        <th>Total including VAT</th>
                        <th>Status</th>
                        <th className="table-action-head">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((order) => (
                        <tr key={order.id}>
                          <td>{order.orderNumber}</td>
                          <td>{order.clientName}</td>
                          <td>{wholesalePeso(order.total)}</td>
                          <td>
                            {order.status === "Pending"
                              ? "Draft"
                              : order.status}
                          </td>
                          <td className="table-action-cell">
                            <div className="table-actions">
                              <AppTooltip content={"Edit draft"}><button
                                className="button soft table-action-btn"
                                disabled={locked}
                                aria-label="Edit draft"

                                onClick={() => open({ kind: "order", order })}
                              >
                                <Pencil size={13} />
                              </button></AppTooltip>
                              <AppTooltip content={"Review order"}><button
                                className="button soft table-action-btn"
                                disabled={locked}
                                aria-label="Review order"

                                onClick={() => open({ kind: "details", order })}
                              >
                                <Eye size={13} />
                              </button></AppTooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!visibleOrders.length && (
                        <tr>
                          <TableEmptyState colSpan={5}>
                            {search
                              ? "No matching records."
                              : "No wholesale orders found."}
                          </TableEmptyState>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
                {tab === "clients" && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Address</th>
                        <th className="table-action-head">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedClients.map((client) => (
                        <tr key={client.id}>
                          <td>{client.name}</td>
                          <td>{client.address || "Not provided"}</td>
                          <td className="table-action-cell">
                            <div className="table-actions">
                              <AppTooltip content={"Edit client"}><button
                                className="button soft table-action-btn"
                                disabled={locked}
                                aria-label="Edit client"

                                onClick={() => open({ kind: "client", client })}
                              >
                                <Pencil size={13} />
                              </button></AppTooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!visibleClients.length && (
                        <tr>
                          <TableEmptyState colSpan={3}>
                            {search
                              ? "No matching records."
                              : "No wholesale clients found."}
                          </TableEmptyState>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
                {tab === "prices" && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product / SKU</th>
                        <th>Wholesale unit price</th>
                        <th>VAT classification</th>
                        <th>Physical</th>
                        <th>Reserved</th>
                        <th>Available</th>
                        {role === "Admin" && <th className="table-action-head">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProducts.map((product) => (
                        <tr key={product.id}>
                          <td>
                            {product.name}
                            <div className="muted">{product.sku}</div>
                          </td>
                          <td>{wholesalePeso(product.wholesalePrice)}</td>
                          <td>
                            {product.isVatExempt === null
                              ? "Needs classification"
                              : product.isVatExempt
                                ? "Exempt"
                                : "VATable"}
                          </td>
                          <td>{product.physicalStock}</td>
                          <td>{product.reservedStock}</td>
                          <td>{product.availableStock}</td>
                          {role === "Admin" && (
                            <td className="table-action-cell">
                              <div className="table-actions">
                                <AppTooltip content={"Set price"}><button
                                  className="button soft table-action-btn"
                                  disabled={locked}
                                  aria-label="Set price"

                                  onClick={() => open({ kind: "price", product })}
                                >
                                  <Pencil size={13} />
                                </button></AppTooltip>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {!visibleProducts.length && (
                        <tr>
                          <TableEmptyState colSpan={role === "Admin" ? 7 : 6}>
                            {search
                              ? "No matching records."
                              : "No wholesale products found."}
                          </TableEmptyState>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
              {tab === "orders" && (
                <div className="wholesale-pagination">
                  <span className="muted">
                    Page {safeOrderPage} of {totalOrderPages} ({visibleOrders.length} orders)
                  </span>
                  <button
                    type="button"
                    className="button soft"
                    disabled={safeOrderPage <= 1}
                    onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="button soft"
                    disabled={safeOrderPage >= totalOrderPages}
                    onClick={() => setOrderPage((p) => Math.min(totalOrderPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
              {tab === "clients" && (
                <div className="wholesale-pagination">
                  <span className="muted">
                    Page {safeClientPage} of {totalClientPages} ({visibleClients.length} clients)
                  </span>
                  <button
                    type="button"
                    className="button soft"
                    disabled={safeClientPage <= 1}
                    onClick={() => setClientPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="button soft"
                    disabled={safeClientPage >= totalClientPages}
                    onClick={() => setClientPage((p) => Math.min(totalClientPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
              {tab === "prices" && (
                <div className="wholesale-pagination">
                  <span className="muted">
                    Page {safePricePage} of {totalPricePages} ({visibleProducts.length} products)
                  </span>
                  <button
                    type="button"
                    className="button soft"
                    disabled={safePricePage <= 1}
                    onClick={() => setPricePage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="button soft"
                    disabled={safePricePage >= totalPricePages}
                    onClick={() => setPricePage((p) => Math.min(totalPricePages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )
        )}
      </section>
      {dialog?.kind === "order" && (
        <WholesaleOrderEditor
          order={dialog.order}
          clients={clients}
          products={products}
          busy={locked}
          error={formError}
          retry={pending && !busy ? () => void submit(pending) : undefined}
          close={() => setDialog(null)}
          save={saveDraft}
        />
      )}
      {dialog?.kind === "details" && (
        <WholesaleOrderDetails
          order={dialog.order}
          role={role}
          busy={locked}
          error={formError}
          retry={pending && !busy ? () => void submit(pending) : undefined}
          close={() => setDialog(null)}
          mutate={mutate}
        />
      )}
      {dialog && dialog.kind !== "order" && dialog.kind !== "details" && (
        <WholesaleDialog
          title={
            dialog.kind === "client"
              ? dialog.client
                ? "Edit wholesale client"
                : "Add wholesale client"
              : "Set wholesale price"
          }
          busy={locked}
          close={() => setDialog(null)}
          description={
            dialog.kind === "client"
              ? "Fields marked * are required. A delivery address is needed before confirmation."
              : "Wholesale unit prices include VAT where applicable."
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              if (dialog.kind === "client")
                mutate(
                  dialog.client ? "/clients/" + dialog.client.id : "/clients",
                  dialog.client ? "PUT" : "POST",
                  {
                    ...(dialog.client
                      ? {
                          expected: {
                            name: dialog.client.name,
                            address: dialog.client.address,
                          },
                        }
                      : {}),
                    name: data.get("name"),
                    address: data.get("address"),
                  },
                );
              else
                mutate("/products/" + dialog.product.id + "/price", "PUT", {
                  wholesalePrice: data.get("price") || null,
                  expectedPrice: dialog.product.wholesalePrice,
                });
            }}
          >
            <fieldset className="wholesale-fields" disabled={locked}>
              {dialog.kind === "client" ? (
                <>
                  <div className="field">
                    <label htmlFor={"wholesale-client-name"}>
                      Client name *
                    </label>
                    <input
                      id={"wholesale-client-name"}
                      name="name"
                      maxLength={255}
                      required
                      defaultValue={
                        dialog.kind === "client" ? dialog.client?.name : ""
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={"wholesale-client-address"}>
                      Delivery address (optional)
                    </label>
                    <textarea
                      id={"wholesale-client-address"}
                      name="address"
                      maxLength={2000}
                      defaultValue={
                        dialog.kind === "client"
                          ? (dialog.client?.address ?? "")
                          : ""
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <p>{dialog.product.name}</p>
                  <div className="field">
                    <label htmlFor={"wholesale-product-price"}>
                      Wholesale unit price (₱)
                    </label>
                    <input
                      id={"wholesale-product-price"}
                      name="price"
                      type="number"
                      min="0"
                      max="9999999999.99"
                      step="0.01"
                      defaultValue={dialog.product.wholesalePrice ?? ""}
                    />
                  </div>
                  <p className="field-hint">
                    Leave blank to mark the price unconfigured. Retail price is
                    unchanged.
                  </p>
                </>
              )}
              <div className="wholesale-actions">
                <button className="button dark" type="submit">
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </fieldset>
            {formError && (
              <div className="inline-error" role="alert">
                {formError}
              </div>
            )}
            {pending && !busy && (
              <button
                type="button"
                className="button dark"
                onClick={() => void submit(pending)}
              >
                Retry saved request
              </button>
            )}
          </form>
        </WholesaleDialog>
      )}
    </div>
  );
}
