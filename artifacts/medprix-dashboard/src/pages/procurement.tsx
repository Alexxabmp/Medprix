import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, Package, Plus, Trash2, X, ArrowRight } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import type { ToastFn } from "@/lib/types";
import { fetchInventoryData } from "@/lib/pharmacy-store";
import { fetchAccountsPayable } from "@/lib/supplier-store";
import { products as initialFallbackProducts } from "@/lib/data";

type Supplier = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  sku: string;
  price?: string;
  cost?: string;
};
type LineItemDetail = {
  id: string;
  productId: string;
  product: string;
  sku: string;
  quantityOrdered: number;
  unitCost: string;
  lineTotal: string;
};
type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId?: string;
  supplier: string;
  orderDate: string;
  status: string;
  totalOrderAmount: string;
  itemCount: number;
  items?: LineItemDetail[];
};
type DeliveryItem = {
  id: string;
  product: string;
  batchNumber: string;
  expirationDate: string;
  quantityDelivered: number;
};
type Delivery = {
  id: string;
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  deliveryStatus: string;
  items: DeliveryItem[];
};
type Invoice = {
  id: string;
  invoiceNumber: string;
  supplier: string;
  poNumber: string | null;
  dueDate: string;
  invoiceAmount: string;
  status: string;
};
type LineItem = { productId: string; quantityOrdered: string; unitCost: string };

const poStatuses = ["Draft", "Pending", "Approved", "Submitted", "Fulfilled", "Cancelled"];

const initialSuppliers: Supplier[] = [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Mindanao MedSupply Corp." },
  { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "Davao Pharma Distributors Inc." },
  { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", name: "Southern Health Wholesale" },
];

const initialOrders: PurchaseOrder[] = [
  {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    poNumber: "PO-2026-0001",
    supplier: "Mindanao MedSupply Corp.",
    orderDate: new Date().toISOString(),
    status: "Draft",
    totalOrderAmount: "15000.00",
    itemCount: 1,
    items: [
      {
        id: "10101010-1010-1010-1010-101010101010",
        productId: "p1",
        product: "Paracetamol 500mg",
        sku: "MED-0421",
        quantityOrdered: 500,
        unitCost: "30.00",
        lineTotal: "15000.00",
      },
    ],
  },
];

const initialDeliveries: Delivery[] = [
  {
    id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    poNumber: "PO-2026-0001",
    supplier: "Mindanao MedSupply Corp.",
    deliveryDate: new Date().toISOString(),
    deliveryStatus: "Received",
    items: [
      {
        id: "10101010-1010-1010-1010-101010101010",
        product: "Paracetamol 500mg",
        batchNumber: "BATCH-MED-0421-01",
        expirationDate: "2027-08-31",
        quantityDelivered: 500,
      },
    ],
  },
];

const initialInvoices: Invoice[] = [
  {
    id: "20202020-2020-2020-2020-202020202020",
    invoiceNumber: "INV-2026-001",
    supplier: "Mindanao MedSupply Corp.",
    poNumber: "PO-2026-0001",
    dueDate: "2026-10-31",
    invoiceAmount: "15000.00",
    status: "Unpaid",
  },
];

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as T;
    }
  } catch {}
  return fallback;
}

function saveStored(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function money(value: string | number) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function expiryStatus(date: string) {
  const expiry = new Date(date);
  if (Number.isNaN(expiry.getTime())) return { label: "Unknown", tone: "neutral" };
  const days = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Expired", tone: "danger" };
  if (days <= 60) return { label: "Expiring Soon", tone: "warning" };
  return { label: "Valid", tone: "success" };
}

export default function ProcurementPage({ onToast, currentRole }: { onToast: ToastFn; currentRole: string }) {
  const canManagePurchasing = currentRole === "Admin" || currentRole === "FrontDesk";
  const [activeSection, setActiveSection] = useState(currentRole === "Cashier" ? "Receiving Report Management" : "Purchase Order Monitoring");
  const [status, setStatus] = useState("All orders");
  const [orders, setOrders] = useState<PurchaseOrder[]>(() =>
    getStored("medprix_procurement_orders", initialOrders)
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    getStored("medprix_procurement_suppliers", initialSuppliers)
  );
  const [products, setProducts] = useState<Product[]>(() => {
    const cached = getStored<any[]>("medprix_cached_inventory", []);
    if (cached.length > 0) {
      return cached.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        cost: p.cost || p.price,
      }));
    }
    return initialFallbackProducts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price,
      cost: (p as any).cost || p.price,
    }));
  });
  const [deliveries, setDeliveries] = useState<Delivery[]>(() =>
    getStored("medprix_procurement_deliveries", initialDeliveries)
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    getStored("medprix_procurement_invoices", initialInvoices)
  );
  const [error, setError] = useState("");
  const [loadingSections, setLoadingSections] = useState({
    orders: false,
    deliveries: false,
    invoices: false,
  });
  const [isInvoiceRefreshing, setIsInvoiceRefreshing] = useState(false);
  const [invoiceRefreshError, setInvoiceRefreshError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [selectedOrderForItems, setSelectedOrderForItems] = useState<PurchaseOrder | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { productId: "", quantityOrdered: "1", unitCost: "0" },
  ]);
  const [deliveryForm, setDeliveryForm] = useState({
    poId: "",
    deliveryDate: new Date().toISOString().slice(0, 10),
    deliveryStatus: "Received",
    productId: "",
    batchNumber: "",
    expirationDate: "2028-12-31",
    quantityDelivered: "1",
  });
  const [invoiceForm, setInvoiceForm] = useState({
    supplierId: "",
    poId: "",
    invoiceNumber: "",
    dueDate: "",
    invoiceAmount: "0",
    isPaid: false,
  });

  const loadData = async () => {
    setError("");
    setLoadingSections({ orders: true, deliveries: true, invoices: true });

    const loadSuppliers = async () => {
      const response = await fetch("/api/suppliers", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to refresh suppliers.");
      if (response.ok) {
        const d = await response.json();
        if (Array.isArray(d.suppliers) && d.suppliers.length > 0) {
          setSuppliers(d.suppliers);
          saveStored("medprix_procurement_suppliers", d.suppliers);
        }
      }
    };

    const loadProducts = async () => {
      const response = await fetch("/api/inventory", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to refresh inventory.");
      if (response.ok) {
        const d = await response.json();
        if (Array.isArray(d.products) && d.products.length > 0) {
          const prods = d.products.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: p.price,
            cost: p.cost || p.price,
          }));
          setProducts(prods);
        }
      }
    };

    const loadOrders = async () => {
      try {
        const response = await fetch("/api/purchase-orders", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to refresh purchase orders.");
        const d = await response.json();
        if (Array.isArray(d.purchaseOrders)) {
          const localOrders = getStored("medprix_procurement_orders", orders);
          const merged = [...d.purchaseOrders];
          for (const lo of localOrders) {
            const matchIndex = merged.findIndex((m) => m.id === lo.id || m.poNumber === lo.poNumber);
            if (matchIndex >= 0) {
              // Preserve local items if server didn't provide them
              if ((!merged[matchIndex].items || merged[matchIndex].items.length === 0) && lo.items) {
                merged[matchIndex].items = lo.items;
              }
            } else {
              merged.unshift(lo);
            }
          }
          setOrders(merged);
          saveStored("medprix_procurement_orders", merged);
        }
      } finally {
        setLoadingSections((current) => ({ ...current, orders: false }));
      }
    };

    const loadDeliveries = async () => {
      try {
        const response = await fetch("/api/supplier-deliveries", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to refresh receiving reports.");
        const d = await response.json();
        if (Array.isArray(d.deliveries)) {
          const localDels = getStored("medprix_procurement_deliveries", deliveries);
          const merged = [...d.deliveries];
          for (const ld of localDels) {
            if (!merged.some((m) => m.id === ld.id)) {
              merged.unshift(ld);
            }
          }
          setDeliveries(merged);
          saveStored("medprix_procurement_deliveries", merged);
        }
      } finally {
        setLoadingSections((current) => ({ ...current, deliveries: false }));
      }
    };

    const loadInvoices = async () => {
      setIsInvoiceRefreshing(true);
      try {
        const response = await fetch("/api/supplier-invoices", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to refresh supplier invoices.");
        const d = await response.json();
        if (Array.isArray(d.invoices)) {
          const localInvs = getStored("medprix_procurement_invoices", invoices);
          const merged = [...d.invoices];
          for (const li of localInvs) {
            if (!merged.some((m) => m.id === li.id || m.invoiceNumber === li.invoiceNumber)) {
              merged.unshift(li);
            }
          }
          setInvoices(merged);
          saveStored("medprix_procurement_invoices", merged);
        }
      } finally {
        setLoadingSections((current) => ({ ...current, invoices: false }));
        setIsInvoiceRefreshing(false);
      }
    };

    const results = await Promise.allSettled([
      loadSuppliers(),
      loadProducts(),
      loadOrders(),
      loadDeliveries(),
      loadInvoices(),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      setError("Some procurement data could not be refreshed. Cached data remains available.");
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredOrders = orders.filter(
    (order) => status === "All orders" || order.status === status,
  );
  const totalOpenValue = orders
    .filter((order) => !["Fulfilled", "Cancelled"].includes(order.status))
    .reduce((total, order) => total + Number(order.totalOrderAmount || 0), 0);
  const runningTotal = lineItems.reduce(
    (total, item) => total + (Number(item.quantityOrdered) || 0) * (Number(item.unitCost) || 0),
    0,
  );

  const updateStatus = async (orderId: string, nextStatus: string) => {
    const updated = orders.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o));
    setOrders(updated);
    saveStored("medprix_procurement_orders", updated);

    if (selectedOrderForItems && selectedOrderForItems.id === orderId) {
      setSelectedOrderForItems({ ...selectedOrderForItems, status: nextStatus });
    }

    try {
      fetch(`/api/purchase-orders/${orderId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      }).catch(() => {});
      onToast("Purchase order status updated.");
    } catch {
      onToast("Updated locally.");
    }
  };

  const openItemsModal = async (order: PurchaseOrder) => {
    setSelectedOrderForItems(order);
    if (!order.items || order.items.length === 0) {
      try {
        const res = await fetch(`/api/purchase-orders/${order.id}/items`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            const updatedOrder = { ...order, items: data.items, itemCount: data.items.length };
            setSelectedOrderForItems(updatedOrder);
            const updatedOrders = orders.map((o) => (o.id === order.id ? updatedOrder : o));
            setOrders(updatedOrders);
            saveStored("medprix_procurement_orders", updatedOrders);
          }
        }
      } catch {}
    }
  };

  const submitPurchaseOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !supplierId ||
      lineItems.some(
        (item) =>
          !item.productId ||
          Number(item.quantityOrdered) <= 0 ||
          Number(item.unitCost) < 0,
      )
    ) {
      onToast("Choose a supplier and complete every line item.");
      return;
    }

    const finalPoNum =
      poNumber.trim() ||
      `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, "0")}`;

    try {
      setIsSaving(true);
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          poNumber: finalPoNum,
          status: "Draft",
          items: lineItems.map((item) => ({
            productId: item.productId,
            quantityOrdered: Number(item.quantityOrdered),
            unitCost: Number(item.unitCost),
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create purchase order.");
      setIsCreateOpen(false);
      setSupplierId("");
      setPoNumber("");
      setLineItems([{ productId: "", quantityOrdered: "1", unitCost: "0" }]);
      await loadData();
      onToast("Purchase order created with Draft status.");
    } catch (requestError) {
      onToast(requestError instanceof Error ? requestError.message : "Failed to create purchase order.");
    } finally {
      setIsSaving(false);
    }
  };

  const submitDelivery = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      const response = await fetch("/api/supplier-deliveries", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId: deliveryForm.poId,
          deliveryDate: deliveryForm.deliveryDate,
          deliveryStatus: deliveryForm.deliveryStatus,
          items: [
            {
              productId: deliveryForm.productId,
              batchNumber: deliveryForm.batchNumber,
              expirationDate: deliveryForm.expirationDate,
              quantityDelivered: Number(deliveryForm.quantityDelivered),
            },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create receiving report.");
      setIsDeliveryOpen(false);
      await Promise.all([loadData(), fetchInventoryData(true)]);
      onToast("Receiving report created and inventory updated.");
    } catch (requestError) {
      onToast(requestError instanceof Error ? requestError.message : "Failed to create receiving report.");
    } finally {
      setIsSaving(false);
    }
  };

  const submitInvoice = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      const response = await fetch("/api/supplier-invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...invoiceForm,
          poId: invoiceForm.poId || null,
          invoiceAmount: Number(invoiceForm.invoiceAmount),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create supplier invoice.");
      const createdInvoice = data.invoice as Invoice | undefined;
      if (createdInvoice?.id) {
        setInvoices((current) => {
          const next = [
            createdInvoice,
            ...current.filter(
              (invoice) =>
                invoice.id !== createdInvoice.id &&
                invoice.invoiceNumber !== createdInvoice.invoiceNumber,
            ),
          ];
          saveStored("medprix_procurement_invoices", next);
          return next;
        });
      }
      setIsInvoiceOpen(false);
      setInvoiceForm({ supplierId: "", poId: "", invoiceNumber: "", dueDate: "", invoiceAmount: "0", isPaid: false });
      onToast("Supplier invoice and payable created.");
      void refreshInvoicesAndPayables();
    } catch (requestError) {
      onToast(requestError instanceof Error ? requestError.message : "Failed to create supplier invoice.");
    } finally {
      setIsSaving(false);
    }
  };

  const refreshInvoicesAndPayables = async () => {
    setIsInvoiceRefreshing(true);
    setInvoiceRefreshError("");
    try {
      const response = await fetch("/api/supplier-invoices", {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to refresh invoices.");
      if (Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
        saveStored("medprix_procurement_invoices", data.invoices);
      }
      await fetchAccountsPayable();
    } catch (requestError) {
      setInvoiceRefreshError(
        requestError instanceof Error
          ? requestError.message
          : "Invoice refresh failed. Cached invoices are still shown.",
      );
    } finally {
      setIsInvoiceRefreshing(false);
    }
  };

  const tableMessage = (columns: number, loading: boolean, itemCount: number) => {
    if (loading && itemCount === 0)
      return (
        <tr>
          <td colSpan={columns} className="muted">
            Loading procurement data...
          </td>
        </tr>
      );
    if (error && itemCount === 0)
      return (
        <tr>
          <td colSpan={columns} className="muted">
            {error}
          </td>
        </tr>
      );
    return null;
  };

  return (
    <div>
      <PageHeading
        title="Procurement"
        description="Keep purchasing predictable from request to receiving."
        action={canManagePurchasing ? (
          <button
            className="button dark"
            data-testid="button-create-po"
            onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} /> Create purchase order
          </button>
        ) : undefined}
      />
      <div className="summary-strip">
        <Summary
          label="Open orders"
          value={String(
            orders.filter((order) => !["Fulfilled", "Cancelled"].includes(order.status)).length
          )}
          caption={`${money(totalOpenValue)} committed`}
        />
        <Summary
          label="Awaiting approval"
          value={String(orders.filter((order) => order.status === "Pending").length)}
          caption="Needs your review"
          tone="warning"
        />
        <Summary
          label="Received deliveries"
          value={String(deliveries.length)}
          caption="Recorded supplier deliveries"
        />
      </div>
      <div className="table-tools supplier-invoices" style={{ marginBottom: 16 }}>
        {[
          "Purchase Order Monitoring",
          "Receiving Report Management",
          "Purchase Invoice Monitoring",
        ].filter((section) => canManagePurchasing || section === "Receiving Report Management").map((section) => (
          <button
            key={section}
            className={`button ${activeSection === section ? "dark" : "soft"}`}
            onClick={() => setActiveSection(section)}>
            {section}
          </button>
        ))}
      </div>

      {activeSection === "Purchase Order Monitoring" && (
        <section className="surface-card table-card">
          <div className="table-tools">
            <div>
              <h2 className="card-title">Purchase orders</h2>
              <p className="card-subtitle">Latest orders, line items, and delivery status</p>
            </div>
            <select
              className="select"
              data-testid="select-procurement-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}>
              <option>All orders</option>
              {poStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Supplier</th>
                  <th>Placed</th>
                  <th>Items</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(7, loadingSections.orders, orders.length) ||
                  (filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        No purchase orders found.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.poNumber}</strong>
                        </td>
                        <td>{order.supplier}</td>
                        <td className="muted">
                          {new Date(order.orderDate).toLocaleDateString()}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="pill neutral"
                            style={{ cursor: "pointer", border: "1px solid rgba(0,0,0,0.1)" }}
                            onClick={() => void openItemsModal(order)}>
                            <Package size={12} style={{ marginRight: 4 }} />
                            {order.itemCount || (order.items?.length ?? 1)} item(s)
                          </button>
                        </td>
                        <td>
                          <strong>{money(order.totalOrderAmount)}</strong>
                        </td>
                        <td>
                          {canManagePurchasing ? <select
                            className="select"
                            data-testid={`select-status-${order.id}`}
                            value={order.status}
                            onChange={(event) =>
                              void updateStatus(order.id, event.target.value)
                            }>
                            {poStatuses.map((item) => (
                              <option key={item}>{item}</option>
                            ))}
                          </select> : <span className="pill neutral">{order.status}</span>}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button soft"
                            style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => void openItemsModal(order)}>
                            <Eye size={12} style={{ marginRight: 4 }} /> View items
                          </button>
                        </td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "Receiving Report Management" && (
        <section className="surface-card table-card">
          <div className="table-tools">
            <div>
              <h2 className="card-title">Receiving reports</h2>
              <p className="card-subtitle">Stock-in records with batch and expiry monitoring</p>
            </div>
            <button className="button dark" onClick={() => setIsDeliveryOpen(true)}>
              <Plus size={14} /> Add receiving report
            </button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>Supplier</th>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Quantity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(7, loadingSections.deliveries, deliveries.length) ||
                  (deliveries.flatMap((delivery) =>
                    delivery.items.map((item) => ({ delivery, item }))
                  ).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        No receiving reports found.
                      </td>
                    </tr>
                  ) : (
                    deliveries.flatMap((delivery) =>
                      delivery.items.map((item) => {
                        const expiry = expiryStatus(item.expirationDate);
                        return (
                          <tr key={item.id}>
                            <td>
                              {delivery.poNumber}
                              <div className="muted" style={{ fontSize: 10 }}>
                                {new Date(delivery.deliveryDate).toLocaleDateString()}
                              </div>
                            </td>
                            <td>{delivery.supplier}</td>
                            <td>{item.product}</td>
                            <td>{item.batchNumber}</td>
                            <td>{item.expirationDate}</td>
                            <td>{item.quantityDelivered}</td>
                            <td>
                              <span className={`pill ${expiry.tone}`}>{expiry.label}</span>
                            </td>
                          </tr>
                        );
                      })
                    )
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "Purchase Invoice Monitoring" && (
        <section className="surface-card table-card">
          <div className="table-tools">
            <div>
              <h2 className="card-title">Supplier invoices</h2>
              <p className="card-subtitle">Outstanding and settled purchase invoices</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isInvoiceRefreshing && (
                <span className="muted" role="status">Refreshing…</span>
              )}
              <button className="button dark" onClick={() => setIsInvoiceOpen(true)}>
                <Plus size={14} /> Add invoice
              </button>
            </div>
          </div>
          {invoiceRefreshError && (
            <div className="inline-error" role="alert">
              <span>{invoiceRefreshError} Cached invoice data remains available.</span>
              <button
                type="button"
                className="button soft"
                disabled={isInvoiceRefreshing}
                onClick={() => void refreshInvoicesAndPayables()}>
                Retry
              </button>
            </div>
          )}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th>Purchase order</th>
                  <th>Due date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tableMessage(6, loadingSections.invoices, invoices.length) ||
                  (invoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        No supplier invoices found.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <strong>{invoice.invoiceNumber}</strong>
                        </td>
                        <td>{invoice.supplier}</td>
                        <td>{invoice.poNumber || "N/A"}</td>
                        <td>{invoice.dueDate}</td>
                        <td>
                          <strong>{money(invoice.invoiceAmount)}</strong>
                        </td>
                        <td><span className={`pill ${invoice.status === "Paid" ? "success" : "warning"}`}>{invoice.status}</span></td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* PO Items Modal */}
      {selectedOrderForItems &&
        createPortal(
          <div
            className="modal-backdrop"
            data-testid="modal-po-items"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setSelectedOrderForItems(null)
            }>
            <div className="modal dialog" style={{ maxWidth: 640 }}>
              <div className="modal-header">
                <div>
                  <h2>Purchase order items</h2>
                  <p className="modal-sub">
                    {selectedOrderForItems.poNumber} • {selectedOrderForItems.supplier}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelectedOrderForItems(null)}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ margin: "12px 0 20px 0" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.03)",
                    borderRadius: 8,
                    marginBottom: 14,
                    fontSize: 13,
                  }}>
                  <div>
                    <strong>Status:</strong>{" "}
                    <span className="pill neutral">{selectedOrderForItems.status}</span>
                  </div>
                  <div>
                    <strong>Placed:</strong>{" "}
                    {new Date(selectedOrderForItems.orderDate).toLocaleDateString()}
                  </div>
                  <div>
                    <strong>Total:</strong>{" "}
                    <strong>{money(selectedOrderForItems.totalOrderAmount)}</strong>
                  </div>
                </div>

                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Qty ordered</th>
                        <th>Unit cost</th>
                        <th>Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderForItems.items && selectedOrderForItems.items.length > 0 ? (
                        selectedOrderForItems.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.product}</strong>
                            </td>
                            <td>{item.sku || "N/A"}</td>
                            <td>{item.quantityOrdered}</td>
                            <td>{money(item.unitCost)}</td>
                            <td>
                              <strong>{money(item.lineTotal)}</strong>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="muted">
                            {selectedOrderForItems.itemCount} item(s) ordered (Total:{" "}
                            {money(selectedOrderForItems.totalOrderAmount)})
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div
                className="modal-actions"
                style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  type="button"
                  className="button soft"
                  onClick={() => setSelectedOrderForItems(null)}>
                  Close
                </button>
                <button
                  type="button"
                  className="button dark"
                  onClick={() => {
                    const ord = selectedOrderForItems;
                    setSelectedOrderForItems(null);
                    setDeliveryForm({
                      poId: ord.id,
                      deliveryDate: new Date().toISOString().slice(0, 10),
                      deliveryStatus: "Received",
                      productId: ord.items?.[0]?.productId || products[0]?.id || "",
                      batchNumber: `BATCH-${Date.now().toString().slice(-6)}`,
                      expirationDate: "2028-12-31",
                      quantityDelivered: ord.items?.[0]
                        ? String(ord.items[0].quantityOrdered)
                        : "1",
                    });
                    setIsDeliveryOpen(true);
                  }}>
                  <Plus size={13} /> Receive delivery for this PO
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Create Purchase Order Modal */}
      {isCreateOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            data-testid="modal-create-po"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setIsCreateOpen(false)
            }>
            <form className="modal dialog" onSubmit={submitPurchaseOrder}>
              <div className="modal-header">
                <div>
                  <h2>Create purchase order</h2>
                  <p className="modal-sub">
                    Supplier order details and line items (starts as <strong>Draft</strong>).
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsCreateOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Supplier *</label>
                  <select
                    required
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}>
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>PO number</label>
                  <input
                    placeholder="Auto-generated if blank"
                    value={poNumber}
                    onChange={(event) => setPoNumber(event.target.value)}
                  />
                </div>
              </div>
              <div className="modal-section">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                  <h4>Line items</h4>
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      setLineItems([
                        ...lineItems,
                        { productId: "", quantityOrdered: "1", unitCost: "0" },
                      ])
                    }>
                    <Plus size={13} /> Add item
                  </button>
                </div>
                {lineItems.map((item, index) => (
                  <div
                    className="form-grid"
                    key={index}
                    style={{ alignItems: "end", marginTop: 10 }}>
                    <div className="field">
                      <label>Product *</label>
                      <select
                        required
                        value={item.productId}
                        onChange={(event) => {
                          const pId = event.target.value;
                          const selectedProd = products.find((p) => p.id === pId);
                          let autoCost = item.unitCost;
                          if (selectedProd && (item.unitCost === "0" || !item.unitCost)) {
                            const parsedCost = parseFloat(
                              String(selectedProd.cost || selectedProd.price || "0").replace(
                                /[^0-9.]/g,
                                ""
                              )
                            );
                            if (parsedCost > 0) autoCost = String(parsedCost);
                          }
                          setLineItems(
                            lineItems.map((line, lineIndex) =>
                              lineIndex === index
                                ? {
                                    ...line,
                                    productId: pId,
                                    unitCost: autoCost,
                                  }
                                : line
                            )
                          );
                        }}>
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.sku})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Quantity *</label>
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantityOrdered}
                        onChange={(event) =>
                          setLineItems(
                            lineItems.map((line, lineIndex) =>
                              lineIndex === index
                                ? { ...line, quantityOrdered: event.target.value }
                                : line
                            )
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Unit cost *</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitCost}
                        onChange={(event) =>
                          setLineItems(
                            lineItems.map((line, lineIndex) =>
                              lineIndex === index
                                ? { ...line, unitCost: event.target.value }
                                : line
                            )
                          )
                        }
                      />
                    </div>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remove line item"
                        onClick={() =>
                          setLineItems(lineItems.filter((_, lineIndex) => lineIndex !== index))
                        }>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="modal-actions items-center">
                <strong>Total: {money(runningTotal)}</strong>
                <button className="button dark" type="submit" disabled={isSaving}>
                  <Check size={13} /> {isSaving ? "Creating..." : "Create Draft Purchase Order"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {/* Add Receiving Report Modal */}
      {isDeliveryOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            data-testid="modal-create-delivery"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setIsDeliveryOpen(false)
            }>
            <form className="modal dialog" onSubmit={submitDelivery}>
              <div className="modal-header">
                <div>
                  <h2>Add receiving report</h2>
                  <p className="modal-sub">
                    Record delivered items, batches, and expiry dates.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsDeliveryOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Purchase order *</label>
                  <select
                    required
                    value={deliveryForm.poId}
                    onChange={(event) => {
                      const selectedPoId = event.target.value;
                      const order = orders.find((o) => o.id === selectedPoId);
                      const firstItem = order?.items?.[0];
                      setDeliveryForm({
                        ...deliveryForm,
                        poId: selectedPoId,
                        productId:
                          firstItem?.productId || deliveryForm.productId || (products[0]?.id ?? ""),
                        quantityDelivered: firstItem
                          ? String(firstItem.quantityOrdered)
                          : deliveryForm.quantityDelivered,
                      });
                    }}>
                    <option value="">Select purchase order</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.poNumber} - {order.supplier} ({order.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Delivery status *</label>
                  <select
                    required
                    value={deliveryForm.deliveryStatus}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        deliveryStatus: event.target.value,
                      })
                    }>
                    <option>Received</option>
                    <option>Pending</option>
                    <option>Partial</option>
                    <option>Inspected</option>
                    <option>Rejected</option>
                  </select>
                </div>
                <div className="field">
                  <label>Delivery date *</label>
                  <input
                    required
                    type="date"
                    value={deliveryForm.deliveryDate}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        deliveryDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Product *</label>
                  <select
                    required
                    value={deliveryForm.productId}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        productId: event.target.value,
                      })
                    }>
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Batch number *</label>
                  <input
                    required
                    placeholder="e.g. BATCH-2026-01"
                    value={deliveryForm.batchNumber}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        batchNumber: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Expiration date *</label>
                  <input
                    required
                    type="date"
                    value={deliveryForm.expirationDate}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        expirationDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Quantity delivered *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={deliveryForm.quantityDelivered}
                    onChange={(event) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        quantityDelivered: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button className="button dark" type="submit" disabled={isSaving}>
                  <Check size={13} /> {isSaving ? "Saving..." : "Save receiving report"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {/* Add Supplier Invoice Modal */}
      {isInvoiceOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            data-testid="modal-create-invoice"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setIsInvoiceOpen(false)
            }>
            <form className="modal dialog" onSubmit={submitInvoice}>
              <div className="modal-header">
                <div>
                  <h2>Add supplier invoice</h2>
                  <p className="modal-sub">Record an invoice and its payment status.</p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsInvoiceOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Supplier *</label>
                  <select
                    required
                    value={invoiceForm.supplierId}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        supplierId: event.target.value,
                        poId: "",
                      })
                    }>
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Purchase order</label>
                  <select
                    value={invoiceForm.poId}
                    onChange={(event) =>
                      setInvoiceForm({ ...invoiceForm, poId: event.target.value })
                    }>
                    <option value="">None</option>
                    {orders
                      .filter(
                        (order) =>
                          !invoiceForm.supplierId ||
                          suppliers.some(
                            (supplier) =>
                              supplier.id === invoiceForm.supplierId &&
                              supplier.name === order.supplier
                          )
                      )
                      .map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.poNumber}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label>Invoice number *</label>
                  <input
                    required
                    value={invoiceForm.invoiceNumber}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        invoiceNumber: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Due date *</label>
                  <input
                    required
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        dueDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Invoice amount *</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoiceForm.invoiceAmount}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        invoiceAmount: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Payment status</label>
                  <select
                    value={invoiceForm.isPaid ? "Paid" : "Unpaid"}
                    onChange={(event) =>
                      setInvoiceForm({
                        ...invoiceForm,
                        isPaid: event.target.value === "Paid",
                      })
                    }>
                    <option>Unpaid</option>
                    <option>Paid</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button className="button dark" type="submit" disabled={isSaving}>
                  <Check size={13} /> {isSaving ? "Saving..." : "Save invoice"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
}
