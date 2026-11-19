import { useState } from "react";
import { CheckCircle2, Download, ExternalLink } from "lucide-react";
import { SUPPLIER_PAYMENT_MODES, SUPPLIER_PAYMENT_MODE_LABEL, type SupplierPaymentMode } from "@workspace/api-zod";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { DateField } from "@/components/custom-ui/date-field";
import { procurementApi, newKey, peso, type PaymentAdvice } from "@/lib/procurement-api";
import { paymentAdvicePdf, savePdf, printPdf } from "@/lib/procurement-documents";
import { Callout, Chips, Field, moneyInput, shortDate, todayManila, useSave } from "./shared";

export type PaymentTarget = {
  apId: string; invoiceNumber: string; supplier: string; poNumber: string | null;
  amount: string; totalPaid: string; balance: string; dueDate: string; prepayment?: boolean;
};

const referenceLabel = (mode: SupplierPaymentMode | "") =>
  mode === "Check" ? "Check no." : mode === "BankTransfer" ? "Bank reference no." : mode === "GCash" || mode === "Maya" ? "Reference no." : "Reference no.";

/** Screen 8 + 9: record a payment (partial is fine), then hand over the payment advice for the supplier. */
export function PaymentDialog({ target, onClose, onSaved }: { target: PaymentTarget; onClose: () => void; onSaved: (advice: PaymentAdvice) => void }) {
  const balance = Number(target.balance);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayManila());
  const [mode, setMode] = useState<SupplierPaymentMode | "">("");
  const [reference, setReference] = useState("");
  const [orNumber, setOrNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [key] = useState(newKey);
  const [advice, setAdvice] = useState<PaymentAdvice | null>(null);
  const save = useSave();

  const value = Number(amount);
  const problems = {
    amount: !(value > 0) ? "Enter the amount paid." : value > balance + 0.0001 ? `That's more than the ${peso(balance)} still owed.` : "",
    date: !paymentDate ? "Enter the payment date." : paymentDate > todayManila() ? "The payment date can't be in the future." : "",
    mode: !mode ? "Choose how it was paid." : "",
    reference: mode && mode !== "Cash" && !reference.trim() ? (mode === "Check" ? "Enter the check number." : "Enter the reference number from the bank slip or app receipt.") : "",
  };
  const left = Math.max(0, balance - (value || 0));

  async function submit() {
    setAttempted(true);
    if (Object.values(problems).some(Boolean)) return;
    const result = await save.run(() => procurementApi.recordPayment(key, {
      apId: target.apId, amount, paymentDate, mode: mode as SupplierPaymentMode,
      referenceNumber: reference.trim() || undefined, supplierOrNumber: orNumber.trim() || undefined, notes: notes.trim() || undefined,
    }));
    if (result) { setAdvice(result); onSaved(result); }
  }
  const err = (f: keyof typeof problems, server?: string) => (attempted && problems[f]) || server;

  if (advice) {
    const number = advice.payment.adviceNumber ?? "";
    return (
      <WholesaleDialog title="Payment recorded" description={`${target.invoiceNumber} · ${target.supplier}`} busy={false} close={onClose} className="proc-dialog proc-dialog-narrow"
        footer={<button type="button" className="button primary-action" onClick={onClose}>Done</button>}>
        <div className="proc-success">
          <CheckCircle2 size={28} aria-hidden="true" />
          <div>
            <strong>{peso(advice.payment.amount)} paid{advice.payment.isPrepayment ? " in advance" : ""}</strong>
            <span>{Number(advice.invoice.balanceAfter) > 0 ? `${peso(advice.invoice.balanceAfter)} left, still due ${shortDate(advice.invoice.dueDate)}` : "This invoice is fully paid."}</span>
          </div>
        </div>
        <Callout tone="info">
          Send the <strong>payment advice {number}</strong> to the supplier (Viber, SMS or email) so they can match the payment and issue their official receipt. You can add their OR number later from the order.
        </Callout>
        <div className="proc-button-row">
          <button type="button" className="button primary-action" onClick={() => savePdf(paymentAdvicePdf(advice), number || "payment-advice")}><Download size={14} /> Download payment advice</button>
          <button type="button" className="button soft" onClick={() => printPdf(paymentAdvicePdf(advice))}><ExternalLink size={14} /> Open to print</button>
        </div>
      </WholesaleDialog>
    );
  }

  return (
    <WholesaleDialog title={target.prepayment ? "Record advance payment" : "Record payment"} description={`${target.invoiceNumber} · ${target.supplier}${target.poNumber ? ` · ${target.poNumber}` : ""}`}
      busy={save.busy} close={onClose} className="proc-dialog"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Cancel</button>
        <button type="button" className="button primary-action" onClick={submit} disabled={save.busy}>{save.busy ? "Saving…" : value > 0 ? `Record ${peso(value)}` : "Record payment"}</button>
      </>}>
      <div className="proc-stat-row">
        <div><span>Invoice</span><strong>{peso(target.amount)}</strong></div>
        <div><span>Paid so far</span><strong>{peso(target.totalPaid)}</strong></div>
        <div><span>Due {shortDate(target.dueDate)}</span><strong>{peso(balance)}</strong></div>
      </div>
      {target.prepayment && <Callout tone="info">Pay-now supplier: this invoice is paid before the goods are checked. It's verified when the delivery arrives.</Callout>}
      <div className="form-grid">
        <Field id="pay-amount" label="Amount paid" error={err("amount", save.fieldErrors.amount)}
          hint={<button type="button" className="proc-link" onClick={() => setAmount(balance.toFixed(2))}>Pay full balance</button>}>
          <div className="proc-money-input"><span>₱</span><input id="pay-amount" inputMode="decimal" value={amount} onChange={e => setAmount(moneyInput(e.target.value))} /></div>
        </Field>
        <Field id="pay-date" label="Payment date" error={err("date", save.fieldErrors.paymentDate)}>
          <DateField id="pay-date" value={paymentDate} max={todayManila()} onChange={e => setPaymentDate(e.target.value)} />
        </Field>
      </div>
      <Chips<SupplierPaymentMode> legend="Mode of payment" name="pay-mode" value={mode} onChange={setMode} options={SUPPLIER_PAYMENT_MODES.map(m => ({ value: m, label: SUPPLIER_PAYMENT_MODE_LABEL[m] }))} />
      {err("mode", save.fieldErrors.mode) && <span className="field-error" role="alert">{err("mode", save.fieldErrors.mode)}</span>}
      <div className="form-grid">
        {mode !== "Cash" && (
          <Field id="pay-ref" label={referenceLabel(mode)} error={err("reference", save.fieldErrors.referenceNumber)} hint="From the bank slip, check or app receipt.">
            <input id="pay-ref" value={reference} maxLength={100} onChange={e => setReference(e.target.value)} autoComplete="off" />
          </Field>
        )}
        <Field id="pay-or" label="Supplier's OR no." optional error={save.fieldErrors.supplierOrNumber} hint="Add it now or when the receipt arrives.">
          <input id="pay-or" value={orNumber} maxLength={100} onChange={e => setOrNumber(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <Field id="pay-notes" label="Notes" optional full error={save.fieldErrors.notes}>
        <input id="pay-notes" value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} />
      </Field>
      {value > 0 && value <= balance + 0.0001 && (
        <div className={`proc-after ${left === 0 ? "paid" : ""}`}><span>After this payment</span><strong>{left === 0 ? "Fully paid" : `${peso(left)} left · still due ${shortDate(target.dueDate)}`}</strong></div>
      )}
      <p className="muted proc-small">The payment counts once the server confirms it. If the connection drops, press the same button again; it won't be paid twice.</p>
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}

/** Add the supplier's OR number to a payment once their receipt arrives. */
export function ReceiptNumberDialog({ paymentId, adviceNumber, onClose, onSaved }: { paymentId: string; adviceNumber: string | null; onClose: () => void; onSaved: () => void }) {
  const [orNumber, setOrNumber] = useState("");
  const [attempted, setAttempted] = useState(false);
  const save = useSave();
  async function submit() {
    setAttempted(true);
    if (!orNumber.trim()) return;
    const result = await save.run(() => procurementApi.addReceipt(paymentId, orNumber.trim()));
    if (result) { onSaved(); onClose(); }
  }
  return (
    <WholesaleDialog title="Add supplier's OR number" description={adviceNumber ? `For payment advice ${adviceNumber}` : undefined} busy={save.busy} close={onClose} className="proc-dialog proc-dialog-narrow"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Cancel</button>
        <button type="button" className="button primary-action" onClick={submit} disabled={save.busy}>{save.busy ? "Saving…" : "Save"}</button>
      </>}>
      <Field id="or-number" label="Official receipt no." error={(attempted && !orNumber.trim() ? "Enter the OR number." : "") || save.fieldErrors.supplierOrNumber}>
        <input id="or-number" value={orNumber} maxLength={100} onChange={e => setOrNumber(e.target.value)} autoComplete="off" />
      </Field>
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}
