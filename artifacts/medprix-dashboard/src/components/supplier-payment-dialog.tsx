import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, X } from "lucide-react";
import {
  fetchAccountsPayable,
  getCachedPayables,
  invalidateSettlementCaches,
  type AccountsPayableRecord,
} from "@/lib/supplier-store";
import { localDate, readResponse, safeError } from "@/lib/feedback";
import type { ToastFn } from "@/lib/types";

// A retained uncertain submission always keeps its identity and exact payload on reopen.
type Draft = {
  apId: string;
  amountPaid: string;
  paymentDate: string;
  notes: string;
  key: string;
};
const storageKey = (id: string) => `medprix_pending_supplier_payment_${id}`;
function pending(id: string): Draft | null {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(id)) || "null");
  } catch {
    return null;
  }
}
const peso = (value: string | null) => value === null ? 'Needs review' : `₱${Number(value).toFixed(2)}`;

export function SupplierPaymentDialog({
  invoiceId,
  onClose,
  onSaved,
  onToast,
}: {
  invoiceId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onToast: ToastFn;
}) {
  const initialTarget = getCachedPayables()?.accountsPayable.find((item) => item.invoiceId === invoiceId) ?? null;
  const [payable, setPayable] = useState<AccountsPayableRecord | null>(initialTarget);
  const [draft, setDraft] = useState<Draft | null>(() => pending(invoiceId) || (initialTarget ? {
    apId: initialTarget.id,
    amountPaid: initialTarget.balance ?? "",
    paymentDate: localDate(),
    notes: "",
    key: crypto.randomUUID(),
  } : null));
  const [uncertain, setUncertain] = useState(() => !!pending(invoiceId));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => !initialTarget);
  const [recorded, setRecorded] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const returnSection = useRef(opener.current?.closest("section"));
  async function load() {
    if (!payable) setLoading(true);
    setError("");
    try {
      const data = await fetchAccountsPayable();
      const target = data.accountsPayable.find(
        (item) => item.invoiceId === invoiceId,
      );
      if (!target)
        throw new Error(
          "No payable exists for this invoice. Ask an administrator to review it.",
        );
      setPayable(target);
      if (target.needsReview) setError('This invoice and its recorded payments disagree. Review the records before recording another payment.');
      setDraft(
        (current) =>
          current || {
            apId: target.id,
            amountPaid: target.balance ?? '',
            paymentDate: localDate(),
            notes: "",
            key: crypto.randomUUID(),
          },
      );
    } catch (failure) {
      setError(
        safeError(
          failure,
          "Could not load the current payable. Please refresh.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [invoiceId]);
  async function committed() {
    setRecorded(true);
    sessionStorage.removeItem(storageKey(invoiceId));
    invalidateSettlementCaches();
    onToast({ message: "Supplier payment recorded.", variant: "success" });
    await onSaved();
    onClose();
  }
  async function reconcile() {
    if (!draft || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/supplier-payments/${draft.key}?apId=${draft.apId}`,
        { credentials: "include" },
      );
      const data = await readResponse(
        response,
        "Could not check payment history. Do not submit another payment yet.",
      );
      if (data.payment) {
        await committed();
        return;
      }
      setUncertain(false);
      sessionStorage.removeItem(storageKey(invoiceId));
      setError(
        "No payment was found for this request. Review the refreshed balance before recording it with the same request reference.",
      );
      const current = await fetchAccountsPayable();
      setPayable(
        current.accountsPayable.find((item) => item.invoiceId === invoiceId) ||
          null,
      );
    } catch (failure) {
      setError(safeError(failure));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy.current || uncertain || !payable || payable.needsReview) return;
    if (!form.current?.reportValidity()) return;
    busy.current = true;
    setSaving(true);
    setError("");
    // Store before sending so losing the response or reopening cannot mint a new payment.
    try {
      sessionStorage.setItem(storageKey(invoiceId), JSON.stringify(draft));
    } catch {
      setError(
        "Payment could not start because this browser cannot retain its request reference. Enable session storage, then try again.",
      );
      busy.current = false;
      setSaving(false);
      return;
    }
    let confirmed = false;
    try {
      const response = await fetch("/api/supplier-payments", {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": draft.key,
        },
        body: JSON.stringify(draft),
      });
      if (response.status >= 400 && response.status < 500) {
        sessionStorage.removeItem(storageKey(invoiceId));
        await readResponse(
          response,
          "Payment was rejected. Refresh the current balance and review your entries.",
        );
      }
      const data = await readResponse(response, "Payment result is unknown.");
      if (!data.payment?.id) throw new Error("Payment result is unknown.");
      confirmed = true;
      await committed();
    } catch (failure) {
      if (confirmed) {
        setError(
          "Payment was recorded, but refreshing failed. Close this dialog and refresh the lists. Do not record it again.",
        );
        setUncertain(true);
      } else if (pending(invoiceId)) {
        setUncertain(true);
        setError(
          "Payment could not be confirmed. Your entries are retained. Check payment history before trying again.",
        );
      } else
        setError(
          safeError(
            failure,
            "Payment was rejected. Review your entries and refresh the balance.",
          ),
        );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy.current) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop supplier-payment-backdrop" />
        <Dialog.Content
          className="modal dialog settlement-dialog"
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
            else returnSection.current?.querySelector<HTMLElement>("button")?.focus();
          }}
        >
          <div className="modal-header">
            <div>
              <Dialog.Title asChild>
                <h2>Record payment</h2>
              </Dialog.Title>
              <Dialog.Description className="modal-sub">
                Paying the full outstanding balance marks the invoice Paid.
              </Dialog.Description>
            </div>
            <button
              className="modal-close"
              aria-label="Close payment dialog"
              disabled={saving}
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
          {loading ? (
            <p className="modal-sub" role="status" style={{ marginBottom: 16 }}>
              Loading current payable…
            </p>
          ) : (
            payable && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}
                >
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    Supplier &amp; Invoice
                  </div>
                  <strong style={{ fontSize: 13, display: "block", marginTop: 2 }}>
                    {payable.supplier}
                  </strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {payable.invoiceNumber}
                  </span>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}
                >
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    Already Paid
                  </div>
                  <strong style={{ fontSize: 13, display: "block", marginTop: 2 }}>
                    {peso(payable.totalPaid)}
                  </strong>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}
                >
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    Outstanding Balance
                  </div>
                  <strong style={{ fontSize: 13, display: "block", marginTop: 2 }}>
                    {peso(payable.balance)}
                  </strong>
                </div>
              </div>
            )
          )}
          <form ref={form} onSubmit={submit}>
            <fieldset
              disabled={
                recorded ||
                loading ||
                saving ||
                uncertain ||
                !payable ||
                payable.needsReview ||
                Number(payable.balance) <= 0
              }
              className="settlement-fields"
            >
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="settlement-amount">Amount paid *</label>
                  <input
                    autoFocus
                    id="settlement-amount"
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={payable?.balance ?? undefined}
                    value={draft?.amountPaid || ""}
                    onChange={(e) =>
                      setDraft({ ...draft!, amountPaid: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="settlement-date">Payment date *</label>
                  <input
                    id="settlement-date"
                    required
                    type="date"
                    value={draft?.paymentDate || ""}
                    onChange={(e) =>
                      setDraft({ ...draft!, paymentDate: e.target.value })
                    }
                  />
                </div>
                <div className="field full-width">
                  <label htmlFor="settlement-notes">Notes</label>
                  <textarea
                    id="settlement-notes"
                    maxLength={500}
                    value={draft?.notes || ""}
                    onChange={(e) =>
                      setDraft({ ...draft!, notes: e.target.value })
                    }
                  />
                </div>
              </div>
            </fieldset>
            {error && (
              <div className="inline-error" role="alert">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}
            {!loading && !payable && (
              <button
                type="button"
                className="button soft"
                onClick={() => void load()}
              >
                Refresh payable
              </button>
            )}
            {payable && !payable.needsReview && Number(payable.balance) <= 0 && (
              <p role="status">This invoice is settled.</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button soft"
                disabled={saving}
                onClick={onClose}
              >
                Close
              </button>
              {recorded ? (
                <span role="status">
                  Payment recorded. Refresh the lists after closing.
                </span>
              ) : uncertain ? (
                <button
                  type="button"
                  className="button soft"
                  disabled={saving}
                  onClick={() => void reconcile()}
                >
                  {saving ? "Checking…" : "Check payment result"}
                </button>
              ) : (
                <button
                  type="submit"
                  className="button settlement-submit"
                  disabled={
                    loading ||
                    saving ||
                    !payable ||
                    payable.needsReview ||
                    Number(payable.balance) <= 0
                  }
                >
                  <Check size={14} />
                  {saving ? "Recording…" : "Record payment"}
                </button>
              )}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
