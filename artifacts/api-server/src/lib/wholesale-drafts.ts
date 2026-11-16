import { randomUUID } from "node:crypto";
import {
  calculateRetailLine,
  pharmacyDate,
  wholesalePaymentPlanSchema,
  wholesaleClientContactsSchema,
  type WholesalePaymentPlan,
} from "@workspace/api-zod";
import type { AuditActor } from "./audit-events";
import {
  WholesaleError,
  requireUuid,
  wholesaleMoney,
  cents,
  money,
  wholesaleAudit as audit,
  createWholesaleOperation,
  type WholesaleQuery as Query,
  type WholesaleTransaction as Transaction,
} from "./wholesale-operations";
export {
  WholesaleError,
  requireUuid,
  wholesaleMoney,
} from "./wholesale-operations";

type DraftInput = {
  clientId: string;
  paymentPlan: WholesalePaymentPlan | null;
  lines: Array<{ productId: string; quantity: number }>;
};
const maxMoney = 999999999999n;
const contactFields = ["contactPerson", "contactNumber", "email"] as const;
function clientContacts(input: any) {
  const parsed = wholesaleClientContactsSchema.safeParse(input);
  if (!parsed.success)
    throw new WholesaleError(400, parsed.error.issues[0].message);
  return parsed.data;
}

function parseDraft(value: any): DraftInput {
  if (
    !value ||
    Object.keys(value).some(
      (key) => !["clientId", "lines", "paymentPlan"].includes(key),
    )
  ) {
    throw new WholesaleError(
      400,
      "Only a client, payment plan and product quantities can be submitted.",
    );
  }
  const clientId = requireUuid(value.clientId);
  const plan = wholesalePaymentPlanSchema
    .nullable()
    .safeParse(value.paymentPlan ?? null);
  if (!plan.success) throw new WholesaleError(400, "Choose Net-30 or Net-60.");
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
  return { clientId, paymentPlan: plan.data, lines };
}

export function createWholesaleDrafts(read: Query, transaction: Transaction) {
  const operation = createWholesaleOperation(transaction);
  return {
    async catalog() {
      const { rows } = await read(
        `SELECT p.id,p.sku,p.product_name AS name,p.wholesale_price::text AS "wholesalePrice",
        p.is_vat_exempt AS "isVatExempt",
        COALESCE((SELECT sum(b.quantity_remaining) FROM batch_info b WHERE b.product_id=p.id),0)::int AS "physicalStock",
        COALESCE((SELECT sum(r.quantity) FROM wholesale_reservations r JOIN batch_info b ON b.id=r.batch_id
          WHERE b.product_id=p.id AND r.released_at IS NULL AND r.consumed_at IS NULL),0)::int AS "reservedStock",
        COALESCE((SELECT sum(GREATEST(0,b.quantity_remaining-COALESCE(r.quantity,0)))
          FROM batch_info b LEFT JOIN (
            SELECT batch_id,sum(quantity) AS quantity FROM wholesale_reservations
            WHERE released_at IS NULL AND consumed_at IS NULL GROUP BY batch_id
          ) r ON r.batch_id=b.id
          WHERE b.product_id=p.id AND b.expiration_date >= $1::date),0)::int AS "availableStock"
        FROM products p ORDER BY p.product_name,p.id`,
        [pharmacyDate()],
      );
      return rows;
    },
    async clients() {
      return (
        await read(`SELECT id,client_name AS name,
        address,contact_person AS "contactPerson",contact_number AS "contactNumber",email
        FROM wholesale_clients ORDER BY client_name,id`)
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
        Object.keys(input).some(
          (field) => !["name", "address", ...contactFields].includes(field),
        )
      ) {
        throw new WholesaleError(
          400,
          "Enter a client name (up to 255 characters) and a valid address.",
        );
      }
      const payload = {
        name: input.name.trim(),
        address: input.address?.trim() || "",
        ...clientContacts(input),
      };
      return operation(
        actor,
        key,
        { action: "client", ...payload },
        async (query) => {
          const {
            rows: [client],
          } = await query(
            `INSERT INTO wholesale_clients(client_name,address,contact_person,contact_number,email)
             VALUES($1,$2,$3,$4,$5) RETURNING id,client_name AS name,address,
             contact_person AS "contactPerson",contact_number AS "contactNumber",email`,
            [
              payload.name,
              payload.address || null,
              payload.contactPerson,
              payload.contactNumber,
              payload.email,
            ],
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
    async updateClient(
      actor: AuditActor,
      key: unknown,
      clientId: unknown,
      input: any,
    ) {
      const id = requireUuid(clientId);
      if (
        typeof input?.name !== "string" ||
        !input.name.trim() ||
        input.name.trim().length > 255 ||
        typeof input?.address !== "string" ||
        input.address.length > 2000 ||
        Object.keys(input).some(
          (field) =>
            !["name", "address", "expected", ...contactFields].includes(field),
        ) ||
        typeof input?.expected?.name !== "string" ||
        contactFields.some(
          (field) =>
            input.expected[field] !== null &&
            typeof input.expected[field] !== "string",
        ) ||
        !(
          input.expected.address === null ||
          typeof input.expected.address === "string"
        )
      ) {
        throw new WholesaleError(400, "Enter a valid client name and address.");
      }
      const name = input.name.trim();
      const address = input.address.trim() || null;
      const contacts = clientContacts(input);
      return operation(
        actor,
        key,
        {
          action: "update-client",
          id,
          name,
          address,
          ...contacts,
          expected: input.expected,
        },
        async (query) => {
          const {
            rows: [client],
          } = await query(
            `SELECT client_name,address,contact_person AS "contactPerson",contact_number AS "contactNumber",email
             FROM wholesale_clients WHERE id=$1 FOR UPDATE`,
            [id],
          );
          if (!client) throw new WholesaleError(404, "Client not found.");
          if (
            client.client_name !== input.expected.name ||
            client.address !== input.expected.address ||
            contactFields.some(
              (field) => client[field] !== input.expected[field],
            )
          ) {
            throw new WholesaleError(
              409,
              "This client changed. Refresh before editing.",
            );
          }
          await query(
            "UPDATE wholesale_clients SET client_name=$2,address=$3,contact_person=$4,contact_number=$5,email=$6 WHERE id=$1",
            [
              id,
              name,
              address,
              contacts.contactPerson,
              contacts.contactNumber,
              contacts.email,
            ],
          );
          await audit(
            query,
            actor,
            "WHOLESALE_CLIENT_UPDATED",
            "Updated client " + id,
          );
          return { id, name, address, ...contacts };
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
    async orders(orderId?: string) {
      const id = orderId ? requireUuid(orderId) : null;
      return (
        await read(
          `SELECT o.id,o.order_number AS "orderNumber",o.draft_revision AS revision,
        o.status,o.client_id AS "clientId",COALESCE(o.confirmation_snapshot->>'clientName',c.client_name) AS "clientName",o.total_order_amount::text AS total,
        o.updated_at AS "updatedAt",o.payment_plan AS "paymentPlan",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('productId',i.product_id,'quantity',i.quantity,
          'unitPrice',i.unit_price::text,'name',p.product_name) ORDER BY i.id)
          FROM wholesale_order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id),'[]'::jsonb) AS lines
        FROM wholesale_orders o JOIN wholesale_clients c ON c.id=o.client_id
        WHERE o.draft_revision IS NOT NULL AND ($1::uuid IS NULL OR o.id=$1) ORDER BY o.updated_at DESC,o.id DESC LIMIT 200`,
          [id],
        )
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
              `INSERT INTO wholesale_orders(id,client_id,order_number,draft_revision,created_by,total_order_amount,payment_plan)
            VALUES($1,$2,'WS-' || nextval('wholesale_order_number_seq')::text,1,$3,$4,$5)`,
              [
                savedId,
                draft.clientId,
                actor.id,
                money(total),
                draft.paymentPlan,
              ],
            );
          } else {
            await query(
              `UPDATE wholesale_orders SET client_id=$2,total_order_amount=$3,
            draft_revision=draft_revision+1,payment_plan=$4 WHERE id=$1`,
              [id, draft.clientId, money(total), draft.paymentPlan],
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
