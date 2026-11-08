import type { WholesaleQuery } from "./wholesale-operations";

export async function reservedByBatch(
  query: WholesaleQuery,
  productIds: string[],
) {
  const { rows } = await query(
    `SELECT r.batch_id, sum(r.quantity)::text AS quantity
      FROM wholesale_reservations r JOIN batch_info b ON b.id=r.batch_id
      WHERE b.product_id=ANY($1::uuid[]) AND r.released_at IS NULL AND r.consumed_at IS NULL
      GROUP BY r.batch_id`,
    [productIds],
  );
  return new Map<string, number>(
    rows.map((row) => [row.batch_id, Number(row.quantity)]),
  );
}
export function freeBatchQuantity(
  batch: { id: string; quantity_remaining: number },
  reserved: Map<string, number>,
) {
  return Math.max(
    0,
    Number(batch.quantity_remaining) - (reserved.get(batch.id) ?? 0),
  );
}
