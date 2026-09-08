import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
    ArrowUpRight,
    CalendarDays,
    CircleDollarSign,
    Receipt,
    ShieldCheck,
    ShoppingCart,
    X,
    type LucideIcon,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import type { ToastFn } from "@/lib/types";

export default function CashierReviewPage({ onToast }: { onToast: ToastFn }) {
    const [activeModal, setActiveModal] = useState<"sales" | "drawer" | "transactions" | "till" | null>(null);

    // Modal body scroll lock
    useEffect(() => {
        if (!activeModal) {
            return undefined;
        }
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, [activeModal]);

    const shiftTransactions = [
        {
            id: "CS-9401",
            time: "10:14 AM",
            items: "Paracetamol 500mg (2), Vitamin C (1)",
            total: "₱195.00",
            method: "Cash",
            cashier: "Maria Santos",
            status: "Completed",
        },
        {
            id: "CS-9400",
            time: "09:48 AM",
            items: "Cough relief syrup 120ml (1)",
            total: "₱145.00",
            method: "GCash",
            cashier: "Maria Santos",
            status: "Completed",
        },
        {
            id: "CS-9399",
            time: "09:12 AM",
            items: "Amoxicillin 500mg Box (1), Cetirizine (4)",
            total: "₱520.00",
            method: "Card",
            cashier: "Maria Santos",
            status: "Completed",
        },
        {
            id: "CS-9398",
            time: "08:35 AM",
            items: "Mefenamic Acid 500mg (2), Antacid (1)",
            total: "₱85.00",
            method: "Cash",
            cashier: "Maria Santos",
            status: "Completed",
        },
        {
            id: "TRX-0005",
            time: "11:20 AM",
            items: "Sterile Normal Saline (5), Surgical Gloves (10)",
            total: "₱18,450.00",
            method: "Cash",
            cashier: "Maria Santos",
            status: "Completed",
        },
    ];

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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: "hsl(var(--surface-soft))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--foreground))" }}>
                                <Receipt size={18} />
                            </div>
                            <span className="pill neutral" style={{ fontSize: 10 }}>Feature 1</span>
                        </div>
                        <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Today's Shift Sales</h3>
                        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                            View total sales made during your active shift, receipt counts, and revenue breakdown by payment method.
                        </p>
                    </div>

                    <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>₱19,395.00</div>
                            <span className="muted" style={{ fontSize: 11 }}>5 receipts completed</span>
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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: "hsl(var(--surface-soft))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--foreground))" }}>
                                <CircleDollarSign size={18} />
                            </div>
                            <span className="pill neutral" style={{ fontSize: 10 }}>Feature 2</span>
                        </div>
                        <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Cash in Drawer</h3>
                        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                            Monitor physical cash float, incoming cash transactions, mid-day safe drops, and expected cash in the register.
                        </p>
                    </div>

                    <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>₱11,780.00</div>
                            <span className="muted" style={{ fontSize: 11 }}>Float: ₱5,000 · Cash sales: ₱8,780</span>
                        </div>
                        <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
                            Open feature <ArrowUpRight size={12} />
                        </button>
                    </div>
                </div>

                {/* 3. Transactions Handled */}
                <div
                    className="surface-card"
                    style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
                    onClick={() => setActiveModal("transactions")}
                    data-testid="card-feature-transactions-handled"
                >
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: "hsl(var(--surface-soft))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--foreground))" }}>
                                <ShoppingCart size={18} />
                            </div>
                            <span className="pill neutral" style={{ fontSize: 10 }}>Feature 3</span>
                        </div>
                        <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Transactions Handled</h3>
                        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                            View a full history and receipt breakdown of transactions you personally processed during your active shift.
                        </p>
                    </div>

                    <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>5 Handled</div>
                            <span className="muted" style={{ fontSize: 11 }}>Avg ₱3,879.00 / order</span>
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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: "hsl(var(--surface-soft))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--foreground))" }}>
                                <ShieldCheck size={18} />
                            </div>
                            <span className="pill neutral" style={{ fontSize: 10 }}>Feature 4</span>
                        </div>
                        <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Till Status</h3>
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
                            <span className="muted" style={{ fontSize: 11 }}>Verified 2:00 PM today</span>
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
                                <p className="modal-sub">Sales performance summary for Maria Santos (Shift #1)</p>
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
                                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>₱19,395.00</strong>
                                <span style={{ color: "#34C759", fontSize: 10, fontWeight: 600 }}>Across all payment modes</span>
                            </div>
                            <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                                <span className="muted" style={{ fontSize: 11, display: "block" }}>Total receipts</span>
                                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>5</strong>
                                <span style={{ color: "#34C759", fontSize: 10, fontWeight: 600 }}>Transactions completed</span>
                            </div>
                            <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                                <span className="muted" style={{ fontSize: 11, display: "block" }}>Average transaction</span>
                                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>₱3,879.00</strong>
                                <span style={{ color: "#34C759", fontSize: 10, fontWeight: 600 }}>Average basket size</span>
                            </div>
                        </div>

                        {/* Sales by Payment Method */}
                        <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", padding: "16px 18px", borderRadius: 14, marginBottom: 18 }}>
                            <h4 style={{ margin: "0 0 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                                Sales by Payment Method
                            </h4>
                            <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ color: "hsl(var(--foreground))", fontWeight: 600 }}>💵 Cash</span>
                                    <div style={{ display: "flex", gap: 12 }}>
                                        <span className="muted">3 receipts (45.3%)</span>
                                        <strong style={{ color: "hsl(var(--foreground))" }}>₱8,780.00</strong>
                                    </div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ color: "hsl(var(--foreground))", fontWeight: 600 }}>📱 GCash / E-Wallet</span>
                                    <div style={{ display: "flex", gap: 12 }}>
                                        <span className="muted">1 receipt (28.2%)</span>
                                        <strong style={{ color: "hsl(var(--foreground))" }}>₱5,475.00</strong>
                                    </div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ color: "hsl(var(--foreground))", fontWeight: 600 }}>💳 Credit / Debit Card</span>
                                    <div style={{ display: "flex", gap: 12 }}>
                                        <span className="muted">1 receipt (26.5%)</span>
                                        <strong style={{ color: "hsl(var(--foreground))" }}>₱5,140.00</strong>
                                    </div>
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
                                        {shiftTransactions.map((trx) => (
                                            <tr key={trx.id}>
                                                <td><strong>{trx.id}</strong></td>
                                                <td className="muted">{trx.time}</td>
                                                <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trx.items}</td>
                                                <td><span className="pill neutral">{trx.method}</span></td>
                                                <td style={{ textAlign: "right" }}><strong>{trx.total}</strong></td>
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
                    <div className="modal" style={{ width: "min(620px, 100%)" }}>
                        <div className="modal-header">
                            <div>
                                <h2>Cash in Drawer</h2>
                                <p className="modal-sub">Physical cash float and register balance breakdown</p>
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
                                    <strong style={{ color: "#34C759" }}>+₱8,780.00</strong>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span className="muted">Mid-day cash drop (Transferred to main safe):</span>
                                    <strong style={{ color: "#FF3B30" }}>-₱2,000.00</strong>
                                </div>
                                <div style={{ height: 1, background: "hsl(var(--border))", margin: "4px 0" }} />
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                                    <strong style={{ color: "hsl(var(--foreground))" }}>Current Expected Cash:</strong>
                                    <strong style={{ color: "hsl(var(--foreground))" }}>₱11,780.00</strong>
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
                                        <tr><td>₱1,000 Bill</td><td style={{ textAlign: "center" }}>8</td><td style={{ textAlign: "right" }}>₱8,000.00</td></tr>
                                        <tr><td>₱500 Bill</td><td style={{ textAlign: "center" }}>5</td><td style={{ textAlign: "right" }}>₱2,500.00</td></tr>
                                        <tr><td>₱100 Bill</td><td style={{ textAlign: "center" }}>10</td><td style={{ textAlign: "right" }}>₱1,000.00</td></tr>
                                        <tr><td>₱50 Bill</td><td style={{ textAlign: "center" }}>4</td><td style={{ textAlign: "right" }}>₱200.00</td></tr>
                                        <tr><td>₱20 Bill</td><td style={{ textAlign: "center" }}>3</td><td style={{ textAlign: "right" }}>₱60.00</td></tr>
                                        <tr><td>Coins &amp; Loose Change</td><td style={{ textAlign: "center" }}>-</td><td style={{ textAlign: "right" }}>₱20.00</td></tr>
                                        <tr style={{ background: "hsl(var(--surface-soft))" }}>
                                            <td><strong>Total Physical Count</strong></td>
                                            <td style={{ textAlign: "center" }}><strong>30 units</strong></td>
                                            <td style={{ textAlign: "right" }}><strong>₱11,780.00</strong></td>
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
            {/* 3. TRANSACTIONS HANDLED MODAL */}
            {/* ========================================================================= */}
            {activeModal === "transactions" && createPortal(
                <div
                    className="modal-backdrop"
                    onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
                >
                    <div className="modal" style={{ width: "min(720px, 100%)" }}>
                        <div className="modal-header">
                            <div>
                                <h2>Transactions Handled</h2>
                                <p className="modal-sub">Receipts processed by Maria Santos on Terminal #01</p>
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

                        <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto" }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Transaction ID</th>
                                        <th>Date &amp; Time</th>
                                        <th>Items</th>
                                        <th style={{ textAlign: "right" }}>Total Amount</th>
                                        <th>Payment Method</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shiftTransactions.map((trx) => (
                                        <tr key={trx.id}>
                                            <td><strong>{trx.id}</strong></td>
                                            <td className="muted">{trx.time}</td>
                                            <td>{trx.items}</td>
                                            <td style={{ textAlign: "right" }}><strong>{trx.total}</strong></td>
                                            <td><span className="pill neutral">{trx.method}</span></td>
                                            <td><span className="pill success">{trx.status}</span></td>
                                        </tr>
                                    ))}
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
                                    <strong style={{ color: "hsl(var(--foreground))" }}>₱11,780.00</strong>
                                </div>
                                <div>
                                    <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Physical Count:</span>
                                    <strong style={{ color: "hsl(var(--foreground))" }}>₱11,780.00</strong>
                                </div>
                                <div>
                                    <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Last Verification Time:</span>
                                    <strong style={{ color: "hsl(var(--foreground))" }}>September 1, 2026 – 2:00 PM</strong>
                                </div>
                                <div>
                                    <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Verified by Supervisor:</span>
                                    <strong style={{ color: "hsl(var(--foreground))" }}>Juan Dela Cruz (Admin)</strong>
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
                                            <td>12:00 PM (Midday Check)</td>
                                            <td>₱8,280.00</td>
                                            <td>₱8,280.00</td>
                                            <td>₱0.00</td>
                                            <td><span className="pill success">Balanced</span></td>
                                        </tr>
                                        <tr>
                                            <td>02:00 PM (Afternoon Audit)</td>
                                            <td>₱11,780.00</td>
                                            <td>₱11,780.00</td>
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
        </div>
    );
}