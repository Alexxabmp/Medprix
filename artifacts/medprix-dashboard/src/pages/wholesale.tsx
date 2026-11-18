import { SelectField } from "@/components/custom-ui/select-field";
import {
  wholesaleClientContactsSchema,
  cleanWholesalePhoneInput,
} from "@workspace/api-zod";
import {
  PageTableValue,
  usePageTableStandard,
} from "@/components/page-table-context";
import { AppTooltip } from "@/components/ui/tooltip";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import {
  WholesaleSummaryModal,
  wholesaleSummaryPath,
  type WholesaleSummaryKind,
  type WholesaleSummaryRow,
} from "@/components/wholesale-workspace-tables";
import { WholesaleReceivables } from "@/components/wholesale-receivables";
import { SourceSummary as Summary, SourceTableBody, SourceFeedback, SourceRefreshButton, SourceProgress, SourceText, type SourceState } from "@/components/custom-ui/source-state";
import { WholesaleDeliveryReceipts } from "@/components/wholesale-delivery-receipts";
import { WholesaleOrderDetails } from "@/components/wholesale-order-details";
import {
  WholesaleDeliveries,
  type DeliveryQueueStatus,
} from "@/components/wholesale-deliveries";
import { WholesaleDeliveryPanel } from "@/components/wholesale-delivery-panel";
import { WholesaleRequestFeedback } from "@/components/wholesale-request-feedback";
import { DeliveryReceiptView } from "@/components/delivery-receipt-view";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, Pencil, Plus, Search, Truck } from "lucide-react";
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
  type WholesaleOrderDetail,
  type DeliveryReceipt,
  type WholesaleProduct,
  type WholesaleRequest,
  type WholesaleLine,
  type WholesaleOverview,
  type WholesalePageResult,
  type WholesaleAccountFilter,
} from "@/lib/wholesale-api";
import type { ToastFn } from "@/lib/types";

type Dialog =
  | { kind: "client"; client?: WholesaleClient }
  | { kind: "price"; product: WholesaleProduct }
  | { kind: "order"; order: WholesaleOrder | null }
  | { kind: "delivery"; order: WholesaleOrder; detail: WholesaleOrderDetail }
  | { kind: "details"; order: WholesaleOrder; confirm?: boolean };

export default function WholesalePage({
  onToast,
  role,
}: {
  onToast: ToastFn;
  role: string;
}) {
  const pageTableStandard = usePageTableStandard();
  const [viewClient, setViewClient] = useState<WholesaleClient | null>(null);
  const storageKey =
    "medprix-wholesale-request:" +
    (localStorage.getItem("medprix-username") ?? "");
  const [clients, setClients] = useState<WholesaleClient[]>(
    () => getCachedWholesale<WholesaleClient[]>("/clients") ?? [],
  );
  const [products, setProducts] = useState<WholesaleProduct[]>(
    () => getCachedWholesale<WholesaleProduct[]>("/catalog") ?? [],
  );
  const [orders, setOrders] = useState<WholesaleOrder[]>(
    () => getCachedWholesale<WholesaleOrder[]>("/orders") ?? [],
  );
  const [receipts, setReceipts] = useState<DeliveryReceiptSummary[]>(
    () =>
      getCachedWholesale<DeliveryReceiptSummary[]>("/delivery-receipts") ?? [],
  );
  const [overview, setOverview] = useState<WholesaleOverview | null>(() =>
    getCachedWholesale<WholesaleOverview>("/overview"),
  );
  const [overviewError, setOverviewError] = useState("");
  const [summary, setSummary] = useState<{
    kind: WholesaleSummaryKind;
    data: WholesalePageResult<WholesaleSummaryRow>;
  } | null>(null);
  const [openingSummary, setOpeningSummary] =
    useState<WholesaleSummaryKind | null>(null);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [accountStatus, setAccountStatus] =
    useState<WholesaleAccountFilter>("all");
  const [orderStatus, setOrderStatus] = useState("All statuses");
  const [deliveryStatus, setDeliveryStatus] =
    useState<DeliveryQueueStatus>("all");
  const [vatFilter, setVatFilter] = useState("All VAT classifications");
  const [orderPage, setOrderPage] = useState(1);
  const [clientPage, setClientPage] = useState(1);
  const [pricePage, setPricePage] = useState(1);
  const [tab, setTab] = useState<
    "orders" | "deliveries" | "clients" | "prices" | "receipts" | "accounts"
  >("orders");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [search, setSearch] = useState("");
  type Resource = "clients" | "catalog" | "orders" | "receipts" | "overview";
  const [sources, setSources] = useState<Record<Resource, SourceState>>(() => Object.fromEntries(
    [["clients", "/clients"], ["catalog", "/catalog"], ["orders", "/orders"], ["receipts", "/delivery-receipts"], ["overview", "/overview"]]
      .map(([key, path]) => [key, { hasData: getCachedWholesale(path) !== null, pending: true, error: "" }]),
  ) as Record<Resource, SourceState>);
  const resourceRequests = useRef<Record<Resource, number>>({ clients: 0, catalog: 0, orders: 0, receipts: 0, overview: 0 });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [deliveryVersion, setDeliveryVersion] = useState(0);
  const [deliveryReceipt, setDeliveryReceipt] =
    useState<DeliveryReceipt | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState<WholesaleRequest | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  });

  async function load(_background = false, only?: Resource, force = false) {
    async function read<T>(key: Resource, path: string, receive: (data: T) => void) {
      resourceRequests.current[key]++;
      setSources(current => ({ ...current, [key]: { ...current[key], pending: true } }));
      try {
        const result = await wholesaleGet<T>(path, force);
        receive(result);
        setSources(current => ({ ...current, [key]: { hasData: true, pending: resourceRequests.current[key] > 1, error: "" } }));
      } catch (failure) {
        setSources(current => ({ ...current, [key]: { ...current[key], pending: resourceRequests.current[key] > 1, error: safeError(failure) } }));
      } finally { resourceRequests.current[key]--; }
    }
    await Promise.all([
      ...(!only || only === "clients" ? [read<WholesaleClient[]>("clients", "/clients", setClients)] : []),
      ...(!only || only === "catalog" ? [read<WholesaleProduct[]>("catalog", "/catalog", setProducts)] : []),
      ...(!only || only === "orders" ? [read<WholesaleOrder[]>("orders", "/orders", setOrders)] : []),
      ...(!only || only === "receipts" ? [read<DeliveryReceiptSummary[]>("receipts", "/delivery-receipts", setReceipts)] : []),
      ...(!only || only === "overview" ? [read<WholesaleOverview>("overview", "/overview", setOverview)] : []),
    ]);
  }
  useEffect(() => {
    void load(true);
  }, []);

  async function refreshOverview() { await load(true, "overview"); }
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(refresh, 60000);
    return () => {
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
  async function submit(request: WholesaleRequest) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError("");
    let recorded = false;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      const result = await wholesaleWrite(request);
      recorded = true;
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setDialog(null);
      setSummary(null);
      onToast("Wholesale record saved.");
      setDeliveryVersion((version) => version + 1);
      const orderAction = request.path.match(
        /^\/orders\/([^/]+)\/(confirm|schedule|delivery-status|deliver)$/,
      );
      if (orderAction) {
        const next = await wholesaleGet<
          WholesaleOrderDetail & { order: WholesaleOrder }
        >("/orders/" + orderAction[1], true);
        setTab("deliveries");
        setSearch("");
        setDialog({ kind: "delivery", order: next.order, detail: next });
      } else if (/^\/orders(?:\/[^/]+)?$/.test(request.path) && result.id) {
        const next = await wholesaleGet<
          WholesaleOrderDetail & { order: WholesaleOrder }
        >("/orders/" + result.id, true);
        setTab("orders");
        setDialog({ kind: "details", order: next.order, confirm: true });
      }
      await load();
    } catch (failure) {
      const definitive = (failure as { definitive?: boolean }).definitive;
      if (definitive) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
      }
      const message = recorded
        ? "The change was saved, but refreshed records could not be loaded. Refresh the page to view the saved result."
        : safeError(failure);
      setFormError(message);
      if (recorded || !dialog) setError(message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function mutate(path: string, method: string, body: unknown) {
    if (pending || inFlight.current) return;
    void submit({ key: crypto.randomUUID(), path, method, body });
  }
  async function openDelivery(id: string) {
    setOpeningAccount(true);
    setFormError("");
    try {
      const detail = await wholesaleGet<
        WholesaleOrderDetail & { order: WholesaleOrder }
      >("/orders/" + id, true);
      setDialog({ kind: "delivery", order: detail.order, detail });
    } catch (failure) {
      setError(safeError(failure));
    } finally {
      setOpeningAccount(false);
    }
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
    if (next.kind === "price") setPriceInput(next.product.wholesalePrice ?? "");
    setDialog(next);
  }
  function saveDraft(draft: {
    clientId: string;
    paymentPlan: NonNullable<WholesaleOrder["paymentPlan"]>;
    lines: WholesaleLine[];
  }) {
    const order = dialog?.kind === "order" ? dialog.order : null;
    mutate(
      order ? "/orders/" + order.id : "/orders",
      order ? "PUT" : "POST",
      order ? { revision: order.revision, draft } : draft,
    );
  }
  const locked =
    busy || pending !== null || openingAccount || openingSummary !== null;
  const navigating = busy || openingAccount || openingSummary !== null;
  const query = search.toLocaleLowerCase();
  const visibleOrders = useMemo(() => tab === "orders" ? orders.filter((order) => {
    const displayStatus = order.status === "Pending" ? "Draft" : order.status;
    const matchesStatus =
      orderStatus === "All statuses" ||
      order.status === orderStatus ||
      displayStatus === orderStatus;
    const matchesQuery = (order.orderNumber + " " + order.clientName)
      .toLocaleLowerCase()
      .includes(query);
    return matchesStatus && matchesQuery;
  }) : [], [tab, orders, orderStatus, query]);
  const visibleClients = useMemo(() => tab === "clients" ? clients.filter((client) =>
    (client.name + " " + (client.address ?? ""))
      .toLocaleLowerCase()
      .includes(query),
  ) : [], [tab, clients, query]);
  const visibleProducts = useMemo(() => tab === "prices" ? products.filter((product) => {
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
  }) : [], [tab, products, vatFilter, query]);

  const WHOLESALE_PAGE_SIZE = 15;
  const totalOrderPages = Math.max(
    1,
    Math.ceil(visibleOrders.length / WHOLESALE_PAGE_SIZE),
  );
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const paginatedOrders = visibleOrders.slice(
    (safeOrderPage - 1) * WHOLESALE_PAGE_SIZE,
    safeOrderPage * WHOLESALE_PAGE_SIZE,
  );

  const totalClientPages = Math.max(
    1,
    Math.ceil(visibleClients.length / WHOLESALE_PAGE_SIZE),
  );
  const safeClientPage = Math.min(clientPage, totalClientPages);
  const paginatedClients = visibleClients.slice(
    (safeClientPage - 1) * WHOLESALE_PAGE_SIZE,
    safeClientPage * WHOLESALE_PAGE_SIZE,
  );

  const totalPricePages = Math.max(
    1,
    Math.ceil(visibleProducts.length / WHOLESALE_PAGE_SIZE),
  );
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
    deliveries: {
      title: "Deliveries",
      description:
        "Schedule confirmed orders, dispatch goods and confirm client receipt",
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

  const activeResource: Resource | null = tab === "orders" ? "orders" : tab === "clients" ? "clients" : tab === "prices" ? "catalog" : tab === "receipts" ? "receipts" : null;
  const retryResource = (key: Resource) => { if (!resourceRequests.current[key]) void load(false, key, true); };
  return (
    <div className="wholesale-workspace">
      <PageHeading
        title="Wholesale"
        description="Clients, orders, deliveries and client collections."
      />
      {error && (
        <div role="alert" className="inline-error">
          {error}
          {!(Object.values(sources).some(source => source.pending)) && (
            <button className="button soft" onClick={() => void load()}>
              Retry loading
            </button>
          )}
        </div>
      )}
      <SourceFeedback status={sources.overview} label="wholesale summary" onRetry={() => retryResource("overview")} />
      {activeResource && <SourceFeedback status={sources[activeResource]} label="wholesale records" />}
      {pending && (
        <div className="inline-error" role="status">
          <span>
            The previous request needs confirmation. You can browse records or
            close a dialog. Retry the saved request before recording another
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
        aria-busy={sources.overview.pending}
      >
        <Summary status={sources.overview}
          label="Pending Orders"
          value={overview ? String(overview.openOrders) : "—"}
          caption="Orders awaiting delivery"
          action={
            <button
              className="button soft wholesale-summary-action"
              disabled={navigating || !overview}
              onClick={() => void openSummary("pending")}
            >
              {openingSummary === "pending" ? <SourceProgress label="Opening…" /> : "View"}
            </button>
          }
        />
        <Summary status={sources.overview}
          label="Deliveries"
          value={overview ? String(overview.activeDeliveries) : "—"}
          caption="Scheduled or in transit"
          action={
            <button
              className="button soft wholesale-summary-action"
              disabled={navigating || !overview}
              onClick={() => void openSummary("deliveries")}
            >
              {openingSummary === "deliveries" ? <SourceProgress label="Opening…" /> : "View"}
            </button>
          }
        />
        <Summary status={sources.overview}
          label="Outstanding Balance"
          value={overview ? wholesalePeso(overview.outstanding) : "—"}
          caption="Unpaid client balances"
          action={
            <button
              className="button soft wholesale-summary-action"
              disabled={navigating || !overview}
              onClick={() => void openSummary("outstanding")}
            >
              {openingSummary === "outstanding" ? <SourceProgress label="Opening…" /> : "View"}
            </button>
          }
        />
        <Summary status={sources.overview}
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
              disabled={navigating || !overview}
              onClick={() => void openSummary("overdue")}
            >
              {openingSummary === "overdue" ? <SourceProgress label="Opening…" /> : "View"}
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
          submitting={busy || openingAccount}
          close={() => setSummary(null)}
          role={role}
          mutate={mutate}
          error={formError}
          retry={pending ? () => void submit(pending) : undefined}
          onAccountChanged={() => void refreshOverview()}
        />
      )}
      <div className="page-tabs" role="group" aria-label="Wholesale sections">
        {(
          [
            "orders",
            "deliveries",
            "accounts",
            "clients",
            "prices",
            "receipts",
          ] as const
        ).map((item) => (
          <button
            key={item}
            className={"button " + (tab === item ? "dark" : "soft")}
            aria-pressed={tab === item}
            onClick={() => {
              setTab(item);
              setSearch("");
              setAccountStatus("all");
              setOrderStatus("All statuses");
              setDeliveryStatus("all");
              setVatFilter("All VAT classifications");
              setOrderPage(1);
              setClientPage(1);
              setPricePage(1);
            }}
          >
            {item === "orders"
              ? "Orders"
              : item === "deliveries"
                ? "Deliveries"
                : item === "clients"
                  ? "Clients"
                  : item === "prices"
                    ? "Wholesale prices"
                    : item === "receipts"
                      ? "Delivery receipts"
                      : "Receivables"}
          </button>
        ))}
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
            {activeResource && <SourceRefreshButton status={sources[activeResource]} label="wholesale records" onRefresh={() => retryResource(activeResource)} />}
            {tab === "deliveries" && (
              <SelectField
                className="select"
                aria-label="Delivery status"
                value={deliveryStatus}
                onChange={(event) =>
                  setDeliveryStatus(event.target.value as DeliveryQueueStatus)
                }
              >
                <option value="all">All deliveries</option>
                <option value="active">Awaiting delivery</option>
                <option value="Ready">Needs scheduling</option>
                <option value="Scheduled">Scheduled</option>
                <option value="InTransit">In transit</option>
                <option value="Completed">Delivered</option>
              </SelectField>
            )}
            {tab === "orders" && (
              <SelectField
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
              </SelectField>
            )}
            {tab === "prices" && (
              <SelectField
                className="select"
                aria-label="Filter wholesale prices by VAT classification"
                value={vatFilter}
                onChange={(event) => {
                  setVatFilter(event.target.value);
                  setPricePage(1);
                }}
                data-testid="select-wholesale-vat-filter"
              >
                <option value="All VAT classifications">
                  All VAT classifications
                </option>
                <option value="VATable">VATable</option>
                <option value="Exempt">Exempt</option>
                <option value="Needs classification">
                  Needs classification
                </option>
              </SelectField>
            )}
            {tab === "accounts" && (
              <SelectField
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
                <option value="deadline">Final deadline passed</option>
                <option value="paid">Paid</option>
              </SelectField>
            )}
            {tab === "orders" && (
              <button
                className="button primary-action"
                disabled={locked || !sources.clients.hasData || !sources.catalog.hasData || !clients.length}
                onClick={() => open({ kind: "order", order: null })}
              >
                <Plus size={14} /> New draft
              </button>
            )}
            {tab === "clients" && (
              <button
                className="button primary-action"
                disabled={locked}
                onClick={() => open({ kind: "client" })}
              >
                <Plus size={14} /> Add client
              </button>
            )}
          </div>
        </div>
        <>
              {tab === "deliveries" ? (
                <WholesaleDeliveries
                  key={deliveryVersion}
                  search={search}
                  status={deliveryStatus}
                  busy={navigating}
                  open={(id) => void openDelivery(id)}
                />
              ) : (
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
                      disabled={navigating}
                      source={sources.receipts}
                    />
                  )}
                  {tab === "orders" && (
                    <table
                      data-page-table="wholesale-orders"
                      className="data-table"
                    >
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Client</th>
                          <th>Total including VAT</th>
                          <th>Status</th>
                          <th className="table-action-head">Action</th>
                        </tr>
                      </thead>
                      <SourceTableBody status={sources.orders} label="Wholesale orders" colSpan={5}>
                        {paginatedOrders.map((order) => (
                          <tr key={order.id}>
                            <td>{order.orderNumber}</td>
                            <td>
                              <PageTableValue value={order.clientName} />
                            </td>
                            <td>{wholesalePeso(order.total)}</td>
                            <td>
                              {order.status === "Pending"
                                ? "Draft"
                                : order.status}
                            </td>
                            <td className="table-action-cell">
                              <div className="table-actions">
                                {pageTableStandard &&
                                  order.status === "Pending" && (
                                    <AppTooltip content="Confirm draft">
                                      <button
                                        type="button"
                                        className="button soft table-action-btn"
                                        disabled={locked}
                                        aria-label="Confirm draft"
                                        onClick={() =>
                                          open({
                                            kind: "details",
                                            order,
                                            confirm: true,
                                          })
                                        }
                                      >
                                        <Check size={13} aria-hidden="true" />
                                      </button>
                                    </AppTooltip>
                                  )}
                                {order.status === "Pending" && (
                                  <AppTooltip content={"Edit draft"}>
                                    <button
                                      className="button soft table-action-btn"
                                      disabled={locked}
                                      aria-label="Edit draft"

                                      onClick={() =>
                                        open({ kind: "order", order })
                                      }
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  </AppTooltip>
                                )}
                                {["Confirmed", "Processing"].includes(
                                  order.status,
                                ) && (
                                  <AppTooltip content="Manage delivery">
                                    <button
                                      className="button soft table-action-btn"
                                      aria-label="Manage delivery"
                                      disabled={navigating}
                                      onClick={() =>
                                        void openDelivery(order.id)
                                      }
                                    >
                                      <Truck size={13} />
                                    </button>
                                  </AppTooltip>
                                )}
                                <AppTooltip content={"Review order"}>
                                  <button
                                    className="button soft table-action-btn"
                                    disabled={navigating}
                                    aria-label="Review order"

                                    onClick={() =>
                                      open({ kind: "details", order })
                                    }
                                  >
                                    <Eye size={13} />
                                  </button>
                                </AppTooltip>
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
                      </SourceTableBody>
                    </table>
                  )}
                  {tab === "clients" && (
                    <table
                      data-page-table="wholesale-clients"
                      className="data-table"
                    >
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Address</th>
                          <th className="table-action-head">Action</th>
                        </tr>
                      </thead>
                      <SourceTableBody status={sources.clients} label="Wholesale clients" colSpan={3}>
                        {paginatedClients.map((client) => (
                          <tr key={client.id}>
                            <td>
                              <PageTableValue value={client.name} />
                            </td>
                            <td>{client.address || "Not provided"}</td>
                            <td className="table-action-cell">
                              <div className="table-actions">
                                <AppTooltip content={"Edit client"}>
                                  <button
                                    className="button soft table-action-btn"
                                    disabled={locked}
                                    aria-label="Edit client"

                                    onClick={() =>
                                      open({ kind: "client", client })
                                    }
                                  >
                                    <Pencil size={13} />
                                  </button>
                                </AppTooltip>
                                {pageTableStandard && (
                                  <AppTooltip content="View client">
                                    <button
                                      type="button"
                                      className="button soft table-action-btn"
                                      aria-label="View client"
                                      onClick={() => setViewClient(client)}
                                    >
                                      <Eye size={13} aria-hidden="true" />
                                    </button>
                                  </AppTooltip>
                                )}
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
                      </SourceTableBody>
                    </table>
                  )}
                  {tab === "prices" && (
                    <table
                      data-page-table="wholesale-prices"
                      className="data-table"
                    >
                      <thead>
                        <tr>
                          <th>Product / SKU</th>
                          <th>Wholesale unit price</th>
                          <th>VAT classification</th>
                          <th>Physical</th>
                          <th>Reserved</th>
                          <th>Available</th>
                          {role === "Admin" && (
                            <th className="table-action-head">Action</th>
                          )}
                        </tr>
                      </thead>
                      <SourceTableBody status={sources.catalog} label="Wholesale products" colSpan={role === "Admin" ? 7 : 6}>
                        {paginatedProducts.map((product) => (
                          <tr key={product.id}>
                            <td>
                              <PageTableValue value={product.name} />
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
                                  <AppTooltip content={"Set price"}>
                                    <button
                                      className="button soft table-action-btn"
                                      disabled={locked}
                                      aria-label="Set price"

                                      onClick={() =>
                                        open({ kind: "price", product })
                                      }
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  </AppTooltip>
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
                      </SourceTableBody>
                    </table>
                  )}
                </div>
              )}
              {tab === "orders" && (
                <div
                  className="table-pagination"
                  role="navigation"
                  aria-label="Wholesale orders pagination"
                >
                  <span className="muted"><SourceText status={sources.orders}>
                    Page {safeOrderPage} of {totalOrderPages} (
                    {visibleOrders.length} orders)
                  </SourceText></span>
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
                    onClick={() =>
                      setOrderPage((p) => Math.min(totalOrderPages, p + 1))
                    }
                  >
                    Next
                  </button>
                </div>
              )}
              {tab === "clients" && (
                <div
                  className="table-pagination"
                  role="navigation"
                  aria-label="Wholesale clients pagination"
                >
                  <span className="muted"><SourceText status={sources.clients}>
                    Page {safeClientPage} of {totalClientPages} (
                    {visibleClients.length} clients)
                  </SourceText></span>
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
                    onClick={() =>
                      setClientPage((p) => Math.min(totalClientPages, p + 1))
                    }
                  >
                    Next
                  </button>
                </div>
              )}
              {tab === "prices" && (
                <div
                  className="table-pagination"
                  role="navigation"
                  aria-label="Wholesale prices pagination"
                >
                  <span className="muted"><SourceText status={sources.catalog}>
                    Page {safePricePage} of {totalPricePages} (
                    {visibleProducts.length} products)
                  </SourceText></span>
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
                    onClick={() =>
                      setPricePage((p) => Math.min(totalPricePages, p + 1))
                    }
                  >
                    Next
                  </button>
                </div>
              )}
        </>
      </section>
      {pageTableStandard && viewClient && (
        <WholesaleDialog
          title="Client information"
          busy={false}
          close={() => setViewClient(null)}
        >
          <dl className="wholesale-detail-list wholesale-client-details">
            <div className="wholesale-client-wide">
              <dt>Client name</dt>
              <dd>{viewClient.name}</dd>
            </div>
            <div className="wholesale-client-wide">
              <dt>Delivery address</dt>
              <dd>{viewClient.address || "Not provided"}</dd>
            </div>
            <div>
              <dt>Contact person</dt>
              <dd>{viewClient.contactPerson || "Not provided"}</dd>
            </div>
            <div>
              <dt>Contact number</dt>
              <dd>{viewClient.contactNumber || "Not provided"}</dd>
            </div>
            <div className="wholesale-client-wide">
              <dt>Email</dt>
              <dd>{viewClient.email || "Not provided"}</dd>
            </div>
          </dl>
        </WholesaleDialog>
      )}
      {dialog?.kind === "order" && (
        <WholesaleOrderEditor
          order={dialog.order}
          clients={clients}
          products={products}
          busy={locked}
          submitting={busy}
          error={formError}
          retry={pending && !busy ? () => void submit(pending) : undefined}
          close={() => setDialog(null)}
          save={saveDraft}
        />
      )}
      {dialog?.kind === "details" && (
        <WholesaleOrderDetails
          key={dialog.order.id + ":" + dialog.order.revision}
          initialAction={dialog.confirm ? "confirm" : undefined}
          order={dialog.order}
          role={role}
          busy={locked}
          submitting={busy}
          error={formError}
          retry={pending && !busy ? () => void submit(pending) : undefined}
          close={() => setDialog(null)}
          mutate={mutate}
        />
      )}
      {dialog?.kind === "delivery" && (
        <WholesaleDialog
          variant="form"
          back={deliveryReceipt ? () => setDeliveryReceipt(null) : undefined}
          title={
            deliveryReceipt
              ? "Delivery receipt details"
              : "Delivery · " + dialog.order.orderNumber
          }
          description={
            deliveryReceipt
              ? deliveryReceipt.receiptNumber
              : dialog.order.orderNumber
          }
          busy={busy || printingReceipt}
          close={() => {
            setDialog(null);
            setDeliveryReceipt(null);
          }}
        >
          {deliveryReceipt ? (
            <DeliveryReceiptView
              receipt={deliveryReceipt}
              onBusyChange={setPrintingReceipt}
              close={() => {
                setDialog(null);
                setDeliveryReceipt(null);
              }}
              embedded
            />
          ) : (
            <>
              <WholesaleRequestFeedback
                error={formError}
                pending={pending}
                busy={busy}
                retry={() => pending && void submit(pending)}
              />
              <WholesaleDeliveryPanel
                key={dialog.order.id + ":" + dialog.order.revision}
                order={dialog.order}
                detail={dialog.detail}
                busy={locked}
                mutate={mutate}
                initialAction={
                  dialog.detail.attempts.some(
                    (attempt) => attempt.status === "InTransit",
                  )
                    ? "deliver"
                    : dialog.detail.attempts.some(
                          (attempt) => attempt.status === "Scheduled",
                        )
                      ? "dispatch"
                      : dialog.detail.receipt
                        ? undefined
                        : "schedule"
                }
                viewReceipt={() => {
                  if (dialog.detail.receipt) {
                    setDeliveryReceipt(dialog.detail.receipt.snapshot);
                  }
                }}
              />
            </>
          )}
        </WholesaleDialog>
      )}
      {deliveryReceipt && dialog?.kind !== "delivery" && (
        <DeliveryReceiptView
          receipt={deliveryReceipt}
          close={() => setDeliveryReceipt(null)}
        />
      )}
      {dialog &&
        dialog.kind !== "order" &&
        dialog.kind !== "details" &&
        dialog.kind !== "delivery" && (
          <WholesaleDialog
            footer={
              <button
                className="button dark"
                type="submit"
                form="wholesale-maintenance-form"
                disabled={locked}
              >
                {busy
                  ? "Saving…"
                  : dialog.kind === "client"
                    ? "Save client"
                    : !priceInput.trim() &&
                        dialog.product.wholesalePrice !== null
                      ? "Remove wholesale price"
                      : "Save wholesale price"}
              </button>
            }
            title={
              dialog.kind === "client"
                ? dialog.client
                  ? "Edit wholesale client"
                  : "Add wholesale client"
                : "Set wholesale price"
            }
            busy={busy}
            close={() => setDialog(null)}
            description={
              dialog.kind === "client"
                ? "Business name and delivery destination."
                : "Wholesale unit prices include VAT where applicable."
            }
          >
            <form
              id="wholesale-maintenance-form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                if (dialog.kind === "client") {
                  const contacts = wholesaleClientContactsSchema.safeParse({
                    contactPerson: data.get("contactPerson"),
                    contactNumber: data.get("contactNumber"),
                    email: data.get("email"),
                  });
                  if (!contacts.success) {
                    const issue = contacts.error.issues[0];
                    setFormError(issue.message);
                    const field = event.currentTarget.elements.namedItem(
                      String(issue.path[0]),
                    ) as HTMLInputElement | null;
                    field?.focus();
                    return;
                  }
                  mutate(
                    dialog.client ? "/clients/" + dialog.client.id : "/clients",
                    dialog.client ? "PUT" : "POST",
                    {
                      ...(dialog.client
                        ? {
                            expected: {
                              name: dialog.client.name,
                              address: dialog.client.address,
                              contactPerson:
                                dialog.client.contactPerson ?? null,
                              contactNumber:
                                dialog.client.contactNumber ?? null,
                              email: dialog.client.email ?? null,
                            },
                          }
                        : {}),
                      name: data.get("name"),
                      address: data.get("address"),
                      ...contacts.data,
                    },
                  );
                } else
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
                        placeholder="Business name"
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
                        placeholder="Delivery address"
                        rows={3}
                        maxLength={2000}
                        defaultValue={
                          dialog.kind === "client"
                            ? (dialog.client?.address ?? "")
                            : ""
                        }
                      />
                    </div>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="wholesale-client-contact-person">
                          Contact person (optional)
                        </label>
                        <input
                          id="wholesale-client-contact-person"
                          name="contactPerson"
                          placeholder="Full name"
                          maxLength={255}
                          defaultValue={dialog.client?.contactPerson ?? ""}
                          autoComplete="name"
                          onInput={(event) => {
                            const result =
                              wholesaleClientContactsSchema.shape.contactPerson.safeParse(
                                event.currentTarget.value,
                              );
                            event.currentTarget.setCustomValidity(
                              result.success
                                ? ""
                                : result.error.issues[0].message,
                            );
                            setFormError("");
                          }}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="wholesale-client-contact-number">
                          Contact number (optional)
                        </label>
                        <input
                          id="wholesale-client-contact-number"
                          name="contactNumber"
                          type="tel"
                          inputMode="tel"
                          maxLength={20}
                          placeholder="+639XXXXXXXXX"
                          onInput={(event) => {
                            const input = event.currentTarget;
                            input.value = cleanWholesalePhoneInput(input.value);
                            const result =
                              wholesaleClientContactsSchema.shape.contactNumber.safeParse(
                                input.value,
                              );
                            input.setCustomValidity(
                              result.success
                                ? ""
                                : result.error.issues[0].message,
                            );
                            setFormError("");
                          }}
                          onBlur={(event) => {
                            const result =
                              wholesaleClientContactsSchema.shape.contactNumber.safeParse(
                                event.currentTarget.value,
                              );
                            if (result.success)
                              event.currentTarget.value = result.data ?? "";
                          }}
                          defaultValue={dialog.client?.contactNumber ?? ""}
                          autoComplete="tel"
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="wholesale-client-email">
                        Email (optional)
                      </label>
                      <input
                        id="wholesale-client-email"
                        name="email"
                        type="email"
                        placeholder="name@example.com"
                        maxLength={255}
                        defaultValue={dialog.client?.email ?? ""}
                        autoComplete="email"
                        onInput={(event) => {
                          const result =
                            wholesaleClientContactsSchema.shape.email.safeParse(
                              event.currentTarget.value,
                            );
                          event.currentTarget.setCustomValidity(
                            result.success
                              ? ""
                              : result.error.issues[0].message,
                          );
                          setFormError("");
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <section className="wholesale-context">
                      <strong>{dialog.product.name}</strong>
                      <span>
                        {dialog.product.sku} ·{" "}
                        {dialog.product.isVatExempt === null
                          ? "VAT classification missing"
                          : dialog.product.isVatExempt
                            ? "VAT-exempt"
                            : "VATable"}
                      </span>
                      <span>
                        Current price:{" "}
                        {dialog.product.wholesalePrice === null
                          ? "Not configured"
                          : wholesalePeso(dialog.product.wholesalePrice)}
                      </span>
                    </section>
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
                        value={priceInput}
                        onChange={(event) => setPriceInput(event.target.value)}
                      />
                    </div>
                    <p className="field-hint">
                      Prices include VAT where applicable. Leave blank to remove
                      the configured wholesale price.
                    </p>
                  </>
                )}
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
