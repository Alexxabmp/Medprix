import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Trash2, X } from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import type { ToastFn } from "@/lib/types";

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
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { productId: "", quantityOrdered: "1", unitCost: "0" },
  ]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError("");
      const responses = await Promise.all([
        fetch("http://localhost:5000/api/suppliers", { credentials: "include" }),
        fetch("http://localhost:5000/api/inventory", { credentials: "include" }),
        fetch("http://localhost:5000/api/purchase-orders", { credentials: "include" }),
        fetch("http://localhost:5000/api/supplier-deliveries", { credentials: "include" }),
        fetch("http://localhost:5000/api/supplier-invoices", { credentials: "include" }),
      ]);
      const payloads = await Promise.all(
        responses.map((response) => response.json().catch(() => ({}))),
      );
      const failedIndex = responses.findIndex((response) => !response.ok);
      if (failedIndex >= 0) {
        throw new Error(payloads[failedIndex].error || "Failed to load procurement data.");
      }
      setSuppliers(payloads[0].suppliers || []);
      setProducts(
        (payloads[1].products || []).map((product: { id: string; name: string; sku: string }) => product),
      );
      setOrders(payloads[2].purchaseOrders || []);
      setDeliveries(payloads[3].deliveries || []);
      setInvoices(payloads[4].invoices || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reach the server.";
      setError(message);
      onToast(message);
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
    try {
      const response = await fetch(`http://localhost:5000/api/purchase-orders/${orderId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        onToast(data.error || "Failed to update purchase order status.");
        return;
      }
      await loadData();
      onToast("Purchase order status updated.");
    } catch {
      onToast("Could not reach the server.");
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

    try {
      setIsSaving(true);
      const response = await fetch("http://localhost:5000/api/purchase-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          poNumber: poNumber.trim() || undefined,
          items: lineItems.map((item) => ({
            productId: item.productId,
            quantityOrdered: Number(item.quantityOrdered),
            unitCost: Number(item.unitCost),
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        onToast(data.error || "Failed to create purchase order.");
        return;
      }
      setIsCreateOpen(false);
      setSupplierId("");
      setPoNumber("");
      setLineItems([{ productId: "", quantityOrdered: "1", unitCost: "0" }]);
      await loadData();
      onToast("Purchase order created.");
    } catch {
      onToast("Could not reach the server.");
    } finally {
      setIsSaving(false);
    }
  };

  const tableMessage = (columns: number) => {
    if (isLoading) return <tr><td colSpan={columns} className="muted">Loading procurement data...</td></tr>;
    if (error) return <tr><td colSpan={columns} className="muted">{error}</td></tr>;
    return null;
  };

  return (
    <div>
      <PageHeading
        title="Procurement"
        description="Keep purchasing predictable from request to receiving."
        action={
          <button className="button dark" data-testid="button-create-po" onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} /> Create purchase order
          </button>
        }
      />
      <div className="summary-strip">
        <Summary
          label="Open orders"
          value={String(orders.filter((order) => !["Fulfilled", "Cancelled"].includes(order.status)).length)}
          caption={`${money(totalOpenValue)} committed`}
        />
        <Summary
          label="Awaiting approval"
          value={String(orders.filter((order) => order.status === "Pending").length)}
          caption="Needs your review"
          tone="warning"
        />
        <Summary label="Received deliveries" value={String(deliveries.length)} caption="Recorded supplier deliveries" />
      </div>
      <div className="table-tools" style={{ marginBottom: 16 }}>
        {["Purchase Order Monitoring", "Receiving Report Management", "Purchase Invoice Monitoring"].map((section) => (
          <button key={section} className={`button ${activeSection === section ? "dark" : "soft"}`} onClick={() => setActiveSection(section)}>
            {section}
          </button>
        ))}
      </div>

      {activeSection === "Purchase Order Monitoring" && (
        <section className="surface-card table-card">
          <div className="table-tools">
            <div><h2 className="card-title">Purchase orders</h2><p className="card-subtitle">Latest orders and delivery status</p></div>
            <select className="select" data-testid="select-procurement-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>All orders</option>
              {poStatuses.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Order</th><th>Supplier</th><th>Placed</th><th>Items</th><th>Value</th><th>Status</th></tr></thead>
              <tbody>
                {tableMessage(6) || (filteredOrders.length === 0 ? <tr><td colSpan={6} className="muted">No purchase orders found.</td></tr> : filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.poNumber}</strong></td>
                    <td>{order.supplier}</td>
                    <td className="muted">{new Date(order.orderDate).toLocaleDateString()}</td>
                    <td>{order.itemCount}</td>
                    <td><strong>{money(order.totalOrderAmount)}</strong></td>
                    <td><select className="select" data-testid={`select-status-${order.id}`} value={order.status} onChange={(event) => void updateStatus(order.id, event.target.value)}>
                      {poStatuses.map((item) => <option key={item}>{item}</option>)}
                    </select></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "Receiving Report Management" && (
        <section className="surface-card table-card">
          <div className="table-tools"><div><h2 className="card-title">Receiving reports</h2><p className="card-subtitle">Stock-in records with batch and expiry monitoring</p></div></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Delivery</th><th>Supplier</th><th>Product</th><th>Batch</th><th>Expiry</th><th>Quantity</th><th>Status</th></tr></thead><tbody>
            {tableMessage(7) || (deliveries.flatMap((delivery) => delivery.items.map((item) => ({ delivery, item }))).length === 0 ? <tr><td colSpan={7} className="muted">No receiving reports found.</td></tr> : deliveries.flatMap((delivery) => delivery.items.map((item) => {
              const expiry = expiryStatus(item.expirationDate);
              return <tr key={item.id}><td>{delivery.poNumber}<div className="muted" style={{ fontSize: 10 }}>{new Date(delivery.deliveryDate).toLocaleDateString()}</div></td><td>{delivery.supplier}</td><td>{item.product}</td><td>{item.batchNumber}</td><td>{item.expirationDate}</td><td>{item.quantityDelivered}</td><td><span className={`pill ${expiry.tone}`}>{expiry.label}</span></td></tr>;
            })))}
          </tbody></table></div>
        </section>
      )}

      {activeSection === "Purchase Invoice Monitoring" && (
        <section className="surface-card table-card">
          <div className="table-tools"><div><h2 className="card-title">Supplier invoices</h2><p className="card-subtitle">Outstanding and settled purchase invoices</p></div></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Invoice</th><th>Supplier</th><th>Purchase order</th><th>Due date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
            {tableMessage(6) || (invoices.length === 0 ? <tr><td colSpan={6} className="muted">No supplier invoices found.</td></tr> : invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoiceNumber}</strong></td><td>{invoice.supplier}</td><td>{invoice.poNumber || "N/A"}</td><td>{invoice.dueDate}</td><td><strong>{money(invoice.invoiceAmount)}</strong></td><td><span className={`pill ${invoice.status === "Paid" ? "success" : "warning"}`}>{invoice.status}</span></td></tr>))}
          </tbody></table></div>
        </section>
      )}

      {isCreateOpen && createPortal(
        <div className="modal-backdrop" data-testid="modal-create-po" onMouseDown={(event) => event.currentTarget === event.target && setIsCreateOpen(false)}>
          <form className="modal dialog" onSubmit={submitPurchaseOrder}>
            <div className="modal-header"><div><h2>Create purchase order</h2><p className="modal-sub">Supplier order details and line items.</p></div><button type="button" className="modal-close" onClick={() => setIsCreateOpen(false)}><X size={16} /></button></div>
            <div className="form-grid"><div className="field"><label>Supplier *</label><select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div><div className="field"><label>PO number</label><input placeholder="Auto-generated if blank" value={poNumber} onChange={(event) => setPoNumber(event.target.value)} /></div></div>
            <div className="modal-section"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h4>Line items</h4><button type="button" className="button" onClick={() => setLineItems([...lineItems, { productId: "", quantityOrdered: "1", unitCost: "0" }])}><Plus size={13} /> Add item</button></div>
              {lineItems.map((item, index) => <div className="form-grid" key={index} style={{ alignItems: "end", marginTop: 10 }}><div className="field"><label>Product *</label><select required value={item.productId} onChange={(event) => setLineItems(lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value } : line))}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}</select></div><div className="field"><label>Quantity *</label><input required type="number" min="1" step="1" value={item.quantityOrdered} onChange={(event) => setLineItems(lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, quantityOrdered: event.target.value } : line))} /></div><div className="field"><label>Unit cost *</label><input required type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => setLineItems(lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, unitCost: event.target.value } : line))} /></div>{lineItems.length > 1 && <button type="button" className="icon-button" aria-label="Remove line item" onClick={() => setLineItems(lineItems.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={14} /></button>}</div>)}
            </div>
            <div className="modal-actions"><strong>Total: {money(runningTotal)}</strong><button className="button dark" type="submit" disabled={isSaving}><Check size={13} /> {isSaving ? "Creating..." : "Create purchase order"}</button></div>
          </form>
        </div>,
        document.body,
      )}
    </div>
  );
}
