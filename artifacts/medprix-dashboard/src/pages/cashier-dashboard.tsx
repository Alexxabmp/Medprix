import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  Download,
  Eye,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { products } from "@/lib/data";
import type { ToastFn } from "@/lib/types";

export default function CashierDashboardPage({ onToast }: { onToast: ToastFn }) {
  const [selectedProductId, setSelectedProductId] = useState(products[0].id);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<
    { id: string; name: string; sku: string; price: number; qty: number }[]
  >([
    {
      id: "p1",
      name: "Paracetamol 500mg",
      sku: "MED-0421",
      price: 5.0,
      qty: 10,
    },
    {
      id: "p4",
      name: "Cough relief syrup",
      sku: "MED-0552",
      price: 145.0,
      qty: 1,
    },
  ]);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "GCash" | "Card">(
    "Cash",
  );
  const [discountType, setDiscountType] = useState<"None" | "Senior" | "PWD">(
    "None",
  );
  const [cashTendered, setCashTendered] = useState<string>("200");
  const [searchReceipt, setSearchReceipt] = useState("");
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

  const [receipts, setReceipts] = useState([
    {
      id: "CS-9401",
      time: "10:14 AM",
      items: 3,
      total: 195.0,
      method: "Cash",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9400",
      time: "09:48 AM",
      items: 1,
      total: 145.0,
      method: "GCash",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9399",
      time: "09:12 AM",
      items: 5,
      total: 520.0,
      method: "Card",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9398",
      time: "08:35 AM",
      items: 2,
      total: 85.0,
      method: "Cash",
      cashier: "Maria Santos",
      status: "Completed",
    },
  ]);

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const isDiscountEligible = discountType !== "None";
  const discountRate = isDiscountEligible ? 0.2 : 0;
  const discountAmount = subtotal * discountRate;
  const vat = isDiscountEligible ? 0 : subtotal * 0.12;
  const total = subtotal - discountAmount + vat;
  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue =
    paymentMethod === "Cash" ? Math.max(0, tenderedNum - total) : 0;

  const handleAddToCart = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;
    const numericPrice =
      parseFloat(prod.price.replace("₱", "").replace(",", "")) || 0;

    const existingIndex = cart.findIndex((item) => item.id === prod.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].qty += qty;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          price: numericPrice,
          qty,
        },
      ]);
    }
    onToast(`Added ${prod.name} (x${qty}) to cart`);
    setQty(1);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as typeof cart,
    );
  };

  const handleCheckout = (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      onToast("Cannot checkout an empty cart");
      return;
    }
    if (paymentMethod === "Cash" && tenderedNum < total) {
      onToast("Cash tendered is less than total amount due");
      return;
    }

    const nextNumber = 9402 + receipts.length - 4;
    const newId = `CS-${nextNumber}`;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const newReceipt = {
      id: newId,
      time: timeStr,
      items: cart.reduce((a, b) => a + b.qty, 0),
      total: total,
      method: paymentMethod,
      discount: discountType,
      cashier: "Maria Santos",
      status: "Completed",
    };

    setReceipts([newReceipt, ...receipts]);
    setCart([]);
    setCashTendered("");
    onToast(
      `Sale completed! Receipt ${newId} printed.${isDiscountEligible ? ` ${discountType} discount applied.` : ""} Change: ₱${changeDue.toFixed(2)}`,
    );
  };

  const filteredReceipts = receipts.filter(
    (r) =>
      r.id.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      r.method.toLowerCase().includes(searchReceipt.toLowerCase()),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeading
        title="Cashier Terminal & Register"
        description="Shift 1 (08:00 AM – 04:00 PM) · Active Terminal #01"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              className="pill success"
              style={{ padding: "6px 12px", fontSize: 12 }}>
              <ShieldCheck size={13} style={{ marginRight: 4 }} /> Register
              Active
            </span>
            <label className="date-control" data-testid="control-cashier-date">
              <CalendarDays size={14} />
              <span>Shift Date</span>
              <input
                type="date"
                aria-label="Select date"
                defaultValue="2026-08-31"
              />
            </label>
          </div>
        }
      />

      {/* Full-Screen Counter Sale Checkout Layout */}
      <section className="surface-card" style={{ padding: "22px 24px", width: "100%", borderRadius: 20 }}>
        <div className="card-header" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2
              className="card-title"
              style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShoppingCart size={18} /> Counter Sale Checkout
            </h2>
            <p className="card-subtitle">
              Scan or select products to process transaction · Terminal #01
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {cart.length > 0 && (
              <span className="pill neutral" style={{ fontSize: 11 }}>
                {cart.reduce((a, b) => a + b.qty, 0)} items in cart
              </span>
            )}
            {cart.length > 0 && (
              <button
                type="button"
                className="button soft"
                style={{ fontSize: 12 }}
                onClick={() => setCart([])}>
                <Trash2 size={13} style={{ marginRight: 4 }} /> Clear Cart
              </button>
            )}
          </div>
        </div>

        {/* Product Selection Form Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px auto",
            gap: 12,
            alignItems: "flex-end",
            padding: "14px 16px",
            background: "hsl(var(--surface-soft))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 14,
            marginBottom: 20,
          }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted))", display: "block", marginBottom: 5 }}>
              Select Product / Medicine *
            </label>
            <select
              className="select"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              style={{ width: "100%", height: 39 }}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — {p.price} [Stock: {p.stock}]
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted))", display: "block", marginBottom: 5, textAlign: "center" }}>
              Quantity
            </label>
            <input
              type="number"
              min="1"
              max="99"
              value={qty}
              onChange={(e) =>
                setQty(Math.max(1, parseInt(e.target.value) || 1))
              }
              style={{
                width: "100%",
                height: 39,
                borderRadius: 11,
                border: "1px solid hsl(var(--border))",
                textAlign: "center",
                background: "hsl(var(--surface))",
                color: "hsl(var(--foreground))",
                fontWeight: 600,
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <button
              type="button"
              className="button dark"
              style={{ height: 39, padding: "0 18px", display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={handleAddToCart}>
              <Plus size={15} /> Add to Cart
            </button>
          </div>
        </div>

        {/* 2-Column POS Layout inside full-width card */}
        <div className="pos-checkout-grid">
          {/* Left: Cart Items Table */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Transaction Items ({cart.length})
              </h4>
            </div>

            <div
              className="table-scroll"
              style={{
                minHeight: 280,
                maxHeight: 480,
                border: "1px solid hsl(var(--border))",
                borderRadius: 14,
                overflowX: "auto",
                background: "hsl(var(--surface))",
              }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th style={{ textAlign: "center" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Unit Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          textAlign: "center",
                          padding: "60px 20px",
                          color: "hsl(var(--muted))",
                        }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "hsl(var(--surface-soft))", display: "grid", placeItems: "center" }}>
                            <ShoppingCart size={22} className="muted" />
                          </div>
                          <strong style={{ fontSize: 14, color: "hsl(var(--foreground))" }}>Cart is empty</strong>
                          <span style={{ fontSize: 12 }}>Select products from the bar above to begin checkout.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    cart.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <div className="muted" style={{ fontSize: 10 }}>
                            {item.sku}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              background: "hsl(var(--surface-soft))",
                              padding: "3px 6px",
                              borderRadius: 8,
                              border: "1px solid hsl(var(--border))",
                            }}>
                            <button
                              type="button"
                              className="icon-button"
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                fontSize: 12,
                                border: 0,
                                fontWeight: 700,
                              }}
                              onClick={() => handleUpdateCartQty(item.id, -1)}>
                              -
                            </button>
                            <span style={{ minWidth: 18, fontWeight: 700, fontSize: 12 }}>
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              className="icon-button"
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                fontSize: 12,
                                border: 0,
                                fontWeight: 700,
                              }}
                              onClick={() => handleUpdateCartQty(item.id, 1)}>
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          ₱{item.price.toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          ₱{(item.price * item.qty).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="icon-button"
                            style={{
                              width: 24,
                              height: 24,
                              border: 0,
                              color: "hsl(var(--danger))",
                            }}
                            title="Remove item"
                            onClick={() => handleRemoveFromCart(item.id)}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Payment & Checkout Summary */}
          <form
            onSubmit={handleCheckout}
            style={{
              background: "hsl(var(--surface-soft))",
              padding: 20,
              borderRadius: 16,
              border: "1px solid hsl(var(--border))",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}>
            <div>
              <h4 style={{ margin: "0 0 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Order Summary &amp; Payment
              </h4>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  fontSize: 13,
                  background: "hsl(var(--surface))",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "hsl(var(--muted))",
                  }}>
                  <span>Subtotal</span>
                  <span style={{ fontWeight: 600, color: "hsl(var(--foreground))" }}>₱{subtotal.toFixed(2)}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "hsl(var(--muted))",
                  }}>
                  <span>VAT (12% included)</span>
                  <span>₱{vat.toFixed(2)}</span>
                </div>
                {isDiscountEligible && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "#34C759",
                      fontWeight: 700,
                    }}>
                    <span>{discountType} Privilege (20%)</span>
                    <span>-₱{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ height: 1, background: "hsl(var(--border))", margin: "2px 0" }} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Total Amount</span>
                  <span style={{ fontFamily: "var(--app-font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-.04em", color: "hsl(var(--foreground))" }}>
                    ₱{total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Discount Tabs */}
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "hsl(var(--muted))",
                  display: "block",
                  marginBottom: 6,
                }}>
                Customer Privilege Discount
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {(["None", "Senior", "PWD"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`button ${discountType === type ? "dark" : "soft"}`}
                    style={{ height: 35, fontSize: 11, padding: "0 4px" }}
                    onClick={() => setDiscountType(type)}>
                    {type === "None" ? "Standard (None)" : `${type} (-20%)`}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method Tabs */}
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "hsl(var(--muted))",
                  display: "block",
                  marginBottom: 6,
                }}>
                Payment Method
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {(["Cash", "GCash", "Card"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`button ${paymentMethod === method ? "dark" : "soft"}`}
                    style={{ height: 35, fontSize: 12 }}
                    onClick={() => setPaymentMethod(method)}>
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Tendered & Change Due */}
            {paymentMethod === "Cash" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  background: "hsl(var(--surface))",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                }}>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "hsl(var(--muted))",
                      display: "block",
                      marginBottom: 4,
                    }}>
                    Cash Tendered
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    style={{
                      width: "100%",
                      height: 38,
                      borderRadius: 10,
                      padding: "0 10px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--surface-soft))",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "hsl(var(--muted))",
                      display: "block",
                      marginBottom: 4,
                    }}>
                    Change Due
                  </label>
                  <div
                    style={{
                      height: 38,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 10px",
                      fontWeight: 700,
                      fontSize: 14,
                      color: changeDue >= 0 ? "#34C759" : "hsl(var(--danger))",
                      background: "hsl(var(--surface-soft))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                    }}>
                    ₱{changeDue.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="button dark full"
              disabled={cart.length === 0}
              style={{
                height: 46,
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}>
              <Receipt size={16} /> Complete &amp; Print Receipt (₱
              {total.toFixed(2)})
            </button>
          </form>
        </div>
      </section>

      {/* Modal: End of Shift Z-Read Confirmation */}
      {showShiftModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowShiftModal(false)}>
          <div
            className="modal dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div>
                <h2>End of Shift Z-Read Report</h2>
                <p className="modal-sub">
                  Confirm shift cash drawer count and generate Z-Report.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowShiftModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: "10px 0",
                fontSize: 13,
              }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                }}>
                <span>Opening Float</span>
                <span>₱3,500.00</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                }}>
                <span>Recorded Cash Sales</span>
                <span>₱5,000.00</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                  fontWeight: 700,
                }}>
                <span>Expected Drawer Total</span>
                <span>₱8,500.00</span>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="button soft"
                onClick={() => setShowShiftModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="button dark"
                onClick={() => {
                  onToast("Shift closed successfully. Z-Read report printed.");
                  setShowShiftModal(false);
                }}>
                <Check size={14} /> Confirm & Print Z-Read
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

