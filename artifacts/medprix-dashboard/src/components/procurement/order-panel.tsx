import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Pencil, RotateCcw } from "lucide-react";
import { SUPPLIER_TERMS_LABEL, SUPPLIER_PAYMENT_MODE_LABEL, DELIVERY_REJECTION_REASON_LABEL } from "@workspace/api-zod";
import { WholesaleDialog } from "@/components/wholesale-dialog";
import { LoadingState } from "@/components/custom-ui/loading-state";
import { procurementApi, peso, stageTone, NEXT_STEP_LABEL, type Invoice, type OrderDetail, type Payment, type NextStep } from "@/lib/procurement-api";
import { purchaseOrderPdf, receivingReportPdf, invoiceRecordPdf, paymentAdvicePdf, savePdf, printPdf } from "@/lib/procurement-documents";
import { OrderEditor, type SupplierOption } from "./order-editor";
import { SendDialog, ReasonDialog, InvoiceDialog, VerifyDialog } from "./action-dialogs";
import { ReceiveDialog } from "./receive-dialog";
import { PaymentDialog, ReceiptNumberDialog, type PaymentTarget } from "./payment-dialog";
import { Callout, dateTime, shortDate, useSave } from "./shared";

type Sub =
  | { kind: "edit" } | { kind: "send" } | { kind: "receive" } | { kind: "invoice" }
  | { kind: "verify"; invoice: Invoice } | { kind: "pay"; target: PaymentTarget }
  | { kind: "receipt"; payment: Payment }
  | { kind: "reason"; action: "cancel" | "close" | "return" };

const EVENT_LABEL: Record<string, string> = {
  created: "Created", edited: "Edited", submitted: "Sent for approval", approved: "Approved", returned: "Returned for changes",
  returned_for_approval: "Changed after approval", sent: "Sent to supplier", resent: "Sending details updated", received: "Delivery received",
  cancelled: "Cancelled", closed_short: "Closed short", invoice_recorded: "Invoice recorded", invoice_verified: "Invoice verified",
  payment_recorded: "Payment recorded", receipt_added: "Supplier OR added",
};

/** Next step for this order, from its detail (same rule the list uses). */
export function nextStepOf(detail: OrderDetail): NextStep {
  const stage = detail.order.stage;
  const pending = detail.invoices.some(i => i.status === "PendingVerification");
  const received = Number(detail.receivedValue) > 0;
  const balance = detail.invoices.reduce((s, i) => s + (i.payable ? Number(i.balance) : 0), 0);
  if (stage === "Draft") return "submit";
  if (stage === "For approval") return "approve";
  if (stage === "Approved") return "send";
  if (stage === "Sent" || stage === "Partly received") return pending && received ? "verify" : "receive";
  if (stage === "Received" || stage === "Closed short")
    return pending ? "verify" : Number(detail.uninvoicedValue) > 0 ? "invoice" : balance > 0 ? "pay" : null;
  return null;
}

export function OrderPanel({ orderId, isAdmin, suppliers, onClose, onChanged }: {
  orderId: string; isAdmin: boolean; suppliers: SupplierOption[]; onClose: () => void; onChanged: (message?: string, warnings?: string[]) => void;
}) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [sub, setSub] = useState<Sub | null>(null);
  const action = useSave();

  const load = useCallback(async () => {
    setLoadError("");
    try { setDetail(await procurementApi.readOrder(orderId)); }
    catch (e) { setLoadError(e instanceof Error ? e.message : "Could not load this order."); }
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  const done = (next: OrderDetail, message: string, warnings: string[] = []) => { setDetail(next); setSub(null); onChanged(message, warnings); };
  const quick = async (work: () => Promise<OrderDetail>, message: (d: OrderDetail) => string) => {
    const next = await action.run(work);
    if (next) done(next, message(next));
  };

  if (!detail) {
    return (
      <WholesaleDialog title="Purchase order" busy={false} close={onClose} className="proc-dialog proc-panel">
        {loadError ? <Callout tone="danger">{loadError} <button type="button" className="proc-link" onClick={load}>Try again</button></Callout> : <LoadingState label="Loading order…" />}
      </WholesaleDialog>
    );
  }

  const { order } = detail;
  const step = nextStepOf(detail);
  const payable = detail.invoices.find(i => i.payable && Number(i.balance) > 0);
  const pendingInvoice = detail.invoices.find(i => i.status === "PendingVerification");
  const payTarget = (invoice: Invoice): PaymentTarget => ({
    apId: invoice.apId!, invoiceNumber: invoice.invoiceNumber, supplier: order.supplier.name, poNumber: order.poNumber,
    amount: invoice.amount, totalPaid: invoice.totalPaid, balance: invoice.balance, dueDate: invoice.dueDate, prepayment: invoice.status !== "Verified",
  });
  const runStep = () => {
    if (step === "submit") return quick(() => procurementApi.submit(order.id), d => `${d.order.poNumber} sent for approval.`);
    if (step === "approve") return quick(() => procurementApi.approve(order.id), d => `${d.order.poNumber} approved.`);
    if (step === "send") return setSub({ kind: "send" });
    if (step === "receive") return setSub({ kind: "receive" });
    if (step === "invoice") return setSub({ kind: "invoice" });
    if (step === "verify" && pendingInvoice) return setSub({ kind: "verify", invoice: pendingInvoice });
    if (step === "pay" && payable) return setSub({ kind: "pay", target: payTarget(payable) });
  };
  const editable = ["Draft", "Pending", "Approved"].includes(order.status);
  const unitsReceived = detail.lines.reduce((s, l) => s + l.quantityReceived, 0);
  const anyInvoice = detail.invoices.length > 0;
  const paidAll = anyInvoice && detail.invoices.every(i => i.payable && Number(i.balance) === 0) && Number(detail.uninvoicedValue) === 0;
  const steps = [
    { label: "Created", done: true, when: order.orderDate },
    { label: "Approved", done: Boolean(order.approvedAt) || ["Submitted", "Fulfilled"].includes(order.status), when: order.approvedAt },
    { label: "Sent", done: Boolean(order.sentAt) || order.status === "Fulfilled", when: order.sentAt },
    { label: order.stage === "Partly received" ? "Partly received" : order.stage === "Closed short" ? "Closed short" : "Received", done: unitsReceived > 0, partial: order.stage === "Partly received", when: detail.deliveries.at(-1)?.deliveryDate ?? null },
    { label: "Invoiced", done: anyInvoice && Number(detail.uninvoicedValue) === 0 && !pendingInvoice && unitsReceived > 0, partial: anyInvoice, when: detail.invoices.at(-1)?.invoiceDate ?? null },
    { label: "Paid", done: paidAll, partial: detail.invoices.some(i => Number(i.totalPaid) > 0), when: null },
  ];

  const subDialog = (() => {
    if (!sub) return null;
    const close = () => setSub(null);
    switch (sub.kind) {
      case "edit": return <OrderEditor suppliers={suppliers} existing={detail} onClose={close} onSaved={(d, m) => done(d, m)} />;
      case "send": return <SendDialog detail={detail} onClose={close} onDone={done} />;
      case "receive": return <ReceiveDialog detail={detail} onClose={close} onDone={done} />;
      case "invoice": return <InvoiceDialog detail={detail} isAdmin={isAdmin} onClose={close} onDone={done} />;
      case "verify": return <VerifyDialog detail={detail} invoice={sub.invoice} onClose={close} onDone={done} />;
      case "pay": return <PaymentDialog target={sub.target} onClose={() => { close(); void load(); }} onSaved={a => onChanged(`${peso(a.payment.amount)} recorded. Payment advice ${a.payment.adviceNumber ?? ""} is ready.`)} />;
      case "receipt": return <ReceiptNumberDialog paymentId={sub.payment.id} adviceNumber={sub.payment.adviceNumber} onClose={close} onSaved={() => { void load(); onChanged("Supplier's OR number saved."); }} />;
      case "reason": {
        const config = {
          cancel: { title: `Cancel ${order.poNumber}?`, description: "Use this when nothing will arrive. The order stays on record as cancelled.", label: "Reason", confirm: "Cancel order", danger: true,
            placeholder: "e.g. supplier out of stock, ordered by mistake", run: (r: string) => procurementApi.cancel(order.id, r), msg: "cancelled" },
          close: { title: `Close ${order.poNumber} short?`, description: "Use this when the rest won't arrive. Stock already received stays; the missing units are no longer expected.", label: "Reason", confirm: "Close short", danger: false,
            placeholder: "e.g. supplier can't deliver the rest", run: (r: string) => procurementApi.closeShort(order.id, r), msg: "closed short" },
          return: { title: `Return ${order.poNumber} for changes?`, description: "It goes back to Draft so the person who made it can fix it and send it again.", label: "What needs to change?", confirm: "Return for changes", danger: false,
            placeholder: "e.g. reduce Metformin to 200 boxes", run: (r: string) => procurementApi.returnForChanges(order.id, r), msg: "returned for changes" },
        }[sub.action];
        return <ReasonDialog {...config} onClose={close} onConfirm={async r => { const d = await config.run(r); setDetail(d); onChanged(`${d.order.poNumber} ${config.msg}.`); return d; }}
          notice={sub.action === "close" ? `Not delivered: ${detail.lines.filter(l => l.quantityRemaining > 0).map(l => `${l.quantityRemaining} ${l.product}`).join(", ")}` : undefined} />;
      }
    }
  })();

  return (
    <>
      <WholesaleDialog hidden={Boolean(sub)} title={order.poNumber} titleIcon={<span className={stageTone(order.stage)}>{order.stage}</span>}
        description={`${order.supplier.name} · ${SUPPLIER_TERMS_LABEL[order.supplier.paymentTerms]} (from supplier) · ${peso(order.totalOrderAmount)}`}
        busy={action.busy} close={onClose} className="proc-dialog proc-panel">
        <ol className="proc-stepper" aria-label="Order progress">
          {steps.map(s => (
            <li key={s.label} className={s.done ? "done" : s.partial ? "partial" : ""}>
              <span className="proc-stepper-bar" /><strong>{s.label}</strong><span className="muted">{s.when ? shortDate(s.when) : ""}</span>
            </li>
          ))}
        </ol>

        {(step || editable || order.status === "Submitted") && (
          <div className="proc-action-bar">
            {step && <button type="button" className="button primary-action" onClick={runStep} disabled={action.busy}>{action.busy ? "Saving…" : step === "approve" ? "Approve order" : NEXT_STEP_LABEL[step]}</button>}
            {step === "approve" && <span className="muted proc-small">{order.createdBy ? `Created by ${order.createdBy}. ` : ""}Approving your own order is allowed and recorded.</span>}
            <div className="proc-action-secondary">
              {editable && <button type="button" className="button soft" onClick={() => setSub({ kind: "edit" })}><Pencil size={14} /> Edit</button>}
              {order.status === "Pending" && <button type="button" className="button soft" onClick={() => setSub({ kind: "reason", action: "return" })}><RotateCcw size={14} /> Return for changes</button>}
              {order.status === "Submitted" && unitsReceived === 0 && <button type="button" className="button soft" onClick={() => setSub({ kind: "send" })}>Update sending details</button>}
              {order.status === "Submitted" && unitsReceived > 0 && <button type="button" className="button soft" onClick={() => setSub({ kind: "reason", action: "close" })}>Close short…</button>}
              {["Submitted", "Fulfilled"].includes(order.status) && step !== "invoice" && step !== "verify" && !(order.status === "Fulfilled" && Number(detail.uninvoicedValue) === 0) && (
                <button type="button" className="button soft" onClick={() => setSub({ kind: "invoice" })}>Record invoice</button>)}
              {order.status === "Approved" && <button type="button" className="button soft" onClick={() => setSub({ kind: "invoice" })}>Record advance invoice</button>}
              {["Draft", "Pending", "Approved"].includes(order.status) || (order.status === "Submitted" && unitsReceived === 0 && !anyInvoice)
                ? <button type="button" className="button soft proc-danger-text" onClick={() => setSub({ kind: "reason", action: "cancel" })}>Cancel order</button> : null}
            </div>
          </div>
        )}
        {action.error && <Callout tone="danger">{action.error}</Callout>}
        {order.stage === "Sent" && order.expectedDeliveryDate && order.expectedDeliveryDate < detail.today && (
          <Callout tone="warning">Expected on {shortDate(order.expectedDeliveryDate)}; nothing has arrived yet. Follow up with {order.supplier.contactPerson ?? "the supplier"}{order.supplier.contactNumber ? ` (${order.supplier.contactNumber})` : ""}.</Callout>)}
        {order.closeReason && <Callout tone="info">{order.stage === "Cancelled" ? "Cancelled" : "Closed short"}: {order.closeReason}</Callout>}

        <section className="proc-panel-section">
          <h3>{order.stage === "Partly received" ? "Still due" : "Items"}</h3>
          <div className="table-scroll">
            <table className="data-table proc-compact">
              <thead><tr><th>Medicine</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Rejected</th><th className="num">Still due</th><th className="num">Unit cost</th></tr></thead>
              <tbody>{detail.lines.map(l => (
                <tr key={l.productId}><td><strong>{l.product}</strong> <span className="muted">{l.sku}</span></td>
                  <td className="num">{l.quantityOrdered}</td><td className="num">{l.quantityReceived}</td><td className="num">{l.quantityRejected || "—"}</td>
                  <td className="num">{order.status === "Fulfilled" || order.status === "Cancelled" ? (l.quantityRemaining ? <span className="muted">{l.quantityRemaining} not coming</span> : "—") : <strong>{l.quantityRemaining || "—"}</strong>}</td>
                  <td className="num">{peso(l.unitCost)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        {detail.deliveries.length > 0 && (
          <section className="proc-panel-section">
            <h3>Deliveries · receiving reports</h3>
            {detail.deliveries.map((d, i) => (
              <div key={d.id} className="proc-record">
                <div className="proc-record-head">
                  <div><strong>{shortDate(d.deliveryDate)}</strong> · {d.items.reduce((s, x) => s + x.quantity, 0)} into stock{d.rejections.length ? ` · ${d.rejections.reduce((s, r) => s + r.quantity, 0)} rejected` : ""}
                    <span className="muted"> · DR {d.receiptNumber ?? "not given"} · received by {d.receivedBy ?? "—"}</span></div>
                  <div className="proc-button-row">
                    <button type="button" className="button soft table-action-btn" aria-label={`Download receiving report ${i + 1}`} onClick={() => savePdf(receivingReportPdf(detail, d), `${order.poNumber}-RR${i + 1}`)}><Download size={14} /></button>
                    <button type="button" className="button soft table-action-btn" aria-label={`Open receiving report ${i + 1}`} onClick={() => printPdf(receivingReportPdf(detail, d))}><ExternalLink size={14} /></button>
                  </div>
                </div>
                <ul className="proc-lot-list">
                  {d.items.map(x => <li key={`${x.productId}-${x.batchNumber}`}>{x.quantity} × {x.product} · lot {x.batchNumber} · exp {shortDate(x.expirationDate)}{x.shortExpiry && <span className="pill orange">short expiry</span>}</li>)}
                  {d.rejections.map((r, k) => <li key={`r${k}`} className="proc-rejected">{r.quantity} × {r.product} rejected · {DELIVERY_REJECTION_REASON_LABEL[r.reason]}{r.notes ? ` (${r.notes})` : ""}</li>)}
                </ul>
                {d.notes && <p className="muted proc-small">{d.notes}</p>}
              </div>
            ))}
          </section>
        )}

        <section className="proc-panel-section">
          <h3>Invoice and payments</h3>
          {detail.invoices.length === 0 ? (
            <div className="proc-empty-record">No invoice yet. Record it when the supplier's invoice arrives; the due date is set from the supplier's terms. Billed before delivery? Record it as <em>pending verification</em>.</div>
          ) : detail.invoices.map(inv => (
            <div key={inv.id} className="proc-record">
              <div className="proc-record-head">
                <div><strong>{inv.invoiceNumber}</strong> · {peso(inv.amount)}
                  <span className={`pill ${inv.status === "PendingVerification" ? "orange" : Number(inv.balance) === 0 ? "success" : inv.overdue ? "danger" : "neutral"}`}>
                    {inv.status === "PendingVerification" ? "Pending verification" : Number(inv.balance) === 0 ? "Paid" : inv.overdue ? "Overdue" : "Unpaid"}</span>
                  <span className="muted"> · dated {shortDate(inv.invoiceDate)} · due {shortDate(inv.dueDate)} · {SUPPLIER_TERMS_LABEL[inv.terms]}</span></div>
                <div className="proc-button-row">
                  {inv.status === "PendingVerification" && <button type="button" className="button soft" onClick={() => setSub({ kind: "verify", invoice: inv })}>Verify</button>}
                  {inv.payable && Number(inv.balance) > 0 && <button type="button" className="button soft" onClick={() => setSub({ kind: "pay", target: payTarget(inv) })}>Record payment</button>}
                  <button type="button" className="button soft table-action-btn" aria-label={`Download invoice record ${inv.invoiceNumber}`} onClick={() => savePdf(invoiceRecordPdf(detail, inv), inv.invoiceNumber)}><Download size={14} /></button>
                </div>
              </div>
              {(inv.termsOverrideReason || inv.varianceReason) && <p className="muted proc-small">{inv.termsOverrideReason ? `Special terms: ${inv.termsOverrideReason}. ` : ""}{inv.varianceReason ? `Difference: ${inv.varianceReason}` : ""}</p>}
              {inv.payable && <div className="proc-mini-stats"><span>Paid {peso(inv.totalPaid)}</span><span>Balance <strong>{peso(inv.balance)}</strong></span></div>}
              {inv.payments.length > 0 && (
                <ul className="proc-lot-list">
                  {inv.payments.map(p => (
                    <li key={p.id} className="proc-payment-line">
                      <span>{shortDate(p.paymentDate)} · {peso(p.amount)} · {p.mode ? SUPPLIER_PAYMENT_MODE_LABEL[p.mode] : "—"}{p.referenceNumber ? ` ${p.referenceNumber}` : ""}{p.isPrepayment ? " · advance" : ""}
                        <span className="muted"> · {p.adviceNumber ?? ""} · OR {p.supplierOrNumber ?? "pending"}</span></span>
                      <span className="proc-button-row">
                        {!p.supplierOrNumber && <button type="button" className="proc-link" onClick={() => setSub({ kind: "receipt", payment: p })}>Add OR</button>}
                        <button type="button" className="proc-link" onClick={async () => { const a = await procurementApi.readPayment(p.id).catch(() => null); if (a) savePdf(paymentAdvicePdf(a), p.adviceNumber ?? "payment-advice"); }}>Payment advice</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>

        <section className="proc-panel-section">
          <h3>Documents</h3>
          <div className="proc-button-row">
            <button type="button" className="button soft" onClick={() => savePdf(purchaseOrderPdf(detail), order.poNumber)}><FileText size={14} /> Purchase order PDF</button>
            <button type="button" className="button soft" onClick={() => printPdf(purchaseOrderPdf(detail))}><ExternalLink size={14} /> Open to print</button>
          </div>
        </section>

        <section className="proc-panel-section">
          <h3>History</h3>
          <ol className="proc-timeline">
            {detail.events.slice().reverse().map(e => (
              <li key={e.id}><span className="muted">{dateTime(e.at)}</span> · <strong>{e.actor ?? "Someone"}</strong> {(EVENT_LABEL[e.type] ?? e.type).toLowerCase()}{e.details ? ` — ${e.details}` : ""}</li>
            ))}
            {detail.events.length === 0 && <li className="muted">This order was created before history was recorded.</li>}
          </ol>
        </section>
      </WholesaleDialog>
      {subDialog}
    </>
  );
}
