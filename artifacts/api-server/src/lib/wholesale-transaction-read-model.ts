import type { Query } from "./atomic-checkout";

const peso = (value: unknown) => `₱${Number(value ?? 0).toFixed(2)}`;
const PLAN_LABEL: Record<string, string> = { Net30: "Net 30 credit", Net60: "Net 60 credit" };
/** Wholesale order status → the status words System Admin's transaction list already uses. */
const STATUS: Record<string, "Completed" | "Pending" | "Cancelled"> = {
  Delivered: "Completed", Cancelled: "Cancelled", Pending: "Pending", Confirmed: "Pending", Processing: "Pending",
};

/**
 * Front desk's wholesale orders, shaped like System Admin's retail transactions (backlog story 9: "view the transactions
 * made by the front desk from the wholesale business and the cashier from the retail business"). Read-only; Admin only.
 */
export async function readWholesaleTransactions(query: Query, id?: string) {
  const { rows } = await query(
    `SELECT o.id, o.order_number, o.order_date, o.status::text AS status, o.payment_plan::text AS payment_plan,
        o.total_order_amount::text AS total, c.client_name,
        COALESCE(u.full_name, u.username) AS created_by_name,
        ar.total_paid::text AS paid, ar.balance::text AS balance,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('product', COALESCE(p.product_name, 'Product'), 'quantity', i.quantity,
            'unitPrice', i.unit_price::text, 'subtotal', i.line_total::text) ORDER BY p.product_name)
          FROM wholesale_order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id = o.id), '[]'::jsonb) AS items
      FROM wholesale_orders o
      JOIN wholesale_clients c ON c.id = o.client_id
      LEFT JOIN users u ON u.id = o.created_by
      LEFT JOIN accounts_receivable ar ON ar.order_id = o.id
      WHERE ($1::uuid IS NULL OR o.id = $1)
      ORDER BY o.order_date DESC, o.id`,
    [id ?? null],
  );
  return rows.map((row: any) => ({
    id: row.id,
    source: "wholesale-order",
    transactionNumber: row.order_number ?? `WO-${String(row.id).slice(0, 8).toUpperCase()}`,
    dateTime: new Date(row.order_date).toISOString(),
    user: row.created_by_name ?? "Front desk (not recorded)",
    businessType: "Wholesale" as const,
    customer: row.client_name,
    total: peso(row.total),
    subtotal: peso(row.total),
    discount: peso(0),
    vat: peso(0),
    amountReceived: peso(row.paid ?? 0),
    change: peso(0),
    balance: row.balance === null ? undefined : peso(row.balance),
    payment: PLAN_LABEL[row.payment_plan] ?? "Credit terms",
    status: STATUS[row.status] ?? "Pending",
    wholesaleStatus: row.status,
    items: (row.items as any[]).map(item => ({
      product: item.product, quantity: Number(item.quantity), unitPrice: peso(item.unitPrice), subtotal: peso(item.subtotal),
    })),
  }));
}
