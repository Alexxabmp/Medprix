import type { Query } from "./atomic-checkout";

interface StockDiscrepancy {
  product_id: string;
  sku: string;
  current_stock: number;
  physical: string;
  dated_before_today: string;
}

interface MovementDiscrepancy {
  movement_id: string;
  product_id: string;
  batch_id: string | null;
  finding: "missing_batch_link" | "batch_product_mismatch";
}

/** Read-only diagnostics. Physical stock includes expired lots; this does not define POS eligibility. */
export async function auditStockConsistency(
  query: Query,
  today = new Date().toISOString().slice(0, 10),
) {
  const { rows: products }: { rows: StockDiscrepancy[] } = await query(
    `
    WITH quantities AS (
      SELECT
        product_id,
        sum(quantity_remaining)::text AS physical,
        COALESCE(sum(quantity_remaining) FILTER (
          WHERE expiration_date < $1::date
        ), 0)::text AS dated_before_today
      FROM batch_info
      GROUP BY product_id
    )
    SELECT
      p.id AS product_id, p.sku, p.current_stock,
      COALESCE(q.physical, '0') AS physical,
      COALESCE(q.dated_before_today, '0') AS dated_before_today
    FROM products p
    LEFT JOIN quantities q ON q.product_id = p.id
    WHERE p.current_stock::bigint <> COALESCE(q.physical, '0')::bigint
    ORDER BY p.sku, p.id
  `,
    [today],
  );
  const { rows: movements }: { rows: MovementDiscrepancy[] } = await query(`
    SELECT
      m.id AS movement_id, m.product_id, m.batch_id,
      CASE WHEN m.batch_id IS NULL THEN 'missing_batch_link'
        ELSE 'batch_product_mismatch' END AS finding
    FROM stock_movements m
    LEFT JOIN batch_info b ON b.id = m.batch_id
    WHERE m.batch_id IS NULL OR b.product_id <> m.product_id
    ORDER BY m.id
  `);
  return {
    productsNeedingReview: products.length,
    products,
    movementsNeedingReview: movements.length,
    movements,
  };
}
