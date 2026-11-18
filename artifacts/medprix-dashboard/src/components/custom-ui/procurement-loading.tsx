import type { ComponentProps } from "react";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { Summary } from "./summary-card";

export function ProcurementSummary({ hasData, error, ...props }: ComponentProps<typeof Summary> & { hasData: boolean; error: string }) {
  return <Summary {...props}
    value={hasData ? props.value : "—"}
    caption={hasData ? props.caption : error ? "Data unavailable" : "Loading…"}
    tone={hasData ? props.tone : "muted"}
    action={hasData ? props.action : error ? <AlertCircle size={14} aria-hidden="true" /> : <LoaderCircle size={14} className="spin action-spinner" aria-hidden="true" />} />;
}

type FeedbackProps = {
  label: string; pending: boolean; hasData: boolean; error: string; onRefresh: () => void;
};

export function ProcurementFeedback({ label, hasData, error }: FeedbackProps) {
  if (!error) return null;
  return <div className="inline-error" role="alert"><span className="action-error-copy" style={{ flexBasis: "auto" }}>
    <AlertCircle size={16} aria-hidden="true" />
    <span>{error}{hasData ? ` Showing previously loaded ${label}.` : ""}</span>
  </span></div>;
}

export function ProcurementRefreshButton({ label, pending, error, onRefresh }: FeedbackProps) {
  return <button type="button" className="button soft" disabled={pending} aria-busy={pending}
    aria-label={pending ? `Refreshing ${label}` : error ? `Retry ${label}` : `Refresh ${label}`} onClick={onRefresh}>
    <RefreshCw size={14} className="spin action-spinner"
      style={{ animationPlayState: pending ? "running" : "paused" }} aria-hidden="true" />
    {error ? "Retry" : "Refresh"}
  </button>;
}
