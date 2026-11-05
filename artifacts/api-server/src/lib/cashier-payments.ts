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

// Canonical UUID history only; readiness is read-only and checked by @workspace/db.
export function createPaymentStore(query: Query) {
  return {
    list: (actor?: { id: string; role: string }) =>
      readRetailSales(query, actor),
  };
}
