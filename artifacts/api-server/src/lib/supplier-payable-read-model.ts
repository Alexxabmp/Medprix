import type { Query } from "./atomic-checkout";

export type SupplierFinding =
  | "missing_payable"
  | "non_positive_invoice_amount"
  | "supplier_mismatch"
  | "invoice_amount_mismatch"
  | "payable_totals_mismatch"
  | "paid_status_mismatch"
  | "payment_history_difference"
  | "recorded_overpayment"
  | "history_paid_status_mismatch"
  | "payment_date_mismatch";

type DatabaseTimestamp = Date | string;

export interface SupplierPayableFact {
  invoice_id: string;
  invoice_number: string;
  invoice_supplier_id: string;
  invoice_supplier: string | null;
  po_id: string | null;
  po_number: string | null;
  due_date: string;
  invoice_amount: string;
  is_paid: boolean;
  payable_id: string | null;
  payable_supplier_id: string | null;
  payable_supplier: string | null;
  total_owed: string | null;
  total_paid: string | null;
  balance: string | null;
  last_payment_date: string | null;
  created_at: DatabaseTimestamp | null;
  updated_at: DatabaseTimestamp | null;
  recorded_paid: string;
  recorded_balance: string;
  payment_count: number;
  recorded_last_payment_date: string | null;
  findings: SupplierFinding[];
}

interface SupplierPayment {
  id: string;
  apId: string;
  amountPaid: string;
  paymentDate: string;
  notes: string | null;
}

interface SupplierHistoryFact extends SupplierPayableFact {
  payment_records: SupplierPayment[];
}

// Only history needs payment JSON. Both variants share every aggregate and
// consistency rule, reading their financial facts in a single SELECT.
function buildFactsSql(includePayments: boolean): string {
  const paymentAggregate = includePayments
    ? `,
      jsonb_agg(
        jsonb_build_object(
          'id', id, 'apId', ap_id, 'amountPaid', amount_paid::text,
          'paymentDate', payment_date, 'notes', notes
        ) ORDER BY payment_date DESC, id
      ) AS payment_records`
    : "";
  const paymentProjection = includePayments
    ? ", COALESCE(h.payment_records, '[]'::jsonb) AS payment_records"
    : "";

  return `WITH history AS (
    SELECT
      ap_id,
      sum(amount_paid) AS recorded_paid,
      count(*)::int AS payment_count,
      (max(payment_date AT TIME ZONE 'UTC'))::date AS latest_date
      ${paymentAggregate}
    FROM supplier_payments
    GROUP BY ap_id
  )
  SELECT
    i.id AS invoice_id, i.invoice_number,
    i.supplier_id AS invoice_supplier_id, s.supplier_name AS invoice_supplier,
    i.po_id, po.po_number, i.due_date::text, i.invoice_amount::text, i.is_paid,
    a.id AS payable_id, a.supplier_id AS payable_supplier_id,
    aps.supplier_name AS payable_supplier,
    a.total_owed::text, a.total_paid::text, a.balance::text,
    a.last_payment_date::text, a.created_at, a.updated_at,
    COALESCE(h.recorded_paid, 0)::text AS recorded_paid,
    (i.invoice_amount - COALESCE(h.recorded_paid, 0))::text AS recorded_balance,
    COALESCE(h.payment_count, 0) AS payment_count,
    h.latest_date::text AS recorded_last_payment_date
    ${paymentProjection},
    array_remove(ARRAY[
      CASE WHEN a.id IS NULL THEN 'missing_payable' END,
      CASE WHEN i.invoice_amount <= 0 THEN 'non_positive_invoice_amount' END,
      CASE WHEN a.id IS NOT NULL AND a.supplier_id <> i.supplier_id
        THEN 'supplier_mismatch' END,
      CASE WHEN a.id IS NOT NULL AND a.total_owed <> i.invoice_amount
        THEN 'invoice_amount_mismatch' END,
      CASE WHEN a.id IS NOT NULL AND a.total_paid + a.balance <> a.total_owed
        THEN 'payable_totals_mismatch' END,
      CASE WHEN a.id IS NOT NULL AND i.is_paid <> (a.balance = 0)
        THEN 'paid_status_mismatch' END,
      CASE WHEN a.id IS NOT NULL AND COALESCE(h.recorded_paid, 0) <> a.total_paid
        THEN 'payment_history_difference' END,
      CASE WHEN COALESCE(h.recorded_paid, 0) > i.invoice_amount
        THEN 'recorded_overpayment' END,
      CASE WHEN i.invoice_amount > 0
        AND i.is_paid <> (COALESCE(h.recorded_paid, 0) = i.invoice_amount)
        THEN 'history_paid_status_mismatch' END,
      CASE WHEN a.id IS NOT NULL AND a.last_payment_date IS DISTINCT FROM h.latest_date
        THEN 'payment_date_mismatch' END
    ], NULL) AS findings
  FROM supplier_invoices i
  LEFT JOIN accounts_payable a ON a.invoice_id = i.id
  LEFT JOIN history h ON h.ap_id = a.id
  LEFT JOIN suppliers s ON s.id = i.supplier_id
  LEFT JOIN suppliers aps ON aps.id = a.supplier_id
  LEFT JOIN purchase_orders po ON po.id = i.po_id`;
}

export const supplierPayableFactsSql = buildFactsSql(false);
const supplierHistoryFactsSql = buildFactsSql(true);

const cents = (value: string): bigint => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const amount = (value: bigint): string =>
  `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
const localToday = (): string =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

function orderedFactsSql(sql: string, supplierId?: string): string {
  const filter = supplierId ? " WHERE i.supplier_id = $1" : "";
  return `${sql}${filter} ORDER BY i.created_at DESC, i.id`;
}

async function readFacts(
  query: Query,
  supplierId?: string,
): Promise<SupplierPayableFact[]> {
  const { rows } = await query(
    orderedFactsSql(supplierPayableFactsSql, supplierId),
    supplierId ? [supplierId] : [],
  );
  return rows;
}

function reconciliation(facts: SupplierPayableFact[]) {
  return {
    invoicesNeedingReview: facts.filter((row) => row.findings.length > 0)
      .length,
    missingPayables: facts.filter((row) => row.payable_id === null).length,
  };
}

function toInvoice(row: SupplierPayableFact) {
  let status = "Unpaid";
  if (row.findings.length > 0) status = "Needs Review";
  else if (cents(row.recorded_balance) === 0n) status = "Paid";
  return {
    id: row.invoice_id,
    invoiceNumber: row.invoice_number,
    supplierId: row.invoice_supplier_id,
    supplier: row.invoice_supplier || "Unknown supplier",
    poId: row.po_id,
    poNumber: row.po_number,
    dueDate: row.due_date,
    invoiceAmount: row.invoice_amount,
    isPaid: row.is_paid,
    needsReview: row.findings.length > 0,
    reviewReasons: row.findings,
    status,
  };
}

function toPayables(facts: SupplierPayableFact[], today: string) {
  return facts.flatMap((row) => {
    if (row.payable_id === null) return [];
    const needsReview = row.findings.length > 0;
    let status = "Open";
    if (needsReview) status = "Needs Review";
    else if (cents(row.recorded_balance) === 0n) status = "Paid";
    else if (row.due_date < today) status = "Overdue";
    return [
      {
        id: row.payable_id,
        supplierId: row.payable_supplier_id,
        invoiceId: row.invoice_id,
        supplier: row.payable_supplier || "Unknown supplier",
        invoiceNumber: row.invoice_number,
        dueDate: row.due_date,
        totalOwed: needsReview ? null : row.invoice_amount,
        totalPaid: needsReview ? null : amount(cents(row.recorded_paid)),
        balance: needsReview ? null : amount(cents(row.recorded_balance)),
        lastPaymentDate: row.recorded_last_payment_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        needsReview,
        reviewReasons: row.findings,
        status,
      },
    ];
  });
}

type Payable = ReturnType<typeof toPayables>[number];

function sumBalances(
  payables: Payable[],
  filter: (row: Payable) => boolean = () => true,
): string {
  // Callers suppress totals for the entire scope when any invoice needs review.
  return amount(
    payables.filter(filter).reduce((sum, row) => sum + cents(row.balance!), 0n),
  );
}

export async function readSupplierPayables(
  query: Query,
  supplierId?: string,
  today = localToday(),
) {
  const facts = await readFacts(query, supplierId);
  const payables = toPayables(facts, today);
  const review = reconciliation(facts);
  const needsReview = review.invoicesNeedingReview > 0;
  const week = new Date(`${today}T00:00:00Z`);
  week.setUTCDate(week.getUTCDate() + 7);
  const weekEnd = week.toISOString().slice(0, 10);
  return {
    payables,
    reconciliation: review,
    summary: {
      totalOpen: needsReview ? null : sumBalances(payables),
      overdue: needsReview
        ? null
        : sumBalances(payables, (row) => row.status === "Overdue"),
      dueThisWeek: needsReview
        ? null
        : sumBalances(
            payables,
            (row) => row.dueDate >= today && row.dueDate <= weekEnd,
          ),
      needsReview,
      invoicesNeedingReview: review.invoicesNeedingReview,
    },
  };
}

export async function readSupplierInvoices(query: Query) {
  const facts = await readFacts(query);
  return {
    invoices: facts.map(toInvoice),
    reconciliation: reconciliation(facts),
  };
}

export async function readSupplierHistory(
  query: Query,
  supplierId: string,
  today = localToday(),
) {
  const { rows: facts }: { rows: SupplierHistoryFact[] } = await query(
    orderedFactsSql(supplierHistoryFactsSql, supplierId),
    [supplierId],
  );
  const payables = toPayables(facts, today);
  const review = reconciliation(facts);
  const needsReview = review.invoicesNeedingReview > 0;
  const payments = facts
    .flatMap((row) => row.payment_records)
    .sort(
      (a, b) =>
        Date.parse(b.paymentDate) - Date.parse(a.paymentDate) ||
        b.id.localeCompare(a.id),
    );
  return {
    invoices: facts.map(toInvoice),
    payables,
    payments,
    reconciliation: review,
    summary: {
      totalOpen: needsReview ? null : sumBalances(payables),
      needsReview,
      invoicesNeedingReview: review.invoicesNeedingReview,
    },
    totalPaid: needsReview
      ? null
      : amount(facts.reduce((sum, row) => sum + cents(row.recorded_paid), 0n)),
  };
}
