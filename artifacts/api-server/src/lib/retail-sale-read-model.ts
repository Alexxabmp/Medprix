import type { Query } from "./atomic-checkout";
const peso = (value: unknown) => `₱${Number(value).toFixed(2)}`;
export async function readRetailSales(
  query: Query,
  actor?: { id: string; role: string },
  id?: string,
) {
  const result = await query(
    `SELECT t.*,r.receipt_number,r.merchant_name_at_issue,
    COALESCE((SELECT jsonb_agg(lines ORDER BY lines.product_id) FROM (
      SELECT product_id,product_name_at_sale AS product,is_vat_exempt_at_sale,vat_rate_at_sale::text AS vat_rate,unit_price_at_sale::text AS unit_price,
        sum(quantity)::int AS quantity,sum(subtotal)::text AS subtotal,sum(vat_amount)::text AS vat,
        sum(discount_amount)::text AS discount,sum(net_amount)::text AS net,
        (sum(subtotal)-sum(discount_amount)-sum(net_amount))::text AS relief
      FROM transaction_items WHERE transaction_id=t.id
      GROUP BY product_id,product_name_at_sale,unit_price_at_sale,is_vat_exempt_at_sale,vat_rate_at_sale
    ) lines),'[]'::jsonb) AS receipt_items
    FROM transactions t JOIN receipts r ON r.transaction_id=t.id
    WHERE ($1::uuid IS NULL OR t.id=$1)
      AND ($2::uuid IS NULL OR t.cashier_id=$2)
    ORDER BY t.created_at DESC,t.id`,
    [id ?? null, actor && actor.role !== "Admin" ? actor.id : null],
  );
  return result.rows.map((row) => ({
    id: row.id,
    source: row.calculation_version
      ? "canonical-retail"
      : "historical-normalized",
    createdAt: row.created_at,
    transactionNumber: row.receipt_number,
    dateTime: new Date(row.transaction_date).toISOString(),
    user: row.cashier_name_at_sale ?? "Cashier name not recorded",
    businessType: "Retail",
    customer: "Walk-in Customer",
    total: peso(row.net_amount),
    subtotal: peso(row.gross_amount),
    discount: peso(row.total_discount),
    vat: peso(row.vat_amount),
    vatRelief: row.calculation_version
      ? peso(
          Number(row.gross_amount) -
            Number(row.total_discount) -
            Number(row.net_amount),
        )
      : undefined,
    amountReceived: peso(row.amount_tendered),
    change: peso(row.change_amount),
    payment: row.payment_method,
    status: row.status,
    merchantNameAtIssue: row.merchant_name_at_issue ?? "Merchant name not recorded",
    calculationVersion: row.calculation_version,
    items: row.receipt_items.map((item: any) => ({
      productId: item.product_id,
      product: item.product ?? "Historical product name not recorded",
      isVatExempt: item.is_vat_exempt_at_sale,
      vatRate: item.vat_rate,
      quantity: item.quantity,
      unitPrice: peso(item.unit_price),
      subtotal: peso(item.subtotal),
      vat: item.vat === null ? undefined : peso(item.vat),
      discount: item.discount === null ? undefined : peso(item.discount),
      net: item.net === null ? undefined : peso(item.net),
      vatRelief: item.relief === null ? undefined : peso(item.relief),
    })),
  }));
}
