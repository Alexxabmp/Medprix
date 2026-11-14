import { AppTooltip } from "@/components/ui/tooltip";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
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
import { DateControl } from "@/components/custom-ui/date-control";
import { formatCalendarDate, recordsOnDate } from "@/lib/business-date";
import { useBusinessDate } from "@/lib/use-business-date";
import { summarizeShiftSales } from "@/lib/shift-sales";
import { printReceipt } from "@/lib/receipt-print";
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
  const { receipts, loading: isLoading } = usePharmacyTransactions();
  const { date: shiftDate, selectDate } = useBusinessDate();
  const shiftReceipts = recordsOnDate(receipts, shiftDate);
  const dateLabel = formatCalendarDate(shiftDate);

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

  const {
    completed: completedReceipts, total: totalSales, count: totalReceiptsCount,
    average: avgBasket, cash: cashSalesTotal, gcash: gcashSalesTotal, card: cardSalesTotal,
    cashCount, gcashCount, cardCount,
  } = summarizeShiftSales(shiftReceipts);

  const cashPct = totalSales > 0 ? ((cashSalesTotal / totalSales) * 100).toFixed(1) : "0.0";
  const gcashPct = totalSales > 0 ? ((gcashSalesTotal / totalSales) * 100).toFixed(1) : "0.0";
  const cardPct = totalSales > 0 ? ((cardSalesTotal / totalSales) * 100).toFixed(1) : "0.0";

  const currentCashSales = summarizeShiftSales(recordsOnDate(receipts, new Date())).cash;

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
            <DateControl date={shiftDate} onDateChange={selectDate} />
          </div>
        }
      />

      {/* 4 Feature Boxes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                <h3 className="card-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Shift Sales · {dateLabel}</h3>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              View completed sales for {dateLabel}, receipt counts, and revenue breakdown by payment method.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatPeso(totalSales)}</div>
              <span className="muted" style={{ fontSize: 12 }}>{totalReceiptsCount} receipts completed</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 12 }}>
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
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Monitor physical cash float, incoming cash transactions, mid-day safe drops, and expected cash in the register.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Not recorded</div>
              <span className="muted" style={{ fontSize: 12 }}>Cash sales today: {formatPeso(currentCashSales)}</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 12 }}>
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
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Transactions recorded on {dateLabel}. Search receipt numbers, inspect itemized sales, and audit cashier receipts.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{shiftReceipts.length} Receipts Logged</div>
              <span className="muted" style={{ fontSize: 12 }}>Total {formatPeso(totalSales)} recorded</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 12 }}>
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
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Check live cash till balance status (Balanced, Over, Short), discrepancy checks, and supervisor verification logs.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="pill neutral" style={{ fontSize: 12 }}>Not recorded</span>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>No verification loaded</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 12 }}>
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
          <div className="modal dialog" style={{ width: "min(680px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Shift Sales · {dateLabel}</h2>
                <p className="modal-sub">Completed sales recorded on {dateLabel}</p>
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
                <span className="muted" style={{ fontSize: 12, display: "block" }}>Total shift sales</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>{formatPeso(totalSales)}</strong>
                <span style={{ color: "#34C759", fontSize: 12, fontWeight: 600 }}>Across all payment modes</span>
              </div>
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                <span className="muted" style={{ fontSize: 12, display: "block" }}>Transactions</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>{totalReceiptsCount} Orders</strong>
                <span className="muted" style={{ fontSize: 12 }}>Completed transactions</span>
              </div>
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                <span className="muted" style={{ fontSize: 12, display: "block" }}>Average basket</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>{formatPeso(avgBasket)}</strong>
                <span className="muted" style={{ fontSize: 12 }}>Per customer order</span>
              </div>
            </div>

            {/* Sales Breakdown by Payment Method */}
            <div style={{ marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Payment Method Breakdown
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Cash</span>
                    <span className="pill success" style={{ fontSize: 12 }}>{cashCount} sale(s)</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>{formatPeso(cashSalesTotal)}</strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{cashPct}% of total</div>
                </div>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>GCash</span>
                    <span className="pill neutral" style={{ fontSize: 12 }}>{gcashCount} sale(s)</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>{formatPeso(gcashSalesTotal)}</strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{gcashPct}% of total</div>
                </div>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Card</span>
                    <span className="pill neutral" style={{ fontSize: 12 }}>{cardCount} sale(s)</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>{formatPeso(cardSalesTotal)}</strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{cardPct}% of total</div>
                </div>
              </div>
            </div>

            {/* Completed Transactions Table */}
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
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
                    {completedReceipts.map((trx) => (
                      <tr key={trx.id}>
                        <td><strong>{trx.id}</strong></td>
                        <td className="muted">{trx.time}</td>
                        <td style={{ maxWidth: 220 }}>
                          <div style={{ maxHeight: 48, overflowY: "auto", fontSize: 12 }}>
                            {trx.itemsSummary.split(", ").map((s, i) => (
                              <div key={i}>{s}</div>
                            ))}
                          </div>
                        </td>
                        <td><span className="pill neutral">{trx.method}</span></td>
                        <td style={{ textAlign: "right" }}><strong>{trx.totalFormatted}</strong></td>
                        <td><span className="pill success">{trx.status}</span></td>
                      </tr>
                    ))}
                    {completedReceipts.length === 0 && (
                      <tr>
                        <TableEmptyState colSpan={6} icon={Receipt}>
                          No completed sales recorded on {dateLabel}.
                        </TableEmptyState>
                      </tr>
                    )}
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
          <div className="modal dialog" style={{ width: "min(640px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Cash in Drawer</h2>
                <p className="modal-sub">Recorded cash sales and drawer information</p>
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

            <div className="surface-card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span className="muted">Cash sales today</span>
                <strong>{formatPeso(currentCashSales)}</strong>
              </div>
              <p className="muted" style={{ margin: "14px 0 0", fontSize: 12, lineHeight: 1.5 }}>
                No opening float, cash drop, or physical cash count is available. Drawer balance and denominations are not recorded.
              </p>
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
          <div className="modal dialog" style={{ width: "min(760px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Shift Receipts Log</h2>
                <p className="modal-sub">Receipts and transactions recorded on {dateLabel}</p>
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
                  style={{ border: "none", background: "transparent", boxShadow: "none", outline: "none", padding: 0, height: "100%", fontSize: 12 }}
                />
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
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
                        <div className="muted" style={{ fontSize: 12 }}>{r.items} items</div>
                      </td>
                      <td className="muted">{r.time}</td>
                      <td style={{ fontSize: 12, maxWidth: 220 }}>
                        <div style={{ maxHeight: 48, overflowY: "auto" }}>
                          {r.itemsSummary.split(", ").map((s, i) => (
                            <div key={i}>{s}</div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${r.method === "Cash" ? "success" : "neutral"}`} style={{ fontSize: 12, padding: "2px 8px" }}>
                          {r.method}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{r.totalFormatted}</strong>
                      </td>
                      <td>
                        <AppTooltip content={"View Receipt Details"}><button
                          type="button"
                          className="icon-button"
                          style={{ width: 26, height: 26 }}

                          onClick={() => setSelectedReceipt(r)}
                        >
                          <Eye size={13} />
                        </button></AppTooltip>
                      </td>
                    </tr>
                  ))}
                  {filteredShiftReceipts.length === 0 && (
                    <tr>
                      <TableEmptyState colSpan={6} icon={Receipt}>
                        No receipts match {dateLabel} and the current search.
                      </TableEmptyState>
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
          <div className="modal dialog" style={{ width: "min(620px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Till Status &amp; Cash Reconciliation</h2>
                <p className="modal-sub">Recorded cash audit and verification information</p>
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

            <div className="surface-card" style={{ padding: 18 }}>
              <span className="pill neutral">Not recorded</span>
              <p className="muted" style={{ margin: "14px 0 0", fontSize: 12, lineHeight: 1.5 }}>
                No till reconciliation or supervisor verification is available. A balance or variance cannot be shown without recorded counts.
              </p>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span className="muted">Items</span>
                  <div style={{ fontSize: 12, textAlign: "right", maxWidth: 240 }}>
                    {selectedReceipt.itemsList && selectedReceipt.itemsList.length > 0
                      ? selectedReceipt.itemsList.map((item, i) => (
                          <div key={i}>{item.product} ×{item.quantity}{item.unitPrice ? ` @ ${item.unitPrice}` : ""}</div>
                        ))
                      : selectedReceipt.itemsSummary.split(", ").map((s, i) => (
                          <div key={i}>{s}</div>
                        ))
                    }
                  </div>
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
                  onClick={async () => {
                    try {
                      await printReceipt(selectedReceipt);
                    } catch {
                      onToast("Could not prepare the receipt. Please try printing again.");
                    }
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
