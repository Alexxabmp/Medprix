import { useMemo, useState } from "react";
import { Copy, Download, ExternalLink } from "lucide-react";
import {
  PO_SEND_METHODS, SUPPLIER_TERMS, SUPPLIER_TERMS_LABEL, SUPPLIER_TERMS_BASIS_LABEL, supplierDueDate,
  type PoSendMethod, type SupplierTerms,
} from "@workspace/api-zod";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { DateField } from "@/components/custom-ui/date-field";
import { SelectField } from "@/components/custom-ui/select-field";
import { procurementApi, newKey, peso, type Invoice, type OrderDetail } from "@/lib/procurement-api";
import { purchaseOrderPdf, savePdf, printPdf } from "@/lib/procurement-documents";
import { Callout, Chips, Field, moneyInput, shortDate, todayManila, useSave } from "./shared";

type Done = (detail: OrderDetail, message: string) => void;

/** Screen 3: download the PO, then record how it went to the supplier. */
export function SendDialog({ detail, onClose, onDone }: { detail: OrderDetail; onClose: () => void; onDone: Done }) {
  const { order } = detail;
  const resend = order.status === "Submitted";
  const [method, setMethod] = useState<PoSendMethod | "">(order.sentMethod ?? "");
  const [expected, setExpected] = useState(order.expectedDeliveryDate ?? "");
  const [copied, setCopied] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const save = useSave();
  const message = `Good day${order.supplier.contactPerson ? ` ${order.supplier.contactPerson}` : ""}! This is Med Prix. Attached is our purchase order ${order.poNumber} (${detail.lines.length} item${detail.lines.length === 1 ? "" : "s"}, ${peso(order.totalOrderAmount)}). Please confirm availability and delivery date, and include the lot number and expiry on the delivery receipt. Thank you!`;
  async function copy() {
    try { await navigator.clipboard.writeText(message); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  }
  async function submit() {
    setAttempted(true);
    if (!method) return;
    const result = await save.run(() => procurementApi.send(order.id, { method, expectedDeliveryDate: expected || null }));
    if (result) onDone(result, resend ? `${order.poNumber}: sending details updated.` : `${order.poNumber} marked as sent by ${method}.`);
  }
  return (
    <WholesaleDialog title={resend ? "Update how it was sent" : "Send to supplier"} description={`${order.poNumber} · ${order.supplier.name}`}
      busy={save.busy} close={onClose} className="proc-dialog"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Cancel</button>
        <button type="button" className="button primary-action" onClick={submit} disabled={save.busy}>{save.busy ? "Saving…" : resend ? "Save" : "Mark as sent"}</button>
      </>}>
      <ol className="proc-steps-list">
        <li>
          <strong>Get the purchase order PDF</strong>
          <div className="proc-button-row">
            <button type="button" className="button soft" onClick={() => savePdf(purchaseOrderPdf(detail), order.poNumber)}><Download size={14} /> Download PDF</button>
            <button type="button" className="button soft" onClick={() => printPdf(purchaseOrderPdf(detail))}><ExternalLink size={14} /> Open to print</button>
          </div>
        </li>
        <li>
          <strong>Send it to the supplier</strong> through Viber, SMS or email{order.supplier.contactNumber ? ` (${order.supplier.contactNumber})` : ""}. A message you can paste:
          <div className="proc-message"><p>{message}</p>
            <button type="button" className="button soft" onClick={copy}><Copy size={14} /> {copied ? "Copied" : "Copy message"}</button>
          </div>
        </li>
        <li><strong>Record it here</strong> so everyone knows it's with the supplier.</li>
      </ol>
      <Chips<PoSendMethod> legend="How was it sent?" name="send-method" value={method} onChange={setMethod}
        options={PO_SEND_METHODS.map(m => ({ value: m, label: m === "Printed" ? "Printed / handed over" : m }))} />
      {attempted && !method && <span className="field-error" role="alert">Choose how the order was sent.</span>}
      <Field id="send-expected" label="Expected delivery" optional hint="Ask the supplier; orders past this date show as late." error={save.fieldErrors.expectedDeliveryDate}>
        <DateField id="send-expected" value={expected} min={todayManila()} onChange={e => setExpected(e.target.value)} />
      </Field>
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}

/** One dialog for every step that needs a reason: cancel, close short, return for changes. */
export function ReasonDialog({ title, description, label, placeholder, confirm, danger, notice, onClose, onConfirm }: {
  title: string; description: string; label: string; placeholder?: string; confirm: string; danger?: boolean; notice?: string;
  onClose: () => void; onConfirm: (reason: string) => Promise<OrderDetail>;
}) {
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const save = useSave();
  const tooShort = reason.trim().length < 3;
  async function submit() {
    setAttempted(true);
    if (tooShort) return;
    const result = await save.run(() => onConfirm(reason.trim()));
    if (result) onClose();
  }
  return (
    <WholesaleDialog title={title} description={description} busy={save.busy} close={onClose} className="proc-dialog proc-dialog-narrow"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Back</button>
        <button type="button" className={`button ${danger ? "danger" : "primary-action"}`} onClick={submit} disabled={save.busy}>{save.busy ? "Saving…" : confirm}</button>
      </>}>
      {notice && <Callout tone="info">{notice}</Callout>}
      <Field id="reason" label={label} full error={attempted && tooShort ? "Write at least a few words." : save.fieldErrors.reason}>
        <textarea id="reason" rows={3} maxLength={500} value={reason} placeholder={placeholder} onChange={e => setReason(e.target.value)} />
      </Field>
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}

/** Screen 6: record the supplier's invoice. Terms come from the supplier; Admin can override one invoice with a reason. */
export function InvoiceDialog({ detail, isAdmin, onClose, onDone }: { detail: OrderDetail; isAdmin: boolean; onClose: () => void; onDone: Done }) {
  const { order } = detail;
  const open = Number(detail.uninvoicedValue);
  const [kind, setKind] = useState<"Received" | "Advance">(open > 0 ? "Received" : "Advance");
  const [number, setNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayManila());
  const [amount, setAmount] = useState(open > 0 ? open.toFixed(2) : "");
  const [variance, setVariance] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [override, setOverride] = useState<SupplierTerms | "">("");
  const [overrideReason, setOverrideReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [key] = useState(newKey);
  const save = useSave();

  const terms = (overriding && override) || order.supplier.paymentTerms;
  const lastDelivery = detail.deliveries.filter(d => d.status !== "Pending").map(d => d.deliveryDate).sort().at(-1) ?? null;
  const start = order.supplier.termsBasis === "DeliveryDate" && lastDelivery ? lastDelivery : invoiceDate;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(start) ? supplierDueDate(terms, start) : "";
  const daysToDue = due ? Math.round((Date.parse(due) - Date.parse(todayManila())) / 86_400_000) : 0;
  const differs = kind === "Received" && amount !== "" && Math.abs(Number(amount) - open) >= 0.01;
  const receivedLines = useMemo(() => detail.lines.filter(l => l.quantityReceived > 0), [detail.lines]);

  const problems = {
    number: !number.trim() ? "Enter the invoice number printed on the supplier's invoice." : "",
    amount: !(Number(amount) > 0) ? "Enter the invoice amount." : "",
    variance: differs && variance.trim().length < 3 ? "Say why it differs (e.g. price increase, freight)." : "",
    override: overriding && (!override || overrideReason.trim().length < 3) ? "Choose the terms and give a reason." : "",
    date: invoiceDate > todayManila() ? "The invoice date can't be in the future." : "",
  };
  async function submit() {
    setAttempted(true);
    if (Object.values(problems).some(Boolean)) return;
    const result = await save.run(() => procurementApi.recordInvoice(order.id, key, {
      kind, invoiceNumber: number.trim(), invoiceDate, amount,
      varianceReason: differs ? variance.trim() : undefined,
      termsOverride: overriding && override ? override : undefined, overrideReason: overriding ? overrideReason.trim() : undefined,
    }));
    if (result) onDone(result, kind === "Received" ? `Invoice ${number.trim().toUpperCase()} recorded. It's now in Payables, due ${shortDate(due)}.` : `Invoice ${number.trim().toUpperCase()} saved as pending verification.`);
  }
  const err = (field: keyof typeof problems, server?: string) => (attempted && problems[field]) || server;

  return (
    <WholesaleDialog title="Record supplier invoice" description={`${order.poNumber} · ${order.supplier.name}`} busy={save.busy} close={onClose} className="proc-dialog"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Cancel</button>
        <button type="button" className="button primary-action" onClick={submit} disabled={save.busy}>{save.busy ? "Saving…" : "Save invoice"}</button>
      </>}>
      <Chips legend="This invoice is for" name="invoice-kind" value={kind} onChange={value => { setKind(value); if (value === "Received" && open > 0) setAmount(open.toFixed(2)); }}
        options={[
          { value: "Received", label: "Goods we received", hint: open > 0 ? "Checked now, goes to Payables" : "Nothing received is left to invoice" },
          { value: "Advance", label: "Billed before delivery", hint: "Saved as pending verification" },
        ]} disabled={save.busy} />
      {kind === "Received" && open <= 0 && <Callout tone="warning">Everything received so far is already invoiced. Receive the delivery first, or choose “Billed before delivery”.</Callout>}
      <div className="form-grid">
        <Field id="inv-number" label="Supplier's invoice no." error={err("number", save.fieldErrors.invoiceNumber)}>
          <input id="inv-number" value={number} maxLength={100} onChange={e => setNumber(e.target.value)} autoComplete="off" />
        </Field>
        <Field id="inv-date" label="Invoice date" error={err("date", save.fieldErrors.invoiceDate)}>
          <DateField id="inv-date" value={invoiceDate} max={todayManila()} onChange={e => setInvoiceDate(e.target.value)} />
        </Field>
      </div>
      {kind === "Received" && open > 0 && (
        <div className="proc-receipt-box">
          <strong>Received and not yet invoiced</strong>
          {receivedLines.map(l => <div key={l.productId}><span>{l.quantityReceived} {l.product} × {peso(l.unitCost)}</span><span>{peso(l.quantityReceived * Number(l.unitCost))}</span></div>)}
          {Number(detail.invoicedValue) > 0 && <div><span>Already invoiced</span><span>−{peso(detail.invoicedValue)}</span></div>}
          <div className="proc-receipt-total"><span>Expected invoice amount</span><span>{peso(open)}</span></div>
        </div>
      )}
      <Field id="inv-amount" label="Amount on the supplier's invoice" error={err("amount", save.fieldErrors.amount)}
        hint={kind === "Received" && amount && !differs ? "Matches what was received." : undefined}>
        <div className="proc-money-input"><span>₱</span><input id="inv-amount" inputMode="decimal" value={amount} onChange={e => setAmount(moneyInput(e.target.value))} /></div>
      </Field>
      {differs && (
        <Field id="inv-variance" label={`Why is it ${Number(amount) > open ? "more" : "less"} than ${peso(open)}?`} full error={err("variance", save.fieldErrors.varianceReason)}>
          <input id="inv-variance" value={variance} maxLength={500} placeholder="e.g. price increase, freight charge, credit memo" onChange={e => setVariance(e.target.value)} />
        </Field>
      )}
      <div className="proc-terms-box">
        <div className="proc-terms-head"><strong>Payment terms</strong>
          <span className="pill neutral">{SUPPLIER_TERMS_LABEL[terms]}{overriding && override ? " · this invoice only" : " · from supplier"}</span></div>
        {kind === "Advance" && order.supplier.termsBasis === "DeliveryDate" && !lastDelivery
          ? <span>The due date will be set when the goods arrive (counted from the delivery date).</span>
          : <span><strong>Due:</strong> {shortDate(due)} (counted from the {SUPPLIER_TERMS_BASIS_LABEL[order.supplier.termsBasis]})</span>}
        {due && daysToDue >= 0 && daysToDue < 3 && <span className="proc-warn-text">Due in {daysToDue === 0 ? "less than a day" : `${daysToDue} day${daysToDue === 1 ? "" : "s"}`}.</span>}
        <span className="muted">Pay all at once or in parts; partial payments don't move the due date.</span>
        {kind === "Advance" && <span className="muted">{terms === "Immediate" ? "Pay-now terms: you can pay this before the goods arrive (recorded as a prepayment)." : "It can be paid once the goods arrive and the invoice is verified."}</span>}
        {isAdmin && !overriding && <button type="button" className="proc-link" onClick={() => setOverriding(true)}>Different terms on this invoice?</button>}
        {overriding && (
          <div className="form-grid">
            <Field id="inv-override" label="Terms for this invoice" error={attempted && !override ? "Choose the terms." : save.fieldErrors.termsOverride}>
              <SelectField id="inv-override" value={override} onChange={e => setOverride(e.target.value as SupplierTerms)}>
                <option value="">Choose terms</option>
                {SUPPLIER_TERMS.map(t => <option key={t} value={t}>{SUPPLIER_TERMS_LABEL[t]}</option>)}
              </SelectField>
            </Field>
            <Field id="inv-override-reason" label="Reason" error={attempted && overrideReason.trim().length < 3 ? "Give a reason." : save.fieldErrors.overrideReason}>
              <input id="inv-override-reason" value={overrideReason} maxLength={500} placeholder="e.g. supplier gave 60 days on this bulk order" onChange={e => setOverrideReason(e.target.value)} />
            </Field>
            <button type="button" className="proc-link" onClick={() => { setOverriding(false); setOverride(""); setOverrideReason(""); }}>Use the supplier's terms</button>
          </div>
        )}
      </div>
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}

/** Check an invoice billed before delivery against what actually arrived. */
export function VerifyDialog({ detail, invoice, onClose, onDone }: { detail: OrderDetail; invoice: Invoice; onClose: () => void; onDone: Done }) {
  const open = Number(detail.uninvoicedValue);
  const differs = Math.abs(Number(invoice.amount) - open) >= 0.01;
  const [variance, setVariance] = useState("");
  const [attempted, setAttempted] = useState(false);
  const save = useSave();
  const nothingYet = Number(detail.receivedValue) === 0;
  async function submit() {
    setAttempted(true);
    if (nothingYet || (differs && variance.trim().length < 3)) return;
    const result = await save.run(() => procurementApi.verifyInvoice(invoice.id, differs ? variance.trim() : undefined));
    if (result) onDone(result, `Invoice ${invoice.invoiceNumber} verified. It's now in Payables.`);
  }
  return (
    <WholesaleDialog title={`Verify invoice ${invoice.invoiceNumber}`} description={`${detail.order.poNumber} · ${detail.order.supplier.name}`} busy={save.busy} close={onClose} className="proc-dialog proc-dialog-narrow"
      footer={<>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Cancel</button>
        <button type="button" className="button primary-action" onClick={submit} disabled={save.busy || nothingYet}>{save.busy ? "Saving…" : "Verify invoice"}</button>
      </>}>
      {nothingYet ? <Callout tone="info">Nothing has arrived yet. Receive the delivery first; the invoice is checked against what actually came.</Callout> : (
        <div className="proc-receipt-box">
          <div><span>Invoice amount</span><span>{peso(invoice.amount)}</span></div>
          <div><span>Received and not yet invoiced</span><span>{peso(open)}</span></div>
          <div className="proc-receipt-total"><span>{differs ? "Difference" : "Matches"}</span><span>{differs ? peso(Number(invoice.amount) - open) : "✓"}</span></div>
        </div>
      )}
      {differs && !nothingYet && (
        <Field id="verify-variance" label="Why is it different?" full hint="e.g. rest of the delivery still coming, price change, credit memo requested"
          error={attempted && variance.trim().length < 3 ? "Give a reason, or wait for the rest of the delivery." : save.fieldErrors.varianceReason}>
          <input id="verify-variance" value={variance} maxLength={500} onChange={e => setVariance(e.target.value)} />
        </Field>
      )}
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}
