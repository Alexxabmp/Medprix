import { LoaderCircle } from "lucide-react";

export function LoadingState({ label }: { label: string }) {
  return (
    <div
      className="surface-card loading-state"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="spin" size={20} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
