import { AsyncActionButton } from "@/components/custom-ui/async-action-button";
import { PharmacyRegion, PharmacyFeedback } from "@/components/custom-ui/pharmacy-source-state";
import { AppTooltip } from "@/components/ui/tooltip";
import { displayPeso } from "@/lib/currency";
import { ModalTableDialog, ModalDataTable } from "@/components/modal-data-table";
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
  Check,
  Pencil,
  Minus,
  Coins,
  Banknote,
  Trash2,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { DateControl } from "@/components/custom-ui/date-control";
import { formatCalendarDate, localDateKey, recordsOnDate } from "@/lib/business-date";
import { useBusinessDate } from "@/lib/use-business-date";
import { summarizeShiftSales } from "@/lib/shift-sales";
import { printReceipt } from "@/lib/receipt-print";
import type { ToastFn, ShiftReceipt } from "@/lib/types";
import { fetchCashReconciliations, usePharmacyCashReconciliations, usePharmacyTransactions } from "@/lib/pharmacy-store";

export type { ShiftReceipt };

type Denomination = {
  key: string;
  label: string;
  value: number;
  type: "bill" | "coin";
};

const PHILIPPINE_DENOMINATIONS: Denomination[] = [
  { key: "b1000", label: "₱1,000 Bill", value: 1000, type: "bill" },
  { key: "b500", label: "₱500 Bill", value: 500, type: "bill" },
  { key: "b200", label: "₱200 Bill", value: 200, type: "bill" },
  { key: "b100", label: "₱100 Bill", value: 100, type: "bill" },
  { key: "b50", label: "₱50 Bill", value: 50, type: "bill" },
  { key: "b20", label: "₱20 Bill", value: 20, type: "bill" },
  { key: "c20", label: "₱20 Coin", value: 20, type: "coin" },
  { key: "c10", label: "₱10 Coin", value: 10, type: "coin" },
  { key: "c5", label: "₱5 Coin", value: 5, type: "coin" },
  { key: "c1", label: "₱1 Coin", value: 1, type: "coin" },
  { key: "c025", label: "25¢ Coin", value: 0.25, type: "coin" },
];

const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CashierReviewPage({
  onToast,
  currentRole,
}: {
  onToast: ToastFn;
  currentRole?: string;
}) {
  const role = (currentRole || localStorage.getItem("medprix-role") || "").toLowerCase();
  const isAdmin = role === "admin" || role === "administrator";
  const [activeModal, setActiveModal] = useState<"sales" | "drawer" | "transactions" | "till" | null>(null);
  const { receipts } = usePharmacyTransactions();
  const { records: cashReconciliations } = usePharmacyCashReconciliations();
  const { date: shiftDate, selectDate } = useBusinessDate();
  const shiftReceipts = recordsOnDate(receipts, shiftDate);
  const dateLabel = formatCalendarDate(shiftDate);
  const dateKey = localDateKey(shiftDate);

  // Cash Float state per date
  const [cashFloatCounts, setCashFloatCounts] = useState<Record<string, number>>({});
  const [isAddingFloat, setIsAddingFloat] = useState(false);
  const [floatEditCounts, setFloatEditCounts] = useState<Record<string, number>>({});

  // Till status / Physical cash count state per date
  const [actualCashInput, setActualCashInput] = useState<string>("");
  const [isCountSaved, setIsCountSaved] = useState<boolean>(false);
  const [tillNotes, setTillNotes] = useState<string>("");
  const [showTillDenominations, setShowTillDenominations] = useState<boolean>(false);
  const [tillDenomCounts, setTillDenomCounts] = useState<Record<string, number>>({});

  // Load saved float & till reconciliation for selected date
  useEffect(() => {
    try {
      const storedFloat = localStorage.getItem(`medprix_cash_float_${dateKey}`);
      if (storedFloat) {
        setCashFloatCounts(JSON.parse(storedFloat));
      } else {
        setCashFloatCounts({});
      }
    } catch {
      setCashFloatCounts({});
    }

    try {
      const storedTill = localStorage.getItem(`medprix_till_count_${dateKey}`);
      if (storedTill) {
        const parsed = JSON.parse(storedTill);
        setActualCashInput(parsed.countedCash !== undefined ? String(parsed.countedCash) : "");
        setTillNotes(parsed.notes || "");
        setIsCountSaved(true);
      } else {
        const serverRec = cashReconciliations.find((r) => r.reconciliationDate === dateKey);
        if (serverRec) {
          setActualCashInput(String(serverRec.cashOnHand));
          setTillNotes(serverRec.notes || "");
          setIsCountSaved(true);
        } else {
          setActualCashInput("");
          setTillNotes("");
          setIsCountSaved(false);
        }
      }
    } catch {
      setActualCashInput("");
      setTillNotes("");
      setIsCountSaved(false);
    }
    setIsAddingFloat(false);
    setShowTillDenominations(false);
  }, [dateKey, cashReconciliations]);

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

  // Calculations for Cash in Drawer
  const cashFloatTotal = PHILIPPINE_DENOMINATIONS.reduce(
    (sum, d) => sum + (Number(cashFloatCounts[d.key]) || 0) * d.value,
    0
  );
  const hasRecordedFloat = cashFloatTotal > 0 || Object.values(cashFloatCounts).some((v) => Number(v) > 0);

  const draftFloatTotal = PHILIPPINE_DENOMINATIONS.reduce(
    (sum, d) => sum + (Number(floatEditCounts[d.key]) || 0) * d.value,
    0
  );

  const expectedCashInDrawer = cashFloatTotal + cashSalesTotal;
  const actualSales = cashSalesTotal;

  // Calculations for Till Status (Over / Short)
  const enteredCashNum = actualCashInput.trim() !== "" ? parseFloat(actualCashInput) : null;
  const variance = enteredCashNum !== null && !isNaN(enteredCashNum)
    ? enteredCashNum - expectedCashInDrawer
    : null;
  const isBalanced = variance !== null && Math.abs(variance) < 0.01;
  const isOver = variance !== null && variance >= 0.01;
  const isShort = variance !== null && variance <= -0.01;

  const handleSaveFloat = () => {
    if (!isAdmin) {
      onToast("Only administrators can record or edit cash float.");
      return;
    }
    setCashFloatCounts(floatEditCounts);
    try {
      localStorage.setItem(`medprix_cash_float_${dateKey}`, JSON.stringify(floatEditCounts));
    } catch {}
    setIsAddingFloat(false);
    onToast(`Cash float of ${formatPeso(draftFloatTotal)} recorded.`);
  };

  const handleClearFloat = () => {
    if (!isAdmin) {
      onToast("Only administrators can clear cash float.");
      return;
    }
    setCashFloatCounts({});
    setFloatEditCounts({});
    try {
      localStorage.removeItem(`medprix_cash_float_${dateKey}`);
    } catch {}
    setIsAddingFloat(false);
    onToast("Cash float cleared.");
  };

  const handleSaveTillCount = () => {
    if (!isAdmin) {
      onToast("Only administrators can record till reconciliations.");
      return;
    }
    if (enteredCashNum === null || isNaN(enteredCashNum)) {
      onToast("Please enter the actual physical cash amount.");
      return;
    }
    const statusStr = isBalanced ? "Balanced" : isOver ? "Over" : "Short";
    try {
      localStorage.setItem(`medprix_till_count_${dateKey}`, JSON.stringify({
        countedCash: enteredCashNum,
        expectedCash: expectedCashInDrawer,
        variance,
        status: statusStr,
        notes: tillNotes,
        updatedAt: new Date().toISOString(),
      }));
    } catch {}

    fetch("/api/admin/cash-reconciliations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        reconciliationDate: dateKey,
        cashOnHand: enteredCashNum,
        totalReportedSales: expectedCashInDrawer,
        discrepancyAmount: variance,
        notes: tillNotes,
      }),
    })
      .then(() => {
        void fetchCashReconciliations(true);
      })
      .catch(() => {});

    setIsCountSaved(true);
    const varianceDesc = isBalanced
      ? "Balanced (₱0.00)"
      : isOver
        ? `Over by +${formatPeso(variance!)}`
        : `Short by -${formatPeso(Math.abs(variance!))}`;
    onToast(`Till reconciliation recorded: ${varianceDesc}`);
  };

  const handleClearTillCount = async () => {
    if (!isAdmin) {
      onToast("Only administrators can reset till reconciliations.");
      return;
    }
    setActualCashInput("");
    setTillNotes("");
    setIsCountSaved(false);
    try {
      localStorage.removeItem(`medprix_till_count_${dateKey}`);
    } catch {}

    try {
      await fetch(`/api/admin/cash-reconciliations/${encodeURIComponent(dateKey)}?date=${encodeURIComponent(dateKey)}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {}

    void fetchCashReconciliations(true);
    onToast("Till reconciliation count reset.");
  };

  const handleApplyTillDenominations = () => {
    const total = PHILIPPINE_DENOMINATIONS.reduce(
      (sum, d) => sum + (Number(tillDenomCounts[d.key]) || 0) * d.value,
      0
    );
    setActualCashInput(total.toFixed(2));
    setShowTillDenominations(false);
    onToast(`Applied denomination count: ${formatPeso(total)}`);
  };

  const filteredShiftReceipts = shiftReceipts.filter(
    (r) =>
      r.id.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      r.method.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      (r.itemsSummary && r.itemsSummary.toLowerCase().includes(searchReceipt.toLowerCase())),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeading
        className="date-page-heading"
        title="Shift review & register operations"
        description="Select any of the 4 register features to view shift sales, drawer balance, handled transactions, or till status."
        action={
          <DateControl date={shiftDate} onDateChange={selectDate} />
        }
      />

      <PharmacyFeedback source="transactions" label="shift receipts" />
      <PharmacyRegion source="transactions" label="Shift receipts">
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
              <span className={hasRecordedFloat ? "pill success" : "pill neutral"} style={{ fontSize: 11, padding: "2px 8px" }}>
                {hasRecordedFloat ? `Float: ${formatPeso(cashFloatTotal)}` : "Float not set"}
              </span>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Monitor physical cash float, incoming cash transactions, and expected cash in the register.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatPeso(expectedCashInDrawer)}</div>
              <span className="muted" style={{ fontSize: 12 }}>
                Float: {formatPeso(cashFloatTotal)} · Cash sales: {formatPeso(cashSalesTotal)}
              </span>
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
              <div>
                {enteredCashNum === null ? (
                  <span className="pill neutral" style={{ fontSize: 11, padding: "2px 8px" }}>Not recorded</span>
                ) : isBalanced ? (
                  <span className="pill success" style={{ fontSize: 11, padding: "2px 8px" }}>Balanced</span>
                ) : isOver ? (
                  <span className="pill blue" style={{ fontSize: 11, padding: "2px 8px" }}>Over (+{formatPeso(variance!)})</span>
                ) : (
                  <span className="pill danger" style={{ fontSize: 11, padding: "2px 8px" }}>Short (-{formatPeso(Math.abs(variance!))})</span>
                )}
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Check live cash till balance status (Balanced, Over, Short), discrepancy checks, and supervisor verification logs.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {enteredCashNum !== null ? formatPeso(enteredCashNum) : "Not recorded"}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {enteredCashNum !== null
                  ? `Expected: ${formatPeso(expectedCashInDrawer)} · Diff: ${variance! >= 0 ? "+" : ""}${formatPeso(variance!)}`
                  : `Expected in drawer: ${formatPeso(expectedCashInDrawer)}`}
              </span>
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
          <ModalTableDialog className="modal dialog"  close={() => setActiveModal(null)}>
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
                <span style={{ color: "var(--success-text)", fontSize: 12, fontWeight: 600 }}>Across all payment modes</span>
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
              <div className="table-scroll" >
                <ModalDataTable className="data-table">
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
                        <td style={{ textAlign: "right" }}><strong>{displayPeso(trx.totalFormatted)}</strong></td>
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
                </ModalDataTable>
              </div>
            </div>
          </ModalTableDialog>
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
          <div className="modal dialog" style={{ width: "min(720px, 100%)", maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column" }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div>
                <h2>Cash in Drawer</h2>
                <p className="modal-sub">Date: {dateLabel} · Starting float, retail/POS sales, and drawer balance</p>
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

            <div style={{ flex: "1 1 auto", overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
              {/* Cash Float Card */}
              <div className="surface-card" style={{ padding: 18, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Banknote size={16} />
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Starting Cash Float</h3>
                      <span className={hasRecordedFloat ? "pill success" : "pill neutral"} style={{ fontSize: 11, padding: "2px 8px" }}>
                        {hasRecordedFloat ? `${formatPeso(cashFloatTotal)} Recorded` : "Not recorded"}
                      </span>
                    </div>
                    <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                      Initial cash placed in the register for change (panukli) at the start of shift.
                    </p>
                  </div>
                  {isAdmin ? (
                    !isAddingFloat && (
                      <button
                        type="button"
                        className="button primary-action"
                        style={{ fontSize: 12, padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
                        onClick={() => {
                          setFloatEditCounts({ ...cashFloatCounts });
                          setIsAddingFloat(true);
                        }}
                      >
                        {hasRecordedFloat ? <Pencil size={13} /> : <Plus size={13} />}
                        {hasRecordedFloat ? "Edit cash float" : "Add cash float"}
                      </button>
                    )
                  ) : (
                    <span className="pill neutral" style={{ fontSize: 11, padding: "4px 10px" }}>
                      Admin only
                    </span>
                  )}
                </div>

                {isAdmin && isAddingFloat ? (
                  /* Form to input Philippine bills and coins */
                  <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: 14, marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Enter Philippine Bills &amp; Coins</span>
                      <span className="muted" style={{ fontSize: 12 }}>Quantities of each denomination</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                      {/* Bills column */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>
                          <Banknote size={13} /> Paper Bills
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {PHILIPPINE_DENOMINATIONS.filter((d) => d.type === "bill").map((d) => {
                            const count = Number(floatEditCounts[d.key]) || 0;
                            const subtotal = count * d.value;
                            return (
                              <div
                                key={d.key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  background: "hsl(var(--background))",
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  border: "1px solid hsl(var(--border))",
                                  fontSize: 12,
                                }}
                              >
                                <span style={{ fontWeight: 600, minWidth: 64 }}>{d.label}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <button
                                    type="button"
                                    className="button soft"
                                    style={{ width: 24, height: 24, padding: 0, minWidth: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                    onClick={() => setFloatEditCounts((prev) => ({ ...prev, [d.key]: Math.max(0, (Number(prev[d.key]) || 0) - 1) }))}
                                  >
                                    <Minus size={11} />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={floatEditCounts[d.key] ?? ""}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const val = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setFloatEditCounts((prev) => ({ ...prev, [d.key]: val }));
                                    }}
                                    style={{ width: 48, height: 26, textAlign: "center", padding: "0 4px", fontSize: 12, fontWeight: 600 }}
                                  />
                                  <button
                                    type="button"
                                    className="button soft"
                                    style={{ width: 24, height: 24, padding: 0, minWidth: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                    onClick={() => setFloatEditCounts((prev) => ({ ...prev, [d.key]: (Number(prev[d.key]) || 0) + 1 }))}
                                  >
                                    <Plus size={11} />
                                  </button>
                                </div>
                                <span style={{ minWidth: 70, textAlign: "right", fontWeight: 600, color: subtotal > 0 ? "hsl(var(--foreground))" : "hsl(var(--muted))" }}>
                                  {formatPeso(subtotal)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Coins column */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>
                          <Coins size={13} /> Coins
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {PHILIPPINE_DENOMINATIONS.filter((d) => d.type === "coin").map((d) => {
                            const count = Number(floatEditCounts[d.key]) || 0;
                            const subtotal = count * d.value;
                            return (
                              <div
                                key={d.key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  background: "hsl(var(--background))",
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  border: "1px solid hsl(var(--border))",
                                  fontSize: 12,
                                }}
                              >
                                <span style={{ fontWeight: 600, minWidth: 64 }}>{d.label}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <button
                                    type="button"
                                    className="button soft"
                                    style={{ width: 24, height: 24, padding: 0, minWidth: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                    onClick={() => setFloatEditCounts((prev) => ({ ...prev, [d.key]: Math.max(0, (Number(prev[d.key]) || 0) - 1) }))}
                                  >
                                    <Minus size={11} />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={floatEditCounts[d.key] ?? ""}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const val = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setFloatEditCounts((prev) => ({ ...prev, [d.key]: val }));
                                    }}
                                    style={{ width: 48, height: 26, textAlign: "center", padding: "0 4px", fontSize: 12, fontWeight: 600 }}
                                  />
                                  <button
                                    type="button"
                                    className="button soft"
                                    style={{ width: 24, height: 24, padding: 0, minWidth: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                    onClick={() => setFloatEditCounts((prev) => ({ ...prev, [d.key]: (Number(prev[d.key]) || 0) + 1 }))}
                                  >
                                    <Plus size={11} />
                                  </button>
                                </div>
                                <span style={{ minWidth: 70, textAlign: "right", fontWeight: 600, color: subtotal > 0 ? "hsl(var(--foreground))" : "hsl(var(--muted))" }}>
                                  {formatPeso(subtotal)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Total & Action Buttons */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid hsl(var(--border))", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <span className="muted" style={{ fontSize: 12, display: "block" }}>Calculated Cash Float</span>
                        <strong style={{ fontSize: 18, color: "hsl(var(--foreground))" }}>{formatPeso(draftFloatTotal)}</strong>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          className="button primary-action"
                          style={{ padding: "6px 14px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                          onClick={handleSaveFloat}
                        >
                          <Check size={13} /> Save cash float
                        </button>
                        <button
                          type="button"
                          className="button soft"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={() => setIsAddingFloat(false)}
                        >
                          Cancel
                        </button>
                        {hasRecordedFloat && (
                          <button
                            type="button"
                            className="button soft"
                            style={{ padding: "6px 12px", fontSize: 12, color: "hsl(var(--destructive))" }}
                            onClick={handleClearFloat}
                          >
                            <Trash2 size={12} /> Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Display recorded denominations if present */
                  <div>
                    {hasRecordedFloat ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {PHILIPPINE_DENOMINATIONS.filter((d) => (Number(cashFloatCounts[d.key]) || 0) > 0).map((d) => {
                          const count = Number(cashFloatCounts[d.key]);
                          const subtotal = count * d.value;
                          return (
                            <span
                              key={d.key}
                              style={{
                                background: "hsl(var(--surface-soft))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                padding: "4px 9px",
                                fontSize: 12,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <strong>{d.label}</strong>
                              <span className="muted">× {count}</span>
                              <span style={{ fontWeight: 600 }}>({formatPeso(subtotal)})</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ background: "hsl(var(--surface-soft))", borderRadius: 8, padding: "10px 14px", marginTop: 8, fontSize: 12 }} className="muted">
                        {isAdmin ? (
                          <>No cash float has been recorded for {dateLabel}. Click <strong>Add cash float</strong> above to record starting bills and coins.</>
                        ) : (
                          <>No cash float has been recorded for {dateLabel}. Only administrators can record or edit starting cash float.</>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4-Item Summary Section */}
              <div style={{ marginTop: 20 }}>
                <h4 style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                  Drawer Cash Summary
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Banknote size={14} className="muted" />
                      <span className="muted" style={{ fontSize: 12 }}>Cash float</span>
                    </div>
                    <strong style={{ fontSize: 19, display: "block", color: "hsl(var(--foreground))" }}>{formatPeso(cashFloatTotal)}</strong>
                    <span className="muted" style={{ fontSize: 11 }}>Starting register cash</span>
                  </div>

                  <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Receipt size={14} className="muted" />
                      <span className="muted" style={{ fontSize: 12 }}>Total cash sales for the day</span>
                    </div>
                    <strong style={{ fontSize: 19, display: "block", color: "hsl(var(--foreground))" }}>{formatPeso(cashSalesTotal)}</strong>
                    <span style={{ color: "var(--success-text, #10b981)", fontSize: 11, fontWeight: 600 }}>From {cashCount} retail/POS cash receipts</span>
                  </div>

                  <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <CircleDollarSign size={14} className="muted" />
                      <span className="muted" style={{ fontSize: 12 }}>Expected cash in drawer</span>
                    </div>
                    <strong style={{ fontSize: 19, display: "block", color: "hsl(var(--foreground))" }}>{formatPeso(expectedCashInDrawer)}</strong>
                    <span className="muted" style={{ fontSize: 11 }}>Cash Float + Cash Sales</span>
                  </div>

                  <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <ShoppingCart size={14} className="muted" />
                      <span className="muted" style={{ fontSize: 12 }}>Actual sales</span>
                    </div>
                    <strong style={{ fontSize: 19, display: "block", color: "hsl(var(--foreground))" }}>{formatPeso(actualSales)}</strong>
                    <span className="muted" style={{ fontSize: 11 }}>Total completed cash sales</span>
                  </div>
                </div>
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
          <ModalTableDialog className="modal dialog"  close={() => setActiveModal(null)}>
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

            <div className="table-scroll" >
              <ModalDataTable className="data-table">
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
              </ModalDataTable>
            </div>
          </ModalTableDialog>
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
          <div className="modal dialog" style={{ width: "min(680px, 100%)", maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column" }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2>Till Status &amp; Cash Reconciliation</h2>
                  {!isAdmin && (
                    <span className="pill neutral" style={{ fontSize: 11 }}>Read-only</span>
                  )}
                </div>
                <p className="modal-sub">Date: {dateLabel} · Terminal #01 Cash Audit &amp; Balance Verification</p>
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

            <div style={{ flex: "1 1 auto", overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
              {/* Expected Balance Reference */}
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <span className="muted">Starting Float: <strong>{formatPeso(cashFloatTotal)}</strong></span>
                  <span className="muted">+</span>
                  <span className="muted">POS Cash Sales: <strong>{formatPeso(cashSalesTotal)}</strong></span>
                  <span className="muted">=</span>
                  <span>Expected in Drawer: <strong style={{ fontSize: 14, color: "hsl(var(--foreground))" }}>{formatPeso(expectedCashInDrawer)}</strong></span>
                </div>
              </div>

              {/* Physical Cash Input */}
              <div className="surface-card" style={{ padding: 18, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label htmlFor="actual-cash-input" style={{ fontSize: 13, fontWeight: 600 }}>
                    Physical Cash Counted in Drawer (₱)
                  </label>
                  {isAdmin && (
                    <button
                      type="button"
                      className="button soft"
                      style={{ fontSize: 11, padding: "3px 8px" }}
                      onClick={() => setActualCashInput(expectedCashInDrawer.toFixed(2))}
                    >
                      Match expected ({formatPeso(expectedCashInDrawer)})
                    </button>
                  )}
                </div>

                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18, fontWeight: 700, color: "hsl(var(--muted))" }}>₱</span>
                  <input
                    id="actual-cash-input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    disabled={!isAdmin}
                    readOnly={!isAdmin}
                    style={{
                      width: "100%",
                      paddingLeft: 32,
                      fontSize: 18,
                      fontWeight: 700,
                      height: 44,
                      background: isAdmin ? "hsl(var(--background))" : "hsl(var(--surface-soft))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                      cursor: isAdmin ? "text" : "not-allowed",
                    }}
                  />
                </div>

                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {isAdmin
                      ? "Enter the counted cash to calculate if the till is Balanced, Over, or Short."
                      : "Physical cash count and reconciliation can only be entered by an administrator."}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      className="button soft"
                      style={{ fontSize: 11, padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                      onClick={() => {
                        setTillDenomCounts({ ...cashFloatCounts });
                        setShowTillDenominations(!showTillDenominations);
                      }}
                    >
                      <Coins size={12} /> {showTillDenominations ? "Hide bill breakdown" : "Count with bills & coins"}
                    </button>
                  )}
                </div>

                {/* Optional Denominations Counter for Till */}
                {isAdmin && showTillDenominations && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid hsl(var(--border))" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Count by Philippine Denominations:</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6 }}>
                      {PHILIPPINE_DENOMINATIONS.map((d) => (
                        <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 4, background: "hsl(var(--surface-soft))", padding: "4px 8px", borderRadius: 6, fontSize: 11 }}>
                          <span style={{ fontWeight: 600, minWidth: 46 }}>{d.label}</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={tillDenomCounts[d.key] ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                              setTillDenomCounts((prev) => ({ ...prev, [d.key]: val }));
                            }}
                            style={{ width: 40, height: 22, textAlign: "center", fontSize: 11, padding: 0 }}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="button primary-action"
                        style={{ fontSize: 11, padding: "4px 10px" }}
                        onClick={handleApplyTillDenominations}
                      >
                        Apply counted total
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Automatic Over / Short Calculation Result Card */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: isBalanced
                    ? "1px solid var(--success-text, #10b981)"
                    : isOver
                      ? "1px solid #3b82f6"
                      : isShort
                        ? "1px solid hsl(var(--destructive))"
                        : "1px solid hsl(var(--border))",
                  background: isBalanced
                    ? "hsl(var(--mint) / 0.15)"
                    : isOver
                      ? "#eff6ff"
                      : isShort
                        ? "hsl(var(--peach) / 0.15)"
                        : "hsl(var(--surface-soft))",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, color: "hsl(var(--muted))" }}>
                    Automated Reconciliation Result
                  </span>
                  <div>
                    {enteredCashNum === null ? (
                      <span className="pill neutral" style={{ fontSize: 12 }}>Awaiting count</span>
                    ) : isBalanced ? (
                      <span className="pill success" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Check size={12} /> Balanced
                      </span>
                    ) : isOver ? (
                      <span className="pill blue" style={{ fontSize: 12 }}>
                        Over by +{formatPeso(variance!)}
                      </span>
                    ) : (
                      <span className="pill danger" style={{ fontSize: 12 }}>
                        Short by -{formatPeso(Math.abs(variance!))}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, fontSize: 12 }}>
                  <div>
                    <span className="muted" style={{ display: "block" }}>Expected cash:</span>
                    <strong style={{ fontSize: 15 }}>{formatPeso(expectedCashInDrawer)}</strong>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block" }}>Counted cash:</span>
                    <strong style={{ fontSize: 15 }}>{enteredCashNum !== null ? formatPeso(enteredCashNum) : "—"}</strong>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block" }}>Discrepancy (Over / Short):</span>
                    {enteredCashNum === null ? (
                      <span className="muted">—</span>
                    ) : isBalanced ? (
                      <strong style={{ color: "var(--success-text, #10b981)", fontSize: 15 }}>₱0.00 (Balanced)</strong>
                    ) : isOver ? (
                      <strong style={{ color: "#1d4ed8", fontSize: 15 }}>+{formatPeso(variance!)} (Over)</strong>
                    ) : (
                      <strong style={{ color: "hsl(var(--destructive))", fontSize: 15 }}>-{formatPeso(Math.abs(variance!))} (Short)</strong>
                    )}
                  </div>
                </div>

                <p className="muted" style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.4 }}>
                  {enteredCashNum === null
                    ? "Enter physical cash in the field above to verify register balance against POS sales."
                    : isBalanced
                      ? "✓ Cash drawer is balanced. The physical money exactly matches the expected sales and float."
                      : isOver
                        ? `▲ Drawer is Over by +${formatPeso(variance!)}. Physical cash exceeds the expected register amount.`
                        : `▼ Drawer is Short by -${formatPeso(Math.abs(variance!))}. Physical cash is less than the expected register amount.`}
                </p>
              </div>

              {/* Auditor Note */}
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="till-notes" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Auditor / Supervisor Verification Notes {isAdmin ? "(Optional)" : ""}
                </label>
                <input
                  id="till-notes"
                  type="text"
                  placeholder={isAdmin ? "e.g. Verified by Admin at shift close" : "No supervisor notes entered."}
                  value={tillNotes}
                  onChange={(e) => setTillNotes(e.target.value)}
                  disabled={!isAdmin}
                  readOnly={!isAdmin}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    padding: "8px 12px",
                    background: isAdmin ? "hsl(var(--background))" : "hsl(var(--surface-soft))",
                    cursor: isAdmin ? "text" : "not-allowed",
                  }}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ flexShrink: 0, marginTop: 14, paddingTop: 12, borderTop: "1px solid hsl(var(--border))", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
              {isAdmin ? (
                <>
                  {isCountSaved && (
                    <button
                      type="button"
                      className="button soft"
                      style={{ color: "hsl(var(--destructive))", marginRight: "auto" }}
                      onClick={handleClearTillCount}
                    >
                      <Trash2 size={13} /> Reset count
                    </button>
                  )}
                  <button
                    type="button"
                    className="button primary-action"
                    onClick={handleSaveTillCount}
                    disabled={enteredCashNum === null || isNaN(enteredCashNum)}
                  >
                    <Check size={14} /> Save Till Reconciliation
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <ShieldCheck size={14} /> Read-only mode · Only an administrator can record or edit till reconciliations.
                  </span>
                </div>
              )}
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
                          <div key={i}>{item.product} ×{item.quantity}{item.unitPrice ? ` @ ${displayPeso(item.unitPrice)}` : ""}</div>
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
                    <span>{displayPeso(selectedReceipt.amountReceived)}</span>
                  </div>
                )}
                {selectedReceipt.change && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="muted">Change</span>
                    <span>{displayPeso(selectedReceipt.change)}</span>
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
                  <span>{displayPeso(selectedReceipt.totalFormatted)}</span>
                </div>
              </div>
              <div className="modal-actions" style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <AsyncActionButton
                  type="button"
                  className="button dark"
                  pendingLabel={"Preparing receipt\u2026"}
                  onAction={() => printReceipt(selectedReceipt)}
                  onError={() => onToast("Could not prepare the receipt. Please try printing again.")}>
                  <Download size={13} /> Re-print Receipt
                </AsyncActionButton>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </PharmacyRegion>
    </div>
  );
}
