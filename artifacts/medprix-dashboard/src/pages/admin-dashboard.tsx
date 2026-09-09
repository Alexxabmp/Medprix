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

export default function AdminDashboardPage({ onToast }: { onToast: ToastFn }) {
  const [report, setReport] = useState<ReportType | null>(null);
  const [cashDetailRow, setCashDetailRow] = useState<number | null>(null);

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
          value="₱45,250"
          change="128 transactions"
          icon={BarChart3}
          onClick={() => setReport("sales")}
          testId="card-report-sales"
        />
        <Kpi
          label="Inventory"
          value="850 products"
          change="95 low stock"
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
          value="₱825,450"
          change="4,280 units held"
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
        data-testid="card-report-movement">
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
                style={{ height: `${Math.max((item.units / 250) * 82, 4)}%` }}>
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
              onClick={() => setReport("cash")}>
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
                className={`pill ${row.type === "short" ? "danger" : "success"}`}>
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
                }}>
                View details <ArrowUpRight size={11} />
              </button>
            </div>
          ))}
        </section>

        {/* Right: Product movement line graph */}
        <section
          className="surface-card list-card"
          data-testid="card-movement-graph">
          <div className="card-header">
            <div>
              <h2 className="card-title">Movement comparison</h2>
              <p className="card-subtitle">Fast vs. slow moving products</p>
            </div>
            <button
              className="button soft"
              data-testid="button-view-movement"
              onClick={() => setReport("movement")}>
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