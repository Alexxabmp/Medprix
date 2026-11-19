import {
  wholesaleOverdue,
  wholesalePaymentStatus,
  wholesaleCreditJoin,
} from "./wholesale-receivable-aging";
import {
  isCalendarDate,
  allocateWholesalePayment,
  pharmacyDate,
  wholesaleReceivableAging,
} from "@workspace/api-zod";
import { wholesaleAccountLedger } from "./wholesale-account-ledger";
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
    f.snapshot->>'clientName' AS client_name,o.order_number,o.payment_plan,f.received_at
    FROM accounts_receivable a JOIN wholesale_fulfillments f ON f.ar_id=a.id
    JOIN wholesale_orders o ON o.id=a.order_id WHERE a.id=$1 FOR UPDATE OF a`,
    [id],
  );
  if (!row)
    throw new WholesaleError(404, "A delivered order receivable is required.");
  return row;
}
function pharmacyDateMinus(day: string, daysBack: number) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - daysBack)).toISOString().slice(0, 10);
}
export function createWholesaleCollections(
  read: WholesaleQuery,
  transaction: WholesaleTransaction,
  clock: () => Date = () => new Date(),
) {
  const operation = createWholesaleOperation(transaction);
  return {
    async list(
      actor: AuditActor,
      search: unknown = "",
      page: unknown = "1",
      status: unknown = "all",
    ) {
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
      if (
        typeof status !== "string" ||
        !["all", "outstanding", "overdue", "paid", "deadline"].includes(status)
      )
        throw new WholesaleError(400, "Choose a valid payment status.");
      const filter =
        status === "overdue"
          ? wholesaleOverdue
          : status === "deadline"
            ? "a.balance>0 AND a.due_date<$3::date"
            : status === "outstanding"
              ? "a.balance > 0"
              : status === "paid"
                ? "a.balance = 0"
                : "true";
      const where = `FROM accounts_receivable a JOIN wholesale_fulfillments f ON f.ar_id=a.id
        JOIN wholesale_orders o ON o.id=a.order_id
        ${wholesaleCreditJoin("$3::date")}
        WHERE strpos(lower(o.order_number || ' ' || (f.snapshot->>'clientName')),lower($1))>0 AND (${filter})`;
      const today = pharmacyDate(clock());
      const {
        rows: [count],
      } = await read(
        "SELECT count(*)::int AS total " + where.replaceAll("$3", "$2"),
        [search.trim(), today],
      );
      const { rows: items } = await read(
        `SELECT a.id,o.order_number AS "orderNumber",o.client_id AS "clientId",
        f.snapshot->>'clientName' AS "clientName",a.total_owed::text AS total,
        a.total_paid::text AS paid,a.balance::text,${wholesalePaymentStatus} AS status,a.due_date::text AS "dueDate",f.delivered_at AS "deliveredAt",
        o.payment_plan AS "paymentPlan",$3::date::text AS "asOfDate",credit.overdue_amount::numeric(12,2)::text AS "overdueAmount",
        credit.overdue_count AS "overdueInstallmentCount",credit.next_due_date::text AS "nextDueDate",
        credit.next_due_amount::numeric(12,2)::text AS "nextDueAmount",(a.balance>0 AND a.due_date<$3::date) AS "finalDeadlineBreached"
        ${where} ORDER BY f.delivered_at DESC,a.id LIMIT 50 OFFSET $2`,
        [search.trim(), (Number(page) - 1) * 50, today],
      );
      return { items, total: count.total, page: Number(page), pageSize: 50 };
    },
    async detail(actor: AuditActor, arId: unknown) {
      access(actor);
      const id = requireUuid(arId);
      return transaction(async (query) => {
        const row = await account(query, id);
        const ledger = await wholesaleAccountLedger(query, row);
        return {
          id,
          orderNumber: row.order_number,
          clientId: row.client_id,
          clientName: row.client_name,
          total: row.total_owed,
          paid: row.total_paid,
          balance: row.balance,
          dueDate: row.due_day,
          paymentPlan: row.payment_plan,
          deliveredAt: row.delivered_at,
          ...ledger,
          ...wholesaleReceivableAging(
            ledger.installments,
            row.due_day,
            pharmacyDate(clock()),
          ),
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
        "officialReceiptNumber",
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
      const officialReceiptNumber = wholesaleText(
        input.officialReceiptNumber,
        "the pharmacy's official receipt or invoice number",
        100,
        false,
      );
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
          ...(officialReceiptNumber ? { officialReceiptNumber } : {}),
        },
        async (query) => {
          if (Date.parse(collectedAt) > clock().getTime())
            throw new WholesaleError(
              400,
              "Collection time cannot be in the future.",
            );
          const row = await account(query, id);
          const ledger = await wholesaleAccountLedger(query, row);
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
          if (
            method !== "Cash" &&
            ledger.payments.some(
              (payment) =>
                !payment.reversalId &&
                payment.method === method &&
                payment.reference?.trim().toLowerCase() ===
                  reference!.toLowerCase(),
            )
          )
            throw new WholesaleError(
              409,
              "A payment with this method and reference is already recorded on this account.",
            );
          const allocations = allocateWholesalePayment(
            amount,
            ledger.installments,
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
          for (const allocation of allocations) {
            await query(
              "INSERT INTO wholesale_payment_allocations(payment_id,ar_id,sequence_number,amount) VALUES($1,$2,$3,$4)",
              [payment.id, id, allocation.sequenceNumber, allocation.amount],
            );
          }
          // Collection receipt, numbered in the same transaction so a retry or double-click never makes two.
          const {
            rows: [seq],
          } = await query("SELECT nextval('wholesale_collection_receipt_seq') AS n");
          const receiptNumber = `CR-${pharmacyDate(new Date(collectedAt)).slice(0, 4)}-${String(seq.n).padStart(4, "0")}`;
          await query(
            "INSERT INTO wholesale_collection_receipts(collection_id,receipt_number,official_receipt_number) VALUES($1,$2,$3)",
            [payment.id, receiptNumber, officialReceiptNumber],
          );
          const balance = money(cents(row.balance) - cents(amount));
          await query(
            "UPDATE accounts_receivable SET total_paid=total_paid+$2,balance=balance-$2 WHERE id=$1",
            [id, amount],
          );
          await wholesaleAccountLedger(query, {
            ...row,
            balance,
            total_paid: money(cents(row.total_paid) + cents(amount)),
          });
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
              method +
              "; receipt " +
              receiptNumber,
          );
          return { id: payment.id, arId: id, balance, allocations, receiptNumber };
        },
      );
    },
    /** The pharmacy's own official receipt / invoice number can be added once, after the payment. */
    async setOfficialReceipt(actor: AuditActor, paymentId: unknown, input: any) {
      access(actor);
      wholesaleFields(input, ["officialReceiptNumber"]);
      const id = requireUuid(paymentId);
      const number = wholesaleText(input.officialReceiptNumber, "the pharmacy's official receipt or invoice number", 100)!;
      return transaction(async (query) => {
        const {
          rows: [receipt],
        } = await query(
          "SELECT receipt_number,official_receipt_number FROM wholesale_collection_receipts WHERE collection_id=$1 FOR UPDATE",
          [id],
        );
        if (!receipt) throw new WholesaleError(404, "Receipt not found.");
        if (receipt.official_receipt_number)
          throw new WholesaleError(409, `This receipt already has official receipt no. ${receipt.official_receipt_number}.`);
        await query(
          "UPDATE wholesale_collection_receipts SET official_receipt_number=$2 WHERE collection_id=$1",
          [id, number],
        );
        await wholesaleAudit(query, actor, "WHOLESALE_RECEIPT_UPDATED", `Receipt ${receipt.receipt_number}: official receipt no. ${number}`);
        return { id, receiptNumber: receipt.receipt_number, officialReceiptNumber: number };
      });
    },
    /**
     * Statement of account for one client: open orders with their installments, payments in the last 90 days with
     * receipt numbers, and how late the unpaid installments are. Uses the same overdue rule as receivables and Finance.
     */
    async statement(actor: AuditActor, clientId: unknown) {
      access(actor);
      const id = requireUuid(clientId);
      const today = pharmacyDate(clock());
      return transaction(async (query) => {
        const {
          rows: [client],
        } = await query(
          "SELECT id,client_name AS name,contact_person AS \"contactPerson\",contact_number AS \"contactNumber\",email,address FROM wholesale_clients WHERE id=$1",
          [id],
        );
        if (!client) throw new WholesaleError(404, "Client not found.");
        const { rows: ids } = await query(
          `SELECT a.id FROM accounts_receivable a JOIN wholesale_orders o ON o.id=a.order_id JOIN wholesale_fulfillments f ON f.ar_id=a.id
          WHERE o.client_id=$1 AND (a.balance>0 OR EXISTS (SELECT 1 FROM ar_payments p WHERE p.ar_id=a.id AND p.payment_date >= ($2::date - 90)))
          ORDER BY f.delivered_at,a.id`,
          [id, today],
        );
        const days = (due: string) => Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);
        const aging = { current: 0n, d1_30: 0n, d31_60: 0n, d61_90: 0n, d90plus: 0n };
        const orders: any[] = [];
        const payments: any[] = [];
        let billed = 0n, paid = 0n, balance = 0n, overdue = 0n;
        for (const { id: arId } of ids) {
          const row = await account(query, arId);
          const ledger = await wholesaleAccountLedger(query, row);
          if (cents(row.balance) > 0n) {
            billed += cents(row.total_owed); paid += cents(row.total_paid); balance += cents(row.balance);
            const installments = ledger.installments.map((entry: any) => {
              const left = cents(entry.balance);
              const late = entry.dueDate < today && left > 0n ? days(entry.dueDate) : 0;
              if (left > 0n) {
                if (!late) aging.current += left;
                else { overdue += left; if (late <= 30) aging.d1_30 += left; else if (late <= 60) aging.d31_60 += left; else if (late <= 90) aging.d61_90 += left; else aging.d90plus += left; }
              }
              return { sequenceNumber: entry.sequenceNumber, dueDate: entry.dueDate, amount: entry.amount, paid: money(cents(entry.amount) - left), balance: entry.balance, daysLate: late };
            });
            orders.push({ arId, orderNumber: row.order_number, paymentPlan: row.payment_plan, deliveredAt: row.delivered_at, total: row.total_owed, paid: row.total_paid, balance: row.balance, installments });
          }
          for (const payment of ledger.payments as any[]) {
            if (pharmacyDate(new Date(payment.collectedAt)) >= pharmacyDateMinus(today, 90))
              payments.push({ orderNumber: row.order_number, receiptNumber: payment.receiptNumber, collectedAt: payment.collectedAt, amount: payment.amount,
                method: payment.method, reference: payment.reference, reversed: Boolean(payment.reversalId) });
          }
        }
        payments.sort((a, b) => String(b.collectedAt).localeCompare(String(a.collectedAt)));
        return {
          client, asOf: today, orders, payments,
          totals: { billed: money(billed), paid: money(paid), balance: money(balance), overdue: money(overdue) },
          aging: { current: money(aging.current), days1to30: money(aging.d1_30), days31to60: money(aging.d31_60), days61to90: money(aging.d61_90), over90: money(aging.d90plus) },
        };
      });
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
          await wholesaleAccountLedger(query, row);
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
          await wholesaleAccountLedger(query, {
            ...row,
            balance: money(cents(row.balance) + cents(payment.amount)),
            total_paid: money(cents(row.total_paid) - cents(payment.amount)),
          });
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
