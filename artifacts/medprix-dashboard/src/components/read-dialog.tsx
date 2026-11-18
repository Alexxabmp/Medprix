import { useEffect, useRef, useState, type ReactNode } from "react";
import { safeError } from "@/lib/feedback";
import { SourceFeedback, SourcePlaceholder } from "./custom-ui/source-state";
import { WholesaleDialog, type WholesaleDialogVariant } from "./wholesale-dialog";

/** Read-only navigation: acknowledge immediately and ignore superseded responses. */
export function useReadDialog<T>() {
  const [state, setState] = useState<{ title: string; pending: boolean; error: string; data: T | null } | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const current = useRef<{ title: string; load: () => Promise<T> } | null>(null);
  useEffect(() => () => { generation.current++; }, []);
  function open(title: string, load: () => Promise<T>) {
    const request = ++generation.current;
    pending.current = true;
    current.current = { title, load };
    setState({ title, pending: true, error: "", data: null });
    void Promise.resolve().then(load).then(data => {
      if (generation.current === request) { pending.current = false; setState({ title, pending: false, error: "", data }); }
    }, failure => {
      if (generation.current === request) { pending.current = false; setState({ title, pending: false, error: safeError(failure), data: null }); }
    });
  }
  function close() {
    generation.current++;
    pending.current = false;
    current.current = null;
    setState(null);
  }
  function retry() {
    if (current.current && !pending.current) open(current.current.title, current.current.load);
  }
  return { state, open, close, retry };
}

export function ReadContent<T>({ task, children }: {
  task: ReturnType<typeof useReadDialog<T>>; children: (data: T) => ReactNode;
}) {
  const state = task.state;
  if (!state) return null;
  const status = { hasData: state.data !== null, pending: state.pending, error: state.error };
  return <div aria-busy={state.pending}>
    <SourceFeedback status={status} label="details" onRetry={task.retry} />
    {state.data !== null ? children(state.data) : <SourcePlaceholder status={status} label={state.title} />}
  </div>;
}

/** Loaded child dialogs use embedded presentation to keep this shell mounted. */
export function ReadDialog<T>({ task, children, variant = "table", busy = false, description }: {
  task: ReturnType<typeof useReadDialog<T>>; children: (data: T) => ReactNode;
  variant?: WholesaleDialogVariant; busy?: boolean;
  description?: (data: T) => string;
}) {
  if (!task.state) return null;
  return <WholesaleDialog title={task.state.title} description={task.state.data !== null ? description?.(task.state.data) : undefined} close={task.close} busy={busy} variant={variant}>
    <ReadContent task={task}>{children}</ReadContent>
  </WholesaleDialog>;
}
