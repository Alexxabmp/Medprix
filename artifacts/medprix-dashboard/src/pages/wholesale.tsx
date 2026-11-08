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
import { Plus, Search } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { WholesaleOrderEditor } from "@/components/wholesale-order-editor";
import { safeError } from "@/lib/feedback";
import {
  wholesaleGet,
  wholesaleWrite,
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
  const [clients, setClients] = useState<WholesaleClient[]>([]);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [orders, setOrders] = useState<WholesaleOrder[]>([]);
  const [receipts, setReceipts] = useState<DeliveryReceiptSummary[]>([]);
  const [overview, setOverview] = useState<WholesaleOverview | null>(null);
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
  const [tab, setTab] = useState<
    "orders" | "clients" | "prices" | "receipts" | "accounts"
  >("orders");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
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
    void load();
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
  const visibleOrders = orders.filter((order) =>
    (order.orderNumber + " " + order.clientName)
      .toLocaleLowerCase()
      .includes(query),
  );
  const visibleClients = clients.filter((client) =>
    (client.name + " " + (client.address ?? ""))
      .toLocaleLowerCase()
      .includes(query),
  );
  const visibleProducts = products.filter((product) =>
    (product.name + " " + product.sku).toLocaleLowerCase().includes(query),
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
        <div className="surface-card wholesale-notice" role="status">
          <p>
            A saved request needs confirmation. Retry it before starting another
            change.
          </p>
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
              {openingSummary === "pending" ? "Opening..." : "View orders"}
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
              {openingSummary === "deliveries"
                ? "Opening..."
                : "View deliveries"}
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
              {openingSummary === "outstanding"
                ? "Opening..."
                : "View accounts"}
            </button>
          }
        />
        <div className="wholesale-summary-alert" role="status">
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
                {openingSummary === "overdue"
                  ? "Opening..."
                  : "View overdue accounts"}
              </button>
            }
          />
        </div>
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
        className="table-tools supplier-invoices wholesale-tabs"
        role="group"
        aria-label="Wholesale sections"
      >
        {(["orders", "clients", "prices", "receipts", "accounts"] as const).map(
          (item) => (
            <button
              key={item}
              className={"button " + (tab === item ? "primary-action" : "soft")}
              aria-pressed={tab === item}
              onClick={() => {
                setTab(item);
                setSearch("");
                setAccountStatus("all");
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
        <div className="table-tools wholesale-table-tools">
          <div>
            <h2 className="card-title">{section.title}</h2>
            <p className="card-subtitle">{section.description}</p>
          </div>
          <div className="wholesale-table-controls">
            <div className="wholesale-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search wholesale records"
                placeholder={section.placeholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {tab === "accounts" && (
              <select
                aria-label="Payment status"
                value={accountStatus}
                onChange={(event) =>
                  setAccountStatus(event.target.value as WholesaleAccountFilter)
                }
              >
                <option value="all">All accounts</option>
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
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrders.map((order) => (
                        <tr key={order.id}>
                          <td>{order.orderNumber}</td>
                          <td>{order.clientName}</td>
                          <td>{wholesalePeso(order.total)}</td>
                          <td>
                            {order.status === "Pending"
                              ? "Draft"
                              : order.status}
                          </td>
                          <td>
                            <button
                              className="button soft"
                              disabled={locked}
                              onClick={() => open({ kind: "order", order })}
                            >
                              Edit draft
                            </button>
                            <button
                              className="button soft"
                              disabled={locked}
                              onClick={() => open({ kind: "details", order })}
                            >
                              Review order
                            </button>
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
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleClients.map((client) => (
                        <tr key={client.id}>
                          <td>{client.name}</td>
                          <td>{client.address || "Not provided"}</td>
                          <td>
                            <button
                              className="button soft"
                              disabled={locked}
                              onClick={() => open({ kind: "client", client })}
                            >
                              Edit client
                            </button>
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
                        {role === "Admin" && <th>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => (
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
                            <td>
                              <button
                                className="button soft"
                                disabled={locked}
                                onClick={() => open({ kind: "price", product })}
                              >
                                Set price
                              </button>
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
