import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Trash2, X } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import type { ToastFn } from "@/lib/types";
import { fetchInventoryData } from "@/lib/pharmacy-store";

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; sku: string };
type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplier: string;
  orderDate: string;
  status: string;
  totalOrderAmount: string;
  itemCount: number;
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
    status: "Submitted",
    totalOrderAmount: "15000.00",
    itemCount: 1,
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

export default function ProcurementPage({ onToast }: { onToast: ToastFn }) {
  const [activeSection, setActiveSection] = useState("Purchase Order Monitoring");
  const [status, setStatus] = useState("All orders");
  const [orders, setOrders] = useState<PurchaseOrder[]>(() =>
    getStored("medprix_procurement_orders", initialOrders)
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    getStored("medprix_procurement_suppliers", initialSuppliers)
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>(() =>
    getStored("medprix_procurement_deliveries", initialDeliveries)
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    getStored("medprix_procurement_invoices", initialInvoices)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
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
    expirationDate: "",
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
    try {
      setIsLoading(true);
      setError("");
      const [suppRes, invRes, poRes, delRes, invcRes] = await Promise.all([
        fetch("/api/suppliers", { credentials: "include" }).catch(() => null),
        fetch("/api/inventory", { credentials: "include" }).catch(() => null),
        fetch("/api/purchase-orders", { credentials: "include" }).catch(() => null),
        fetch("/api/supplier-deliveries", { credentials: "include" }).catch(() => null),
        fetch("/api/supplier-invoices", { credentials: "include" }).catch(() => null),
      ]);

      if (suppRes?.ok) {
        const d = await suppRes.json();
        if (Array.isArray(d.suppliers) && d.suppliers.length > 0) {
          setSuppliers(d.suppliers);
          saveStored("medprix_procurement_suppliers", d.suppliers);
        }
      }
      if (invRes?.ok) {
        const d = await invRes.json();
        if (Array.isArray(d.products)) {
          setProducts(d.products.map((p: any) => ({ id: p.id, name: p.name, sku: p.sku })));
        }
      }
      if (poRes?.ok) {
        const d = await poRes.json();
        if (Array.isArray(d.purchaseOrders)) {
          const localOrders = getStored("medprix_procurement_orders", orders);
          const merged = [...d.purchaseOrders];
          for (const lo of localOrders) {
            if (!merged.some((m) => m.id === lo.id || m.poNumber === lo.poNumber)) {
              merged.unshift(lo);
            }
          }
          setOrders(merged);
          saveStored("medprix_procurement_orders", merged);
        }
      }
      if (delRes?.ok) {
        const d = await delRes.json();
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
      }
      if (invcRes?.ok) {
        const d = await invcRes.json();
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
      }
    } catch {
      // Keep state from local cache
    } finally {
      setIsLoading(false);
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
    .reduce((total, order) => total + Number(order.totalOrderAmount), 0);
  const runningTotal = lineItems.reduce(
    (total, item) => total + (Number(item.quantityOrdered) || 0) * (Number(item.unitCost) || 0),
    0,
  );

  const updateStatus = async (orderId: string, nextStatus: string) => {
    const updated = orders.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o));
    setOrders(updated);
    saveStored("medprix_procurement_orders", updated);

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

    const suppObj = suppliers.find((s) => s.id === supplierId);
    const finalPoNum = poNumber.trim() || `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, "0")}`;
    const newOrder: PurchaseOrder = {
      id: `po-${Date.now()}`,
      poNumber: finalPoNum,
      supplier: suppObj?.name || "Selected Supplier",
      orderDate: new Date().toISOString(),
      status: "Submitted",
      totalOrderAmount: String(runningTotal),
      itemCount: lineItems.length,
    };

    const nextOrders = [newOrder, ...orders];
    setOrders(nextOrders);
    saveStored("medprix_procurement_orders", nextOrders);

    setIsCreateOpen(false);
    setSupplierId("");
    setPoNumber("");
    setLineItems([{ productId: "", quantityOrdered: "1", unitCost: "0" }]);
    onToast("Purchase order created.");

    try {
      setIsSaving(true);
      fetch("/api/purchase-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          poNumber: finalPoNum,
          items: lineItems.map((item) => ({
            productId: item.productId,
            quantityOrdered: Number(item.quantityOrdered),
            unitCost: Number(item.unitCost),
          })),
        }),
      }).catch(() => {});
    } finally {
      setIsSaving(false);
    }
  };

  const submitDelivery = async (event: FormEvent) => {
    event.preventDefault();
    const poObj = orders.find((o) => o.id === deliveryForm.poId);
    const prodObj = products.find((p) => p.id === deliveryForm.productId);

    const newDelivery: Delivery = {
      id: `del-${Date.now()}`,
      poNumber: poObj?.poNumber || "PO Direct",
      supplier: poObj?.supplier || "Direct Supplier",
      deliveryDate: deliveryForm.deliveryDate || new Date().toISOString(),
      deliveryStatus: deliveryForm.deliveryStatus || "Received",
      items: [
        {
          id: `deli-${Date.now()}`,
          product: prodObj?.name || "Medical Item",
          batchNumber: deliveryForm.batchNumber.trim().toUpperCase(),
          expirationDate: deliveryForm.expirationDate || "2028-12-31",
          quantityDelivered: Number(deliveryForm.quantityDelivered) || 1,
        },
      ],
    };

    const nextDeliveries = [newDelivery, ...deliveries];
    setDeliveries(nextDeliveries);
    saveStored("medprix_procurement_deliveries", nextDeliveries);

    setIsDeliveryOpen(false);
    void fetchInventoryData(true);
    onToast("Receiving report created.");

    try {
      setIsSaving(true);
      fetch("/api/supplier-deliveries", {
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
      }).catch(() => {});
    } finally {
      setIsSaving(false);
    }
  };

  const submitInvoice = async (event: FormEvent) => {
    event.preventDefault();
    const suppObj = suppliers.find((s) => s.id === invoiceForm.supplierId);
    const poObj = orders.find((o) => o.id === invoiceForm.poId);

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: invoiceForm.invoiceNumber.trim().toUpperCase(),
      supplier: suppObj?.name || "Supplier",
      poNumber: poObj?.poNumber || null,
      dueDate: invoiceForm.dueDate,
      invoiceAmount: String(Number(invoiceForm.invoiceAmount) || 0),
      status: invoiceForm.isPaid ? "Paid" : "Unpaid",
    };

    const nextInvoices = [newInvoice, ...invoices];
    setInvoices(nextInvoices);
    saveStored("medprix_procurement_invoices", nextInvoices);

    setIsInvoiceOpen(false);
    onToast("Supplier invoice created.");

    try {
      setIsSaving(true);
      fetch("/api/supplier-invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...invoiceForm,
          poId: invoiceForm.poId || null,
          invoiceAmount: Number(invoiceForm.invoiceAmount),
        }),
      }).catch(() => {});
    } finally {
      setIsSaving(false);
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, nextStatus: string) => {
    const updated = invoices.map((inv) =>
      inv.id === invoiceId ? { ...inv, status: nextStatus } : inv
    );
    setInvoices(updated);
    saveStored("medprix_procurement_invoices", updated);

    try {
      fetch(`/api/supplier-invoices/${invoiceId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      }).catch(() => {});
      onToast("Invoice status updated.");
    } catch {
      onToast("Status updated locally.");
    }
  };

  const tableMessage = (columns: number) => {
    if (isLoading && orders.length === 0)
      return (
        <tr>
          <td colSpan={columns} className="muted">
            Loading procurement data...
          </td>
        </tr>
      );
    if (error && orders.length === 0)
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
        action={
          <button
            className="button dark"
            data-testid="button-create-po"
            onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} /> Create purchase order
          </button>
        }
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
      <div className="table-tools" style={{ marginBottom: 16 }}>
        {[
          "Purchase Order Monitoring",
          "Receiving Report Management",
          "Purchase Invoice Monitoring",
        ].map((section) => (
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
              <p className="card-subtitle">Latest orders and delivery status</p>
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
                </tr>
              </thead>
              <tbody>
                {tableMessage(6) ||
                  (filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
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
                        <td>{order.itemCount}</td>
                        <td>
                          <strong>{money(order.totalOrderAmount)}</strong>
                        </td>
                        <td>
                          <select
                            className="select"
                            data-testid={`select-status-${order.id}`}
                            value={order.status}
                            onChange={(event) =>
                              void updateStatus(order.id, event.target.value)
                            }>
                            {poStatuses.map((item) => (
                              <option key={item}>{item}</option>
                            ))}
                          </select>
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
                {tableMessage(7) ||
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
            <button className="button dark" onClick={() => setIsInvoiceOpen(true)}>
              <Plus size={14} /> Add invoice
            </button>
          </div>
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
                {tableMessage(6) ||
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
                        <td>
                          <select
                            className="select"
                            value={invoice.status}
                            onChange={(event) =>
                              void updateInvoiceStatus(invoice.id, event.target.value)
                            }>
                            <option>Paid</option>
                            <option>Unpaid</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
                  <p className="modal-sub">Supplier order details and line items.</p>
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
                        onChange={(event) =>
                          setLineItems(
                            lineItems.map((line, lineIndex) =>
                              lineIndex === index
                                ? { ...line, productId: event.target.value }
                                : line
                            )
                          )
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
              <div className="modal-actions">
                <strong>Total: {money(runningTotal)}</strong>
                <button className="button dark" type="submit" disabled={isSaving}>
                  <Check size={13} /> {isSaving ? "Creating..." : "Create purchase order"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

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
                    onChange={(event) =>
                      setDeliveryForm({ ...deliveryForm, poId: event.target.value })
                    }>
                    <option value="">Select purchase order</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.poNumber} - {order.supplier}
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
                    <option>Pending</option>
                    <option>Received</option>
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
