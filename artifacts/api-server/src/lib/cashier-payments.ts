import { readRetailSales } from "./retail-sale-read-model";
type Query = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

export class PaymentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function paymentFromRow(row: any) {
  return {
    id: Number(row.id),
    source: "legacy-cashier" as const,
    createdAt: row.created_at,
    transactionNumber: row.transaction_number,
    dateTime: row.date_time,
    user: row.user_name,
    businessType: row.business_type,
    customer: row.customer,
    total: row.total,
    subtotal: row.subtotal,
    discount: row.discount,
    vat: row.vat,
    amountReceived: row.amount_received,
    change: row.change,
    payment: row.payment,
    status: row.status,
    items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
  };
}

// Storage readiness is checked centrally by @workspace/db. Reads never repair schema.
export function createPaymentStore(query: Query) {
  async function list(actor?: { id: string; role: string }) {
    const result =
      actor && actor.role !== "Admin"
        ? await query(
            "SELECT * FROM cashier_transactions WHERE (CASE WHEN jsonb_typeof(checkout_payload)='string' THEN (checkout_payload #>> '{}')::jsonb ELSE checkout_payload END)->>'userId'=$1 ORDER BY id DESC",
            [actor.id],
          )
        : await query("SELECT * FROM cashier_transactions ORDER BY id DESC");
    const canonical = await readRetailSales(query, actor);
    return [...canonical, ...result.rows.map(paymentFromRow)].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return { list };
}
