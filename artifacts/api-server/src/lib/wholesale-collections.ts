import { isCalendarDate } from "@workspace/api-zod";
import type { AuditActor } from "./audit-events";
import {
  WholesaleError,
  requireUuid,
  wholesaleMoney,
  cents,
  money,
  wholesaleAudit,
  createWholesaleOperation,
  type WholesaleQuery,
  type WholesaleTransaction,
} from "./wholesale-operations";
import {
  wholesaleFields,
  wholesaleText,
  wholesaleActorName,
} from "./wholesale-collection-common";

export const wholesalePaymentMethods = [
  "Cash",
  "Bank transfer",
  "GCash",
] as const;

function access(actor: AuditActor) {
  if (!["Admin", "FrontDesk"].includes(actor.role))
    throw new WholesaleError(
      403,
      "Wholesale collection access is restricted to Admin and FrontDesk.",
    );
}
function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !isCalendarDate(value.slice(0, 10)) ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new WholesaleError(
      400,
      "Enter a valid collection time with a timezone.",
    );
  return new Date(value).toISOString();
}
async function account(query: WholesaleQuery, id: string) {
  const {
    rows: [row],
  } = await query(
    `SELECT a.*,a.due_date::text AS due_day,f.delivered_at,f.snapshot->>'total' AS sale_total,
    f.snapshot->>'clientName' AS client_name,o.order_number
    FROM accounts_receivable a JOIN wholesale_fulfillments f ON f.ar_id=a.id
    JOIN wholesale_orders o ON o.id=a.order_id WHERE a.id=$1 FOR UPDATE OF a`,
    [id],
  );
  if (!row)
    throw new WholesaleError(404, "A delivered order receivable is required.");
  return row;
}
async function reconcile(query: WholesaleQuery, row: any) {
  const {
    rows: [ledger],
  } = await query(
    `SELECT count(*) FILTER(WHERE c.id IS NULL)::int AS unknown,
    coalesce(sum(CASE WHEN r.id IS NULL THEN p.amount_paid ELSE 0 END),0)::text AS paid
    FROM ar_payments p LEFT JOIN wholesale_collections c ON c.id=p.id
    LEFT JOIN wholesale_collection_reversals r ON r.collection_id=c.id WHERE p.ar_id=$1`,
    [row.id],
  );
  if (
    ledger.unknown ||
    row.total_owed !== row.sale_total ||
    cents(row.total_paid) !== cents(ledger.paid) ||
    cents(row.balance) !== cents(row.total_owed) - cents(ledger.paid)
  )
    throw new WholesaleError(
      409,
      "This receivable has unresolved payment history or balances. Review it before recording another change.",
    );
}
export function createWholesaleCollections(
  read: WholesaleQuery,
  transaction: WholesaleTransaction,
) {
  const operation = createWholesaleOperation(transaction);
  return {
    async list(actor: AuditActor, search: unknown = "", page: unknown = "1") {
      access(actor);
      if (
        typeof search !== "string" ||
        search.length > 200 ||
        !/^\d{1,6}$/.test(String(page)) ||
        Number(page) < 1
      )
        throw new WholesaleError(
          400,
          "Choose a valid account search and page.",
        );
      const where = `FROM accounts_receivable a JOIN wholesale_fulfillments f ON f.ar_id=a.id
        JOIN wholesale_orders o ON o.id=a.order_id
        WHERE strpos(lower(o.order_number || ' ' || (f.snapshot->>'clientName')),lower($1))>0`;
      const {
        rows: [count],
      } = await read("SELECT count(*)::int AS total " + where, [search.trim()]);
      const { rows: items } = await read(
        `SELECT a.id,o.order_number AS "orderNumber",
        f.snapshot->>'clientName' AS "clientName",a.total_owed::text AS total,
        a.total_paid::text AS paid,a.balance::text,a.due_date::text AS "dueDate",f.delivered_at AS "deliveredAt"
        ${where} ORDER BY f.delivered_at DESC,a.id LIMIT 50 OFFSET $2`,
        [search.trim(), (Number(page) - 1) * 50],
      );
      return { items, total: count.total, page: Number(page), pageSize: 50 };
    },
    async detail(actor: AuditActor, arId: unknown) {
      access(actor);
      const id = requireUuid(arId);
      return transaction(async (query) => {
        const row = await account(query, id);
        const { rows: payments } = await query(
          `SELECT p.id,p.amount_paid::text AS amount,p.payment_date AS "collectedAt",
          p.notes,c.method,c.reference,c.collector_name AS "collectorName",c.collector_id AS "collectorId",
          r.id AS "reversalId",r.reason AS "reversalReason",r.reversed_at AS "reversedAt"
          FROM ar_payments p LEFT JOIN wholesale_collections c ON c.id=p.id
          LEFT JOIN wholesale_collection_reversals r ON r.collection_id=c.id
          WHERE p.ar_id=$1 ORDER BY p.payment_date DESC,p.id`,
          [id],
        );
        let reviewRequired = false;
        try {
          await reconcile(query, row);
        } catch (error) {
          if (error instanceof WholesaleError) reviewRequired = true;
          else throw error;
        }
        return {
          id,
          orderNumber: row.order_number,
          clientName: row.client_name,
          total: row.total_owed,
          paid: row.total_paid,
          balance: row.balance,
          dueDate: row.due_day,
          deliveredAt: row.delivered_at,
          payments,
          reviewRequired,
          methods: wholesalePaymentMethods,
        };
      });
    },
    async collect(actor: AuditActor, key: unknown, arId: unknown, input: any) {
      access(actor);
      wholesaleFields(input, [
        "amount",
        "method",
        "reference",
        "collectedAt",
        "notes",
      ]);
      const id = requireUuid(arId);
      const amount = wholesaleMoney(input.amount);
      if (cents(amount) <= 0n)
        throw new WholesaleError(400, "Enter a payment greater than zero.");
      if (!wholesalePaymentMethods.includes(input.method))
        throw new WholesaleError(400, "Choose a supported collection method.");
      const method = String(input.method);
      const reference = wholesaleText(
        input.reference,
        "a payment reference",
        255,
        method !== "Cash",
      );
      if (method === "Cash" && reference !== null)
        throw new WholesaleError(
          400,
          "Cash payments do not use a noncash reference.",
        );
      const collectedAt = instant(input.collectedAt);
      const notes = wholesaleText(input.notes, "payment notes", 500, false);
      return operation(
        actor,
        key,
        {
          action: "collect-wholesale",
          id,
          amount,
          method,
          reference,
          collectedAt,
          notes,
        },
        async (query) => {
          if (Date.parse(collectedAt) > Date.now())
            throw new WholesaleError(
              400,
              "Collection time cannot be in the future.",
            );
          const row = await account(query, id);
          await reconcile(query, row);
          if (Date.parse(collectedAt) < new Date(row.delivered_at).getTime())
            throw new WholesaleError(
              400,
              "Collection cannot precede the confirmed delivery.",
            );
          if (cents(amount) > cents(row.balance))
            throw new WholesaleError(
              409,
              "This payment exceeds the outstanding balance. Refresh the account.",
            );
          const collector = await wholesaleActorName(query, actor.id);
          const {
            rows: [payment],
          } = await query(
            "INSERT INTO ar_payments(ar_id,payment_date,amount_paid,notes) VALUES($1,$2,$3,$4) RETURNING id",
            [id, collectedAt, amount, notes],
          );
          await query(
            "INSERT INTO wholesale_collections(id,collector_id,collector_name,method,reference) VALUES($1,$2,$3,$4,$5)",
            [payment.id, actor.id, collector, method, reference],
          );
          const balance = money(cents(row.balance) - cents(amount));
          await query(
            "UPDATE accounts_receivable SET total_paid=total_paid+$2,balance=balance-$2 WHERE id=$1",
            [id, amount],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_PAYMENT_RECORDED",
            "AR " +
              id +
              "; payment " +
              payment.id +
              "; " +
              amount +
              " " +
              method,
          );
          return { id: payment.id, arId: id, balance };
        },
      );
    },
    async reverse(
      actor: AuditActor,
      key: unknown,
      paymentId: unknown,
      input: any,
    ) {
      if (actor.role !== "Admin")
        throw new WholesaleError(403, "Only Admin may reverse a payment.");
      wholesaleFields(input, ["reason"]);
      const id = requireUuid(paymentId);
      const reason = wholesaleText(input.reason, "a correction reason")!;
      return operation(
        actor,
        key,
        { action: "reverse-wholesale-payment", id, reason },
        async (query) => {
          const {
            rows: [payment],
          } = await query(
            `SELECT c.*,p.ar_id,p.amount_paid::text AS amount,p.payment_date
          FROM wholesale_collections c JOIN ar_payments p ON p.id=c.id WHERE c.id=$1`,
            [id],
          );
          if (!payment)
            throw new WholesaleError(
              404,
              "Managed wholesale payment not found.",
            );
          const row = await account(query, payment.ar_id);
          await reconcile(query, row);
          if (
            (
              await query(
                "SELECT id FROM wholesale_collection_reversals WHERE collection_id=$1",
                [id],
              )
            ).rows.length
          )
            throw new WholesaleError(409, "This payment was already reversed.");
          const {
            rows: [reversal],
          } = await query(
            "INSERT INTO wholesale_collection_reversals(collection_id,reversed_by,reason) VALUES($1,$2,$3) RETURNING id",
            [id, actor.id, reason],
          );
          await query(
            "UPDATE accounts_receivable SET total_paid=total_paid-$2,balance=balance+$2 WHERE id=$1",
            [row.id, payment.amount],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_PAYMENT_REVERSED",
            "Payment " + id + "; reversal " + reversal.id + "; " + reason,
          );
          return {
            id: reversal.id,
            arId: row.id,
            balance: money(cents(row.balance) + cents(payment.amount)),
          };
        },
      );
    },
  };
}
