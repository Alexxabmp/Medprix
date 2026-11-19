import { useState } from "react";
import { Plus, X } from "lucide-react";
import { DELIVERY_REJECTION_REASONS, DELIVERY_REJECTION_REASON_LABEL, SHORT_EXPIRY_MONTHS, type DeliveryRejectionReason } from "@workspace/api-zod";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { DateField } from "@/components/custom-ui/date-field";
import { SelectField } from "@/components/custom-ui/select-field";
import { procurementApi, newKey, type OrderDetail, type ReceiveLine } from "@/lib/procurement-api";
import { Callout, Field, addMonths, shortDate, todayManila, useSave } from "./shared";

type Lot = { key: string; productId: string; good: string; lot: string; expiry: string; rejected: string; reason: DeliveryRejectionReason | ""; reasonNotes: string };

let lotSeqCounter = 0;
function generateUniqueLotNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  lotSeqCounter = (lotSeqCounter + 1) % 10000;
  const seq = String(lotSeqCounter).padStart(4, "0");
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `LOT-${yy}${mm}${dd}-${seq}${rand}`;
}

const lotFor = (productId: string, good = ""): Lot => ({
  key: crypto.randomUUID(),
  productId,
  good,
  lot: generateUniqueLotNumber(),
  expiry: "",
  rejected: "",
  reason: "",
  reasonNotes: "",
});

/** Screen 5: one form that becomes the receiving report. Saving adds the good units to stock in their supplier lots. */
export function ReceiveDialog({ detail, onClose, onDone }: {
  detail: OrderDetail; onClose: () => void; onDone: (detail: OrderDetail, message: string, warnings: string[]) => void;
}) {
  const due = detail.lines.filter(l => l.quantityRemaining > 0);
  const [deliveryDate, setDeliveryDate] = useState(todayManila());
  const [receipt, setReceipt] = useState("");
  const [notes, setNotes] = useState("");
  const [lots, setLots] = useState<Lot[]>(due.map(l => lotFor(l.productId, String(l.quantityRemaining))));
  const [attempted, setAttempted] = useState(false);
  const [key, setKey] = useState(newKey);
  const save = useSave();
  const shortLimit = addMonths(deliveryDate || todayManila(), SHORT_EXPIRY_MONTHS);

  const update = (key: string, patch: Partial<Lot>) => setLots(current => current.map(l => l.key === key ? { ...l, ...patch } : l));
  const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : 0);
  const goodFor = (productId: string) => lots.filter(l => l.productId === productId).reduce((s, l) => s + num(l.good), 0);
  const problemsFor = (lot: Lot) => {
    const p: Partial<Record<"good" | "lot" | "expiry" | "reason" | "reasonNotes", string>> = {};
    const line = due.find(l => l.productId === lot.productId)!;
    if (goodFor(lot.productId) > line.quantityRemaining) p.good = `Only ${line.quantityRemaining} still due. Record extra units as rejected.`;
    if (num(lot.good) > 0) {
      if (!lot.lot.trim()) p.lot = "Enter the lot number on the box.";
      else if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(lot.lot.trim())) p.lot = "Letters, numbers and hyphens only.";
      if (!lot.expiry) p.expiry = "Enter the expiry date.";
      else if (lot.expiry <= deliveryDate) p.expiry = "Already expired. Record these as rejected.";
    }
    if (num(lot.rejected) > 0 && !lot.reason) p.reason = "Choose a reason.";
    if (lot.reason === "Other" && num(lot.rejected) > 0 && !lot.reasonNotes.trim()) p.reasonNotes = "Describe the problem.";
    return p;
  };
  const allProblems = lots.map(problemsFor);
  const totalGood = lots.reduce((s, l) => s + num(l.good), 0);
  const totalRejected = lots.reduce((s, l) => s + num(l.rejected), 0);
  const stillDueAfter = due.reduce((s, l) => s + Math.max(0, l.quantityRemaining - goodFor(l.productId)), 0);
  const shortLots = lots.filter(l => num(l.good) > 0 && l.expiry && l.expiry > deliveryDate && l.expiry < shortLimit);
  const dateProblem = !deliveryDate ? "Enter the delivery date." : deliveryDate > todayManila() ? "The delivery date can't be in the future." : "";
  const valid = !dateProblem && totalGood + totalRejected > 0 && allProblems.every(p => Object.keys(p).length === 0);

  async function submit() {
    setAttempted(true);
    if (!valid) return;
    const lines: ReceiveLine[] = lots.filter(l => num(l.good) + num(l.rejected) > 0).map(l => ({
      productId: l.productId, quantityAccepted: num(l.good),
      batchNumber: num(l.good) > 0 ? l.lot.trim().toUpperCase() : l.lot.trim() ? l.lot.trim().toUpperCase() : undefined,
      expirationDate: l.expiry || undefined,
      quantityRejected: num(l.rejected) || undefined, rejectionReason: num(l.rejected) ? (l.reason as DeliveryRejectionReason) : undefined,
      rejectionNotes: l.reasonNotes.trim() || undefined,
    }));
    const result = await save.run(() => procurementApi.receive(detail.order.id, key, { deliveryDate, receiptNumber: receipt.trim() || undefined, notes: notes.trim() || undefined, lines }));
    if (!result) return;
    setKey(newKey());
    const complete = result.order.stage === "Received";
    onDone(result, `${totalGood} unit${totalGood === 1 ? "" : "s"} added to stock${totalRejected ? `, ${totalRejected} rejected` : ""}. ${complete ? "The order is complete." : `${stillDueAfter} still due.`}`, result.warnings);
  }

  return (
    <WholesaleDialog title="Receive delivery" description={`${detail.order.poNumber} · ${detail.order.supplier.name} · Check each box against the supplier's delivery receipt`}
      busy={save.busy} close={onClose} className="proc-dialog proc-dialog-wide"
      footer={<>
        <span className="proc-footer-summary" aria-live="polite">
          <strong>{totalGood}</strong> into stock{totalRejected ? <> · <strong>{totalRejected}</strong> rejected</> : null} · <strong>{stillDueAfter}</strong> still due after this
        </span>
        <button type="button" className="button soft" onClick={onClose} disabled={save.busy}>Cancel</button>
        <button type="button" className="button primary-action" onClick={submit} disabled={save.busy}>{save.busy ? "Saving…" : "Save receiving report"}</button>
      </>}>
      <div className="form-grid proc-grid-3">
        <Field id="rcv-date" label="Delivery date" error={(attempted && dateProblem) || save.fieldErrors.deliveryDate}>
          <DateField id="rcv-date" value={deliveryDate} max={todayManila()} onChange={e => setDeliveryDate(e.target.value)} />
        </Field>
        <Field id="rcv-dr" label="Supplier's delivery receipt no." optional error={save.fieldErrors.receiptNumber}>
          <input id="rcv-dr" value={receipt} maxLength={100} placeholder="e.g. DR-8812" onChange={e => setReceipt(e.target.value)} />
        </Field>
        <Field id="rcv-notes" label="Notes" optional error={save.fieldErrors.notes}>
          <input id="rcv-notes" value={notes} maxLength={1000} placeholder="e.g. 1 box arrived wet" onChange={e => setNotes(e.target.value)} />
        </Field>
      </div>

      <div className="proc-receive-list">
        {due.map(line => {
          const mine = lots.filter(l => l.productId === line.productId);
          const good = goodFor(line.productId);
          return (
            <section key={line.productId} className="proc-receive-item" aria-label={line.product}>
              <header>
                <div><strong>{line.product}</strong> <span className="muted">{line.sku}</span></div>
                <span className={`pill ${good === line.quantityRemaining ? "success" : good > line.quantityRemaining ? "danger" : "neutral"}`}>
                  {good} of {line.quantityRemaining} still due{line.quantityReceived ? ` (${line.quantityReceived} received before)` : ""}
                </span>
              </header>
              {mine.map((lot, i) => {
                const p = allProblems[lots.indexOf(lot)]!;
                const show = (f: keyof typeof p) => (attempted || (f === "good" && p.good)) ? p[f] : undefined;
                const isShort = shortLots.includes(lot);
                return (
                  <div key={lot.key} className="proc-lot-row">
                    <div className="proc-lot-fields">
                      <Field id={`good-${lot.key}`} label={i === 0 ? "Good qty" : "Good qty (other lot)"} error={show("good")}>
                        <input id={`good-${lot.key}`} inputMode="numeric" value={lot.good} onChange={e => update(lot.key, { good: e.target.value.replace(/\D/g, "").slice(0, 7) })} />
                      </Field>
                      <Field id={`lot-${lot.key}`} label="Lot no." error={show("lot")}>
                        <input
                          id={`lot-${lot.key}`}
                          value={lot.lot}
                          readOnly
                          tabIndex={-1}
                          style={{ background: "hsl(var(--surface-soft))", cursor: "default", fontWeight: 500 }}
                          title="Automatically generated unique lot number"
                        />
                      </Field>
                      <Field id={`exp-${lot.key}`} label="Expiry" error={show("expiry")} hint={isShort ? `Expires within ${SHORT_EXPIRY_MONTHS} months` : undefined}>
                        <DateField id={`exp-${lot.key}`} value={lot.expiry} onChange={e => update(lot.key, { expiry: e.target.value })} />
                      </Field>
                      <Field id={`rej-${lot.key}`} label="Rejected" error={undefined}>
                        <input id={`rej-${lot.key}`} inputMode="numeric" value={lot.rejected} placeholder="0" onChange={e => update(lot.key, { rejected: e.target.value.replace(/\D/g, "").slice(0, 7) })} />
                      </Field>
                      {num(lot.rejected) > 0 && (
                        <Field id={`why-${lot.key}`} label="Why rejected" error={show("reason")}>
                          <SelectField id={`why-${lot.key}`} value={lot.reason} onChange={e => update(lot.key, { reason: e.target.value as DeliveryRejectionReason })}>
                            <option value="">Choose</option>
                            {DELIVERY_REJECTION_REASONS.map(r => <option key={r} value={r}>{DELIVERY_REJECTION_REASON_LABEL[r]}</option>)}
                          </SelectField>
                        </Field>
                      )}
                      {mine.length > 1 && (
                        <button type="button" className="button soft table-action-btn proc-lot-remove" aria-label="Remove this lot" onClick={() => setLots(c => c.filter(l => l.key !== lot.key))}><X size={14} /></button>
                      )}
                    </div>
                    {lot.reason === "Other" && num(lot.rejected) > 0 && (
                      <Field id={`whynote-${lot.key}`} label="Describe the problem" full error={show("reasonNotes")}>
                        <input id={`whynote-${lot.key}`} value={lot.reasonNotes} maxLength={500} onChange={e => update(lot.key, { reasonNotes: e.target.value })} />
                      </Field>
                    )}
                    {isShort && <Callout tone="warning">Lot {lot.lot || "?"} expires {shortDate(lot.expiry)}, within {SHORT_EXPIRY_MONTHS} months. Accept only if it will sell in time; otherwise record it as rejected (“Expiry too short”).</Callout>}
                  </div>
                );
              })}
              <button type="button" className="proc-link" onClick={() => setLots(c => [...c, lotFor(line.productId)])}><Plus size={13} /> Another lot of this medicine</button>
            </section>
          );
        })}
      </div>
      <p className="muted proc-small">Rejected units don't go into stock and stay due on the order. If the rest won't come, use “Close short” on the order.</p>
      {attempted && totalGood + totalRejected === 0 && <Callout tone="danger">Enter at least one good or rejected quantity.</Callout>}
      {save.error && <Callout tone="danger">{save.error}</Callout>}
    </WholesaleDialog>
  );
}
