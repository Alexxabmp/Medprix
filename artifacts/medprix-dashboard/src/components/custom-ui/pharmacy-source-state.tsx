import type { ComponentProps, ReactNode } from "react";
import { usePharmacyInventoryStatus, usePharmacyTransactionsStatus,
  getPharmacyInventoryStatus, getPharmacyTransactionsStatus, fetchInventoryData, fetchTransactionsData } from "@/lib/pharmacy-store";
import { SourceFeedback, SourceRegion, SourceTableBody, SourceProgress, SourceSummary, SourceRefreshButton } from "./source-state";
import { Kpi } from "./kpi-card";

type Source = "inventory" | "transactions" | "both";
function useSource(source: Source) {
  const inventory = usePharmacyInventoryStatus();
  const transactions = usePharmacyTransactionsStatus();
  if (source === "inventory") return inventory;
  if (source === "transactions") return transactions;
  return { hasData: inventory.hasData && transactions.hasData,
    pending: inventory.pending || transactions.pending,
    error: [inventory.error, transactions.error].filter(Boolean).join(" ") };
}
function retry(source: Source) {
  if (source !== "transactions" && !getPharmacyInventoryStatus().pending) void fetchInventoryData(true);
  if (source !== "inventory" && !getPharmacyTransactionsStatus().pending) void fetchTransactionsData(true);
}
export function PharmacyFeedback({ source, label, showRetry = true }: { source: Source; label: string; showRetry?: boolean }) {
  return <SourceFeedback status={useSource(source)} label={label} onRetry={showRetry ? () => retry(source) : undefined} />;
}
export function PharmacyRefreshButton({ source, label }: { source: Source; label: string }) {
  return <SourceRefreshButton status={useSource(source)} label={label} onRefresh={() => retry(source)} />;
}
export function PharmacyRegion({ source, label, children }: { source: Source; label: string; children: ReactNode }) {
  return <SourceRegion status={useSource(source)} label={label}>{children}</SourceRegion>;
}
export function TransactionTableBody({ children, colSpan, label = "Receipts" }: { children: ReactNode; colSpan: number; label?: string }) {
  return <SourceTableBody status={usePharmacyTransactionsStatus()} label={label} colSpan={colSpan}>{children}</SourceTableBody>;
}
export function TransactionText({ children }: { children: ReactNode }) {
  const status = usePharmacyTransactionsStatus();
  return <>{status.hasData ? children : status.error ? "Unavailable" : "Loading…"}</>;
}
export function PharmacyKpi({ source, ...props }: ComponentProps<typeof Kpi> & { source: Source }) {
  const status = useSource(source);
  return <Kpi {...props} value={status.hasData ? props.value : "—"}
    change={status.hasData ? props.change : status.error ? "Data unavailable" : <SourceProgress label="Loading…" />}
    busy={!status.hasData && status.pending} onClick={status.hasData ? props.onClick : undefined} />;
}

export function TransactionSummary(props: Omit<ComponentProps<typeof SourceSummary>, "status">) {
  return <SourceSummary {...props} status={usePharmacyTransactionsStatus()} />;
}

export function ReportRegion({ type, children }: { type: string; children: ReactNode }) {
  if (type === "financial") return <>{children}</>;
  const source = type === "inventory" || type === "valuation" ? "inventory" : type === "movement" ? "both" : "transactions";
  return <><PharmacyFeedback source={source} label="report data" /><PharmacyRegion source={source} label="Report data">{children}</PharmacyRegion></>;
}

export { useSource as usePharmacySourceStatus };
export function PharmacyText({ source, children }: { source: Source; children: ReactNode }) {
  const status = useSource(source);
  return <>{status.hasData ? children : status.error ? "Unavailable" : "Loading\u2026"}</>;
}
