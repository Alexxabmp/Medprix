import { queryDb } from "@workspace/db";
import { isCalendarDate } from "@workspace/api-zod";

type FinanceQuery = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export class FinanceInputError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface FinanceDateRange {
  from: string;
  to: string;
}

const moneyCents = (value: unknown): bigint => {
  const text = String(value ?? "0");
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents =
    BigInt(whole || "0") * 100n +
    BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
};

const money = (value: bigint): string => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(
    absolute % 100n,
  ).padStart(2, "0")}`;
};

function validateDateRange(from: unknown, to: unknown): FinanceDateRange {
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    throw new FinanceInputError(400, "Enter valid from and to calendar dates.");
  }
  if (from > to) {
    throw new FinanceInputError(400, "The from date cannot be after the to date.");
  }
  return { from, to };
}

const summarySql = `
WITH
retail_transactions AS (
  SELECT t.net_amount, t.status
  FROM transactions t
  WHERE (t.transaction_date AT TIME ZONE 'Asia/Manila')::date >= $1::date
    AND (t.transaction_date AT TIME ZONE 'Asia/Manila')::date < ($2::date + 1)
),
retail AS (
  SELECT
    COALESCE((SELECT SUM(net_amount) FROM retail_transactions WHERE status = 'Completed'), 0)::text AS revenue,
    COALESCE(SUM(ti.quantity * p.cost_price) FILTER (WHERE t.status = 'Completed'), 0)::text AS cogs,
    COUNT(*) FILTER (WHERE t.status = 'Completed' AND (p.id IS NULL OR p.cost_price <= 0))::int AS missing_cost_items,
    COALESCE(SUM(ti.subtotal) FILTER (WHERE t.status = 'Completed' AND (p.id IS NULL OR p.cost_price <= 0)), 0)::text AS missing_cost_revenue
  FROM transactions t
  LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
  LEFT JOIN products p ON p.id = ti.product_id
  WHERE (t.transaction_date AT TIME ZONE 'Asia/Manila')::date >= $1::date
    AND (t.transaction_date AT TIME ZONE 'Asia/Manila')::date < ($2::date + 1)
),
wholesale_snapshots AS (
  SELECT
    f.id AS fulfillment_id,
    f.delivered_at,
    f.snapshot,
    CASE
      WHEN jsonb_typeof(f.snapshot) = 'object'
        AND jsonb_typeof(f.snapshot->'lines') = 'array'
        AND f.snapshot->>'total' ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN f.snapshot->>'total'
    END AS total
  FROM wholesale_fulfillments f
  WHERE (f.delivered_at AT TIME ZONE 'Asia/Manila')::date >= $1::date
    AND (f.delivered_at AT TIME ZONE 'Asia/Manila')::date < ($2::date + 1)
),
wholesale_revenue AS (
  SELECT COALESCE(SUM(total::numeric), 0)::text AS revenue
  FROM wholesale_snapshots
  WHERE total IS NOT NULL
),
wholesale_lines AS (
  SELECT
    s.fulfillment_id,
    line,
    CASE
      WHEN line->>'productId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (line->>'productId')::uuid
    END AS product_id,
    CASE
      WHEN line->>'quantity' ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN (line->>'quantity')::numeric
    END AS quantity,
    CASE
      WHEN line->>'total' ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN (line->>'total')::numeric
    END AS line_total
  FROM wholesale_snapshots s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN s.total IS NOT NULL THEN s.snapshot->'lines' ELSE '[]'::jsonb END
  ) AS line
),
wholesale AS (
  SELECT
    COALESCE(SUM(l.quantity * p.cost_price) FILTER (
      WHERE l.quantity IS NOT NULL AND p.cost_price > 0
    ), 0)::text AS cogs,
    COUNT(*) FILTER (WHERE l.line_total IS NOT NULL AND (p.id IS NULL OR p.cost_price <= 0))::int AS missing_cost_items,
    COALESCE(SUM(l.line_total) FILTER (
      WHERE l.line_total IS NOT NULL AND (p.id IS NULL OR p.cost_price <= 0)
    ), 0)::text AS missing_cost_revenue
  FROM wholesale_lines l
  LEFT JOIN products p ON p.id = l.product_id
),
wholesale_snapshot_warnings AS (
  SELECT COUNT(*)::int AS malformed_count
  FROM wholesale_snapshots
  WHERE total IS NULL
),
period_ar_payments AS (
  SELECT COALESCE(SUM(p.amount_paid), 0)::text AS collected
  FROM ar_payments p
  LEFT JOIN wholesale_collection_reversals r ON r.collection_id = p.id
  WHERE r.id IS NULL
    AND (p.payment_date AT TIME ZONE 'Asia/Manila')::date >= $1::date
    AND (p.payment_date AT TIME ZONE 'Asia/Manila')::date < ($2::date + 1)
),
period_supplier_payments AS (
  SELECT COALESCE(SUM(amount_paid), 0)::text AS paid
  FROM supplier_payments
  WHERE (payment_date AT TIME ZONE 'Asia/Manila')::date >= $1::date
    AND (payment_date AT TIME ZONE 'Asia/Manila')::date < ($2::date + 1)
),
ar_history AS (
  SELECT
    p.ar_id,
    COALESCE(SUM(p.amount_paid) FILTER (WHERE r.id IS NULL), 0) AS recorded_paid,
    COUNT(*) FILTER (WHERE r.id IS NULL)::int AS payment_count
  FROM ar_payments p
  LEFT JOIN wholesale_collections c ON c.id = p.id
  LEFT JOIN wholesale_collection_reversals r ON r.collection_id = c.id
  GROUP BY p.ar_id
),
ar_facts AS (
  SELECT
    a.id,
    a.balance,
    a.due_date,
    a.total_owed,
    a.total_paid,
    COALESCE(h.recorded_paid, 0) AS recorded_paid,
    f.total AS sale_total,
    (
      f.total IS NOT NULL
      AND a.total_owed = f.total::numeric
      AND a.total_paid = COALESCE(h.recorded_paid, 0)
      AND a.balance = a.total_owed - COALESCE(h.recorded_paid, 0)
    ) AS reconciled
  FROM accounts_receivable a
  LEFT JOIN wholesale_fulfillments raw_f ON raw_f.ar_id = a.id
  LEFT JOIN wholesale_snapshots f ON f.fulfillment_id = raw_f.id
  LEFT JOIN ar_history h ON h.ar_id = a.id
),
ar_warnings AS (
  SELECT COUNT(*)::int AS missing_fulfillment_count
  FROM accounts_receivable a
  LEFT JOIN wholesale_fulfillments f ON f.ar_id = a.id
  WHERE f.id IS NULL
),
ap_history AS (
  SELECT
    ap_id,
    COALESCE(SUM(amount_paid), 0) AS recorded_paid,
    MAX((payment_date AT TIME ZONE 'Asia/Manila')::date) AS last_payment_date
  FROM supplier_payments
  GROUP BY ap_id
),
ap_facts AS (
  SELECT
    i.id AS invoice_id,
    a.balance,
    i.due_date,
    a.total_owed,
    a.total_paid,
    i.invoice_amount,
    i.is_paid,
    COALESCE(h.recorded_paid, 0) AS recorded_paid,
    (
      a.id IS NOT NULL
      AND i.invoice_amount = a.total_owed
      AND a.total_paid = COALESCE(h.recorded_paid, 0)
      AND a.balance = a.total_owed - COALESCE(h.recorded_paid, 0)
      AND i.is_paid = (a.balance = 0)
    ) AS reconciled
  FROM supplier_invoices i
  LEFT JOIN accounts_payable a ON a.invoice_id = i.id
  LEFT JOIN ap_history h ON h.ap_id = a.id
),
ap_warnings AS (
  SELECT COUNT(*)::int AS missing_payable_count
  FROM supplier_invoices i
  LEFT JOIN accounts_payable a ON a.invoice_id = i.id
  WHERE a.id IS NULL
),
ar_totals AS (
  SELECT
    COALESCE(SUM(balance) FILTER (WHERE reconciled), 0)::text AS outstanding,
    COALESCE(SUM(balance) FILTER (WHERE reconciled AND balance > 0 AND due_date < (now() AT TIME ZONE 'Asia/Manila')::date), 0)::text AS overdue,
    COUNT(*) FILTER (WHERE reconciled AND balance > 0 AND due_date < (now() AT TIME ZONE 'Asia/Manila')::date)::int AS overdue_count,
    COUNT(*) FILTER (WHERE NOT reconciled)::int AS review_count,
    COALESCE(SUM(balance) FILTER (WHERE NOT reconciled), 0)::text AS review_amount
  FROM ar_facts
),
ap_totals AS (
  SELECT
    COALESCE(SUM(balance) FILTER (WHERE reconciled), 0)::text AS outstanding,
    COALESCE(SUM(balance) FILTER (WHERE reconciled AND balance > 0 AND due_date < (now() AT TIME ZONE 'Asia/Manila')::date), 0)::text AS overdue,
    COUNT(*) FILTER (WHERE reconciled AND balance > 0 AND due_date < (now() AT TIME ZONE 'Asia/Manila')::date)::int AS overdue_count,
    COUNT(*) FILTER (WHERE NOT reconciled)::int AS review_count,
    COALESCE(SUM(balance) FILTER (WHERE NOT reconciled), 0)::text AS review_amount
  FROM ap_facts
)
SELECT
  retail.revenue AS retail_revenue,
  retail.cogs AS retail_cogs,
  retail.missing_cost_items AS retail_missing_cost_items,
  retail.missing_cost_revenue AS retail_missing_cost_revenue,
  wholesale_revenue.revenue AS wholesale_revenue,
  wholesale.cogs AS wholesale_cogs,
  wholesale.missing_cost_items AS wholesale_missing_cost_items,
  wholesale.missing_cost_revenue AS wholesale_missing_cost_revenue,
  wholesale_snapshot_warnings.malformed_count AS malformed_wholesale_snapshot_count,
  period_ar_payments.collected AS wholesale_collected,
  period_supplier_payments.paid AS supplier_paid,
  (now() AT TIME ZONE 'Asia/Manila')::date::text AS as_of,
  ar_totals.outstanding AS ar_outstanding,
  ar_totals.overdue AS ar_overdue,
  ar_totals.overdue_count AS ar_overdue_count,
  ar_totals.review_count AS ar_review_count,
  ar_totals.review_amount AS ar_review_amount,
  ar_warnings.missing_fulfillment_count AS ar_missing_fulfillment_count,
  ap_totals.outstanding AS ap_outstanding,
  ap_totals.overdue AS ap_overdue,
  ap_totals.overdue_count AS ap_overdue_count,
  ap_totals.review_count AS ap_review_count,
  ap_totals.review_amount AS ap_review_amount
  , ap_warnings.missing_payable_count AS ap_missing_payable_count
FROM retail, wholesale, wholesale_revenue, wholesale_snapshot_warnings,
  period_ar_payments, period_supplier_payments, ar_totals, ar_warnings, ap_totals,
  ap_warnings
`;

export async function readFinanceSummary(
  query: FinanceQuery,
  from: unknown,
  to: unknown,
) {
  const range = validateDateRange(from, to);
  const { rows: [row] } = await query(summarySql, [range.from, range.to]);

  const retailRevenue = moneyCents(row.retail_revenue);
  const wholesaleRevenue = moneyCents(row.wholesale_revenue);
  const retailCogs = moneyCents(row.retail_cogs);
  const wholesaleCogs = moneyCents(row.wholesale_cogs);
  const revenue = retailRevenue + wholesaleRevenue;
  const cogs = retailCogs + wholesaleCogs;
  const grossProfit = revenue - cogs;
  const missingCostItems =
    Number(row.retail_missing_cost_items ?? 0) +
    Number(row.wholesale_missing_cost_items ?? 0);
  const missingCostRevenue =
    moneyCents(row.retail_missing_cost_revenue) +
    moneyCents(row.wholesale_missing_cost_revenue);
  const arReviewCount = Number(row.ar_review_count ?? 0);
  const apReviewCount = Number(row.ap_review_count ?? 0);
  const arReviewAmount = moneyCents(row.ar_review_amount);
  const apReviewAmount = moneyCents(row.ap_review_amount);
  const malformedWholesaleSnapshots = Number(
    row.malformed_wholesale_snapshot_count ?? 0,
  );
  const arMissingFulfillmentCount = Number(
    row.ar_missing_fulfillment_count ?? 0,
  );
  const apMissingPayableCount = Number(row.ap_missing_payable_count ?? 0);
  const warnings: string[] = [];

  if (arReviewCount) {
    warnings.push(`${arReviewCount} receivable record(s) excluded from totals pending reconciliation.`);
  }
  if (apReviewCount) {
    warnings.push(`${apReviewCount} payable record(s) excluded from totals pending reconciliation.`);
  }
  if (missingCostItems) {
    warnings.push(
      `${missingCostItems} sold line item(s) have no positive cost and were excluded from cost of goods sold.`,
    );
  }
  if (malformedWholesaleSnapshots) {
    warnings.push(
      `${malformedWholesaleSnapshots} delivered wholesale fulfillment snapshot(s) were excluded because their structure is invalid.`,
    );
  }
  if (arMissingFulfillmentCount) {
    warnings.push(
      `${arMissingFulfillmentCount} receivable record(s) have no delivered wholesale fulfillment.`,
    );
  }
  if (apMissingPayableCount) {
    warnings.push(
      `${apMissingPayableCount} supplier invoice(s) have no payable record.`,
    );
  }

  return {
    success: true,
    from: range.from,
    to: range.to,
    asOf: String(row.as_of),
    revenue: {
      retail: money(retailRevenue),
      wholesale: money(wholesaleRevenue),
      total: money(revenue),
    },
    costOfGoodsSold: money(cogs),
    grossProfit: money(grossProfit),
    grossMargin: revenue === 0n ? null : Number(grossProfit) / Number(revenue),
    cashCollected: money(retailRevenue + moneyCents(row.wholesale_collected)),
    cashPaid: money(moneyCents(row.supplier_paid)),
    accountsReceivable: {
      outstanding: money(moneyCents(row.ar_outstanding)),
      overdue: money(moneyCents(row.ar_overdue)),
      overdueCount: Number(row.ar_overdue_count ?? 0),
      needsReviewCount: arReviewCount,
      needsReviewAmount: money(arReviewAmount),
    },
    accountsPayable: {
      outstanding: money(moneyCents(row.ap_outstanding)),
      overdue: money(moneyCents(row.ap_overdue)),
      overdueCount: Number(row.ap_overdue_count ?? 0),
      needsReviewCount: apReviewCount,
      needsReviewAmount: money(apReviewAmount),
    },
    itemsMissingCost: {
      count: missingCostItems,
      // This is missing-cost line subtotal before transaction-level discounts.
      affectedRevenue: money(missingCostRevenue),
    },
    warnings,
    costBasis: "current-product-cost-excluding-missing-cost-lines",
    operatingExpensesIncluded: false,
    operatingExpensesNote:
      "Operating expenses are not included; this metric is cost of goods sold only.",
    balanceScope: "current-as-of-asOf-not-from-to",
  };
}

export const financeQuery = queryDb as FinanceQuery;
