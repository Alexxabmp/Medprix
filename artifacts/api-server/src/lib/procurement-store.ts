import {
  isCalendarDate, pharmacyDate, supplierDueDate, isSupplierTerms, isSupplierTermsBasis,
  normalizeSupplierTerms, SUPPLIER_TERMS_LABEL, SUPPLIER_PAYMENT_MODES, PO_SEND_METHODS,
  DELIVERY_REJECTION_REASONS, SHORT_EXPIRY_MONTHS, SUPPLIER_PAYMENT_MODE_LABEL,
  type SupplierTerms, type SupplierTermsBasis,
} from "@workspace/api-zod";
import { writeAuditEvent } from "./audit-events";

/**
 * Procurement workflow (one place for every rule):
 *   Draft → For approval (Pending) → Approved → Sent (Submitted) → Partly received → Received (Fulfilled)
 * plus Cancelled (before anything arrives) and Closed short (Fulfilled with a reason).
 *
 * - Front desk and Admin create, approve (including their own orders, which is recorded), send,
 *   receive, invoice and pay. Only Admin overrides an invoice's terms.
 * - Receiving IS the receiving report: accepted units post stock with the supplier's lot and expiry;
 *   rejected units never enter stock and stay due.
 * - Invoices copy the supplier's terms. Invoices for received goods are verified at once and
 *   become payables. Invoices billed before delivery wait as Pending verification; only
 *   Immediate-terms invoices can be paid while pending (recorded as prepayments).
 * - Payments: partial and multiple, never past the balance, never move the due date.
 *   Each payment gets a payment advice number for the PDF sent to the supplier.
 */

export type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
export type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
export type ProcurementActor = { id: string; username: string; role: string; deviceIp?: string | null };

export class ProcurementError extends Error {
  constructor(public status: number, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lotPattern = /^[A-Z0-9][A-Z0-9-]{0,99}$/;
const docNumberPattern = /^[A-Za-z0-9][A-Za-z0-9 \-/#.]{0,99}$/;
const RECEIVED_STATUSES = "('Received','Inspected','Partial')";

const bad = (message: string, field?: string) =>
  new ProcurementError(400, message, field ? { errors: { [field]: message } } : {});
const conflict = (message: string, extra: Record<string, unknown> = {}) => new ProcurementError(409, message, extra);
const notFound = (message: string) => new ProcurementError(404, message);

function idOf(value: unknown, what: string): string {
  if (typeof value !== "string" || !uuid.test(value)) throw bad(`Choose a valid ${what}.`);
  return value.toLowerCase();
}
function keyOf(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value))
    throw bad("This form is missing its save reference. Refresh the page and try again.");
  return value.toLowerCase();
}
function text(value: unknown, field: string, label: string, opts: { max: number; min?: number; required?: boolean }): string | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (opts.required) throw bad(`Enter ${label}.`, field);
    return null;
  }
  if (typeof value !== "string") throw bad(`Enter ${label}.`, field);
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length < (opts.min ?? 1) || clean.length > opts.max)
    throw bad(`${label[0]!.toUpperCase()}${label.slice(1)} must be ${opts.min ?? 1} to ${opts.max} characters.`, field);
  return clean;
}
function date(value: unknown, field: string, label: string): string {
  if (!isCalendarDate(value)) throw bad(`Enter a valid ${label}.`, field);
  return value;
}
/** Money as integer centavos from "1234.5" / 1234.5. */
function cents(value: unknown, field: string, label: string): number {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(/,/g, "") : "";
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw)) throw bad(`Enter ${label} with at most two decimal places.`, field);
  const [whole, fraction = ""] = raw.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
const toCents = (value: unknown) => Math.round(Number(value || 0) * 100);
const peso = (c: number) => (c / 100).toFixed(2);
const pesoLabel = (c: number) => `₱${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function wholeNumber(value: unknown, field: string, label: string, min: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > 1_000_000) throw bad(`${label} must be a whole number from ${min} to 1,000,000.`, field);
  return n;
}
function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

/** Display stage from the stored status plus what has arrived. */
export function orderStage(status: string, unitsReceived: number, closedAt: unknown): string {
  if (status === "Draft") return "Draft";
  if (status === "Pending") return "For approval";
  if (status === "Approved") return "Approved";
  if (status === "Submitted") return unitsReceived > 0 ? "Partly received" : "Sent";
  if (status === "Fulfilled") return closedAt ? "Closed short" : "Received";
  return "Cancelled";
}

async function history(query: Query, poId: string, actor: ProcurementActor, eventType: string, details: string | null) {
  await query(`INSERT INTO purchase_order_events(po_id,event_type,actor_id,actor_name,actor_role,details)
    SELECT $1,$2,$3,coalesce((SELECT full_name FROM users WHERE id=$3),$4),$5,$6`,
    [poId, eventType, actor.id, actor.username, actor.role, details]);
}
async function audit(query: Query, actor: ProcurementActor, action: string, activity: string, description: string) {
  await writeAuditEvent(query, { actor, action, activity, module: "Procurement", description, deviceIp: actor.deviceIp ?? null });
}
async function lockOrder(query: Query, poId: string) {
  const { rows: [order] } = await query(`SELECT po.*, s.supplier_name, s.payment_terms, s.terms_basis
    FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.id=$1 FOR UPDATE OF po`, [poId]);
  if (!order) throw notFound("Purchase order not found. Refresh the order list.");
  return order;
}
/** Ordered / accepted / rejected units per product on one PO. */
async function lineState(query: Query, poId: string) {
  const { rows } = await query(`SELECT pi.product_id, p.product_name, p.sku,
      sum(pi.quantity_ordered)::int AS ordered,
      round(sum(pi.line_total)/nullif(sum(pi.quantity_ordered),0),4)::text AS unit_cost,
      coalesce((SELECT sum(di.quantity_delivered) FROM delivery_items di JOIN supplier_deliveries d ON d.id=di.delivery_id
        WHERE d.po_id=$1 AND di.product_id=pi.product_id AND d.delivery_status IN ${RECEIVED_STATUSES}),0)::int AS received,
      coalesce((SELECT sum(r.quantity) FROM delivery_rejections r JOIN supplier_deliveries d ON d.id=r.delivery_id
        WHERE d.po_id=$1 AND r.product_id=pi.product_id),0)::int AS rejected
    FROM po_items pi JOIN products p ON p.id=pi.product_id WHERE pi.po_id=$1
    GROUP BY pi.product_id, p.product_name, p.sku ORDER BY min(pi.created_at), p.product_name`, [poId]);
  return rows.map(row => ({ ...row, remaining: Math.max(0, row.ordered - row.received) }));
}
/** Value of received goods not yet covered by a verified invoice (centavos, never negative). */
async function uninvoicedValue(query: Query, poId: string, excludeInvoiceId: string | null = null): Promise<{ received: number; invoiced: number; open: number }> {
  const lines = await lineState(query, poId);
  const received = lines.reduce((sum, line) => sum + Math.round(line.received * Number(line.unit_cost) * 100), 0);
  const { rows: [row] } = await query(`SELECT coalesce(sum(invoice_amount),0)::text AS total FROM supplier_invoices
    WHERE po_id=$1 AND status='Verified' AND ($2::uuid IS NULL OR id<>$2::uuid)`, [poId, excludeInvoiceId]);
  const invoiced = toCents(row.total);
  return { received, invoiced, open: Math.max(0, received - invoiced) };
}
async function latestDeliveryDate(query: Query, poId: string): Promise<string | null> {
  const { rows: [row] } = await query(`SELECT max(delivery_date)::text AS day FROM supplier_deliveries
    WHERE po_id=$1 AND delivery_status IN ${RECEIVED_STATUSES}`, [poId]);
  return row?.day ?? null;
}

type OrderLineInput = { productId: string; quantityOrdered: number; unitCost: number };
async function parseOrderLines(query: Query, value: unknown): Promise<OrderLineInput[]> {
  if (!Array.isArray(value) || value.length === 0) throw bad("Add at least one medicine to the order.", "items");
  if (value.length > 100) throw bad("An order can have at most 100 lines.", "items");
  const lines: OrderLineInput[] = value.map((item: any, i) => ({
    productId: idOf(item?.productId, "medicine for every line"),
    quantityOrdered: wholeNumber(item?.quantityOrdered, `items.${i}.quantityOrdered`, "Quantity", 1),
    unitCost: cents(item?.unitCost, `items.${i}.unitCost`, "a unit cost"),
  }));
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.productId)) throw conflict("A medicine is listed twice. Combine it into one line.");
    seen.add(line.productId);
  }
  const { rows } = await query(`SELECT id FROM products WHERE id = ANY($1::uuid[])`, [[...seen]]);
  if (rows.length !== seen.size) throw bad("A medicine on this order no longer exists. Refresh and choose again.", "items");
  return lines;
}
async function writeOrderLines(query: Query, poId: string, lines: OrderLineInput[]) {
  await query(`DELETE FROM po_items WHERE po_id=$1`, [poId]);
  let total = 0;
  for (const line of lines) {
    const lineTotal = line.quantityOrdered * line.unitCost;
    total += lineTotal;
    await query(`INSERT INTO po_items(po_id,product_id,quantity_ordered,unit_cost,line_total) VALUES($1,$2,$3,$4,$5)`,
      [poId, line.productId, line.quantityOrdered, peso(line.unitCost), peso(lineTotal)]);
  }
  await query(`UPDATE purchase_orders SET total_order_amount=$2, updated_at=now() WHERE id=$1`, [poId, peso(total)]);
  return total;
}
const linesSignature = (lines: { productId?: string; product_id?: string; quantityOrdered?: number; quantity_ordered?: number; unitCost?: number; unit_cost?: string }[]) =>
  lines.map(l => `${l.productId ?? l.product_id}:${l.quantityOrdered ?? l.quantity_ordered}:${l.unitCost ?? toCents(l.unit_cost)}`).sort().join("|");

export function createProcurementStore(transaction: Transaction, read: Query) {
  // ─── Suppliers ─────────────────────────────────────────────────────────────
  function supplierInput(body: any, partial: boolean) {
    const terms = body?.paymentTerms === undefined && partial ? undefined : normalizeSupplierTerms(body?.paymentTerms);
    if (terms === null) throw bad("Choose the supplier's payment terms.", "paymentTerms");
    const basis = body?.termsBasis === undefined ? (partial ? undefined : "InvoiceDate") : body.termsBasis;
    if (basis !== undefined && !isSupplierTermsBasis(basis)) throw bad("Choose where the due date counts from.", "termsBasis");
    return { terms, basis: basis as SupplierTermsBasis | undefined };
  }

  async function updateSupplierTerms(id: string, body: any, actor: ProcurementActor) {
    const supplierId = idOf(id, "supplier");
    if (actor.role !== "Admin") throw new ProcurementError(403, "Only an administrator can change a supplier's payment terms.");
    const { terms, basis } = supplierInput(body, false);
    return transaction(async query => {
      const { rows: [before] } = await query(`SELECT * FROM suppliers WHERE id=$1 FOR UPDATE`, [supplierId]);
      if (!before) throw notFound("Supplier not found.");
      const { rows: [saved] } = await query(`UPDATE suppliers SET payment_terms=$2, terms_basis=$3, updated_at=now()
        WHERE id=$1 RETURNING *`, [supplierId, terms, basis]);
      if (before.payment_terms !== terms || before.terms_basis !== basis)
        await audit(query, actor, "UPDATE", "Changed supplier terms", `Changed ${saved.supplier_name} terms from ${SUPPLIER_TERMS_LABEL[before.payment_terms as SupplierTerms]} (${before.terms_basis}) to ${SUPPLIER_TERMS_LABEL[terms!]} (${basis}). Existing invoices keep their due dates.`);
      return { supplier: saved };
    });
  }

  // ─── Reading ───────────────────────────────────────────────────────────────
  async function listOrders() {
    const { rows } = await read(`WITH lines AS (
        SELECT po_id, count(*)::int AS item_count, sum(quantity_ordered)::int AS units_ordered FROM po_items GROUP BY po_id
      ), recv AS (
        SELECT d.po_id, sum(di.quantity_delivered)::int AS units_received, max(d.delivery_date)::text AS last_delivery
        FROM supplier_deliveries d JOIN delivery_items di ON di.delivery_id=d.id
        WHERE d.delivery_status IN ${RECEIVED_STATUSES} GROUP BY d.po_id
      ), recv_value AS (
        SELECT d.po_id, sum(di.quantity_delivered * c.unit_cost) AS value
        FROM supplier_deliveries d JOIN delivery_items di ON di.delivery_id=d.id
        JOIN (SELECT po_id, product_id, sum(line_total)/nullif(sum(quantity_ordered),0) AS unit_cost FROM po_items GROUP BY 1,2) c
          ON c.po_id=d.po_id AND c.product_id=di.product_id
        WHERE d.delivery_status IN ${RECEIVED_STATUSES} GROUP BY d.po_id
      ), inv AS (
        SELECT i.po_id, count(*)::int AS invoice_count,
          count(*) FILTER (WHERE i.status='PendingVerification')::int AS pending_invoices,
          coalesce(sum(i.invoice_amount) FILTER (WHERE i.status='Verified'),0) AS verified_amount,
          coalesce(sum(a.balance),0) AS balance,
          min(i.due_date) FILTER (WHERE a.balance > 0)::text AS next_due
        FROM supplier_invoices i LEFT JOIN accounts_payable a ON a.invoice_id=i.id GROUP BY i.po_id
      )
      SELECT po.id, po.po_number, po.supplier_id, s.supplier_name, s.payment_terms, s.terms_basis,
        po.status, po.order_date, po.updated_at, po.expected_delivery_date::text, po.sent_at, po.sent_method,
        po.closed_at, po.total_order_amount::text, po.self_approved,
        coalesce(l.item_count,0) AS item_count, coalesce(l.units_ordered,0) AS units_ordered,
        coalesce(r.units_received,0) AS units_received, r.last_delivery,
        coalesce(inv.invoice_count,0) AS invoice_count, coalesce(inv.pending_invoices,0) AS pending_invoices,
        greatest(0, round(coalesce(rv.value,0),2) - coalesce(inv.verified_amount,0))::text AS uninvoiced_value,
        coalesce(inv.balance,0)::text AS balance, inv.next_due,
        cb.full_name AS created_by_name, ab.full_name AS approved_by_name
      FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id
      LEFT JOIN lines l ON l.po_id=po.id LEFT JOIN recv r ON r.po_id=po.id LEFT JOIN recv_value rv ON rv.po_id=po.id
      LEFT JOIN inv ON inv.po_id=po.id
      LEFT JOIN users cb ON cb.id=po.created_by LEFT JOIN users ab ON ab.id=po.approved_by
      ORDER BY po.updated_at DESC, po.created_at DESC, po.id`);
    const today = pharmacyDate();
    return {
      today,
      orders: rows.map(row => {
        const stage = orderStage(row.status, row.units_received, row.closed_at);
        const uninvoiced = toCents(row.uninvoiced_value), balance = toCents(row.balance);
        const nextStep =
          stage === "Draft" ? "submit" : stage === "For approval" ? "approve" : stage === "Approved" ? "send"
          : stage === "Sent" || stage === "Partly received" ? (row.pending_invoices > 0 && row.units_received > 0 ? "verify" : "receive")
          : stage === "Received" || stage === "Closed short"
            ? row.pending_invoices > 0 ? "verify" : uninvoiced > 0 ? "invoice" : balance > 0 ? "pay" : null
          : null;
        return {
          id: row.id, poNumber: row.po_number, supplierId: row.supplier_id, supplier: row.supplier_name,
          paymentTerms: row.payment_terms, termsBasis: row.terms_basis, status: row.status, stage, nextStep,
          orderDate: row.order_date, updatedAt: row.updated_at, expectedDeliveryDate: row.expected_delivery_date,
          sentAt: row.sent_at, sentMethod: row.sent_method, totalOrderAmount: row.total_order_amount,
          itemCount: row.item_count, unitsOrdered: row.units_ordered, unitsReceived: row.units_received,
          lastDeliveryDate: row.last_delivery, invoiceCount: row.invoice_count, pendingInvoices: row.pending_invoices,
          uninvoicedValue: peso(uninvoiced), balance: peso(balance), nextDueDate: row.next_due,
          overdue: Boolean(row.next_due && row.next_due < today && balance > 0),
          late: Boolean(stage === "Sent" && row.expected_delivery_date && row.expected_delivery_date < today),
          createdBy: row.created_by_name, approvedBy: row.approved_by_name, selfApproved: row.self_approved,
        };
      }),
    };
  }

  async function readOrder(id: string, query: Query = read) {
    const poId = idOf(id, "purchase order");
    const { rows: [order] } = await query(`SELECT po.*, po.expected_delivery_date::text AS expected_day,
        s.supplier_name, s.contact_person, s.contact_number, s.email, s.address, s.payment_terms, s.terms_basis,
        cb.full_name AS created_by_name, ab.full_name AS approved_by_name, sb.full_name AS sent_by_name
      FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id
      LEFT JOIN users cb ON cb.id=po.created_by LEFT JOIN users ab ON ab.id=po.approved_by LEFT JOIN users sb ON sb.id=po.sent_by
      WHERE po.id=$1`, [poId]);
    if (!order) throw notFound("Purchase order not found. Refresh the order list.");
    const [lines, deliveries, items, rejections, invoices, payments, events, value] = await Promise.all([
      lineState(query, poId),
      query(`SELECT d.id, d.delivery_date::text, d.delivery_status, d.receipt_number, d.notes, d.created_at, u.full_name AS received_by
        FROM supplier_deliveries d LEFT JOIN users u ON u.id=d.received_by WHERE d.po_id=$1 ORDER BY d.delivery_date, d.created_at`, [poId]),
      query(`SELECT di.delivery_id, di.product_id, p.product_name, p.sku, di.batch_number, di.expiration_date::text, di.quantity_delivered
        FROM delivery_items di JOIN supplier_deliveries d ON d.id=di.delivery_id JOIN products p ON p.id=di.product_id
        WHERE d.po_id=$1 ORDER BY p.product_name, di.batch_number`, [poId]),
      query(`SELECT r.delivery_id, r.product_id, p.product_name, p.sku, r.quantity, r.reason, r.batch_number, r.expiration_date::text, r.notes
        FROM delivery_rejections r JOIN supplier_deliveries d ON d.id=r.delivery_id JOIN products p ON p.id=r.product_id
        WHERE d.po_id=$1 ORDER BY p.product_name`, [poId]),
      query(`SELECT i.id, i.invoice_number, i.invoice_date::text, i.due_date::text, i.invoice_amount::text, i.status, i.terms, i.terms_basis,
          i.terms_override_reason, i.variance_reason, i.is_paid, i.created_at, i.verified_at,
          a.id AS ap_id, coalesce(a.total_paid,0)::text AS total_paid,
          (CASE WHEN a.id IS NULL THEN i.invoice_amount ELSE a.balance END)::text AS balance,
          ru.full_name AS recorded_by, vu.full_name AS verified_by
        FROM supplier_invoices i LEFT JOIN accounts_payable a ON a.invoice_id=i.id
        LEFT JOIN users ru ON ru.id=i.recorded_by LEFT JOIN users vu ON vu.id=i.verified_by
        WHERE i.po_id=$1 ORDER BY i.invoice_date, i.created_at`, [poId]),
      query(`SELECT sp.id, a.invoice_id, sp.payment_date, sp.amount_paid::text, sp.payment_mode, sp.reference_number,
          sp.supplier_or_number, sp.advice_number, sp.is_prepayment, sp.notes, u.full_name AS recorded_by
        FROM supplier_payments sp JOIN accounts_payable a ON a.id=sp.ap_id JOIN supplier_invoices i ON i.id=a.invoice_id
        LEFT JOIN users u ON u.id=sp.recorded_by WHERE i.po_id=$1 ORDER BY sp.payment_date, sp.created_at`, [poId]),
      query(`SELECT id, event_type, actor_name, actor_role, details, created_at FROM purchase_order_events
        WHERE po_id=$1 ORDER BY created_at, id`, [poId]),
      uninvoicedValue(query, poId),
    ]);
    const unitsReceived = lines.reduce((sum, line) => sum + line.received, 0);
    const today = pharmacyDate();
    return {
      today,
      order: {
        id: order.id, poNumber: order.po_number, status: order.status,
        stage: orderStage(order.status, unitsReceived, order.closed_at),
        orderDate: order.order_date, expectedDeliveryDate: order.expected_day, notes: order.notes,
        totalOrderAmount: order.total_order_amount, sentAt: order.sent_at, sentMethod: order.sent_method, sentBy: order.sent_by_name,
        createdBy: order.created_by_name, approvedBy: order.approved_by_name, approvedAt: order.approved_at,
        selfApproved: order.self_approved, closedAt: order.closed_at, closeReason: order.close_reason,
        supplier: {
          id: order.supplier_id, name: order.supplier_name, contactPerson: order.contact_person,
          contactNumber: order.contact_number, email: order.email, address: order.address,
          paymentTerms: order.payment_terms, termsBasis: order.terms_basis,
        },
      },
      lines: lines.map(line => ({
        productId: line.product_id, product: line.product_name, sku: line.sku, unitCost: Number(line.unit_cost).toFixed(2),
        quantityOrdered: line.ordered, quantityReceived: line.received, quantityRejected: line.rejected, quantityRemaining: line.remaining,
      })),
      deliveries: deliveries.rows.map(d => ({
        id: d.id, deliveryDate: d.delivery_date, status: d.delivery_status, receiptNumber: d.receipt_number, notes: d.notes,
        receivedBy: d.received_by, createdAt: d.created_at,
        items: items.rows.filter(i => i.delivery_id === d.id).map(i => ({
          productId: i.product_id, product: i.product_name, sku: i.sku, batchNumber: i.batch_number,
          expirationDate: i.expiration_date, quantity: i.quantity_delivered,
          shortExpiry: i.expiration_date < addMonths(d.delivery_date, SHORT_EXPIRY_MONTHS),
        })),
        rejections: rejections.rows.filter(r => r.delivery_id === d.id).map(r => ({
          productId: r.product_id, product: r.product_name, sku: r.sku, quantity: r.quantity, reason: r.reason,
          batchNumber: r.batch_number, expirationDate: r.expiration_date, notes: r.notes,
        })),
      })),
      invoices: invoices.rows.map(i => ({
        id: i.id, invoiceNumber: i.invoice_number, invoiceDate: i.invoice_date, dueDate: i.due_date, amount: i.invoice_amount,
        status: i.status, terms: i.terms, termsBasis: i.terms_basis, termsOverrideReason: i.terms_override_reason,
        varianceReason: i.variance_reason, apId: i.ap_id, totalPaid: i.total_paid, balance: i.balance,
        payable: Boolean(i.ap_id), recordedBy: i.recorded_by, verifiedBy: i.verified_by, verifiedAt: i.verified_at,
        overdue: Boolean(i.ap_id && toCents(i.balance) > 0 && i.due_date < today),
        payments: payments.rows.filter(p => p.invoice_id === i.id).map(p => ({
          id: p.id, paymentDate: p.payment_date, amount: p.amount_paid, mode: p.payment_mode, referenceNumber: p.reference_number,
          supplierOrNumber: p.supplier_or_number, adviceNumber: p.advice_number, isPrepayment: p.is_prepayment,
          notes: p.notes, recordedBy: p.recorded_by,
        })),
      })),
      events: events.rows.map(e => ({ id: e.id, type: e.event_type, actor: e.actor_name, role: e.actor_role, details: e.details, at: e.created_at })),
      receivedValue: peso(value.received), invoicedValue: peso(value.invoiced), uninvoicedValue: peso(value.open),
    };
  }

  // ─── Ordering ──────────────────────────────────────────────────────────────
  async function createOrder(body: any, actor: ProcurementActor) {
    const supplierId = idOf(body?.supplierId, "supplier");
    const expected = body?.expectedDeliveryDate ? date(body.expectedDeliveryDate, "expectedDeliveryDate", "expected delivery date") : null;
    const notes = text(body?.notes, "notes", "notes", { max: 1000 });
    const submit = body?.submit === true;
    return transaction(async query => {
      const { rows: [supplier] } = await query(`SELECT id, supplier_name FROM suppliers WHERE id=$1`, [supplierId]);
      if (!supplier) throw bad("Supplier not found. Refresh and choose again.", "supplierId");
      const lines = await parseOrderLines(query, body?.items);
      // Readable sequential numbers per year: PO-2026-0042.
      await query(`SELECT pg_advisory_xact_lock(hashtext('purchase_orders.po_number'))`);
      const year = pharmacyDate().slice(0, 4);
      const { rows: [seq] } = await query(`SELECT coalesce(max(substring(po_number from '^PO-${year}-(\\d+)$')::int),0)+1 AS next
        FROM purchase_orders WHERE po_number ~ '^PO-${year}-\\d+$'`);
      const poNumber = `PO-${year}-${String(seq.next).padStart(4, "0")}`;
      const { rows: [order] } = await query(`INSERT INTO purchase_orders(supplier_id,po_number,status,created_by,expected_delivery_date,notes)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [supplierId, poNumber, submit ? "Pending" : "Draft", actor.id, expected, notes]);
      const total = await writeOrderLines(query, order.id, lines);
      await history(query, order.id, actor, "created", `${lines.length} line(s), ${pesoLabel(total)}${submit ? "; sent for approval" : "; saved as draft"}`);
      await audit(query, actor, "CREATE", "Created purchase order", `Created ${poNumber} for ${supplier.supplier_name} (${pesoLabel(total)})`);
      return readOrder(order.id, query);
    });
  }

  async function updateOrder(id: string, body: any, actor: ProcurementActor) {
    const poId = idOf(id, "purchase order");
    return transaction(async query => {
      const order = await lockOrder(query, poId);
      if (!["Draft", "Pending", "Approved"].includes(order.status))
        throw conflict("This order was already sent to the supplier, so it can't be changed. Close it short or create a new order.");
      const lines = await parseOrderLines(query, body?.items);
      const { rows: current } = await query(`SELECT product_id, quantity_ordered, unit_cost::text FROM po_items WHERE po_id=$1`, [poId]);
      const linesChanged = linesSignature(current) !== linesSignature(lines);
      const expected = body?.expectedDeliveryDate ? date(body.expectedDeliveryDate, "expectedDeliveryDate", "expected delivery date") : null;
      const notes = text(body?.notes, "notes", "notes", { max: 1000 });
      const total = await writeOrderLines(query, poId, lines);
      let status = order.status;
      if (linesChanged && order.status === "Approved") {
        // An approved order can't be quietly changed: quantities or costs send it back for approval.
        status = "Pending";
        await query(`UPDATE purchase_orders SET status='Pending', approved_by=NULL, approved_at=NULL, self_approved=false WHERE id=$1`, [poId]);
      }
      await query(`UPDATE purchase_orders SET expected_delivery_date=$2, notes=$3, updated_at=now() WHERE id=$1`, [poId, expected, notes]);
      await history(query, poId, actor, status !== order.status ? "returned_for_approval" : "edited",
        linesChanged ? `Lines changed; total now ${pesoLabel(total)}${status !== order.status ? ". Needs approval again." : ""}` : "Details updated");
      await audit(query, actor, "UPDATE", "Edited purchase order", `Edited ${order.po_number}${status !== order.status ? " (back to For approval)" : ""}`);
      return readOrder(poId, query);
    });
  }

  async function transition(id: string, actor: ProcurementActor, work: (query: Query, order: any) => Promise<void>) {
    const poId = idOf(id, "purchase order");
    return transaction(async query => {
      const order = await lockOrder(query, poId);
      await work(query, order);
      return readOrder(poId, query);
    });
  }

  const submitOrder = (id: string, actor: ProcurementActor) => transition(id, actor, async (query, order) => {
    if (order.status === "Pending") return;
    if (order.status !== "Draft") throw conflict("Only a draft can be sent for approval.");
    await query(`UPDATE purchase_orders SET status='Pending', updated_at=now() WHERE id=$1`, [order.id]);
    await history(query, order.id, actor, "submitted", null);
    await audit(query, actor, "UPDATE", "Submitted purchase order", `Sent ${order.po_number} for approval`);
  });

  const approveOrder = (id: string, actor: ProcurementActor) => transition(id, actor, async (query, order) => {
    if (order.status === "Approved") return;
    if (!["Draft", "Pending"].includes(order.status)) throw conflict(`This order is already ${orderStage(order.status, 0, order.closed_at).toLowerCase()}.`);
    const own = order.created_by === actor.id;
    await query(`UPDATE purchase_orders SET status='Approved', approved_by=$2, approved_at=now(), self_approved=$3, updated_at=now() WHERE id=$1`,
      [order.id, actor.id, own]);
    await history(query, order.id, actor, "approved", own ? "Approved own order" : null);
    await audit(query, actor, "APPROVE", "Approved purchase order", `Approved ${order.po_number}${own ? " (own order)" : ""} for ${pesoLabel(toCents(order.total_order_amount))}`);
  });

  const returnOrder = (id: string, body: any, actor: ProcurementActor) => transition(id, actor, async (query, order) => {
    const reason = text(body?.reason, "reason", "what needs to change", { min: 3, max: 500, required: true });
    if (order.status !== "Pending") throw conflict("Only an order waiting for approval can be returned for changes.");
    await query(`UPDATE purchase_orders SET status='Draft', updated_at=now() WHERE id=$1`, [order.id]);
    await history(query, order.id, actor, "returned", reason);
    await audit(query, actor, "UPDATE", "Returned purchase order", `Returned ${order.po_number} for changes: ${reason}`);
  });

  const sendOrder = (id: string, body: any, actor: ProcurementActor) => transition(id, actor, async (query, order) => {
    const method = body?.method;
    if (!(PO_SEND_METHODS as readonly string[]).includes(method)) throw bad("Choose how the order was sent.", "method");
    const expected = body?.expectedDeliveryDate ? date(body.expectedDeliveryDate, "expectedDeliveryDate", "expected delivery date") : null;
    if (!["Approved", "Submitted"].includes(order.status))
      throw conflict(order.status === "Draft" || order.status === "Pending" ? "Approve the order before sending it." : "This order is closed.");
    const resend = order.status === "Submitted";
    await query(`UPDATE purchase_orders SET status='Submitted', sent_at=coalesce(sent_at, now()), sent_method=$2, sent_by=coalesce(sent_by,$3),
      expected_delivery_date=coalesce($4::date, expected_delivery_date), updated_at=now() WHERE id=$1`, [order.id, method, actor.id, expected]);
    await history(query, order.id, actor, resend ? "resent" : "sent", `By ${method}${expected ? `; expected ${expected}` : ""}`);
    await audit(query, actor, "UPDATE", "Sent purchase order", `${resend ? "Re-sent" : "Sent"} ${order.po_number} to ${order.supplier_name} by ${method}`);
  });

  const cancelOrder = (id: string, body: any, actor: ProcurementActor) => transition(id, actor, async (query, order) => {
    const reason = text(body?.reason, "reason", "a reason", { min: 3, max: 500, required: true });
    if (order.status === "Cancelled") return;
    if (order.status === "Fulfilled") throw conflict("This order is already closed.");
    const lines = await lineState(query, order.id);
    if (lines.some(line => line.received > 0)) throw conflict("Some goods already arrived. Use Close short instead, so the received stock stays on record.");
    const { rows: [inv] } = await query(`SELECT count(*)::int AS n FROM supplier_invoices WHERE po_id=$1`, [order.id]);
    if (inv.n > 0) throw conflict("This order has a supplier invoice. Settle or review the invoice with the supplier before cancelling.");
    await query(`UPDATE purchase_orders SET status='Cancelled', closed_at=now(), close_reason=$2, updated_at=now() WHERE id=$1`, [order.id, reason]);
    await history(query, order.id, actor, "cancelled", reason);
    await audit(query, actor, "CANCEL", "Cancelled purchase order", `Cancelled ${order.po_number}: ${reason}`);
  });

  const closeShort = (id: string, body: any, actor: ProcurementActor) => transition(id, actor, async (query, order) => {
    const reason = text(body?.reason, "reason", "a reason", { min: 3, max: 500, required: true });
    if (order.status !== "Submitted") throw conflict("Only an order waiting for the rest of its delivery can be closed short.");
    const lines = await lineState(query, order.id);
    if (!lines.some(line => line.received > 0)) throw conflict("Nothing has arrived yet. Cancel the order instead.");
    const short = lines.filter(line => line.remaining > 0).map(line => `${line.remaining} ${line.product_name}`).join(", ");
    await query(`UPDATE purchase_orders SET status='Fulfilled', closed_at=now(), close_reason=$2, updated_at=now() WHERE id=$1`, [order.id, reason]);
    await history(query, order.id, actor, "closed_short", `${reason}. Not delivered: ${short}`);
    await audit(query, actor, "UPDATE", "Closed purchase order short", `Closed ${order.po_number} short (${short}): ${reason}`);
  });

  // ─── Receiving (the receiving report) ──────────────────────────────────────
  async function receiveDelivery(key: unknown, body: any, actor: ProcurementActor) {
    const deliveryId = keyOf(key);
    const poId = idOf(body?.poId, "purchase order");
    const deliveryDate = date(body?.deliveryDate, "deliveryDate", "delivery date");
    const receiptNumber = text(body?.receiptNumber, "receiptNumber", "the delivery receipt number", { max: 100 });
    if (receiptNumber && !docNumberPattern.test(receiptNumber)) throw bad("Delivery receipt numbers use letters, numbers, spaces, - / # or .", "receiptNumber");
    const notes = text(body?.notes, "notes", "notes", { max: 1000 });
    const today = pharmacyDate();
    if (deliveryDate > today) throw bad("The delivery date can't be in the future.", "deliveryDate");
    if (!Array.isArray(body?.lines) || body.lines.length === 0 || body.lines.length > 200) throw bad("Add what arrived.", "lines");
    const lines = body.lines.map((raw: any, i: number) => {
      const productId = idOf(raw?.productId, "medicine");
      const accepted = wholeNumber(raw?.quantityAccepted ?? 0, `lines.${i}.quantityAccepted`, "Good quantity", 0);
      const rejected = wholeNumber(raw?.quantityRejected ?? 0, `lines.${i}.quantityRejected`, "Rejected quantity", 0);
      const batch = typeof raw?.batchNumber === "string" && raw.batchNumber.trim() ? raw.batchNumber.trim().toUpperCase() : null;
      if (batch && !lotPattern.test(batch)) throw bad("Lot numbers use letters, numbers and hyphens only (up to 100).", `lines.${i}.batchNumber`);
      const expiry = raw?.expirationDate ? date(raw.expirationDate, `lines.${i}.expirationDate`, "expiry date") : null;
      if (accepted > 0 && !batch) throw bad("Enter the lot number printed on the box or delivery receipt.", `lines.${i}.batchNumber`);
      if (accepted > 0 && !expiry) throw bad("Enter the expiry date printed on the box.", `lines.${i}.expirationDate`);
      if (accepted > 0 && expiry! <= deliveryDate) throw bad("This lot is already expired. Record it as rejected instead.", `lines.${i}.expirationDate`);
      const reason = rejected > 0 ? raw?.rejectionReason : null;
      if (rejected > 0 && !(DELIVERY_REJECTION_REASONS as readonly string[]).includes(reason)) throw bad("Choose why units were rejected.", `lines.${i}.rejectionReason`);
      const rejectionNotes = text(raw?.rejectionNotes, `lines.${i}.rejectionNotes`, "rejection notes", { max: 500 });
      if (reason === "Other" && !rejectionNotes) throw bad("Describe why the units were rejected.", `lines.${i}.rejectionNotes`);
      return { productId, accepted, rejected, batch, expiry, reason, rejectionNotes };
    }).filter((line: any) => line.accepted > 0 || line.rejected > 0);
    if (!lines.length) throw bad("Enter at least one good or rejected quantity.", "lines");

    return transaction(async query => {
      await query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [deliveryId]);
      const { rows: [existing] } = await query(`SELECT id, po_id FROM supplier_deliveries WHERE id=$1`, [deliveryId]);
      if (existing) {
        if (existing.po_id !== poId) throw conflict("This save reference was already used for another order. Refresh and try again.");
        return { ...(await readOrder(poId, query)), deliveryId, replayed: true, warnings: [] as string[] };
      }
      const order = await lockOrder(query, poId);
      if (!["Approved", "Submitted"].includes(order.status))
        throw conflict(order.status === "Fulfilled" || order.status === "Cancelled" ? "This order is closed, so nothing more can be received on it." : "Approve the order before receiving goods for it.");
      const orderDay = new Date(new Date(order.order_date).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
      if (deliveryDate < orderDay) throw bad("The delivery date can't be before the order date.", "deliveryDate");
      const state = await lineState(query, poId);
      const acceptedByProduct = new Map<string, number>();
      const lots = new Map<string, string>();
      for (const line of lines) {
        const onOrder = state.find(s => s.product_id === line.productId);
        if (!onOrder) throw conflict("A medicine in this delivery isn't on the order. Receive it on its own order.");
        acceptedByProduct.set(line.productId, (acceptedByProduct.get(line.productId) ?? 0) + line.accepted);
        if (line.accepted > 0) {
          const key = `${line.productId}:${line.batch}`;
          if (lots.has(key) && lots.get(key) !== line.expiry) throw bad(`Lot ${line.batch} is listed twice with different expiry dates.`, "lines");
          lots.set(key, line.expiry!);
        }
      }
      for (const [productId, accepted] of acceptedByProduct) {
        const onOrder = state.find(s => s.product_id === productId)!;
        if (accepted > onOrder.remaining)
          throw conflict(`${onOrder.product_name}: only ${onOrder.remaining} unit(s) are still due on this order. Record the extra units as rejected, or refresh if someone else just received this delivery.`);
      }
      const accepted = [...acceptedByProduct.values()].reduce((a, b) => a + b, 0);
      const complete = state.every(s => s.remaining === (acceptedByProduct.get(s.product_id) ?? 0));
      await query(`INSERT INTO supplier_deliveries(id,po_id,delivery_date,delivery_status,receipt_number,notes,received_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [deliveryId, poId, deliveryDate, complete ? "Received" : "Partial", receiptNumber, notes, actor.id]);

      // Lock products in ID order, then post each accepted line as stock in its supplier lot.
      const productIds = [...new Set(lines.filter((l: any) => l.accepted > 0).map((l: any) => l.productId as string))].sort();
      for (const productId of productIds) await query(`SELECT id FROM products WHERE id=$1 FOR UPDATE`, [productId]);
      const warnings: string[] = [];
      const shortLimit = addMonths(deliveryDate, SHORT_EXPIRY_MONTHS);
      for (const line of lines) {
        if (line.rejected > 0)
          await query(`INSERT INTO delivery_rejections(delivery_id,product_id,quantity,reason,batch_number,expiration_date,notes)
            VALUES($1,$2,$3,$4,$5,$6,$7)`, [deliveryId, line.productId, line.rejected, line.reason, line.batch, line.expiry, line.rejectionNotes]);
        if (line.accepted === 0) continue;
        const name = state.find(s => s.product_id === line.productId)!.product_name;
        const { rows: [product] } = await query(`SELECT current_stock FROM products WHERE id=$1`, [line.productId]);
        const { rows: batches } = await query(`SELECT id, batch_number, expiration_date::text, quantity_remaining FROM batch_info
          WHERE product_id=$1 FOR UPDATE`, [line.productId]);
        const physical = batches.reduce((sum: number, b: any) => sum + b.quantity_remaining, 0);
        if (physical !== product.current_stock)
          throw conflict(`${name}: the stock count and lot quantities don't match. Ask an administrator to review this medicine's stock before receiving.`);
        const lot = batches.find((b: any) => b.batch_number.trim().toUpperCase() === line.batch);
        if (lot && lot.expiration_date !== line.expiry)
          throw conflict(`${name}: lot ${line.batch} is already on file with expiry ${lot.expiration_date}. Check the box; if the supplier really sent a different expiry, ask them to confirm the lot number.`, { field: "expirationDate" });
        const { rows: [saved] } = lot
          ? await query(`UPDATE batch_info SET quantity_remaining=quantity_remaining+$2, updated_at=now() WHERE id=$1 RETURNING id`, [lot.id, line.accepted])
          : await query(`INSERT INTO batch_info(product_id,batch_number,expiration_date,quantity_remaining,date_received,supplier)
              VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [line.productId, line.batch, line.expiry, line.accepted, deliveryDate, order.supplier_name]);
        await query(`INSERT INTO delivery_items(delivery_id,product_id,batch_number,expiration_date,quantity_delivered) VALUES($1,$2,$3,$4,$5)`,
          [deliveryId, line.productId, line.batch, line.expiry, line.accepted]);
        await query(`UPDATE products SET current_stock=current_stock+$2, updated_at=now() WHERE id=$1`, [line.productId, line.accepted]);
        await query(`INSERT INTO stock_movements(product_id,batch_id,movement_type,quantity,reference_id,notes)
          VALUES($1,$2,'StockIn',$3,$4,$5)`, [line.productId, saved.id, line.accepted, deliveryId, `Received on ${order.po_number}${receiptNumber ? ` (DR ${receiptNumber})` : ""}`]);
        if (line.expiry! < shortLimit) warnings.push(`${name} lot ${line.batch} expires ${line.expiry}, within ${SHORT_EXPIRY_MONTHS} months.`);
      }
      await query(`UPDATE purchase_orders SET status=$2, sent_at=coalesce(sent_at, now()), updated_at=now() WHERE id=$1`,
        [poId, complete ? "Fulfilled" : "Submitted"]);
      const rejectedUnits = lines.reduce((sum: number, l: any) => sum + l.rejected, 0);
      const summary = `${accepted} good unit(s)${rejectedUnits ? `, ${rejectedUnits} rejected` : ""}${receiptNumber ? `; DR ${receiptNumber}` : ""}${complete ? "; order complete" : ""}`;
      await history(query, poId, actor, "received", summary);
      await audit(query, actor, "RECEIVE", "Received delivery", `Received delivery on ${order.po_number}: ${summary}`);
      return { ...(await readOrder(poId, query)), deliveryId, replayed: false, warnings };
    });
  }

  // ─── Invoices ──────────────────────────────────────────────────────────────
  async function recordInvoice(key: unknown, body: any, actor: ProcurementActor) {
    const invoiceId = keyOf(key);
    const poId = idOf(body?.poId, "purchase order");
    const kind = body?.kind === "Advance" ? "Advance" : body?.kind === "Received" ? "Received" : null;
    if (!kind) throw bad("Choose what this invoice is for.", "kind");
    const number = text(body?.invoiceNumber, "invoiceNumber", "the supplier's invoice number", { max: 100, required: true })!.toUpperCase();
    if (!docNumberPattern.test(number)) throw bad("Invoice numbers use letters, numbers, spaces, - / # or .", "invoiceNumber");
    const invoiceDate = date(body?.invoiceDate, "invoiceDate", "invoice date");
    if (invoiceDate > pharmacyDate()) throw bad("The invoice date can't be in the future.", "invoiceDate");
    const amount = cents(body?.amount, "amount", "the invoice amount");
    if (amount <= 0) throw bad("The invoice amount must be more than zero.", "amount");
    const variance = text(body?.varianceReason, "varianceReason", "a reason for the difference", { min: 3, max: 500 });
    let override: SupplierTerms | null = null;
    let overrideReason: string | null = null;
    if (body?.termsOverride) {
      if (actor.role !== "Admin") throw new ProcurementError(403, "Only an administrator can use different terms on one invoice.");
      if (!isSupplierTerms(body.termsOverride)) throw bad("Choose the terms for this invoice.", "termsOverride");
      override = body.termsOverride;
      overrideReason = text(body?.overrideReason, "overrideReason", "why this invoice has different terms", { min: 3, max: 500, required: true });
    }

    return transaction(async query => {
      await query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [invoiceId]);
      const { rows: [existing] } = await query(`SELECT id, po_id FROM supplier_invoices WHERE id=$1`, [invoiceId]);
      if (existing) {
        if (existing.po_id !== poId) throw conflict("This save reference was already used. Refresh and try again.");
        return { ...(await readOrder(poId, query)), invoiceId, replayed: true };
      }
      const order = await lockOrder(query, poId);
      if (["Draft", "Pending", "Cancelled"].includes(order.status))
        throw conflict(order.status === "Cancelled" ? "This order was cancelled." : "Approve and send the order before recording an invoice for it.");
      const value = await uninvoicedValue(query, poId);
      let status: "Verified" | "PendingVerification" = "Verified";
      if (kind === "Received") {
        if (value.received === 0) throw conflict("Nothing has been received on this order yet. If the supplier billed in advance, choose “Billed before delivery”.");
        if (value.open === 0) throw conflict("Every received item is already covered by an invoice. If this bill is for goods still coming, choose “Billed before delivery”.");
        if (Math.abs(amount - value.open) >= 1 && !variance)
          throw bad(`The invoice is ${pesoLabel(amount)} but the received goods not yet invoiced come to ${pesoLabel(value.open)}. Enter a reason (e.g. price change, freight) or check the amount.`, "varianceReason");
      } else {
        status = "PendingVerification";
      }
      const terms: SupplierTerms = override ?? order.payment_terms;
      const basis: SupplierTermsBasis = order.terms_basis;
      const start = basis === "DeliveryDate" ? (await latestDeliveryDate(query, poId)) ?? invoiceDate : invoiceDate;
      const dueDate = supplierDueDate(terms, start);
      try {
        await query(`INSERT INTO supplier_invoices(id,po_id,supplier_id,invoice_number,invoice_date,due_date,invoice_amount,is_paid,status,
            terms,terms_basis,terms_override_reason,variance_reason,recorded_by,verified_by,verified_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [invoiceId, poId, order.supplier_id, number, invoiceDate, dueDate, peso(amount), status, terms, basis, overrideReason,
            status === "Verified" ? variance : null, actor.id, status === "Verified" ? actor.id : null, status === "Verified" ? new Date().toISOString() : null]);
      } catch (error: any) {
        if (/uq_supplier_invoices_supplier_number_ci|duplicate key/i.test(String(error?.message ?? error?.constraint_name ?? "")) || error?.code === "23505")
          throw conflict(`${order.supplier_name} already has invoice ${number} on file.`, { errors: { invoiceNumber: "This invoice number is already recorded for this supplier." } });
        throw error;
      }
      // Verified invoices are payables. Immediate-terms invoices billed in advance are payable now (prepayment).
      if (status === "Verified" || terms === "Immediate")
        await query(`INSERT INTO accounts_payable(supplier_id,invoice_id,total_owed,total_paid,balance) VALUES($1,$2,$3,0,$3)`,
          [order.supplier_id, invoiceId, peso(amount)]);
      const details = `${number}, ${pesoLabel(amount)}, due ${dueDate}${status === "PendingVerification" ? " (billed before delivery; pending verification)" : ""}${override ? `; terms ${SUPPLIER_TERMS_LABEL[override]}: ${overrideReason}` : ""}${status === "Verified" && variance ? `; difference: ${variance}` : ""}`;
      await history(query, poId, actor, "invoice_recorded", details);
      await audit(query, actor, "CREATE", "Recorded supplier invoice", `Recorded ${order.supplier_name} invoice on ${order.po_number}: ${details}`);
      return { ...(await readOrder(poId, query)), invoiceId, replayed: false };
    });
  }

  async function verifyInvoice(id: string, body: any, actor: ProcurementActor) {
    const invoiceId = idOf(id, "invoice");
    const variance = text(body?.varianceReason, "varianceReason", "a reason for the difference", { min: 3, max: 500 });
    return transaction(async query => {
      const { rows: [invoice] } = await query(`SELECT * FROM supplier_invoices WHERE id=$1`, [invoiceId]);
      if (!invoice || !invoice.po_id) throw notFound("Invoice not found.");
      const order = await lockOrder(query, invoice.po_id);
      const { rows: [locked] } = await query(`SELECT *, invoice_date::text AS invoice_day, due_date::text AS due_day FROM supplier_invoices WHERE id=$1 FOR UPDATE`, [invoiceId]);
      if (locked.status === "Verified") return readOrder(order.id, query);
      const value = await uninvoicedValue(query, order.id, invoiceId);
      if (value.received === 0) throw conflict("Receive the goods first. The invoice is checked against what actually arrived.");
      const amount = toCents(locked.invoice_amount);
      if (Math.abs(amount - value.open) >= 1 && !variance)
        throw bad(`The invoice is ${pesoLabel(amount)} but the received goods not yet invoiced come to ${pesoLabel(value.open)}. Enter a reason or wait for the rest of the delivery.`, "varianceReason");
      const start = locked.terms_basis === "DeliveryDate" ? (await latestDeliveryDate(query, order.id)) ?? locked.invoice_day : locked.invoice_day;
      const dueDate = supplierDueDate(locked.terms, start);
      await query(`UPDATE supplier_invoices SET status='Verified', verified_by=$2, verified_at=now(), variance_reason=$3, due_date=$4 WHERE id=$1`,
        [invoiceId, actor.id, Math.abs(amount - value.open) >= 1 ? variance : null, dueDate]);
      const { rows: [ap] } = await query(`SELECT id FROM accounts_payable WHERE invoice_id=$1`, [invoiceId]);
      if (!ap) await query(`INSERT INTO accounts_payable(supplier_id,invoice_id,total_owed,total_paid,balance) VALUES($1,$2,$3,0,$3)`,
        [locked.supplier_id, invoiceId, peso(amount)]);
      await history(query, order.id, actor, "invoice_verified", `${locked.invoice_number} checked against received goods; due ${dueDate}${variance ? `; difference: ${variance}` : ""}`);
      await audit(query, actor, "UPDATE", "Verified supplier invoice", `Verified ${locked.invoice_number} on ${order.po_number}`);
      return readOrder(order.id, query);
    });
  }

  // ─── Payments ──────────────────────────────────────────────────────────────
  async function readPayment(id: string, query: Query = read) {
    const paymentId = idOf(id, "payment");
    const { rows: [p] } = await query(`SELECT sp.*, sp.payment_date, sp.amount_paid::text AS amount,
        a.id AS ap_id, a.balance::text AS ap_balance, i.id AS invoice_id, i.invoice_number, i.invoice_date::text, i.due_date::text,
        i.invoice_amount::text, i.status AS invoice_status, po.po_number, po.id AS po_id,
        s.supplier_name, s.contact_person, s.contact_number, s.email, s.address, u.full_name AS recorded_by_name, u.role AS recorded_by_role,
        (SELECT coalesce(sum(x.amount_paid),0) FROM supplier_payments x WHERE x.ap_id=sp.ap_id
          AND (x.payment_date, x.created_at, x.id) < (sp.payment_date, sp.created_at, sp.id))::text AS paid_before
      FROM supplier_payments sp JOIN accounts_payable a ON a.id=sp.ap_id JOIN supplier_invoices i ON i.id=a.invoice_id
      JOIN suppliers s ON s.id=i.supplier_id LEFT JOIN purchase_orders po ON po.id=i.po_id LEFT JOIN users u ON u.id=sp.recorded_by
      WHERE sp.id=$1`, [paymentId]);
    if (!p) return null;
    const amount = toCents(p.amount), before = toCents(p.paid_before), total = toCents(p.invoice_amount);
    return {
      payment: {
        id: p.id, adviceNumber: p.advice_number, paymentDate: p.payment_date, amount: p.amount, mode: p.payment_mode,
        referenceNumber: p.reference_number, supplierOrNumber: p.supplier_or_number, isPrepayment: p.is_prepayment, notes: p.notes,
        recordedBy: p.recorded_by_name, recordedByRole: p.recorded_by_role, createdAt: p.created_at,
      },
      invoice: {
        id: p.invoice_id, apId: p.ap_id, invoiceNumber: p.invoice_number, invoiceDate: p.invoice_date, dueDate: p.due_date,
        amount: p.invoice_amount, status: p.invoice_status, poNumber: p.po_number, poId: p.po_id,
        paidBefore: peso(before), balanceAfter: peso(Math.max(0, total - before - amount)), currentBalance: p.ap_balance,
      },
      supplier: { name: p.supplier_name, contactPerson: p.contact_person, contactNumber: p.contact_number, email: p.email, address: p.address },
    };
  }

  async function recordPayment(key: unknown, body: any, actor: ProcurementActor) {
    const paymentId = keyOf(key);
    const apId = idOf(body?.apId, "invoice to pay");
    const amount = cents(body?.amount, "amount", "the amount paid");
    if (amount <= 0) throw bad("The amount paid must be more than zero.", "amount");
    const paymentDate = date(body?.paymentDate, "paymentDate", "payment date");
    if (paymentDate > pharmacyDate()) throw bad("The payment date can't be in the future.", "paymentDate");
    const mode = body?.mode;
    if (!(SUPPLIER_PAYMENT_MODES as readonly string[]).includes(mode)) throw bad("Choose how it was paid.", "mode");
    const reference = text(body?.referenceNumber, "referenceNumber", mode === "Check" ? "the check number" : "the reference number", { max: 100, required: mode !== "Cash" });
    if (reference && !docNumberPattern.test(reference)) throw bad("Reference numbers use letters, numbers, spaces, - / # or .", "referenceNumber");
    const orNumber = text(body?.supplierOrNumber, "supplierOrNumber", "the supplier's OR number", { max: 100 });
    if (orNumber && !docNumberPattern.test(orNumber)) throw bad("OR numbers use letters, numbers, spaces, - / # or .", "supplierOrNumber");
    const notes = text(body?.notes, "notes", "notes", { max: 500 });

    return transaction(async query => {
      await query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [paymentId]);
      const { rows: [previous] } = await query(`SELECT id, ap_id, amount_paid::text FROM supplier_payments WHERE id=$1`, [paymentId]);
      if (previous) {
        if (previous.ap_id !== apId || toCents(previous.amount_paid) !== amount)
          throw conflict("This payment reference was already used with different details. Refresh before trying again.");
        return { ...(await readPayment(paymentId, query))!, replayed: true };
      }
      const { rows: [ap] } = await query(`SELECT a.*, a.balance::text AS bal, a.total_paid::text AS paid, a.total_owed::text AS owed,
          i.status AS invoice_status, i.terms, i.invoice_number, i.invoice_date::text AS invoice_day, i.po_id, s.supplier_name
        FROM accounts_payable a JOIN supplier_invoices i ON i.id=a.invoice_id JOIN suppliers s ON s.id=a.supplier_id
        WHERE a.id=$1 FOR UPDATE OF a`, [apId]);
      if (!ap) throw notFound("This invoice isn't payable yet. Refresh the payables list.");
      const prepayment = ap.invoice_status !== "Verified";
      if (prepayment && ap.terms !== "Immediate") throw conflict("Verify this invoice against the delivery before paying it.");
      const balance = toCents(ap.bal), paid = toCents(ap.paid);
      if (paid + balance !== toCents(ap.owed)) throw conflict("This invoice's totals don't add up. Ask an administrator to review its payment history.");
      if (balance === 0) throw conflict("This invoice is already fully paid.");
      if (amount > balance) throw bad(`That's more than the ${pesoLabel(balance)} still owed on this invoice.`, "amount");
      const { rows: [seq] } = await query(`SELECT nextval('supplier_payment_advice_seq') AS n`);
      const adviceNumber = `PA-${paymentDate.slice(0, 4)}-${String(seq.n).padStart(4, "0")}`;
      await query(`INSERT INTO supplier_payments(id,ap_id,payment_date,amount_paid,notes,payment_mode,reference_number,supplier_or_number,advice_number,recorded_by,is_prepayment)
        VALUES($1,$2,($3::date)::timestamp AT TIME ZONE 'UTC',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [paymentId, apId, paymentDate, peso(amount), notes, mode, reference, orNumber, adviceNumber, actor.id, prepayment]);
      await query(`UPDATE accounts_payable SET total_paid=$2, balance=$3, last_payment_date=greatest(coalesce(last_payment_date,$4::date),$4::date), updated_at=now() WHERE id=$1`,
        [apId, peso(paid + amount), peso(balance - amount), paymentDate]);
      await query(`UPDATE supplier_invoices SET is_paid=$2 WHERE id=$1`, [ap.invoice_id, balance - amount === 0]);
      const details = `${pesoLabel(amount)} on ${ap.invoice_number} by ${SUPPLIER_PAYMENT_MODE_LABEL[mode as keyof typeof SUPPLIER_PAYMENT_MODE_LABEL]}${reference ? ` (${reference})` : ""}; ${pesoLabel(balance - amount)} left${prepayment ? "; prepayment" : ""}; advice ${adviceNumber}`;
      if (ap.po_id) await history(query, ap.po_id, actor, "payment_recorded", details);
      await audit(query, actor, "PAYMENT", "Recorded supplier payment", `Paid ${ap.supplier_name}: ${details}`);
      return { ...(await readPayment(paymentId, query))!, replayed: false };
    });
  }

  async function updatePaymentReceipt(id: string, body: any, actor: ProcurementActor) {
    const paymentId = idOf(id, "payment");
    const orNumber = text(body?.supplierOrNumber, "supplierOrNumber", "the supplier's OR number", { max: 100, required: true })!;
    if (!docNumberPattern.test(orNumber)) throw bad("OR numbers use letters, numbers, spaces, - / # or .", "supplierOrNumber");
    return transaction(async query => {
      const current = await readPayment(paymentId, query);
      if (!current) throw notFound("Payment not found.");
      if (current.payment.supplierOrNumber === orNumber) return current;
      await query(`UPDATE supplier_payments SET supplier_or_number=$2 WHERE id=$1`, [paymentId, orNumber]);
      if (current.invoice.poId) await history(query, current.invoice.poId, actor, "receipt_added", `OR ${orNumber} for advice ${current.payment.adviceNumber ?? ""}`.trim());
      await audit(query, actor, "UPDATE", "Added supplier OR", `Added OR ${orNumber} to ${current.supplier.name} payment ${current.payment.adviceNumber ?? paymentId}`);
      return (await readPayment(paymentId, query))!;
    });
  }

  return {
    updateSupplierTerms, listOrders, readOrder: (id: string) => readOrder(id), createOrder, updateOrder, submitOrder, approveOrder,
    returnOrder, sendOrder, cancelOrder, closeShort, receiveDelivery, recordInvoice, verifyInvoice,
    recordPayment, readPayment: (id: string) => readPayment(id), updatePaymentReceipt,
  };
}
