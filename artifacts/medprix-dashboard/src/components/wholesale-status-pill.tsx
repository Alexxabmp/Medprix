const tones: Record<string, string> = {
  Pending: "neutral",
  Draft: "neutral",
  Confirmed: "info",
  Processing: "info",
  Ready: "warning",
  Scheduled: "warning",
  InTransit: "info",
  Delivered: "success",
  Completed: "success",
  Cancelled: "neutral",
  Failed: "danger",
  Paid: "success",
  Overdue: "danger",
  Outstanding: "warning",
  Partial: "warning",
  Unpaid: "warning",
};
const labels: Record<string, string> = {
  Pending: "Draft",
  Ready: "Needs scheduling",
  InTransit: "In transit",
  Completed: "Delivered",
};

export function WholesaleStatusPill({ status }: { status: string }) {
  return <span className={`pill ${tones[status] ?? "neutral"}`}>{labels[status] ?? status}</span>;
}
