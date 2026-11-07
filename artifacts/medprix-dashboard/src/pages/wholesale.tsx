import { Summary } from "@/components/custom-ui/summary-card";
import { LoadingState } from "@/components/custom-ui/loading-state";
import { WholesaleDeliveryReceipts } from "@/components/wholesale-delivery-receipts";
import { WholesaleOrderDetails } from "@/components/wholesale-order-details";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
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
  const [tab, setTab] = useState<"orders" | "clients" | "prices" | "receipts">(
    "orders",
  );
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

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [nextClients, nextProducts, nextOrders, nextReceipts] =
        await Promise.all([
          wholesaleGet<WholesaleClient[]>("/clients"),
          wholesaleGet<WholesaleProduct[]>("/catalog"),
          wholesaleGet<WholesaleOrder[]>("/orders"),
          wholesaleGet<DeliveryReceiptSummary[]>("/delivery-receipts"),
        ]);
      setClients(nextClients);
      setProducts(nextProducts);
      setOrders(nextOrders);
      setReceipts(nextReceipts);
      setReady(true);
    } catch (failure) {
      setReady(false);
      setError(safeError(failure));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

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
  const locked = busy || pending !== null;
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

  const openOrders = orders.filter((order) =>
    ["Pending", "Confirmed", "Processing"].includes(order.status),
  );
  const draftCount = orders.filter(
    (order) => order.status === "Pending",
  ).length;
  const reservedUnits = products.reduce(
    (total, product) => total + product.reservedStock,
    0,
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
    receipts: {
      title: "Delivery receipts",
      description: "View and reprint saved delivery receipts",
      placeholder: "Search receipt, order or client",
    },
  }[tab];
  const summaryValue = (value: number) => (ready ? String(value) : "—");

  return (
    <div className="wholesale-workspace">
      <PageHeading
        title="Wholesale"
        description="Clients, wholesale orders and full-order deliveries."
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
        className="summary-strip"
        aria-label="Wholesale summary"
        aria-busy={loading}
      >
        <Summary
          label="Open orders"
          value={summaryValue(openOrders.length)}
          caption="Among the latest 200 orders"
        />
        <Summary
          label="Awaiting confirmation"
          value={summaryValue(draftCount)}
          caption="Drafts in the latest 200 orders"
          tone="warning"
        />
        <Summary
          label="Reserved units"
          value={summaryValue(reservedUnits)}
          caption="Held across all wholesale orders"
        />
      </div>
      <div
        className="table-tools supplier-invoices wholesale-tabs"
        role="group"
        aria-label="Wholesale sections"
      >
        {(["orders", "clients", "prices", "receipts"] as const).map((item) => (
          <button
            key={item}
            className={"button " + (tab === item ? "primary-action" : "soft")}
            aria-pressed={tab === item}
            onClick={() => {
              setTab(item);
              setSearch("");
            }}
          >
            {item === "orders"
              ? "Orders"
              : item === "clients"
                ? "Clients"
                : item === "prices"
                  ? "Wholesale prices"
                  : "Delivery receipts"}
          </button>
        ))}
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
            <button
              className="button soft"
              disabled={busy || loading}
              onClick={() => void load()}
            >
              <RefreshCw size={15} /> Refresh
            </button>
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
                          <td colSpan={5} className="muted">
                            {search
                              ? "No matching records."
                              : "No wholesale orders found."}
                          </td>
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
                          <td colSpan={3} className="muted">
                            {search
                              ? "No matching records."
                              : "No wholesale clients found."}
                          </td>
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
                          <td
                            colSpan={role === "Admin" ? 7 : 6}
                            className="muted"
                          >
                            {search
                              ? "No matching records."
                              : "No wholesale products found."}
                          </td>
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
