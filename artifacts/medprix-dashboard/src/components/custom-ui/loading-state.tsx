import { SourceProgress } from "./source-state";

export function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={compact ? undefined : "surface-card loading-state"}><SourceProgress label={label} /></div>;
}
