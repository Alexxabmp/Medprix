import { writeAuditEvent, type AuditActor } from "./audit-events";

export type WholesaleQuery = (
  sql: string,
  params?: any[],
) => Promise<{ rows: any[] }>;
export type WholesaleTransaction = <T>(
  work: (query: WholesaleQuery) => Promise<T>,
) => Promise<T>;
export class WholesaleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new WholesaleError(400, "A valid record identifier is required.");
  }
  return value.toLowerCase();
}
export function wholesaleMoney(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
    throw new WholesaleError(
      400,
      "Enter an amount with at most two decimal places.",
    );
  }
  return Number(value).toFixed(2);
}
export function cents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function money(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
export async function wholesaleAudit(
  query: WholesaleQuery,
  actor: AuditActor,
  action: string,
  description: string,
) {
  await writeAuditEvent(query, {
    actor,
    action,
    activity: action,
    module: "Wholesale",
    description,
  });
}
export function createWholesaleOperation(transaction: WholesaleTransaction) {
  return async function operation<T>(
    actor: AuditActor,
    key: unknown,
    payload: unknown,
    work: (query: WholesaleQuery) => Promise<T>,
  ) {
    const id = requireUuid(key);
    return transaction(async (query) => {
      await query(
        "INSERT INTO wholesale_operations(id,actor_id,payload) VALUES($1,$2,$3::text::jsonb) ON CONFLICT DO NOTHING",
        [id, actor.id, JSON.stringify(payload)],
      );
      const {
        rows: [saved],
      } = await query(
        "SELECT *,payload=$2::text::jsonb AS matches FROM wholesale_operations WHERE id=$1 FOR UPDATE",
        [id, JSON.stringify(payload)],
      );
      if (saved.actor_id !== actor.id || !saved.matches) {
        throw new WholesaleError(
          409,
          "This request identifier belongs to a different operation.",
        );
      }
      if (saved.result !== null) return saved.result as T;
      const result = await work(query);
      await query(
        "UPDATE wholesale_operations SET result=$2::text::jsonb WHERE id=$1",
        [id, JSON.stringify(result)],
      );
      return result;
    });
  };
}
