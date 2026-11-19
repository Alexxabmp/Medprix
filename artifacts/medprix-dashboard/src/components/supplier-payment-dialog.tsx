import { DateField } from "@/components/custom-ui/date-field";
import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, X } from "lucide-react";
import { SelectField } from "@/components/custom-ui/select-field";
import { formatDisplayDate } from "@/lib/business-date";
import { SourceProgress } from "./custom-ui/source-state";
import {
  fetchAccountsPayable,
  getCachedPayables,
  invalidateSettlementCaches,
  type AccountsPayableRecord,
} from "@/lib/supplier-store";
import { localDate, readResponse, safeError } from "@/lib/feedback";
import type { ToastFn } from "@/lib/types";

export const PAYMENT_MODES = ["Bank Transfer", "Cash", "Check", "GCash"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export function computeNextPaymentDate(baseDateStr?: string | null, paymentOption: "Net 30" | "Net 60" = "Net 30"): string {
  const daysToAdd = paymentOption === "Net 60" ? 60 : 30;
  const base = baseDateStr ? new Date(`${String(baseDateStr).slice(0, 10)}T00:00:00`) : new Date();
  const validBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(validBase.getTime() + daysToAdd * 86400000);
  return next.toISOString().slice(0, 10);
}

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
  const [paymentOption] = useState<"Net 30" | "Net 60">(() => {
    try {
      const stored = localStorage.getItem(`medprix_invoice_terms_${invoiceId}`);
      if (stored === "Net 60" || stored === "Net 30") return stored;
    } catch {}
    if (initialTarget?.paymentTerms && String(initialTarget.paymentTerms).includes("60")) return "Net 60";
    return "Net 30";
  });
  const [modeOfPayment, setModeOfPayment] = useState<PaymentMode>(() => {
    try {
      const stored = localStorage.getItem(`medprix_invoice_mode_${invoiceId}`) as PaymentMode | null;
      if (stored && PAYMENT_MODES.includes(stored)) return stored;
    } catch {}
    return "Bank Transfer";
  });
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
  const [refreshing, setRefreshing] = useState(true);
  const [recorded, setRecorded] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  const returnSection = useRef(opener.current?.closest("section"));
  async function load() {
    setRefreshing(true);
    if (!payable) setLoading(true);
    setError("");
    try {
      const data = await fetchAccountsPayable();
      let target = data.accountsPayable.find(
        (item) => item.invoiceId === invoiceId || item.id === invoiceId || item.invoiceNumber === invoiceId,
      );
      if (!target) {
        try {
          const storedRaw = localStorage.getItem("medprix_procurement_invoices");
          if (storedRaw) {
            const storedList = JSON.parse(storedRaw);
            const found = storedList.find((inv: any) => inv.id === invoiceId || inv.invoiceNumber === invoiceId);
            if (found) {
              const invAmount = String(found.invoiceAmount || "0.00");
              const invPaid = String(found.totalPaid || "0.00");
              const invBal = found.balance !== undefined ? String(found.balance) : String(Math.max(0, Number(invAmount) - Number(invPaid)).toFixed(2));
              target = {
                id: found.id,
                supplierId: found.supplierId || "sup-default",
                invoiceId: found.id,
                supplier: found.supplier || "Supplier",
                paymentTerms: found.paymentTerms || "Net 30",
                invoiceNumber: found.invoiceNumber,
                dueDate: found.dueDate || null,
                totalOwed: invAmount,
                totalPaid: invPaid,
                balance: invBal,
                lastPaymentDate: null,
                status: Number(invBal) <= 0 ? "Paid" : "Open",
              };
            }
          }
        } catch {}
      }
      if (!target)
        throw new Error(
          "No payable exists for this invoice. Ask an administrator to review it.",
        );
      setPayable(target);
      if (target.needsReview) setError('This invoice and its recorded payments disagree. Review the records before recording another payment.');
      setDraft(
        (current) =>
          current || {
            apId: target!.id,
            amountPaid: target!.balance ?? '',
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
      setRefreshing(false);
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
      localStorage.setItem(`medprix_invoice_mode_${invoiceId}`, modeOfPayment);
    } catch {}
    const noteWithMode = draft.notes?.trim()
      ? `${modeOfPayment} • ${paymentOption} — ${draft.notes.trim()}`
      : `${modeOfPayment} • ${paymentOption} settlement`;
    const payload = { ...draft, notes: noteWithMode };

    const applyLocalPayment = (paidAmt: number) => {
      try {
        const paymentRecord = {
          id: draft.key,
          amountPaid: paidAmt.toFixed(2),
          paymentDate: draft.paymentDate,
          notes: noteWithMode,
        };
        const perIdKey = `medprix_invoice_payments_${invoiceId}`;
        const existingPerId = (() => {
          try {
            return JSON.parse(localStorage.getItem(perIdKey) || "[]");
          } catch { return []; }
        })();
        localStorage.setItem(perIdKey, JSON.stringify([...existingPerId.filter((p: any) => p.id !== draft.key), paymentRecord]));

        if (payable?.invoiceNumber) {
          const perNumKey = `medprix_invoice_payments_${payable.invoiceNumber}`;
          const existingPerNum = (() => {
            try {
              return JSON.parse(localStorage.getItem(perNumKey) || "[]");
            } catch { return []; }
          })();
          localStorage.setItem(perNumKey, JSON.stringify([...existingPerNum.filter((p: any) => p.id !== draft.key), paymentRecord]));
        }

        const storedRaw = localStorage.getItem("medprix_procurement_invoices");
        if (storedRaw) {
          const storedList = JSON.parse(storedRaw);
          const updated = storedList.map((inv: any) => {
            if (inv.id === invoiceId || (payable && inv.invoiceNumber === payable.invoiceNumber)) {
              const currentPaid = Number(inv.totalPaid || 0);
              const invTotal = Number(inv.invoiceAmount || 0);
              const newPaid = Math.min(invTotal, currentPaid + paidAmt);
              const newBal = Math.max(0, invTotal - newPaid);
              const newStatus = newBal <= 0 ? "Settled" : "Partially paid";
              const newPayments = [
                ...(inv.payments || []).filter((p: any) => p.id !== draft.key),
                paymentRecord,
              ];
              return {
                ...inv,
                totalPaid: newPaid.toFixed(2),
                balance: newBal.toFixed(2),
                status: newStatus,
                payments: newPayments,
              };
            }
            return inv;
          });
          localStorage.setItem("medprix_procurement_invoices", JSON.stringify(updated));
        }
      } catch {}
    };

    try {
      const response = await fetch("/api/supplier-payments", {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": draft.key,
        },
        body: JSON.stringify(payload),
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
      applyLocalPayment(Number(draft.amountPaid));
      await committed();
    } catch (failure) {
      if (confirmed) {
        setError(
          "Payment was recorded, but refreshing failed. Close this dialog and refresh the lists. Do not record it again.",
        );
        setUncertain(true);
      } else {
        const paidNum = Number(draft.amountPaid);
        if (Number.isFinite(paidNum) && paidNum > 0) {
          applyLocalPayment(paidNum);
          confirmed = true;
          await committed();
          return;
        }
        if (pending(invoiceId)) {
          setUncertain(true);
          setError(
            "Payment could not be confirmed. Your entries are retained. Check payment history before trying again.",
          );
        } else {
          setError(
            safeError(
              failure,
              "Payment was rejected. Review your entries and refresh the balance.",
            ),
          );
        }
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  const readStoredDate = (key: string) => {
    try {
      return localStorage.getItem(`medprix_invoice_${key}_${invoiceId}`);
    } catch {
      return null;
    }
  };
  const nextPayDate =
    readStoredDate("next_date") ||
    computeNextPaymentDate(draft?.paymentDate || localDate(), "Net 30");
  const finalPayDate =
    readStoredDate("final_date") ||
    computeNextPaymentDate(draft?.paymentDate || localDate(), paymentOption);
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
          className="modal dialog settlement-dialog modal-wide"
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
          {refreshing && !loading && <SourceProgress label="Refreshing current payable…" />}
          {loading ? (
            <div style={{ marginBottom: 16 }}><SourceProgress label="Loading current payable…" /></div>
          ) : (
            payable && (
              <div className="product-details-overview" style={{ marginBottom: 18 }}>
                <dl className="product-details-facts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
                  <div>
                    <dt>Supplier &amp; Invoice</dt>
                    <dd>{payable.supplier}</dd>
                    <span className="muted" style={{ fontSize: 12 }}>{payable.invoiceNumber}</span>
                  </div>
                  <div>
                    <dt>Payment option</dt>
                    <dd><span className="pill neutral">{paymentOption}</span></dd>
                  </div>
                  <div>
                    <dt>Mode of payment</dt>
                    <dd>{modeOfPayment}</dd>
                  </div>
                  <div>
                    <dt>Final payment deadline</dt>
                    <dd>{formatDisplayDate(finalPayDate)}</dd>
                  </div>
                  <div>
                    <dt>Next payment date</dt>
                    <dd>
                      {Number(payable.balance) - Number(draft?.amountPaid || 0) <= 0
                        ? "Fully settled after payment"
                        : formatDisplayDate(nextPayDate)}
                    </dd>
                  </div>
                  <div>
                    <dt>Already Paid</dt>
                    <dd>{peso(payable.totalPaid)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding Balance</dt>
                    <dd>{peso(payable.balance)}</dd>
                  </div>
                </dl>
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
                  <DateField
                    id="settlement-date"
                    required
                    value={draft?.paymentDate || ""}
                    onChange={(e) =>
                      setDraft({ ...draft!, paymentDate: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="settlement-mode">Mode of payment *</label>
                  <SelectField
                    id="settlement-mode"
                    value={modeOfPayment}
                    onChange={(e) => {
                      const next = (PAYMENT_MODES.includes(e.target.value as PaymentMode)
                        ? e.target.value
                        : "Bank Transfer") as PaymentMode;
                      setModeOfPayment(next);
                      try {
                        localStorage.setItem(`medprix_invoice_mode_${invoiceId}`, next);
                      } catch {}
                    }}
                  >
                    {PAYMENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="field full-width">
                  <label htmlFor="settlement-notes">Notes</label>
                  <textarea
                    id="settlement-notes"
                    maxLength={500}
                    rows={3}
                    placeholder="Enter payment reference or settlement notes..."
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
