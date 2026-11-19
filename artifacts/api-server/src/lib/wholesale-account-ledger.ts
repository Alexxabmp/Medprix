import {
  calculateWholesaleSchedule,
  wholesaleInstallmentBalance,
  type WholesalePaymentPlan,
} from "@workspace/api-zod";
import {
  cents,
  money,
  WholesaleError,
  type WholesaleQuery,
} from "./wholesale-operations";

function inconsistent(): never {
  throw new WholesaleError(
    409,
    "This account's payments, allocations or balances are inconsistent. No financial change was recorded; contact Admin.",
  );
}

/** Caller holds the AR lock. Posted schedule/allocations are immutable. */
export async function wholesaleAccountLedger(query: WholesaleQuery, row: any) {
  const {
    rows: [header],
  } = await query(
    `SELECT payment_plan,plan_version,principal::text,installment_count,received_at,
      receipt_date::text,next_payment_date::text,final_due_date::text FROM wholesale_installment_schedules WHERE ar_id=$1`,
    [row.id],
  );
  if (!header || !row.received_at) inconsistent();
  let schedule: ReturnType<typeof calculateWholesaleSchedule>;
  try {
    schedule = calculateWholesaleSchedule({
      paymentPlan: row.payment_plan as WholesalePaymentPlan,
      total: row.sale_total,
      paymentPlanVersion: header.plan_version,
      nextPaymentDate: header.next_payment_date ?? undefined,
      finalDueDate: header.final_due_date,
      receivedAt: new Date(row.received_at).toISOString(),
    });
  } catch {
    inconsistent();
  }
  if (
    header.payment_plan !== schedule.paymentPlan ||
    header.plan_version !== schedule.paymentPlanVersion ||
    header.principal !== schedule.total ||
    header.installment_count !== schedule.installments.length ||
    new Date(header.received_at).toISOString() !== schedule.receivedAt ||
    header.receipt_date !== schedule.receiptDate ||
    header.final_due_date !== schedule.finalDueDate ||
    row.due_day !== schedule.finalDueDate ||
    row.total_owed !== schedule.total
  )
    inconsistent();
  const { rows: scheduled } = await query(
    `SELECT sequence_number AS "sequenceNumber",due_date::text AS "dueDate",amount::text
    FROM wholesale_installments WHERE ar_id=$1 ORDER BY due_date,sequence_number FOR UPDATE`,
    [row.id],
  );
  if (
    scheduled.length !== schedule.installments.length ||
    scheduled.some((entry, index) => {
      const expected = schedule.installments[index];
      return (
        entry.sequenceNumber !== expected.sequenceNumber ||
        entry.dueDate !== expected.dueDate ||
        entry.amount !== expected.amount
      );
    })
  )
    inconsistent();
  const { rows: payments } = await query(
    `SELECT p.id,p.amount_paid::text AS amount,p.payment_date AS "collectedAt",p.notes,
    c.id AS "collectionId",c.method,c.reference,c.collector_name AS "collectorName",c.collector_id AS "collectorId",
    r.id AS "reversalId",r.reason AS "reversalReason",r.reversed_at AS "reversedAt"
    FROM ar_payments p LEFT JOIN wholesale_collections c ON c.id=p.id
    LEFT JOIN wholesale_collection_reversals r ON r.collection_id=c.id
    WHERE p.ar_id=$1 ORDER BY p.payment_date DESC,p.created_at DESC,p.id`,
    [row.id],
  );
  const { rows: allocations } = await query(
    `SELECT payment_id AS "paymentId",sequence_number AS "sequenceNumber",amount::text
    FROM wholesale_payment_allocations WHERE ar_id=$1 ORDER BY payment_id,sequence_number`,
    [row.id],
  );
  const effective = new Map<number, bigint>();
  let paid = 0n;
  const paymentIds = new Set(payments.map((payment) => payment.id));
  if (allocations.some((allocation) => !paymentIds.has(allocation.paymentId)))
    inconsistent();
  const history = payments.map((payment) => {
    if (!payment.collectionId || cents(payment.amount) <= 0n) inconsistent();
    const applied = allocations.filter(
      (allocation) => allocation.paymentId === payment.id,
    );
    if (
      new Set(applied.map((allocation) => allocation.sequenceNumber)).size !==
        applied.length ||
      applied.reduce(
        (sum, allocation) => sum + cents(allocation.amount),
        0n,
      ) !== cents(payment.amount)
    )
      inconsistent();
    for (const allocation of applied) {
      if (
        !scheduled.some(
          (entry) => entry.sequenceNumber === allocation.sequenceNumber,
        ) ||
        cents(allocation.amount) <= 0n
      )
        inconsistent();
      if (!payment.reversalId)
        effective.set(
          allocation.sequenceNumber,
          (effective.get(allocation.sequenceNumber) ?? 0n) +
            cents(allocation.amount),
        );
    }
    if (!payment.reversalId) paid += cents(payment.amount);
    const { collectionId, ...entry } = payment;
    return {
      ...entry,
      allocations: applied.map(({ sequenceNumber, amount }) => ({
        sequenceNumber,
        amount,
      })),
    };
  });
  let installments;
  try {
    installments = scheduled.map((entry) =>
      wholesaleInstallmentBalance(
        entry,
        money(effective.get(entry.sequenceNumber) ?? 0n),
      ),
    );
  } catch {
    inconsistent();
  }
  if (
    paid !== cents(row.total_paid) ||
    paid > cents(row.total_owed) ||
    cents(row.balance) !== cents(row.total_owed) - paid ||
    installments.reduce((sum, entry) => sum + cents(entry.balance), 0n) !==
      cents(row.balance)
  )
    inconsistent();
  return { schedule, installments, payments: history };
}
