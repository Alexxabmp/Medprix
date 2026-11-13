import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { safeError } from "@/lib/feedback";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import type { ToastFn } from "@/lib/types";
import { parseCalendarDate, formatCalendarDate } from "@/lib/business-date";

export type ReceivingReport = {
  id: string;
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  items: { id: string; product: string; sku?: string; batchNumber: string; expirationDate: string; quantityDelivered: number }[];
};
export type ReceivingDecision = "Received" | "Rejected";
type Phase = "confirm" | "saving" | "checking" | "uncertain" | "blocked" | "done";

export function ReceivingReportDecisionDialog({ report, decision, onClose, onSaved, onToast }: {
  report: ReceivingReport;
  decision: ReceivingDecision;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast: ToastFn;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const isBusy = phase === "saving" || phase === "checking";
  const receivesStock = decision === "Received";
  const action = receivesStock ? "Receive report" : "Reject report";
  const date = parseCalendarDate(report.deliveryDate);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  function close() {
    if (busy.current && phase !== "done") return;
    if (["uncertain", "blocked", "done"].includes(phase)) void onSaved().catch(() => undefined);
    onClose();
  }
  useDialogAccessibility(true, '[data-testid="modal-receiving-decision"] .modal', close, isBusy);

  async function finish() {
    setPhase("done");
    setError("");
    onToast(receivesStock ? "Receiving report completed and inventory updated." : "Receiving report rejected. Inventory was not changed.");
    try {
      await onSaved();
      onClose();
    } catch {
      setError("The report was saved, but refreshing failed. Refresh the lists before continuing.");
    }
  }

  async function submit() {
    if (busy.current || phase === "blocked" || phase === "done") return;
    busy.current = true;
    setPhase("saving");
    setError("");
    try {
      const response = await fetch(`/api/supplier-deliveries/${report.id}/status`, {
        method: "PATCH", credentials: "include", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: decision }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok && response.status >= 400 && response.status < 500) {
        setPhase("blocked");
        setError(safeError({ status: response.status, data }, "The report could not be updated. Refresh and review its current status."));
        return;
      }
      if (!response.ok || data?.delivery?.id !== report.id || data.delivery.deliveryStatus !== decision)
        throw new Error("The result could not be confirmed. Check the report before retrying this action.");
      await finish();
    } catch (failure) {
      setPhase("uncertain");
      setError(safeError(failure, "The result could not be confirmed. Check the report before retrying this action."));
    } finally { busy.current = false; }
  }

  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPhase("checking");
    setError("");
    try {
      const response = await fetch(`/api/supplier-deliveries/${report.id}`, {
        credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(safeError({ status: response.status, data }, "Could not check the report. Try checking again."));
      if (data?.state === "not_found") {
        setPhase("blocked"); setError("This report could not be found. Close this dialog and refresh the report list.");
      } else if (data?.state !== "committed" || data?.delivery?.id !== report.id) {
        throw new Error("The report status could not be read. Try checking again.");
      } else if (data.delivery.deliveryStatus === decision) {
        await finish();
      } else if (data.delivery.deliveryStatus === "Pending") {
        setPhase("uncertain"); setError("This report is still Pending. You can retry the same action.");
      } else {
        setPhase("blocked");
        setError(`This report is already ${data.delivery.deliveryStatus}. Close this dialog and refresh the report list.`);
      }
    } catch (failure) {
      setPhase("uncertain"); setError(safeError(failure, "Could not check the report. Try checking again."));
    } finally { busy.current = false; }
  }

  return createPortal(
    <div className="modal-backdrop" data-testid="modal-receiving-decision" onMouseDown={event => {
      if (event.currentTarget === event.target && !isBusy) close();
    }}>
      <div className="modal dialog receiving-decision-dialog" aria-busy={isBusy}>
        <div className="modal-header">
          <div><h2>{receivesStock ? "Receive pending report?" : "Reject pending report?"}</h2>
            <p className="modal-sub">{report.poNumber} · {report.supplier}</p></div>
          <button type="button" className="modal-close" aria-label="Close receiving confirmation" disabled={isBusy} onClick={close}><X size={16} /></button>
        </div>
        <div className="receiving-decision-body">
          <p className="modal-sub">Delivery date: {date ? formatCalendarDate(date) : report.deliveryDate}</p>
          <p>{receivesStock ? "Receive all items in this report and add the quantities below to inventory." : "Reject this entire report. None of its items will be added to inventory."}</p>
          <ul className="receiving-decision-items">
            {report.items.map(item => <li key={item.id}>
              <div><strong>{item.product}</strong><span className="muted">{item.sku} · Batch {item.batchNumber}</span><span className="muted">Expiry {item.expirationDate}</span></div>
              <strong className="receiving-decision-quantity">{item.quantityDelivered} units</strong>
            </li>)}
          </ul>
          {error && <div className="inline-error" role="alert">{error}</div>}
          {(phase === "saving" || phase === "checking") && <span className="sr-only" role="status">{phase === "checking" ? "Checking report status…" : "Saving report status…"}</span>}
        </div>
        <div className="modal-actions">
          <button type="button" className="button soft" disabled={isBusy} onClick={close}>{phase === "confirm" ? "Cancel" : "Close"}</button>
          {(phase === "uncertain" || phase === "checking") && <button type="button" className="button soft" disabled={isBusy} onClick={() => void check()}>{phase === "checking" ? "Checking…" : "Check report status"}</button>}
          {!["blocked", "done"].includes(phase) && <button type="button" className="button primary-action" disabled={isBusy} onClick={() => void submit()}>
            <Check size={13} /> {phase === "saving" ? "Saving…" : phase === "uncertain" ? `Retry ${receivesStock ? "receiving" : "rejection"}` : action}
          </button>}
        </div>
      </div>
    </div>, document.body,
  );
}
