import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  CircleDollarSign,
  FileBarChart,
  Package,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { DateControl } from "@/components/custom-ui/date-control";
import { useBusinessDate } from "@/lib/use-business-date";
import { Kpi } from "@/components/custom-ui/kpi-card";
import { MovementLineGraph } from "@/components/custom-ui/movement-line-graph";
import { ReportModal } from "@/components/custom-ui/report-modal";
import {
  financialArReviewMessage,
  formatPeso,
} from "@/lib/dashboard-analytics";
import { useDashboardAnalytics } from "@/lib/use-dashboard-analytics";
import type { ReportType, ToastFn } from "@/lib/types";

export default function AdminDashboardPage({ onToast }: { onToast: ToastFn }) {
  const [report, setReport] = useState<ReportType | null>(null);
  const [cashDetailRow, setCashDetailRow] = useState<number | null>(null);
  const { date: salesDate, selectDate } = useBusinessDate();
  const { analytics, transactions, inventoryProducts, retryFinance } =
    useDashboardAnalytics(salesDate);
  const financial = analytics.financial;

  const barItems = useMemo(
    () => analytics.movement.chartFast.concat(analytics.movement.chartSlow),
    [analytics.movement.chartFast, analytics.movement.chartSlow],
  );
  const maxBarUnits = useMemo(
    () => Math.max(...barItems.map((item) => item.units), 1),
    [barItems],
  );

  const displayedCashMismatches = analytics.cash.mismatches.slice(0, 4);

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeading
        title="Hello, Admin!"
        description="Here's the shape of your pharmacy today."
        action={
          <DateControl
            label="Select date"
            testId="control-date"
            date={salesDate}
            onDateChange={selectDate}
          />
        }
      />

      {/* 4 KPI boxes — report summaries, click to open report */}
      <section className="kpi-grid">
        <Kpi
          label="Daily sales"
          value={formatPeso(analytics.dailySales.totalSales)}
          change={`${analytics.dailySales.transactionCount} completed · ${analytics.salesDateLabel}`}
          icon={BarChart3}
          onClick={() => setReport("sales")}
          testId="card-report-sales"
        />
        <Kpi
          label="Inventory"
          value={`${analytics.inventory.totalProducts} products`}
          change={`${analytics.inventory.lowStockCount} low stock`}
          icon={Package}
          onClick={() => setReport("inventory")}
          testId="card-report-inventory"
        />
        <Kpi
          label="Financial · All Time"
          value={
            financial.status === "ready"
              ? formatPeso(financial.data.revenue.total)
              : formatPeso(analytics.dailySales.totalSales)
          }
          change={
            financial.status === "ready"
              ? financialArReviewMessage(financial.data)
              : "All-time financial summary"
          }
          icon={CircleDollarSign}
          onClick={() => setReport("financial")}
          testId="card-report-financial"
        />
        <Kpi
          label="Stock value"
          value={formatPeso(analytics.valuation.totalRetailValue)}
          change={`${analytics.valuation.totalUnits.toLocaleString()} units held`}
          icon={Boxes}
          onClick={() => setReport("valuation")}
          testId="card-report-valuation"
        />
      </section>

      <section
        className="surface-card chart-card"
        style={{ cursor: "pointer" }}
        onClick={() => setReport("movement")}
        data-testid="card-report-movement"
      >
        <div className="card-header">
          <div>
            <h2 className="card-title">Product movement</h2>
            <p className="card-subtitle">
              Units sold · {analytics.periodLabel} (
              {analytics.movement.totalUnitsSold.toLocaleString()} total units)
            </p>
          </div>
          <div className="chart-legend">
            <span className="legend-dot" /> Units sold{" "}
            <ArrowUpRight size={13} />
          </div>
        </div>
        <div className="bar-chart">
          {barItems.map((item, i) => (
            <div className="bar-wrap" key={`${item.name}-${i}`}>
              <div
                className={`bar ${i === 0 ? "peak" : ""}`}
                style={{
                  height: `${Math.max((item.units / maxBarUnits) * 82, 4)}%`,
                }}
              >
                <span className="bar-value">{item.units}</span>
              </div>
              <span className="bar-label">{item.name.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Two list cards — cash mismatch + fast movers */}
      <div className="grid grid-cols-1 md:grid-cols-[1.45fr_1fr] gap-4">
        {/* Left: cash mismatch */}
        <section className="surface-card list-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Cash mismatch</h2>
              <p className="card-subtitle">
                {analytics.cash.openAlertsCount} inconsistencies detected
              </p>
            </div>
            <button
              className="button soft"
              data-testid="card-report-cash"
              onClick={() => setReport("cash")}
            >
              View alerts
            </button>
          </div>
          {displayedCashMismatches.map((row, index) => (
            <div className="list-row" key={row.dateKey + row.shift}>
              <div className="row-icon">
                <FileBarChart size={15} />
              </div>
              <div className="row-main">
                <strong>
                  {row.date} · {row.shift} shift
                </strong>
                <span>
                  Expected {row.expected} · Recorded {row.recorded}
                </span>
              </div>
              <span
                className={`pill ${row.type === "short" ? "danger" : "success"}`}
              >
                {row.difference}
              </span>
              <button
                className="button soft"
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  height: "auto",
                  flexShrink: 0,
                }}
                data-testid={`button-view-cash-details-${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCashDetailRow(index);
                  setReport("cash");
                }}
              >
                View <ArrowUpRight size={11} />
              </button>
            </div>
          ))}
          {displayedCashMismatches.length === 0 && (
            <div className="list-row">
              <div className="row-main">
                <strong>All shifts balanced</strong>
                <span>
                  No cash discrepancies detected in recorded transactions.
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Right: Product movement line graph */}
        <section
          className="surface-card list-card"
          data-testid="card-movement-graph"
        >
          <div className="card-header">
            <div>
              <h2 className="card-title">Movement comparison</h2>
              <p className="card-subtitle">Fast vs. slow moving products</p>
            </div>
            <button
              className="button soft"
              data-testid="button-view-movement"
              onClick={() => setReport("movement")}
            >
              View all
            </button>
          </div>
          <MovementLineGraph
            fastMovers={analytics.movement.chartFast}
            slowMovers={analytics.movement.chartSlow}
          />
        </section>
      </div>

      {report && (
        <ReportModal
          type={report}
          initialCashDetailRow={cashDetailRow}
          liveTransactions={transactions}
          liveProducts={inventoryProducts}
          salesDate={salesDate}
          analytics={analytics}
          onRetryFinance={retryFinance}
          onClose={() => {
            setReport(null);
            setCashDetailRow(null);
          }}
          onToast={onToast}
        />
      )}
    </div>
  );
}
