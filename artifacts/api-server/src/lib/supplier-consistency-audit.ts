import type { Query } from "./atomic-checkout";

/** Read-only evidence. A history difference may represent a legitimate opening balance. */
export async function auditSupplierConsistency(query: Query) {
  const { rows } = await query(`WITH history AS (
    SELECT ap_id, sum(amount_paid) AS recorded_paid, count(*)::int AS payment_count
    FROM supplier_payments GROUP BY ap_id
  ), inspected AS (
    SELECT i.id AS invoice_id, i.invoice_number, i.is_paid, i.invoice_amount::text,
      a.id AS payable_id, a.total_owed::text, a.total_paid::text, a.balance::text,
      COALESCE(h.recorded_paid,0)::text AS recorded_paid, COALESCE(h.payment_count,0) AS payment_count,
      array_remove(ARRAY[
        CASE WHEN a.id IS NULL THEN 'missing_payable' END,
        CASE WHEN a.id IS NOT NULL AND a.total_owed <> i.invoice_amount THEN 'invoice_amount_mismatch' END,
        CASE WHEN a.id IS NOT NULL AND a.total_paid+a.balance <> a.total_owed THEN 'payable_totals_mismatch' END,
        CASE WHEN a.id IS NOT NULL AND i.is_paid <> (a.balance=0) THEN 'paid_status_mismatch' END,
        CASE WHEN a.id IS NOT NULL AND COALESCE(h.recorded_paid,0) <> a.total_paid THEN 'payment_history_difference' END
      ], NULL) AS findings
    FROM supplier_invoices i LEFT JOIN accounts_payable a ON a.invoice_id=i.id
    LEFT JOIN history h ON h.ap_id=a.id WHERE i.invoice_amount>0 OR a.id IS NOT NULL
  ) SELECT * FROM inspected WHERE cardinality(findings)>0 ORDER BY invoice_number,invoice_id`);
  return {
    invoicesNeedingReview: rows.length,
    counts: rows.reduce((counts: Record<string, number>, row) => {
      for (const finding of row.findings)
        counts[finding] = (counts[finding] || 0) + 1;
      return counts;
    }, {}),
    invoices: rows,
  };
}
