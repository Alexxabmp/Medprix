import type { Query } from "./atomic-checkout";
import {
  supplierPayableFactsSql,
  type SupplierPayableFact,
} from "./supplier-payable-read-model";

type SupplierAuditRow = Pick<
  SupplierPayableFact,
  | "invoice_id"
  | "invoice_number"
  | "is_paid"
  | "invoice_amount"
  | "payable_id"
  | "total_owed"
  | "total_paid"
  | "balance"
  | "recorded_paid"
  | "payment_count"
  | "findings"
  | "invoice_supplier_id"
  | "payable_supplier_id"
  | "recorded_balance"
  | "recorded_last_payment_date"
  | "last_payment_date"
>;

/** Read-only evidence. Reports disagreements without guessing opening balances or repairing historical data. */
export async function auditSupplierConsistency(query: Query) {
  const { rows }: { rows: SupplierAuditRow[] } = await query(`
    SELECT
      invoice_id, invoice_number, is_paid, invoice_amount, payable_id,
      total_owed, total_paid, balance, recorded_paid, payment_count, findings,
      invoice_supplier_id, payable_supplier_id, recorded_balance,
      recorded_last_payment_date, last_payment_date
    FROM (${supplierPayableFactsSql}) inspected
    WHERE cardinality(findings) > 0
    ORDER BY invoice_number, invoice_id
  `);
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
