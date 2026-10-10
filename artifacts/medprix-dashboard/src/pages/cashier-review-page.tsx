import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import type { ToastFn, ShiftReceipt } from "@/lib/types";
import { usePharmacyTransactions } from "@/lib/pharmacy-store";

export type { ShiftReceipt };

const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CashierReviewPage({ onToast }: { onToast: ToastFn }) {
  const [activeModal, setActiveModal] = useState<"sales" | "drawer" | "transactions" | "till" | null>(null);
  const { receipts: shiftReceipts, loading: isLoading } = usePharmacyTransactions();

  // Modal body scroll lock
  useEffect(() => {
    if (!activeModal) return undefined;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeModal]);

  const [searchReceipt, setSearchReceipt] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<ShiftReceipt | null>(null);

  // Compute live shift metrics
  const totalSales = shiftReceipts.reduce((sum, r) => sum + r.total, 0);
  const totalReceiptsCount = shiftReceipts.length;
  const avgBasket = totalReceiptsCount > 0 ? totalSales / totalReceiptsCount : 0;

  const cashReceipts = shiftReceipts.filter((r) => r.method.toLowerCase().includes("cash"));
  const cashSalesTotal = cashReceipts.reduce((sum, r) => sum + r.total, 0);

  const gcashReceipts = shiftReceipts.filter((r) => r.method.toLowerCase().includes("gcash"));
  const gcashSalesTotal = gcashReceipts.reduce((sum, r) => sum + r.total, 0);

  const cardReceipts = shiftReceipts.filter((r) => {
    const m = r.method.toLowerCase();
    return m.includes("card") || m.includes("credit") || m.includes("debit");
  });
  const cardSalesTotal = cardReceipts.reduce((sum, r) => sum + r.total, 0);

  const cashPct = totalSales > 0 ? ((cashSalesTotal / totalSales) * 100).toFixed(1) : "0.0";
  const gcashPct = totalSales > 0 ? ((gcashSalesTotal / totalSales) * 100).toFixed(1) : "0.0";
  const cardPct = totalSales > 0 ? ((cardSalesTotal / totalSales) * 100).toFixed(1) : "0.0";

  // Cash in Drawer calculations
  const openingFloat = 5000.0;
  const cashDrop = 2000.0;
  const currentExpectedCash = openingFloat + cashSalesTotal - cashDrop;

  const calculateBills = (amount: number) => {
    let rem = Math.max(0, Math.floor(amount));
    const k1000 = Math.floor(rem / 1000);
    rem %= 1000;
    const k500 = Math.floor(rem / 500);
    rem %= 500;
    const k100 = Math.floor(rem / 100);
    rem %= 100;
    const k50 = Math.floor(rem / 50);
    rem %= 50;
    const k20 = Math.floor(rem / 20);
    rem %= 20;
    const coins = (amount - Math.floor(amount)) + rem;
    return { k1000, k500, k100, k50, k20, coins };
  };
  const bills = calculateBills(currentExpectedCash);

  const filteredShiftReceipts = shiftReceipts.filter(
    (r) =>
      r.id.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      r.method.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      (r.itemsSummary && r.itemsSummary.toLowerCase().includes(searchReceipt.toLowerCase())),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeading
        title="Shift review & register operations"
        description="Select any of the 4 register features to view shift sales, drawer balance, handled transactions, or till status."
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="pill success" style={{ padding: "6px 12px", fontSize: 12 }}>
              <ShieldCheck size={13} style={{ marginRight: 4 }} /> Terminal #01 · Active
            </span>
            <label className="date-control" data-testid="control-cashier-date">
              <CalendarDays size={14} />
              <span>September 1, 2026</span>
            </label>
          </div>
        }
      />

      {/* 4 Feature Boxes Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        {/* 1. Today's Shift Sales */}
        <div
          className="surface-card"
          style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
          onClick={() => setActiveModal("sales")}
          data-testid="card-feature-shift-sales"
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Receipt size={15} />
                <h3 className="card-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Today's Shift Sales</h3>
              </div>
              <span className="pill neutral" style={{ fontSize: 10 }}>Feature 1</span>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              View total sales made during your active shift, receipt counts, and revenue breakdown by payment method.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatPeso(totalSales)}</div>
              <span className="muted" style={{ fontSize: 11 }}>{totalReceiptsCount} receipts completed</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
              Open feature <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        {/* 2. Cash in Drawer */}
        <div
          className="surface-card"
          style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
          onClick={() => setActiveModal("drawer")}
          data-testid="card-feature-cash-drawer"
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CircleDollarSign size={15} />
                <h3 className="card-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Cash in Drawer</h3>
              </div>
              <span className="pill neutral" style={{ fontSize: 10 }}>Feature 2</span>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Monitor physical cash float, incoming cash transactions, mid-day safe drops, and expected cash in the register.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatPeso(currentExpectedCash)}</div>
              <span className="muted" style={{ fontSize: 11 }}>Float: ₱5,000.00 · Cash sales: {formatPeso(cashSalesTotal)}</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
              Open feature <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        {/* 3. Shift Receipts Log */}
        <div
          className="surface-card"
          style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
          onClick={() => setActiveModal("transactions")}
          data-testid="card-feature-shift-receipts-log"
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Receipt size={15} />
                <h3 className="card-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Shift Receipts Log</h3>
              </div>
              <span className="pill neutral" style={{ fontSize: 10 }}>Feature 3</span>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Transactions recorded during current shift. Search receipt numbers, inspect itemized sales, and audit cashier receipts.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{totalReceiptsCount} Receipts Logged</div>
              <span className="muted" style={{ fontSize: 11 }}>Total {formatPeso(totalSales)} recorded</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
              Open feature <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        {/* 4. Till Status */}
        <div
          className="surface-card"
          style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
          onClick={() => setActiveModal("till")}
          data-testid="card-feature-till-status"
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={15} />
                <h3 className="card-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Till Status</h3>
              </div>
              <span className="pill neutral" style={{ fontSize: 10 }}>Feature 4</span>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Check live cash till balance status (Balanced, Over, Short), discrepancy checks, and supervisor verification logs.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="pill success" style={{ fontSize: 11 }}>Balanced</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>₱0.00 variance</span>
              </div>
              <span className="muted" style={{ fontSize: 11 }}>Verified today</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
              Open feature <ArrowUpRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. TODAY'S SHIFT SALES MODAL */}
      {/* ========================================================================= */}
      {activeModal === "sales" && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
        >
          <div className="modal" style={{ width: "min(680px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Today's Shift Sales</h2>
                <p className="modal-sub">Live sales performance summary for Shift #1</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveModal(null)}
                data-testid="button-close-sales-modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Shift Overview Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Total shift sales</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>{formatPeso(totalSales)}</strong>
                <span style={{ color: "#34C759", fontSize: 10, fontWeight: 600 }}>Across all payment modes</span>
              </div>
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Transactions</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>{totalReceiptsCount} Orders</strong>
                <span className="muted" style={{ fontSize: 10 }}>Completed transactions</span>
              </div>
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Average basket</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>{formatPeso(avgBasket)}</strong>
                <span className="muted" style={{ fontSize: 10 }}>Per customer order</span>
              </div>
            </div>

            {/* Sales Breakdown by Payment Method */}
            <div style={{ marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Payment Method Breakdown
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Cash</span>
                    <span className="pill success" style={{ fontSize: 9 }}>{cashReceipts.length} sale(s)</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>{formatPeso(cashSalesTotal)}</strong>
                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{cashPct}% of total</div>
                </div>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>GCash</span>
                    <span className="pill neutral" style={{ fontSize: 9 }}>{gcashReceipts.length} sale(s)</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>{formatPeso(gcashSalesTotal)}</strong>
                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{gcashPct}% of total</div>
                </div>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Card</span>
                    <span className="pill neutral" style={{ fontSize: 9 }}>{cardReceipts.length} sale(s)</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>{formatPeso(cardSalesTotal)}</strong>
                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{cardPct}% of total</div>
                </div>
              </div>
            </div>

            {/* Completed Transactions Table */}
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Completed Shift Transactions
              </h4>
              <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt ID</th>
                      <th>Time</th>
                      <th>Items</th>
                      <th>Payment</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftReceipts.map((trx) => (
                      <tr key={trx.id}>
                        <td><strong>{trx.id}</strong></td>
                        <td className="muted">{trx.time}</td>
                        <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trx.itemsSummary}</td>
                        <td><span className="pill neutral">{trx.method}</span></td>
                        <td style={{ textAlign: "right" }}><strong>{trx.totalFormatted}</strong></td>
                        <td><span className="pill success">{trx.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 2. CASH IN DRAWER MODAL */}
      {/* ========================================================================= */}
      {activeModal === "drawer" && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
        >
          <div className="modal" style={{ width: "min(640px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Cash in Drawer</h2>
                <p className="modal-sub">Live cash drawer audit and denominations count · Terminal #01</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveModal(null)}
                data-testid="button-close-drawer-modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Expected Cash Card */}
            <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", padding: "16px 18px", borderRadius: 14, marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Drawer Reconciliation Breakdown
              </h4>
              <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Opening cash / float (08:00 AM):</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>₱5,000.00</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Cash received from transactions:</span>
                  <strong style={{ color: "#34C759" }}>+{formatPeso(cashSalesTotal)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Mid-day cash drop (Transferred to main safe):</span>
                  <strong style={{ color: "#FF3B30" }}>-₱2,000.00</strong>
                </div>
                <div style={{ height: 1, background: "hsl(var(--border))", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                  <strong style={{ color: "hsl(var(--foreground))" }}>Current Expected Cash:</strong>
                  <strong style={{ color: "hsl(var(--foreground))" }}>{formatPeso(currentExpectedCash)}</strong>
                </div>
              </div>
            </div>

            {/* Physical Cash Denominations Table */}
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Drawer Count Reference (Denominations)
              </h4>
              <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Denomination</th>
                      <th style={{ textAlign: "center" }}>Count</th>
                      <th style={{ textAlign: "right" }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>₱1,000 Bill</td><td style={{ textAlign: "center" }}>{bills.k1000}</td><td style={{ textAlign: "right" }}>{formatPeso(bills.k1000 * 1000)}</td></tr>
                    <tr><td>₱500 Bill</td><td style={{ textAlign: "center" }}>{bills.k500}</td><td style={{ textAlign: "right" }}>{formatPeso(bills.k500 * 500)}</td></tr>
                    <tr><td>₱100 Bill</td><td style={{ textAlign: "center" }}>{bills.k100}</td><td style={{ textAlign: "right" }}>{formatPeso(bills.k100 * 100)}</td></tr>
                    <tr><td>₱50 Bill</td><td style={{ textAlign: "center" }}>{bills.k50}</td><td style={{ textAlign: "right" }}>{formatPeso(bills.k50 * 50)}</td></tr>
                    <tr><td>₱20 Bill</td><td style={{ textAlign: "center" }}>{bills.k20}</td><td style={{ textAlign: "right" }}>{formatPeso(bills.k20 * 20)}</td></tr>
                    <tr><td>Coins &amp; Loose Change</td><td style={{ textAlign: "center" }}>-</td><td style={{ textAlign: "right" }}>{formatPeso(bills.coins)}</td></tr>
                    <tr style={{ background: "hsl(var(--surface-soft))" }}>
                      <td><strong>Total Physical Count</strong></td>
                      <td style={{ textAlign: "center" }}><strong>{bills.k1000 + bills.k500 + bills.k100 + bills.k50 + bills.k20} bills</strong></td>
                      <td style={{ textAlign: "right" }}><strong>{formatPeso(currentExpectedCash)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 3. SHIFT RECEIPTS LOG MODAL (REPLACING TRANSACTIONS HANDLED) */}
      {/* ========================================================================= */}
      {activeModal === "transactions" && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
        >
          <div className="modal" style={{ width: "min(760px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Shift Receipts Log</h2>
                <p className="modal-sub">Receipts and transactions recorded during current shift (Terminal #01)</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveModal(null)}
                data-testid="button-close-trx-handled-modal"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div className="search-wrap" style={{ width: 240, height: 34 }}>
                <Search size={14} style={{ flexShrink: 0 }} />
                <input
                  type="search"
                  placeholder="Search receipt #, method..."
                  value={searchReceipt}
                  onChange={(e) => setSearchReceipt(e.target.value)}
                  style={{ border: "none", background: "transparent", boxShadow: "none", outline: "none", padding: 0, height: "100%", fontSize: 11 }}
                />
              </div>
              <span className="muted" style={{ fontSize: 11 }}>
                Showing {filteredShiftReceipts.length} recorded receipt(s)
              </span>
            </div>

            <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto", maxHeight: 380 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Time</th>
                    <th>Items</th>
                    <th>Method</th>
                    <th style={{ textAlign: "right" }}>Total Amount</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredShiftReceipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.id}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>{r.items} items</div>
                      </td>
                      <td className="muted">{r.time}</td>
                      <td style={{ fontSize: 11 }}>{r.itemsSummary}</td>
                      <td>
                        <span className={`pill ${r.method === "Cash" ? "success" : "neutral"}`} style={{ fontSize: 10, padding: "2px 8px" }}>
                          {r.method}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{r.totalFormatted}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          style={{ width: 26, height: 26 }}
                          title="View Receipt Details"
                          onClick={() => setSelectedReceipt(r)}
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredShiftReceipts.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 24 }} className="muted">
                        No shift receipts match that search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 4. TILL STATUS MODAL */}
      {/* ========================================================================= */}
      {activeModal === "till" && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
        >
          <div className="modal" style={{ width: "min(620px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Till Status &amp; Cash Reconciliation</h2>
                <p className="modal-sub">Register Terminal #01 cash audit and status</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveModal(null)}
                data-testid="button-close-till-modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Current Till Status Card */}
            <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", padding: "16px 18px", borderRadius: 14, marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Till Status Summary
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, fontSize: 12 }}>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Till Status:</span>
                  <span className="pill success" style={{ fontSize: 11 }}>Balanced</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Discrepancy (Over / Short):</span>
                  <strong style={{ color: "#34C759" }}>₱0.00 (Balanced)</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Expected Cash:</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>{formatPeso(currentExpectedCash)}</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Physical Count:</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>{formatPeso(currentExpectedCash)}</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Last Verification Time:</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>Active Shift</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Verified by Supervisor:</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>Admin Verified</strong>
                </div>
              </div>
            </div>

            {/* Verification History Log */}
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Till Reconciliation History (Today)
              </h4>
              <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Expected</th>
                      <th>Counted</th>
                      <th>Variance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>08:00 AM (Opening)</td>
                      <td>₱5,000.00</td>
                      <td>₱5,000.00</td>
                      <td>₱0.00</td>
                      <td><span className="pill success">Balanced</span></td>
                    </tr>
                    <tr>
                      <td>Active Audit (Current)</td>
                      <td>{formatPeso(currentExpectedCash)}</td>
                      <td>{formatPeso(currentExpectedCash)}</td>
                      <td>₱0.00</td>
                      <td><span className="pill success">Balanced</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Nested Receipt Details Modal */}
      {selectedReceipt &&
        createPortal(
          <div
            className="modal-backdrop"
            onClick={() => setSelectedReceipt(null)}
            style={{ zIndex: 1100 }}>
            <div
              className="modal dialog"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 440 }}>
              <div className="modal-header">
                <div>
                  <h2>Receipt Details ({selectedReceipt.id})</h2>
                  <p className="modal-sub">
                    Processed at {selectedReceipt.time} by{" "}
                    {selectedReceipt.cashier}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelectedReceipt(null)}>
                  <X size={16} />
                </button>
              </div>
              <div
                style={{
                  padding: "14px 0",
                  display: "grid",
                  gap: 8,
                  fontSize: 13,
                  borderTop: "1px solid hsl(var(--border))",
                  borderBottom: "1px solid hsl(var(--border))",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Transaction Status</span>
                  <span className="pill success">{selectedReceipt.status}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Payment Method</span>
                  <strong>{selectedReceipt.method}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Items Summary</span>
                  <span
                    style={{
                      fontSize: 11,
                      textAlign: "right",
                      maxWidth: 240,
                    }}>
                    {selectedReceipt.itemsSummary}
                  </span>
                </div>
                {selectedReceipt.amountReceived && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="muted">Amount Received</span>
                    <span>{selectedReceipt.amountReceived}</span>
                  </div>
                )}
                {selectedReceipt.change && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="muted">Change</span>
                    <span>{selectedReceipt.change}</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 16,
                    fontWeight: 700,
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: "1px solid hsl(var(--border))",
                  }}>
                  <span>Total Paid</span>
                  <span>{selectedReceipt.totalFormatted}</span>
                </div>
              </div>
              <div className="modal-actions" style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="button dark"
                  onClick={() => {
                    onToast(`Re-printing receipt ${selectedReceipt.id}...`);
                    setSelectedReceipt(null);
                  }}>
                  <Download size={13} /> Re-print Receipt
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
