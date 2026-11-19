import type { ComponentProps, ReactNode } from "react";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { Summary } from "./summary-card";

/** Presentation only. Availability includes a successful empty result. */
export type SourceState = { hasData: boolean; pending: boolean; error: string };

export function SourceProgress({ label }: { label: string }) {
  return <span className="action-progress" role="status">
    <LoaderCircle size={16} className="spin action-spinner" aria-hidden="true" />{label}
  </span>;
}

export function SourceRefreshButton({ status, label, onRefresh, retryOnError = true }: {
  status: SourceState; label: string; onRefresh: () => void; retryOnError?: boolean;
}) {
  return <button type="button" className="button soft" disabled={status.pending}
    aria-busy={status.pending} onClick={onRefresh}
    aria-label={status.pending ? `Refreshing ${label}` : status.error && retryOnError ? `Retry ${label}` : `Refresh ${label}`}>
    <RefreshCw size={14} className="spin action-spinner"
      style={{ animationPlayState: status.pending ? "running" : "paused" }} aria-hidden="true" />
    {status.error && retryOnError ? "Retry" : "Refresh"}
  </button>;
}

export function SourceFeedback({ status, label, onRetry }: {
  status: SourceState; label: string; onRetry?: () => void;
}) {
  if (!status.error) return null;
  return <div className="inline-error" role="alert">
    <span className="action-error-copy" style={{ flexBasis: "auto" }}>
      <AlertCircle size={16} aria-hidden="true" />
      <span>{status.error}{status.hasData ? ` Showing previously loaded ${label}.` : ""}</span>
    </span>
    {onRetry && <SourceRefreshButton status={status} label={label} onRefresh={onRetry} />}
  </div>;
}

export function SourcePlaceholder({ status, label }: { status: SourceState; label: string }) {
  return <div className="empty-state" role="status">
    {status.error ? <AlertCircle size={25} aria-hidden="true" /> :
      <LoaderCircle size={25} className="spin action-spinner" aria-hidden="true" />}
    <div>{status.error ? `${label} unavailable.` : `Loading ${label.toLowerCase()}…`}</div>
  </div>;
}

export function SourceRegion({ status, label, children }: {
  status: SourceState; label: string; children: ReactNode;
}) {
  return <>{status.hasData ? children : <SourcePlaceholder status={status} label={label} />}</>;
}

export function SourceTableBody({ status, label, colSpan, children }: {
  status: SourceState; label: string; colSpan: number; children: ReactNode;
}) {
  return <tbody aria-busy={status.pending}>
    {status.hasData ? children : <tr><td colSpan={colSpan} className="empty-state-cell">
      <SourcePlaceholder status={status} label={label} />
    </td></tr>}
  </tbody>;
}

export function SourceSummary({ status, ...props }: ComponentProps<typeof Summary> & { status: SourceState }) {
  return <Summary {...props} value={status.hasData ? props.value : "—"}
    caption={status.hasData ? props.caption : status.error ? "Data unavailable" : "Loading…"}
    tone={status.hasData ? props.tone : "muted"}
    action={status.hasData ? props.action : status.error ? <AlertCircle size={14} aria-hidden="true" /> :
      <LoaderCircle size={14} className="spin action-spinner" aria-hidden="true" />} />;
}

export function SourceText({ status, children }: { status: SourceState; children: ReactNode }) {
  return <>{status.hasData ? children : status.error ? "Unavailable" : "Loading\u2026"}</>;
}
