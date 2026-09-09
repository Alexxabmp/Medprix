import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Download, X } from "lucide-react";
import { cashMismatches, movementFast, movementSlow, products } from "@/lib/data";
import type { ReportType, ToastFn } from "@/lib/types";

// ─── Utility ──────────────────────────────────────────────────────────────────

export function exportReport(type: ReportType, onToast: ToastFn) {
  const content = `Medprix ${type} report\nGenerated August 18, 2026\n\nThis local report contains the latest pharmacy operations snapshot.`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  link.download = `medprix-${type}-report.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
  onToast("Report exported successfully");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function ReportMetric({ label, value }: { label: string; value: string }) {
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
            {row.map((cell, cellIndex) => (
              <td key={`${cell}-${cellIndex}`}>
                {cellIndex === row.length - 1 &&
                (cell.includes("stock") || cell.includes("Available")) ? (
                  <span className="pill success">{cell}</span>
                ) : (
                  cell
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReportModal({
  type,
  initialCashDetailRow = null,
  onClose,
  onToast,
}: {
  type: ReportType;
  initialCashDetailRow?: number | null;
  onClose: () => void;
  onToast: ToastFn;
}) {
  const [movementTab, setMovementTab] = useState<"fast" | "slow">("fast");
  const [cashDetailRow, setCashDetailRow] = useState<number | null>(
    initialCashDetailRow,
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

  const titles: Record<ReportType, string> = {
    sales: "Daily sales report",
    inventory: "Inventory report",
    financial: "Financial summary",
    valuation: "Stock valuation",
    movement: "Product movement",
    cash:
      cashDetailRow !== null
        ? `Cash mismatch – ${cashMismatches[cashDetailRow].date} ${cashMismatches[cashDetailRow].shift} shift`
        : "Cash mismatch alerts",
  };

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
            <p className="modal-sub">
              {cashDetailRow !== null
                ? `Shift reconciliation · ${cashMismatches[cashDetailRow].date} · Medprix Central`
                : type === "financial"
                  ? "Period: August 2026"
                  : "August 18, 2026 · Medprix Central"}
            </p>
          </div>
          {cashDetailRow !== null ? (
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
              <ReportMetric label="Total sales" value="₱45,250" />
              <ReportMetric label="Transactions" value="128" />
              <ReportMetric label="Products sold" value="356" />
            </div>
            <ModalSection title="Payment method">
              <ModalRow label="Cash" value="₱25,000" />
              <ModalRow label="Card" value="₱12,500" />
              <ModalRow label="E-wallet" value="₱7,750" />
            </ModalSection>
          </>
        )}

        {/* Inventory */}
        {type === "inventory" && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Total products" value="850" />
              <ReportMetric label="In stock" value="720" />
              <ReportMetric label="Low stock" value="95" />
            </div>
            <ModalSection title="Stock watchlist">
              <ModalTable
                headers={["Product", "Stock", "Status"]}
                rows={products
                  .slice(0, 3)
                  .map((p) => [p.name, String(p.stock), p.status])}
              />
            </ModalSection>
          </>
        )}

        {/* Financial */}
        {type === "financial" && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Total sales" value="₱450,000" />
              <ReportMetric label="Expenses" value="₱85,000" />
              <ReportMetric label="Net profit" value="₱365,000" />
            </div>
            <ModalSection title="Summary">
              <ModalRow label="Gross margin" value="81.1%" />
              <ModalRow label="Operating expenses" value="₱85,000" />
              <ModalRow label="Net profit margin" value="81.1%" />
            </ModalSection>
          </>
        )}

        {/* Valuation */}
        {type === "valuation" && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Current stock value" value="₱825,450" />
              <ReportMetric label="Units held" value="4,280" />
              <ReportMetric label="SKUs tracked" value="850" />
            </div>
            <ModalSection title="Value by product">
              <ModalTable
                headers={["Product", "Qty", "Value"]}
                rows={[
                  ["Paracetamol", "120", "₱600"],
                  ["Amoxicillin", "80", "₱960"],
                  ["Vitamin C", "50", "₱400"],
                ]}
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
              headers={["Product", "Units sold"]}
              rows={(movementTab === "fast" ? movementFast : movementSlow).map(
                (item) => [item.name, String(item.units)],
              )}
            />
          </>
        )}

        {/* Cash mismatch — list view */}
        {type === "cash" && cashDetailRow === null && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Open alerts" value="2" />
              <ReportMetric label="Short" value="₱500" />
              <ReportMetric label="Over" value="₱1,000" />
            </div>
            <ModalSection
              title={`${cashMismatches.length} inconsistencies detected`}>
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
                    <tr key={row.date + row.shift}>
                      <td>{row.date}</td>
                      <td>{row.shift}</td>
                      <td>{row.expected}</td>
                      <td>{row.recorded}</td>
                      <td
                        style={{
                          color: row.type === "short" ? "#ff8a7a" : "#7ed2a0",
                          fontWeight: 600,
                        }}>
                        {row.difference}
                      </td>
                      <td>
                        <button
                          className="button soft"
                          style={{
                            fontSize: 11,
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
                </tbody>
              </table>
            </ModalSection>
          </>
        )}

        {/* Cash mismatch — detail view for a specific row */}
        {type === "cash" &&
          cashDetailRow !== null &&
          (() => {
            const row = cashMismatches[cashDetailRow];
            return (
              <>
                <ModalSection title="Shift reconciliation">
                  <ModalRow
                    label="Date"
                    value={`August ${row.date.split(" ")[1]}, 2026`}
                  />
                  <ModalRow label="Shift" value={row.shift} />
                  <ModalRow label="Recorded sales" value={row.expected} />
                  <ModalRow label="Expected cash" value={row.expected} />
                  <ModalRow label="Actual cash" value={row.recorded} />
                  <ModalRow label="Difference" value={row.difference} />
                </ModalSection>
                <div
                  style={{
                    marginTop: 16,
                    padding: 13,
                    borderRadius: 12,
                    background: row.type === "short" ? "#30272b" : "#23302a",
                    color: row.type === "short" ? "#ffb5ad" : "#7ed2a0",
                    fontSize: 12,
                  }}>
                  {row.type === "short"
                    ? `Cash is ${row.difference.replace("-", "")} short. Review the register transactions before closing the shift.`
                    : `Cash is ${row.difference} over. Verify receipts and confirm no duplicate entries.`}
                </div>
                <div className="modal-actions">
                  <button
                    className="button dark"
                    data-testid="button-view-transactions"
                    onClick={() =>
                      onToast(
                        `Showing register transactions for the ${row.shift.toLowerCase()} shift`,
                      )
                    }>
                    View transactions <ArrowUpRight size={13} />
                  </button>
                </div>
              </>
            );
          })()}

        {type !== "cash" && (
          <div className="modal-actions">
            <button
              className="button dark"
              data-testid="button-export-report"
              onClick={() => exportReport(type, onToast)}>
              <Download size={14} /> Export report
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
