import { useRef, useState, type ButtonHTMLAttributes } from "react";
import { SourceProgress } from "./source-state";

/** Acknowledgement for asynchronous utilities such as print preparation, not financial retries. */
export function AsyncActionButton({ onAction, onError, pendingLabel, children, disabled, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "onError"> & {
  onAction: () => Promise<void>; onError: (error: unknown) => void; pendingLabel: string;
}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  return <button {...props} type="button" disabled={disabled || pending} aria-busy={pending} aria-label={pending ? pendingLabel : props["aria-label"]} onClick={async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try { await onAction(); }
    catch (error) { onError(error); }
    finally { busy.current = false; setPending(false); }
  }}>{pending ? <SourceProgress label={pendingLabel} /> : children}</button>;
}
