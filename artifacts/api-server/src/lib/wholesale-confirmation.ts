import { pharmacyDate, calculateRetailLine } from "@workspace/api-zod";
import type { AuditActor } from "./audit-events";
import {
  WholesaleError,
  requireUuid,
  wholesaleMoney,
  cents,
  money,
  wholesaleAudit,
  createWholesaleOperation,
  type WholesaleQuery,
  type WholesaleTransaction,
} from "./wholesale-operations";
import { reservedByBatch, freeBatchQuantity } from "./reserved-stock";

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new WholesaleError(400, "The current order revision is required.");
  return Number(value);
}
function reason(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 500) {
    throw new WholesaleError(400, "Enter a reason of up to 500 characters.");
  }
  return value.trim();
}
async function lockOrder(
  query: WholesaleQuery,
  id: string,
  expected: number,
  statuses: string[],
) {
  const {
    rows: [order],
  } = await query("SELECT * FROM wholesale_orders WHERE id=$1 FOR UPDATE", [
    id,
  ]);
  if (!order || order.draft_revision === null)
    throw new WholesaleError(404, "Order not found.");
  if (order.draft_revision !== expected || !statuses.includes(order.status)) {
    throw new WholesaleError(
      409,
      "This order changed. Refresh and review it before continuing.",
    );
  }
  return order;
}
async function priceBinding(
  query: WholesaleQuery,
  orderId: string,
  productId: string,
) {
  const {
    rows: [line],
  } = await query(
    `SELECT i.quantity,i.unit_price::text AS original_price,p.wholesale_price::text AS default_price,
      p.is_vat_exempt FROM wholesale_order_items i JOIN products p ON p.id=i.product_id
      WHERE i.order_id=$1 AND i.product_id=$2 FOR SHARE OF p`,
    [orderId, productId],
  );
  if (
    !line ||
    line.default_price === null ||
    line.original_price !== line.default_price
  ) {
    throw new WholesaleError(
      409,
      "The default price changed or is unconfigured. Save the draft again before requesting approval.",
    );
  }
  return line;
}

export function createWholesaleConfirmation(
  read: WholesaleQuery,
  transaction: WholesaleTransaction,
) {
  const operation = createWholesaleOperation(transaction);
  return {
    async detail(orderId: unknown) {
      const id = requireUuid(orderId);
      const {
        rows: [order],
      } = await read(
        `SELECT id,confirmation_snapshot AS snapshot FROM wholesale_orders
          WHERE id=$1 AND draft_revision IS NOT NULL`,
        [id],
      );
      if (!order) throw new WholesaleError(404, "Order not found.");
      const { rows: overrides } = await read(
        `SELECT r.id,r.product_id AS "productId",r.order_revision AS revision,r.requested_price::text AS price,
          r.reason,r.approval_reason AS "approvalReason",r.approved_by AS "approvedBy",r.binding,
          u.full_name AS "approvedByName"
          FROM wholesale_price_overrides r LEFT JOIN users u ON u.id=r.approved_by
          WHERE r.order_id=$1 ORDER BY r.requested_at,r.id`,
        [id],
      );
      const { rows: reservations } = await read(
        `SELECT r.id,r.quantity,r.batch_number_at_reservation AS "batchNumber",r.expiry_at_reservation::text AS expiry,
          p.product_name AS product,r.released_at AS "releasedAt",r.consumed_at AS "consumedAt"
          FROM wholesale_reservations r JOIN batch_info b ON b.id=r.batch_id
          JOIN products p ON p.id=b.product_id WHERE r.order_id=$1 ORDER BY p.id,b.expiration_date,b.id`,
        [id],
      );
      return { snapshot: order.snapshot, overrides, reservations };
    },
    async requestOverride(
      actor: AuditActor,
      key: unknown,
      orderId: unknown,
      input: any,
    ) {
      const id = requireUuid(orderId);
      const expected = revision(input?.revision);
      const productId = requireUuid(input?.productId);
      const price = wholesaleMoney(input?.price);
      const explanation = reason(input?.reason);
      return operation(
        actor,
        key,
        {
          action: "request-override",
          id,
          expected,
          productId,
          price,
          explanation,
        },
        async (query) => {
          await lockOrder(query, id, expected, ["Pending"]);
          const binding = await priceBinding(query, id, productId);
          const {
            rows: [request],
          } = await query(
            `INSERT INTO wholesale_price_overrides(order_id,product_id,order_revision,binding,requested_price,reason,requested_by)
            VALUES($1,$2,$3,$4::text::jsonb,$5,$6,$7) RETURNING id`,
            [
              id,
              productId,
              expected,
              JSON.stringify(binding),
              price,
              explanation,
              actor.id,
            ],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_OVERRIDE_REQUESTED",
            "Order " + id + "; request " + request.id,
          );
          return request;
        },
      );
    },
    async approveOverride(
      actor: AuditActor,
      key: unknown,
      overrideId: unknown,
      input: any,
    ) {
      if (actor.role !== "Admin")
        throw new WholesaleError(
          403,
          "Only Admin may approve a price override.",
        );
      const id = requireUuid(overrideId);
      const explanation = reason(input?.reason);
      return operation(
        actor,
        key,
        { action: "approve-override", id, explanation },
        async (query) => {
          const {
            rows: [request],
          } = await query(
            "SELECT * FROM wholesale_price_overrides WHERE id=$1",
            [id],
          );
          if (!request)
            throw new WholesaleError(404, "Override request not found.");
          await lockOrder(query, request.order_id, request.order_revision, [
            "Pending",
          ]);
          const {
            rows: [current],
          } = await query(
            "SELECT approved_at FROM wholesale_price_overrides WHERE id=$1 FOR UPDATE",
            [id],
          );
          if (current.approved_at)
            throw new WholesaleError(409, "This request was already approved.");
          const binding = await priceBinding(
            query,
            request.order_id,
            request.product_id,
          );
          const {
            rows: [match],
          } = await query(
            "SELECT binding=$2::text::jsonb AS matches FROM wholesale_price_overrides WHERE id=$1",
            [id, JSON.stringify(binding)],
          );
          if (!match.matches)
            throw new WholesaleError(
              409,
              "The product or draft changed. Request approval again.",
            );
          await query(
            "UPDATE wholesale_price_overrides SET approved_by=$2,approved_at=now(),approval_reason=$3 WHERE id=$1",
            [id, actor.id, explanation],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_OVERRIDE_APPROVED",
            "Approved " + id + "; " + explanation,
          );
          return { id };
        },
      );
    },
    async confirm(
      actor: AuditActor,
      key: unknown,
      orderId: unknown,
      input: any,
    ) {
      const id = requireUuid(orderId);
      const expected = revision(input?.revision);
      const overrideIds = (input?.overrideIds ?? []) as unknown;
      if (!Array.isArray(overrideIds) || overrideIds.length > 100)
        throw new WholesaleError(400, "Choose valid approvals.");
      const chosen = overrideIds.map(requireUuid).sort();
      if (new Set(chosen).size !== chosen.length)
        throw new WholesaleError(400, "Choose each approval once.");
      return operation(
        actor,
        key,
        { action: "confirm", id, expected, chosen },
        async (query) => {
          const order = await lockOrder(query, id, expected, ["Pending"]);
          const { rows: lines } = await query(
            "SELECT * FROM wholesale_order_items WHERE order_id=$1 ORDER BY product_id",
            [id],
          );
          if (!lines.length)
            throw new WholesaleError(409, "Add products before confirming.");
          const ids = lines.map((line) => line.product_id);
          const { rows: products } = await query(
            "SELECT * FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
            [ids],
          );
          const { rows: batches } = await query(
            `SELECT *,expiration_date::text AS expiry FROM batch_info WHERE product_id=ANY($1::uuid[])
            ORDER BY product_id,expiration_date,id FOR UPDATE`,
            [ids],
          );
          const {
            rows: [client],
          } = await query(
            "SELECT client_name,address FROM wholesale_clients WHERE id=$1 FOR SHARE",
            [order.client_id],
          );
          if (!client?.address?.trim())
            throw new WholesaleError(
              409,
              "A delivery address is required before confirmation.",
            );
          for (const product of products) {
            const physical = batches
              .filter((batch) => batch.product_id === product.id)
              .reduce(
                (sum, batch) => sum + Number(batch.quantity_remaining),
                0,
              );
            if (physical !== Number(product.current_stock)) {
              throw new WholesaleError(
                409,
                product.product_name +
                  ": physical stock totals disagree. Review inventory first.",
              );
            }
          }
          const reserved = await reservedByBatch(query, ids);
          const today = pharmacyDate();
          const snapshots = [];
          let total = 0n;
          let vat = 0n;
          for (const line of lines) {
            const product = products.find(
              (item) => item.id === line.product_id,
            );
            if (!product || typeof product.is_vat_exempt !== "boolean") {
              throw new WholesaleError(
                409,
                "Every product needs an explicit VAT classification.",
              );
            }
            if (
              product.wholesale_price === null ||
              wholesaleMoney(product.wholesale_price) !== line.unit_price
            ) {
              throw new WholesaleError(
                409,
                "A wholesale price changed. Reopen and save the draft before confirming.",
              );
            }
            let price = line.unit_price;
            let override: any = null;
            const { rows: candidates } = await query(
              `SELECT *,binding=$4::text::jsonb AS matches FROM wholesale_price_overrides
              WHERE id=ANY($1::uuid[]) AND order_id=$2 AND product_id=$3`,
              [
                chosen,
                id,
                product.id,
                JSON.stringify({
                  quantity: line.quantity,
                  original_price: line.unit_price,
                  default_price: product.wholesale_price,
                  is_vat_exempt: product.is_vat_exempt,
                }),
              ],
            );
            if (candidates.length > 1)
              throw new WholesaleError(
                400,
                "Choose only one approval per product.",
              );
            if (candidates.length) {
              override = candidates[0];
              if (
                !override.approved_by ||
                override.order_revision !== expected ||
                !override.matches
              ) {
                throw new WholesaleError(
                  409,
                  "An override is unapproved or stale.",
                );
              }
              price = override.requested_price;
            }
            const amounts = calculateRetailLine(
              cents(price),
              line.quantity,
              product.is_vat_exempt,
              false,
            );
            total += amounts.net;
            vat += amounts.vat;
            if (total > 999999999999n)
              throw new WholesaleError(
                400,
                "The order total exceeds the supported amount.",
              );
            let remaining = line.quantity;
            for (const batch of batches.filter(
              (item) => item.product_id === product.id && item.expiry >= today,
            )) {
              const quantity = Math.min(
                remaining,
                freeBatchQuantity(batch, reserved),
              );
              if (!quantity) continue;
              await query(
                `INSERT INTO wholesale_reservations(order_id,order_item_id,batch_id,quantity,reserved_by,batch_number_at_reservation,expiry_at_reservation)
              VALUES($1,$2,$3,$4,$5,$6,$7)`,
                [
                  id,
                  line.id,
                  batch.id,
                  quantity,
                  actor.id,
                  batch.batch_number,
                  batch.expiry,
                ],
              );
              reserved.set(batch.id, (reserved.get(batch.id) ?? 0) + quantity);
              remaining -= quantity;
              if (!remaining) break;
            }
            if (remaining)
              throw new WholesaleError(
                409,
                product.product_name +
                  ": insufficient available stock. No items were reserved.",
              );
            await query(
              "UPDATE wholesale_order_items SET unit_price=$2,line_total=$3 WHERE id=$1",
              [line.id, price, money(amounts.net)],
            );
            snapshots.push({
              productId: product.id,
              name: product.product_name,
              sku: product.sku,
              quantity: line.quantity,
              originalPrice: line.unit_price,
              unitPrice: price,
              isVatExempt: product.is_vat_exempt,
              vatRate: product.is_vat_exempt ? "0.00" : "12.00",
              vat: money(amounts.vat),
              base: money(amounts.net - amounts.vat),
              total: money(amounts.net),
              override: override
                ? {
                    id: override.id,
                    adminId: override.approved_by,
                    reason: override.approval_reason,
                    requestedBy: override.requested_by,
                    approvedAt: override.approved_at,
                  }
                : null,
            });
          }
          if (
            snapshots.filter((line) => line.override).length !== chosen.length
          )
            throw new WholesaleError(
              400,
              "An approval does not belong to this order.",
            );
          const snapshot = {
            clientId: order.client_id,
            clientName: client.client_name,
            address: client.address,
            lines: snapshots,
            total: money(total),
            vat: money(vat),
            calculationVersion: "wholesale-inclusive-v1",
          };
          await query(
            `UPDATE wholesale_orders SET status='Confirmed',draft_revision=draft_revision+1,
          total_order_amount=$2,confirmation_snapshot=$3::text::jsonb,confirmed_at=now(),confirmed_by=$4 WHERE id=$1`,
            [id, money(total), JSON.stringify(snapshot), actor.id],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_CONFIRMED",
            "Confirmed and reserved order " + id,
          );
          return { id, revision: expected + 1, status: "Confirmed" };
        },
      );
    },
    async cancel(
      actor: AuditActor,
      key: unknown,
      orderId: unknown,
      input: any,
    ) {
      const id = requireUuid(orderId);
      const expected = revision(input?.revision);
      const explanation = reason(input?.reason);
      return operation(
        actor,
        key,
        { action: "cancel", id, expected, explanation },
        async (query) => {
          await lockOrder(query, id, expected, ["Pending", "Confirmed"]);
          const { rows: products } = await query(
            "SELECT product_id FROM wholesale_order_items WHERE order_id=$1 ORDER BY product_id",
            [id],
          );
          await query(
            "SELECT id FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
            [products.map((line) => line.product_id)],
          );
          await query(
            `UPDATE wholesale_reservations SET released_at=now(),released_by=$2
          WHERE order_id=$1 AND released_at IS NULL AND consumed_at IS NULL`,
            [id, actor.id],
          );
          await query(
            `UPDATE wholesale_orders SET status='Cancelled',draft_revision=draft_revision+1,
          cancelled_at=now(),cancelled_by=$2 WHERE id=$1`,
            [id, actor.id],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_CANCELLED",
            "Order " + id + "; " + explanation,
          );
          return { id, revision: expected + 1, status: "Cancelled" };
        },
      );
    },
  };
}
