export const wholesaleBusinessDay = "(now() AT TIME ZONE 'Asia/Manila')::date";
export const wholesaleOverdue = "a.balance > 0 AND credit.overdue_amount > 0";
export const wholesalePaymentStatus = `CASE WHEN a.balance=0 THEN 'Paid' WHEN ${wholesaleOverdue} THEN 'Overdue' ELSE 'Outstanding' END`;

/** Caller supplies trusted SQL for the reporting date. All amounts remain numeric. */
export function wholesaleCreditJoin(day = wholesaleBusinessDay) {
  return `LEFT JOIN LATERAL (
    WITH balances AS (
      SELECT i.sequence_number,i.due_date,i.amount-coalesce(p.paid,0) AS remaining
      FROM wholesale_installments i LEFT JOIN LATERAL (
        SELECT sum(x.amount) AS paid FROM wholesale_payment_allocations x
        JOIN ar_payments payment ON payment.id=x.payment_id AND payment.ar_id=x.ar_id
        LEFT JOIN wholesale_collection_reversals r ON r.collection_id=x.payment_id
        WHERE x.ar_id=i.ar_id AND x.sequence_number=i.sequence_number AND r.id IS NULL
      ) p ON true WHERE i.ar_id=a.id
    ) SELECT coalesce(sum(remaining) FILTER (WHERE remaining>0 AND due_date<${day}),0) AS overdue_amount,
      count(*) FILTER (WHERE remaining>0 AND due_date<${day})::int AS overdue_count,
      (array_agg(due_date ORDER BY due_date,sequence_number) FILTER (WHERE remaining>0))[1] AS next_due_date,
      coalesce((array_agg(remaining ORDER BY due_date,sequence_number) FILTER (WHERE remaining>0))[1],0) AS next_due_amount
    FROM balances
  ) credit ON true`;
}
