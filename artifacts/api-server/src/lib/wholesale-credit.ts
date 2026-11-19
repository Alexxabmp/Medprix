import { pharmacyDate } from "@workspace/api-zod";
import type { AuditActor } from "./audit-events";
import { wholesaleCreditJoin } from "./wholesale-receivable-aging";
import { WholesaleError, requireUuid, wholesaleAudit, createWholesaleOperation, type WholesaleQuery, type WholesaleTransaction } from "./wholesale-operations";

/**
 * Credit hold (the paper's "Identify overdue client payments", acted on): a client with any overdue balance can't get a
 * new credit order confirmed until an Admin approves it. The approval is bound to the order revision, like terms
 * exceptions, so editing the order afterwards needs a fresh approval. Overdue = an installment past its due date with
 * money still owed, the same rule the receivables list and the Finance dashboard use.
 */
export type ClientCredit = {
  overdueAmount: string;
  oldestDueDate: string | null;
  daysLate: number;
  accounts: { orderNumber: string; overdue: string; oldestDueDate: string | null; daysLate: number }[];
};

export async function clientCredit(query: WholesaleQuery, clientId: string, today = pharmacyDate()): Promise<ClientCredit> {
  const { rows } = await query(
    `SELECT o.order_number AS "orderNumber", credit.overdue_amount::numeric(12,2)::text AS overdue,
        (SELECT min(i.due_date) FROM wholesale_installments i WHERE i.ar_id = a.id AND i.due_date < $2::date
          AND i.amount > coalesce((SELECT sum(x.amount) FROM wholesale_payment_allocations x
            LEFT JOIN wholesale_collection_reversals r ON r.collection_id = x.payment_id
            WHERE x.ar_id = i.ar_id AND x.sequence_number = i.sequence_number AND r.id IS NULL), 0))::text AS "oldestDueDate"
      FROM accounts_receivable a JOIN wholesale_orders o ON o.id = a.order_id
      ${wholesaleCreditJoin("$2::date")}
      WHERE o.client_id = $1 AND a.balance > 0 AND credit.overdue_amount > 0
      ORDER BY 3, o.order_number`,
    [clientId, today],
  );
  const days = (due: string | null) => (due ? Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0);
  const accounts = rows.map((r: any) => ({ orderNumber: r.orderNumber, overdue: r.overdue, oldestDueDate: r.oldestDueDate, daysLate: days(r.oldestDueDate) }));
  const cents = accounts.reduce((sum, a) => sum + Math.round(Number(a.overdue) * 100), 0);
  const oldest = accounts.map(a => a.oldestDueDate).filter(Boolean).sort()[0] ?? null;
  return { overdueAmount: (cents / 100).toFixed(2), oldestDueDate: oldest, daysLate: days(oldest), accounts };
}

export const creditHoldMessage = (credit: ClientCredit) =>
  `Credit hold: this client has ₱${Number(credit.overdueAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} overdue` +
  (credit.accounts[0] ? ` (${credit.accounts.map(a => a.orderNumber).join(", ")}, ${credit.daysLate} day${credit.daysLate === 1 ? "" : "s"} late)` : "") +
  ". An Admin has to approve new credit before this order is confirmed.";

function note(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length < 3 || value.trim().length > 500)
    throw new WholesaleError(400, `Enter ${label} (3 to 500 characters).`);
  return value.trim();
}

/** The decision recorded for this exact order revision, if any. */
export async function approvedCredit(query: WholesaleQuery, orderId: string, revision: number) {
  const { rows: [row] } = await query(
    `SELECT id, decided_by AS "decidedBy", decision_note AS "note", decided_at AS "decidedAt", overdue_amount::text AS "overdueAmount"
      FROM wholesale_credit_approvals WHERE order_id=$1 AND order_revision=$2 AND decision='Approved' ORDER BY decided_at DESC LIMIT 1`,
    [orderId, revision],
  );
  return row ?? null;
}

export function createWholesaleCredit(read: WholesaleQuery, transaction: WholesaleTransaction, clock: () => Date = () => new Date()) {
  const operation = createWholesaleOperation(transaction);
  const access = (actor: AuditActor) => {
    if (!["Admin", "FrontDesk"].includes(actor.role)) throw new WholesaleError(403, "Wholesale access is restricted to Admin and FrontDesk.");
  };
  async function lockDraft(query: WholesaleQuery, id: string, expected: number) {
    const { rows: [order] } = await query("SELECT * FROM wholesale_orders WHERE id=$1 FOR UPDATE", [id]);
    if (!order || order.draft_revision === null) throw new WholesaleError(404, "Order not found.");
    if (order.status !== "Pending" || order.draft_revision !== expected)
      throw new WholesaleError(409, "This order changed. Refresh and review it before continuing.");
    return order;
  }
  return {
    /** For the order screen: the client's overdue balance and every credit decision on this order. */
    async status(actor: AuditActor, orderId: unknown) {
      access(actor);
      const id = requireUuid(orderId);
      const { rows: [order] } = await read("SELECT id, client_id, draft_revision, status FROM wholesale_orders WHERE id=$1", [id]);
      if (!order) throw new WholesaleError(404, "Order not found.");
      const credit = await clientCredit(read, order.client_id, pharmacyDate(clock()));
      const { rows: decisions } = await read(
        `SELECT c.id, c.order_revision AS revision, c.overdue_amount::text AS "overdueAmount", c.reason, c.requested_at AS "requestedAt",
            coalesce(rq.full_name, rq.username) AS "requestedBy", c.decision, c.decision_note AS "decisionNote", c.decided_at AS "decidedAt",
            coalesce(dc.full_name, dc.username) AS "decidedBy"
          FROM wholesale_credit_approvals c JOIN users rq ON rq.id = c.requested_by LEFT JOIN users dc ON dc.id = c.decided_by
          WHERE c.order_id=$1 ORDER BY c.requested_at DESC, c.id`,
        [id],
      );
      const current = decisions.find((d: any) => d.revision === order.draft_revision);
      return {
        ...credit,
        onHold: Number(credit.overdueAmount) > 0 && order.status === "Pending" && current?.decision !== "Approved",
        message: Number(credit.overdueAmount) > 0 ? creditHoldMessage(credit) : null,
        revision: order.draft_revision,
        current: current ?? null,
        decisions,
      };
    },
    /** For the order editor: warn as soon as the client is picked. */
    async forClient(actor: AuditActor, clientId: unknown) {
      access(actor);
      const credit = await clientCredit(read, requireUuid(clientId), pharmacyDate(clock()));
      return { ...credit, message: Number(credit.overdueAmount) > 0 ? creditHoldMessage(credit) : null };
    },
    async request(actor: AuditActor, key: unknown, orderId: unknown, input: any) {
      access(actor);
      const id = requireUuid(orderId);
      const expected = Number(input?.revision);
      if (!Number.isInteger(expected) || expected < 0) throw new WholesaleError(400, "Refresh the order and try again.");
      const reason = note(input?.reason, "why this order should go ahead");
      return operation(actor, key, { action: "credit-approval-request", id, expected, reason }, async (query) => {
        const order = await lockDraft(query, id, expected);
        const credit = await clientCredit(query, order.client_id, pharmacyDate(clock()));
        if (Number(credit.overdueAmount) <= 0) throw new WholesaleError(409, "This client has nothing overdue now. You can confirm the order.");
        if (await approvedCredit(query, id, expected)) throw new WholesaleError(409, "This order already has an approval. You can confirm it.");
        const { rows: [pending] } = await query("SELECT id FROM wholesale_credit_approvals WHERE order_id=$1 AND order_revision=$2 AND decision IS NULL", [id, expected]);
        if (pending) throw new WholesaleError(409, "An approval request is already waiting for an Admin.");
        const { rows: [row] } = await query(
          `INSERT INTO wholesale_credit_approvals(order_id, order_revision, overdue_amount, oldest_due_date, reason, requested_by)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [id, expected, credit.overdueAmount, credit.oldestDueDate, reason, actor.id],
        );
        await wholesaleAudit(query, actor, "WHOLESALE_CREDIT_HOLD_REQUESTED",
          `Order ${order.order_number ?? id}: credit approval requested; client overdue ₱${credit.overdueAmount}; reason: ${reason}`);
        return { id: row.id, status: "Requested" };
      });
    },
    async decide(actor: AuditActor, key: unknown, approvalId: unknown, input: any) {
      if (actor.role !== "Admin") throw new WholesaleError(403, "Only an Admin may approve or refuse a credit hold.");
      const id = requireUuid(approvalId);
      const decision = input?.decision === "Approved" || input?.decision === "Refused" ? input.decision : null;
      if (!decision) throw new WholesaleError(400, "Choose Approve or Refuse.");
      const decisionNote = note(input?.note, "a decision note");
      return operation(actor, key, { action: "credit-approval-decision", id, decision, decisionNote }, async (query) => {
        const { rows: [request] } = await query("SELECT * FROM wholesale_credit_approvals WHERE id=$1 FOR UPDATE", [id]);
        if (!request) throw new WholesaleError(404, "Approval request not found.");
        if (request.decision) throw new WholesaleError(409, `This request was already ${request.decision.toLowerCase()}.`);
        const order = await lockDraft(query, request.order_id, request.order_revision).catch(() => {
          throw new WholesaleError(409, "The order changed after this request. Ask for a new approval on the current order.");
        });
        await query("UPDATE wholesale_credit_approvals SET decision=$2, decided_by=$3, decided_at=now(), decision_note=$4 WHERE id=$1",
          [id, decision, actor.id, decisionNote]);
        await wholesaleAudit(query, actor, decision === "Approved" ? "WHOLESALE_CREDIT_HOLD_APPROVED" : "WHOLESALE_CREDIT_HOLD_REFUSED",
          `Order ${order.order_number ?? order.id}: credit hold ${decision.toLowerCase()}; note: ${decisionNote}`);
        return { id, decision };
      });
    },
  };
}
