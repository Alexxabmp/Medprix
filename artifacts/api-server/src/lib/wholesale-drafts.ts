import { randomUUID } from "node:crypto";
import { calculateRetailLine } from "@workspace/api-zod";
import { writeAuditEvent, type AuditActor } from "./audit-events";

type Query = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
type DraftInput = {
  clientId: string;
  lines: Array<{ productId: string; quantity: number }>;
};
export class WholesaleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxMoney = 999999999999n;

export function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) {
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
function cents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function money(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
function parseDraft(value: any): DraftInput {
  if (
    !value ||
    Object.keys(value).some((key) => !["clientId", "lines"].includes(key))
  ) {
    throw new WholesaleError(
      400,
      "Only a client and product quantities can be submitted.",
    );
  }
  const clientId = requireUuid(value.clientId);
  if (
    !Array.isArray(value.lines) ||
    !value.lines.length ||
    value.lines.length > 100
  ) {
    throw new WholesaleError(400, "Add between 1 and 100 product lines.");
  }
  const lines = value.lines
    .map((line: any) => {
      if (
        !line ||
        Object.keys(line).some(
          (key) => !["productId", "quantity"].includes(key),
        )
      ) {
        throw new WholesaleError(400, "Prices are controlled by the server.");
      }
      const productId = requireUuid(line.productId);
      if (
        !Number.isSafeInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 1000000
      ) {
        throw new WholesaleError(
          400,
          "Quantity must be a whole number between 1 and 1,000,000.",
        );
      }
      return { productId, quantity: line.quantity };
    })
    .sort((a: DraftInput["lines"][number], b: DraftInput["lines"][number]) =>
      a.productId.localeCompare(b.productId),
    );
  if (
    new Set(lines.map((line: DraftInput["lines"][number]) => line.productId))
      .size !== lines.length
  ) {
    throw new WholesaleError(400, "Combine duplicate products into one line.");
  }
  return { clientId, lines };
}

export function createWholesaleDrafts(read: Query, transaction: Transaction) {
  async function audit(
    query: Query,
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
  async function operation<T>(
    actor: AuditActor,
    key: unknown,
    payload: unknown,
    work: (query: Query) => Promise<T>,
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
  }
  return {
    async catalog() {
      const { rows } =
        await read(`SELECT id,sku,product_name AS name,wholesale_price::text AS "wholesalePrice",
        is_vat_exempt AS "isVatExempt" FROM products ORDER BY product_name,id`);
      return rows;
    },
    async clients() {
      return (
        await read(`SELECT id,client_name AS name,
        address FROM wholesale_clients ORDER BY client_name,id`)
      ).rows;
    },
    async createClient(actor: AuditActor, key: unknown, input: any) {
      if (
        !input ||
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.trim().length > 255 ||
        (input.address !== undefined &&
          (typeof input.address !== "string" || input.address.length > 2000)) ||
        Object.keys(input).some((field) => !["name", "address"].includes(field))
      ) {
        throw new WholesaleError(
          400,
          "Enter a client name (up to 255 characters) and a valid address.",
        );
      }
      const payload = {
        name: input.name.trim(),
        address: input.address?.trim() || "",
      };
      return operation(
        actor,
        key,
        { action: "client", ...payload },
        async (query) => {
          const {
            rows: [client],
          } = await query(
            "INSERT INTO wholesale_clients(client_name,address) VALUES($1,$2) RETURNING id,client_name AS name,address",
            [payload.name, payload.address || null],
          );
          await audit(
            query,
            actor,
            "WHOLESALE_CLIENT_CREATED",
            "Created client " + client.id,
          );
          return client;
        },
      );
    },
    async setPrice(
      actor: AuditActor,
      key: unknown,
      productId: unknown,
      input: any,
    ) {
      if (actor.role !== "Admin")
        throw new WholesaleError(
          403,
          "Only Admin can maintain wholesale prices.",
        );
      const id = requireUuid(productId);
      if (
        !input ||
        Object.keys(input).some(
          (field) => !["wholesalePrice", "expectedPrice"].includes(field),
        )
      ) {
        throw new WholesaleError(
          400,
          "Enter the wholesale price and its previous value.",
        );
      }
      const price =
        input.wholesalePrice === null
          ? null
          : wholesaleMoney(input.wholesalePrice);
      const previous =
        input.expectedPrice === null
          ? null
          : wholesaleMoney(input.expectedPrice);
      return operation(
        actor,
        key,
        { action: "price", id, price, previous },
        async (query) => {
          const {
            rows: [product],
          } = await query(
            "SELECT wholesale_price::text AS price FROM products WHERE id=$1 FOR UPDATE",
            [id],
          );
          if (!product) throw new WholesaleError(404, "Product not found.");
          if (product.price !== previous)
            throw new WholesaleError(
              409,
              "This price changed. Refresh before saving.",
            );
          await query("UPDATE products SET wholesale_price=$2 WHERE id=$1", [
            id,
            price,
          ]);
          await audit(
            query,
            actor,
            "WHOLESALE_PRICE_CHANGED",
            `Product ${id}: ${previous ?? "unset"} to ${price ?? "unset"}`,
          );
          return { id, wholesalePrice: price };
        },
      );
    },
    async orders() {
      return (
        await read(`SELECT o.id,o.order_number AS "orderNumber",o.draft_revision AS revision,
        o.status,o.client_id AS "clientId",c.client_name AS "clientName",o.total_order_amount::text AS total,
        o.updated_at AS "updatedAt",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('productId',i.product_id,'quantity',i.quantity,
          'unitPrice',i.unit_price::text,'name',p.product_name) ORDER BY i.id)
          FROM wholesale_order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id),'[]'::jsonb) AS lines
        FROM wholesale_orders o JOIN wholesale_clients c ON c.id=o.client_id
        WHERE o.draft_revision IS NOT NULL ORDER BY o.updated_at DESC,o.id DESC LIMIT 200`)
      ).rows;
    },
    async save(
      actor: AuditActor,
      key: unknown,
      input: unknown,
      orderId?: string,
      revision?: number,
    ) {
      const draft = parseDraft(input);
      const id = orderId ? requireUuid(orderId) : null;
      if (id && (!Number.isSafeInteger(revision) || revision! < 1)) {
        throw new WholesaleError(
          400,
          "The current draft revision is required.",
        );
      }
      return operation(
        actor,
        key,
        { action: "draft", id, revision: revision ?? null, ...draft },
        async (query) => {
          if (id) {
            const {
              rows: [order],
            } = await query(
              "SELECT * FROM wholesale_orders WHERE id=$1 FOR UPDATE",
              [id],
            );
            if (!order || order.draft_revision === null)
              throw new WholesaleError(404, "Draft not found.");
            if (
              order.status !== "Pending" ||
              order.draft_revision !== revision
            ) {
              throw new WholesaleError(
                409,
                "This draft changed. Reload it before editing.",
              );
            }
          }
          if (
            !(
              await query(
                "SELECT id FROM wholesale_clients WHERE id=$1 FOR KEY SHARE",
                [draft.clientId],
              )
            ).rows.length
          ) {
            throw new WholesaleError(404, "Client not found.");
          }
          const products = (
            await query(
              "SELECT id,wholesale_price::text AS price,is_vat_exempt FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
              [draft.lines.map((line) => line.productId)],
            )
          ).rows;
          let total = 0n;
          let vat: bigint | null = 0n;
          const lines = draft.lines.map((line) => {
            const product = products.find((item) => item.id === line.productId);
            if (!product || product.price === null) {
              throw new WholesaleError(
                409,
                "Configure a wholesale price for every selected product first.",
              );
            }
            const amount = calculateRetailLine(
              cents(product.price),
              line.quantity,
              product.is_vat_exempt === true,
              false,
            );
            total += amount.net;
            if (product.is_vat_exempt === null) vat = null;
            else if (vat !== null) vat += amount.vat;
            if (total > maxMoney)
              throw new WholesaleError(
                400,
                "The order total exceeds the supported amount.",
              );
            return {
              ...line,
              unitPrice: product.price,
              total: money(amount.net),
            };
          });
          const savedId = id ?? randomUUID();
          if (!id) {
            await query(
              `INSERT INTO wholesale_orders(id,client_id,order_number,draft_revision,created_by,total_order_amount)
            VALUES($1,$2,'WS-' || nextval('wholesale_order_number_seq')::text,1,$3,$4)`,
              [savedId, draft.clientId, actor.id, money(total)],
            );
          } else {
            await query(
              `UPDATE wholesale_orders SET client_id=$2,total_order_amount=$3,
            draft_revision=draft_revision+1 WHERE id=$1`,
              [id, draft.clientId, money(total)],
            );
            await query("DELETE FROM wholesale_order_items WHERE order_id=$1", [
              id,
            ]);
          }
          for (const line of lines) {
            await query(
              `INSERT INTO wholesale_order_items(order_id,product_id,quantity,unit_price,line_total)
            VALUES($1,$2,$3,$4,$5)`,
              [
                savedId,
                line.productId,
                line.quantity,
                line.unitPrice,
                line.total,
              ],
            );
          }
          await audit(
            query,
            actor,
            "WHOLESALE_DRAFT_SAVED",
            "Saved draft " + savedId,
          );
          return {
            id: savedId,
            revision: (revision ?? 0) + 1,
            total: money(total),
            vat: vat === null ? null : money(vat),
          };
        },
      );
    },
  };
}
