import type { ComponentProps } from "react";
import { SourceFeedback, SourceRefreshButton, SourceSummary } from "./source-state";
import type { Summary } from "./summary-card";

type FeedbackProps = { label: string; pending: boolean; hasData: boolean; error: string; onRefresh: () => void };
export function ProcurementSummary({ hasData, error, ...props }: ComponentProps<typeof Summary> & { hasData: boolean; error: string }) {
  return <SourceSummary {...props} status={{ hasData, error, pending: !hasData && !error }} />;
}
export function ProcurementFeedback({ label, ...status }: FeedbackProps) {
  return <SourceFeedback label={label} status={status} />;
}
export function ProcurementRefreshButton({ label, onRefresh, ...status }: FeedbackProps) {
  return <SourceRefreshButton label={label} status={status} onRefresh={onRefresh} />;
}
