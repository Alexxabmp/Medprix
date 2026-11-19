import { useEffect, useState } from "react";
import { wholesaleGet, wholesalePeso } from "@/lib/wholesale-api";
import { formatDisplayDate } from "@/lib/business-date";

export type CreditDecision = {
  id: string; revision: number; overdueAmount: string; reason: string; requestedAt: string; requestedBy: string;
  decision: "Approved" | "Refused" | null; decisionNote: string | null; decidedAt: string | null; decidedBy: string | null;
};
export type CreditStatus = {
  overdueAmount: string; oldestDueDate: string | null; daysLate: number;
  accounts: { orderNumber: string; overdue: string; oldestDueDate: string | null; daysLate: number }[];
  onHold: boolean; message: string | null; revision: number; current: CreditDecision | null; decisions: CreditDecision[];
};

/** The order's credit-hold state, reloaded whenever the order changes or a save finishes. */
export function useCreditStatus(orderId: string, revision: number, busy: boolean, enabled: boolean) {
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || busy) return;
    let live = true;
    wholesaleGet<CreditStatus>(`/orders/${orderId}/credit`, true)
      .then(value => { if (live) { setStatus(value); setError(""); } })
      .catch(() => { if (live) setError("The client's credit status couldn't be checked. Confirmation will check it again."); });
    return () => { live = false; };
  }, [orderId, revision, busy, enabled]);
  return { status, error };
}

/**
 * Credit hold, shown on a draft order when the client has an overdue balance. Works like contract terms exceptions:
 * Front desk asks with a reason, an Admin approves or refuses with a note, and editing the order needs a new approval.
 */
export function WholesaleCreditHold({ orderId, revision, role, busy, credit, mutate }: {
  orderId: string; revision: number; role: string; busy: boolean; credit: CreditStatus;
  mutate: (path: string, method: string, body: unknown) => void;
}) {
  const current = credit.current;
  const pending = current && !current.decision ? current : null;
  const refused = current?.decision === "Refused" ? current : null;
  return (
    <section className="modal-section wholesale-credit-hold" aria-labelledby={`credit-${orderId}`}>
      <div role={credit.onHold ? "alert" : "status"} className={credit.onHold ? "wholesale-credit-banner is-hold" : "wholesale-credit-banner"}>
        <strong id={`credit-${orderId}`}>
          {credit.onHold ? "Credit hold" : "Credit approved"}: this client has {wholesalePeso(credit.overdueAmount)} overdue
        </strong>
        <span>
          {credit.accounts.map(a => `${a.orderNumber} · due ${a.oldestDueDate ? formatDisplayDate(a.oldestDueDate) : "—"} · ${a.daysLate} day${a.daysLate === 1 ? "" : "s"} late`).join(" · ")}
        </span>
        {credit.onHold
          ? <span>An Admin has to approve new credit for this client before the order is confirmed.</span>
          : current?.decision === "Approved" && <span>Approved by {current.decidedBy}: {current.decisionNote}</span>}
      </div>

      {credit.onHold && !pending && role !== "Admin" && (
        <form onSubmit={event => {
          event.preventDefault();
          mutate(`/orders/${orderId}/credit-approvals`, "POST", { revision, reason: new FormData(event.currentTarget).get("reason") });
        }}>
          <fieldset className="wholesale-fields" disabled={busy}>
            <div className="field">
              <label htmlFor={`credit-reason-${orderId}`}>Why should this order go ahead? *</label>
              <input id={`credit-reason-${orderId}`} name="reason" required minLength={3} maxLength={500}
                placeholder="e.g. Client promised to settle this Friday; urgent restock" />
            </div>
            {refused && <p className="field-hint">An earlier request was refused by {refused.decidedBy}: {refused.decisionNote}</p>}
            <button className="button soft w-fit">Request Admin approval</button>
          </fieldset>
        </form>
      )}

      {pending && (
        <section className="wholesale-context" aria-label="Approval request">
          <p><strong>{pending.requestedBy}</strong> asked on {new Date(pending.requestedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}: {pending.reason}</p>
          {role === "Admin" ? (
            <form onSubmit={event => {
              event.preventDefault();
              const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
              mutate(`/credit-approvals/${pending.id}/decision`, "POST", {
                decision: submitter?.value === "Refused" ? "Refused" : "Approved",
                note: new FormData(event.currentTarget).get("note"),
              });
            }}>
              <fieldset className="wholesale-fields" disabled={busy}>
                <div className="field">
                  <label htmlFor={`credit-note-${orderId}`}>Your decision note *</label>
                  <input id={`credit-note-${orderId}`} name="note" required minLength={3} maxLength={500} placeholder="e.g. OK this once; follow up Friday" />
                </div>
                <div className="wholesale-actions">
                  <button className="button soft" value="Refused">Refuse</button>
                  <button className="button primary-action" value="Approved">Approve credit</button>
                </div>
              </fieldset>
            </form>
          ) : <p className="field-hint">Waiting for an Admin to approve or refuse.</p>}
        </section>
      )}
      {credit.onHold && !pending && role === "Admin" && (
        <p className="field-hint">As an Admin you can confirm directly; you'll be asked for a note, which is kept with the order.</p>
      )}
    </section>
  );
}
