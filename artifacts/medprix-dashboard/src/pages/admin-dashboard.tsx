import { useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  FileBarChart,
  Package,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Kpi } from "@/components/custom-ui/kpi-card";
import { MovementLineGraph } from "@/components/custom-ui/movement-line-graph";
import { ReportModal } from "@/components/custom-ui/report-modal";
import { cashMismatches, movementFast, movementSlow } from "@/lib/data";
import type { ReportType, ToastFn } from "@/lib/types";
import { usePharmacyTransactions, usePharmacyInventory } from "@/lib/pharmacy-store";

const formatPeso = (val: number) =>
  `₱${val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminDashboardPage({ onToast }: { onToast: ToastFn }) {
  const [report, setReport] = useState<ReportType | null>(null);
  const [cashDetailRow, setCashDetailRow] = useState<number | null>(null);

  const { transactions } = usePharmacyTransactions();
  const { items: inventoryProducts } = usePharmacyInventory();

  const liveDailySales = transactions.reduce((sum, t) => {
    const val = parseFloat(String(t.total || "0").replace("₱", "").replace(/,/g, "")) || 0;
    return sum + val;
  }, 0);
  const liveTxCount = transactions.length;

  const liveProductCount = inventoryProducts.length;
  const liveLowStockCount = inventoryProducts.filter((p) => {
    const stock = Array.isArray(p.batches)
      ? p.batches.reduce((sum: number, b: any) => sum + (Number(b.quantity) || 0), 0)
      : (Number(p.stock) || 0);
    return stock <= (Number(p.reorder) || 10);
  }).length;
  const liveTotalStockUnits = inventoryProducts.reduce((sum, p) => {
    const stock = Array.isArray(p.batches)
      ? p.batches.reduce((bSum: number, b: any) => bSum + (Number(b.quantity) || 0), 0)
      : (Number(p.stock) || 0);
    return sum + stock;
  }, 0);
  const liveStockValuation = inventoryProducts.reduce((sum, p) => {
    const stock = Array.isArray(p.batches)
      ? p.batches.reduce((bSum: number, b: any) => bSum + (Number(b.quantity) || 0), 0)
      : (Number(p.stock) || 0);
    const priceNum = parseFloat(String(p.price || "0").replace("₱", "").replace(/,/g, "")) || 0;
    return sum + stock * priceNum;
  }, 0);

  return (
    <div>
      <PageHeading
        title="Hello, Admin!"
        description="Here's the shape of your pharmacy today."
        action={
          <label className="date-control" data-testid="control-date">
            <CalendarDays size={14} />
            <span>Select date</span>
            <input
              type="date"
              aria-label="Select date"
              defaultValue="2026-08-18"
            />
          </label>
        }
      />

      {/* 4 KPI boxes — report summaries, click to open report */}
      <section className="kpi-grid">
        <Kpi
          label="Daily sales"
          value={formatPeso(liveDailySales)}
          change={`${liveTxCount} transactions logged`}
          icon={BarChart3}
          onClick={() => setReport("sales")}
          testId="card-report-sales"
        />
        <Kpi
          label="Inventory"
          value={`${liveProductCount} products`}
          change={`${liveLowStockCount} low stock`}
          icon={Package}
          onClick={() => setReport("inventory")}
          testId="card-report-inventory"
        />
        <Kpi
          label="Financial"
          value="₱450,000"
          change="₱365K net profit"
          icon={CircleDollarSign}
          onClick={() => setReport("financial")}
          testId="card-report-financial"
        />
        <Kpi
          label="Stock value"
          value={formatPeso(liveStockValuation)}
          change={`${liveTotalStockUnits.toLocaleString()} units held`}
          icon={Boxes}
          onClick={() => setReport("valuation")}
          testId="card-report-valuation"
        />
      </section>

      {/* Bar chart box — product movement */}
      <section
        className="surface-card chart-card"
        style={{ cursor: "pointer" }}
        onClick={() => setReport("movement")}
        data-testid="card-report-movement"
      >
        <div className="card-header">
          <div>
            <h2 className="card-title">Product movement</h2>
            <p className="card-subtitle">Units sold · August 2026</p>
          </div>
          <div className="chart-legend">
            <span className="legend-dot" /> Units sold{" "}
            <ArrowUpRight size={13} />
          </div>
        </div>
        <div className="bar-chart">
          {movementFast.concat(movementSlow).map((item, i) => (
            <div className="bar-wrap" key={item.name}>
              <div
                className={`bar ${i === 0 ? "peak" : ""}`}
                style={{ height: `${Math.max((item.units / 250) * 82, 4)}%` }}
              >
                <span className="bar-value">{item.units}</span>
              </div>
              <span className="bar-label">{item.name.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Two list cards — cash mismatch + fast movers */}
      <div className="dashboard-lower">
        {/* Left: cash mismatch */}
        <section className="surface-card list-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Cash mismatch</h2>
              <p className="card-subtitle">2 inconsistencies detected</p>
            </div>
            <button
              className="button soft"
              data-testid="card-report-cash"
              onClick={() => setReport("cash")}
            >
              View alerts
            </button>
          </div>
          {cashMismatches.map((row, index) => (
            <div className="list-row" key={row.date + row.shift}>
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
                  fontSize: 11,
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
                View details <ArrowUpRight size={11} />
              </button>
            </div>
          ))}
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
          <MovementLineGraph />
        </section>
      </div>

      {report && (
        <ReportModal
          type={report}
          initialCashDetailRow={cashDetailRow}
          liveTransactions={transactions}
          liveProducts={inventoryProducts}
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
