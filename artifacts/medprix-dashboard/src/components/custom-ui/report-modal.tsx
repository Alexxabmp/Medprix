import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Download, X } from "lucide-react";
import {
  buildReportPdf,
  computeDashboardAnalytics,
  formatPeso,
  parseMoney,
  type DashboardAnalytics,
} from "@/lib/dashboard-analytics";
import type { ReportType, ToastFn } from "@/lib/types";

// --- Utility ---

export function exportReport(
  type: ReportType,
  onToast: ToastFn,
  analytics?: DashboardAnalytics,
) {
  const resolved = analytics ?? computeDashboardAnalytics([], [], new Date());
  const pdfBytes = buildReportPdf(type, resolved);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" }),
  );
  link.download = `medprix-${type}-report.pdf`;
  link.click();
  URL.revokeObjectURL(link.href);
  onToast("PDF report exported successfully");
}

// --- Sub-components ---

export function ReportMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="report-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ModalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="modal-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

export function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="modal-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ModalTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div style={{ maxHeight: 300, overflowY: "auto" }}>
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => {
                const isLast = cellIndex === row.length - 1;
                if (isLast && cell === "Available") {
                  return (
                    <td key={`${cell}-${cellIndex}`}>
                      <span className="pill success">{cell}</span>
                    </td>
                  );
                }
                if (isLast && (cell === "Low stock" || cell === "Out of stock")) {
                  return (
                    <td key={`${cell}-${cellIndex}`}>
                      <span
                        className={`pill ${cell === "Out of stock" ? "danger" : "warning"}`}>
                        {cell}
                      </span>
                    </td>
                  );
                }
                return <td key={`${cell}-${cellIndex}`}>{cell}</td>;
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <TableEmptyState colSpan={headers.length}>
                No records found.
              </TableEmptyState>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ReportModal({
  type,
  initialCashDetailRow = null,
  onClose,
  onToast,
  liveTransactions = [],
  liveProducts = [],
  salesDate = new Date(),
  analytics: providedAnalytics,
}: {
  type: ReportType;
  initialCashDetailRow?: number | null;
  onClose: () => void;
  onToast: ToastFn;
  liveTransactions?: any[];
  liveProducts?: any[];
  salesDate?: Date;
  analytics?: DashboardAnalytics;
}) {
  const [movementTab, setMovementTab] = useState<"fast" | "slow">("fast");
  const [cashDetailRow, setCashDetailRow] = useState<number | null>(
    initialCashDetailRow,
  );

  const analytics = useMemo(
    () =>
      providedAnalytics ??
      computeDashboardAnalytics(liveTransactions, liveProducts, salesDate),
    [providedAnalytics, liveTransactions, liveProducts, salesDate],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const cashMismatches = analytics.cash.mismatches;
  const activeCashRow =
    cashDetailRow !== null ? cashMismatches[cashDetailRow] ?? null : null;

  const titles: Record<ReportType, string> = {
    sales: "Daily sales report",
    inventory: "Inventory report",
    financial: "Financial summary",
    valuation: "Stock valuation",
    movement: "Product movement",
    cash: activeCashRow
      ? `Cash mismatch – ${activeCashRow.date} ${activeCashRow.shift} shift`
      : "Cash mismatch alerts",
  };

  const subtitle = activeCashRow
    ? `Shift reconciliation · ${activeCashRow.fullDateLabel} · Medprix Central`
    : type === "financial" || type === "movement" || type === "cash"
      ? `Period: ${analytics.periodLabel} · Medprix Central`
      : `${analytics.salesDateLabel} · Medprix Central`;

  return createPortal(
    <div
      className="modal-backdrop"
      data-testid="modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        data-testid={`modal-report-${type}`}>
        <div className="modal-header">
          <div>
            <h2>{titles[type]}</h2>
            <p className="modal-sub">{subtitle}</p>
          </div>
          {activeCashRow ? (
            <button
              className="button soft"
              style={{ marginRight: 8 }}
              onClick={() => setCashDetailRow(null)}>
              ← Back
            </button>
          ) : null}
          <button
            className="modal-close"
            data-testid="button-close-modal"
            onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Sales */}
        {type === "sales" && (
          <>
            <div className="report-metrics">
              <ReportMetric
                label="Total sales"
                value={formatPeso(analytics.dailySales.totalSales)}
              />
              <ReportMetric
                label="Transactions"
                value={String(analytics.dailySales.transactionCount)}
              />
              <ReportMetric
                label="Products sold"
                value={String(analytics.dailySales.productsSold)}
              />
            </div>
            <ModalSection title="Payment method">
              <ModalRow
                label={`Cash (${analytics.dailySales.cashCount} order(s))`}
                value={formatPeso(analytics.dailySales.cashSales)}
              />
              <ModalRow
                label={`Card (${analytics.dailySales.cardCount} order(s))`}
                value={formatPeso(analytics.dailySales.cardSales)}
              />
              <ModalRow
                label={`E-wallet (${analytics.dailySales.walletCount} order(s))`}
                value={formatPeso(analytics.dailySales.walletSales)}
              />
            </ModalSection>
            <ModalSection
              title={`Completed orders on ${analytics.salesDateLabel} (${analytics.dailySales.transactionCount})`}>
              <ModalTable
                headers={["Receipt #", "Payment", "Cashier", "Total"]}
                rows={analytics.dailySales.transactions.map((t) => [
                  String(t.transactionNumber || t.id),
                  String(t.payment || "Cash"),
                  String(t.user || "Cashier"),
                  formatPeso(parseMoney(t.total)),
                ])}
              />
            </ModalSection>
          </>
        )}

        {/* Inventory */}
        {type === "inventory" && (
          <>
            <div className="report-metrics">
              <ReportMetric
                label="Total products"
                value={String(analytics.inventory.totalProducts)}
              />
              <ReportMetric
                label="In stock"
                value={String(analytics.inventory.inStockCount)}
              />
              <ReportMetric
                label="Low stock"
                value={String(analytics.inventory.lowStockCount)}
              />
            </div>
            <ModalSection
              title={`Stock watchlist (${analytics.inventory.rows.length} SKUs)`}>
              <ModalTable
                headers={["Product", "SKU", "Stock", "Status"]}
                rows={analytics.inventory.rows.map((p) => [
                  p.name,
                  p.sku,
                  `${p.stock} (min ${p.reorder})`,
                  p.status,
                ])}
              />
            </ModalSection>
          </>
        )}

        {/* Financial */}
        {type === "financial" && (
          <>
            <div className="report-metrics">
              <ReportMetric
                label="Total sales"
                value={formatPeso(analytics.financial.totalSales)}
              />
              <ReportMetric
                label="Expenses (COGS)"
                value={formatPeso(analytics.financial.expenses)}
              />
              <ReportMetric
                label="Net profit"
                value={formatPeso(analytics.financial.netProfit)}
              />
            </div>
            <ModalSection title="Summary">
              <ModalRow
                label="Gross sales"
                value={formatPeso(analytics.financial.grossSales)}
              />
              <ModalRow
                label="Discounts granted"
                value={formatPeso(analytics.financial.totalDiscount)}
              />
              <ModalRow
                label="VAT collected"
                value={formatPeso(analytics.financial.totalVat)}
              />
              <ModalRow
                label="Cost of goods sold (COGS)"
                value={formatPeso(analytics.financial.expenses)}
              />
              <ModalRow
                label="Gross margin"
                value={`${analytics.financial.grossMarginPct.toFixed(1)}%`}
              />
              <ModalRow
                label="Net profit margin"
                value={`${analytics.financial.netProfitMarginPct.toFixed(1)}%`}
              />
            </ModalSection>
          </>
        )}

        {/* Valuation */}
        {type === "valuation" && (
          <>
            <div className="report-metrics">
              <ReportMetric
                label="Current stock value"
                value={formatPeso(analytics.valuation.totalRetailValue)}
              />
              <ReportMetric
                label="Units held"
                value={analytics.valuation.totalUnits.toLocaleString()}
              />
              <ReportMetric
                label="SKUs tracked"
                value={String(analytics.valuation.skusTracked)}
              />
            </div>
            <ModalSection
              title={`Value by product (${analytics.inventory.rows.length} SKUs)`}>
              <ModalTable
                headers={["Product", "Qty", "Unit price", "Value"]}
                rows={analytics.inventory.rows.map((p) => [
                  p.name,
                  String(p.stock),
                  formatPeso(p.price),
                  formatPeso(p.retailValue),
                ])}
              />
            </ModalSection>
          </>
        )}

        {/* Movement */}
        {type === "movement" && (
          <>
            <div className="modal-tabs">
              <button
                className={`modal-tab ${movementTab === "fast" ? "active" : ""}`}
                data-testid="tab-fast-moving"
                onClick={() => setMovementTab("fast")}>
                Fast moving
              </button>
              <button
                className={`modal-tab ${movementTab === "slow" ? "active" : ""}`}
                data-testid="tab-slow-moving"
                onClick={() => setMovementTab("slow")}>
                Slow moving
              </button>
            </div>
            <ModalTable
              headers={["Product", "Units sold", "Revenue", "Current stock"]}
              rows={(movementTab === "fast"
                ? analytics.movement.fastMovers
                : analytics.movement.slowMovers
              ).map((item) => [
                item.name,
                String(item.units),
                formatPeso(item.revenue),
                String(item.stock),
              ])}
            />
          </>
        )}

        {/* Cash mismatch — list view */}
        {type === "cash" && !activeCashRow && (
          <>
            <div className="report-metrics">
              <ReportMetric
                label="Open alerts"
                value={String(analytics.cash.openAlertsCount)}
              />
              <ReportMetric
                label="Short"
                value={formatPeso(analytics.cash.totalShortAmount)}
              />
              <ReportMetric
                label="Over"
                value={formatPeso(analytics.cash.totalOverAmount)}
              />
            </div>
            <ModalSection
              title={`${cashMismatches.length} inconsistencies detected`}>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Shift</th>
                      <th>Expected</th>
                      <th>Recorded</th>
                      <th>Difference</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashMismatches.map((row, index) => (
                      <tr key={row.dateKey + row.shift}>
                        <td>{row.date}</td>
                        <td>{row.shift}</td>
                        <td>{row.expected}</td>
                        <td>{row.recorded}</td>
                        <td
                          style={{
                            color:
                              row.type === "short" ? "#ff8a7a" : "#7ed2a0",
                            fontWeight: 600,
                          }}>
                          {row.difference}
                        </td>
                        <td>
                          <button
                            className="button soft"
                            style={{
                              fontSize: 12,
                              padding: "4px 10px",
                              height: "auto",
                            }}
                            data-testid={`button-view-cash-details-${index}`}
                            onClick={() => setCashDetailRow(index)}>
                            View details <ArrowUpRight size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {cashMismatches.length === 0 && (
                      <tr>
                        <TableEmptyState colSpan={6}>
                          No cash discrepancies detected across recorded shifts.
                        </TableEmptyState>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ModalSection>
          </>
        )}

        {/* Cash mismatch — detail view for a specific row */}
        {type === "cash" && activeCashRow && (
          <>
            <ModalSection title="Shift reconciliation">
              <ModalRow label="Date" value={activeCashRow.fullDateLabel} />
              <ModalRow label="Shift" value={activeCashRow.shift} />
              <ModalRow
                label="Expected cash"
                value={activeCashRow.expected}
              />
              <ModalRow
                label="Recorded cash"
                value={activeCashRow.recorded}
              />
              <ModalRow label="Difference" value={activeCashRow.difference} />
            </ModalSection>
            <ModalSection
              title={`Discrepant transactions (${activeCashRow.discrepantTransactions.length})`}>
              <ModalTable
                headers={["Receipt #", "Time", "Status", "Total"]}
                rows={activeCashRow.discrepantTransactions.map((t) => [
                  t.transactionNumber,
                  t.time,
                  t.status,
                  t.total,
                ])}
              />
            </ModalSection>
            <div
              style={{
                marginTop: 16,
                padding: 13,
                borderRadius: 12,
                background:
                  activeCashRow.type === "short" ? "#30272b" : "#23302a",
                color:
                  activeCashRow.type === "short" ? "#ffb5ad" : "#7ed2a0",
                fontSize: 12,
              }}>
              {activeCashRow.type === "short"
                ? `Cash is ${activeCashRow.difference.replace("-", "")} short due to cancelled/uncollected shift orders. Review the register transactions before closing the shift.`
                : `Cash is ${activeCashRow.difference} over net completed sales due to voided cash receipts. Verify drawer returns and confirm no duplicate entries.`}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button
            className="button dark"
            data-testid="button-export-report"
            onClick={() => exportReport(type, onToast, analytics)}>
            <Download size={14} /> Export report
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
