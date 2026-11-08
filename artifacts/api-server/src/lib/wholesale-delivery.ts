import { pharmacyDate, isCalendarDate } from "@workspace/api-zod";
import type { AuditActor } from "./audit-events";
import {
  WholesaleError,
  requireUuid,
  createWholesaleOperation,
  wholesaleAudit,
  type WholesaleQuery,
  type WholesaleTransaction,
} from "./wholesale-operations";

function date(value: unknown, label: string): string {
  if (!isCalendarDate(value))
    throw new WholesaleError(400, "Enter a valid " + label + ".");
  return value;
}
function text(value: unknown, label: string, maximum = 500): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum
  )
    throw new WholesaleError(
      400,
      "Enter " + label + " (up to " + maximum + " characters).",
    );
  return value.trim();
}
function validate(actor: AuditActor, input: any, allowed: string[]) {
  if (!["Admin", "FrontDesk"].includes(actor.role))
    throw new WholesaleError(
      403,
      "Only Admin or FrontDesk may manage deliveries.",
    );
  if (!input || Object.keys(input).some((key) => !allowed.includes(key)))
    throw new WholesaleError(
      400,
      "Unexpected delivery fields. Full-order delivery only.",
    );
  if (!Number.isSafeInteger(input.revision) || input.revision < 1)
    throw new WholesaleError(400, "The current order revision is required.");
  return Number(input.revision);
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
  if (!order || !order.confirmation_snapshot)
    throw new WholesaleError(404, "Confirmed order not found.");
  if (order.draft_revision !== expected || !statuses.includes(order.status))
    throw new WholesaleError(
      409,
      "This order changed. Refresh and review it before continuing.",
    );
  return order;
}
async function attempt(
  query: WholesaleQuery,
  orderId: string,
  scheduleId: string,
) {
  const {
    rows: [row],
  } = await query(
    "SELECT *,scheduled_date::text AS day FROM delivery_schedules WHERE id=$1 AND order_id=$2 FOR UPDATE",
    [scheduleId, orderId],
  );
  if (!row?.managed_by)
    throw new WholesaleError(409, "Select a current delivery attempt.");
  return row;
}

export function createWholesaleDelivery(
  read: WholesaleQuery,
  transaction: WholesaleTransaction,
) {
  const operation = createWholesaleOperation(transaction);
  return {
    async detail(orderId: unknown) {
      const id = requireUuid(orderId);
      const { rows: attempts } = await read(
        `SELECT id,scheduled_date::text AS date,status,notes FROM delivery_schedules
        WHERE order_id=$1 AND managed_by IS NOT NULL ORDER BY created_at,id`,
        [id],
      );
      const {
        rows: [delivered],
      } = await read(
        'SELECT receipt_id AS "receiptId",snapshot FROM wholesale_fulfillments WHERE order_id=$1',
        [id],
      );
      return { attempts, receipt: delivered ?? null };
    },
    async receipts() {
      return (
        await read(
          `SELECT receipt_id AS id,snapshot->>'receiptNumber' AS "receiptNumber",
        snapshot->>'orderNumber' AS "orderNumber",snapshot->>'clientName' AS "clientName",
        delivered_at AS "deliveredAt" FROM wholesale_fulfillments ORDER BY delivered_at DESC,id DESC LIMIT 200`,
        )
      ).rows;
    },
    async receipt(receiptId: unknown) {
      const {
        rows: [row],
      } = await read(
        "SELECT snapshot FROM wholesale_fulfillments WHERE receipt_id=$1",
        [requireUuid(receiptId)],
      );
      if (!row) throw new WholesaleError(404, "Delivery receipt not found.");
      return row.snapshot;
    },
    async schedule(
      actor: AuditActor,
      key: unknown,
      orderId: unknown,
      input: any,
    ) {
      const expected = validate(actor, input, ["revision", "date", "notes"]);
      const id = requireUuid(orderId);
      const day = date(input.date, "scheduled date");
      const notes = input.notes ? text(input.notes, "delivery notes") : null;
      return operation(
        actor,
        key,
        { action: "schedule-delivery", id, expected, day, notes },
        async (query) => {
          if (day < pharmacyDate())
            throw new WholesaleError(
              400,
              "Schedule the delivery for today or a future date.",
            );
          await lockOrder(query, id, expected, ["Confirmed"]);
          const { rows: existing } = await query(
            "SELECT id FROM delivery_schedules WHERE order_id=$1 AND status IN ('Scheduled','InTransit')",
            [id],
          );
          if (existing.length)
            throw new WholesaleError(
              409,
              "Close the active delivery attempt before scheduling another.",
            );
          const {
            rows: [schedule],
          } = await query(
            "INSERT INTO delivery_schedules(order_id,scheduled_date,notes,managed_by) VALUES($1,$2,$3,$4) RETURNING id",
            [id, day, notes, actor.id],
          );
          await query(
            "UPDATE wholesale_orders SET draft_revision=draft_revision+1 WHERE id=$1",
            [id],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_DELIVERY_SCHEDULED",
            "Order " + id + "; attempt " + schedule.id + "; " + day,
          );
          return { id, scheduleId: schedule.id, revision: expected + 1 };
        },
      );
    },
    async transition(
      actor: AuditActor,
      key: unknown,
      orderId: unknown,
      input: any,
    ) {
      const expected = validate(actor, input, [
        "revision",
        "scheduleId",
        "status",
        "reason",
        "returned",
      ]);
      const id = requireUuid(orderId);
      const scheduleId = requireUuid(input.scheduleId);
      const status = input.status;
      if (!["InTransit", "Failed", "Cancelled"].includes(status))
        throw new WholesaleError(400, "Choose a valid delivery action.");
      const reason =
        status === "InTransit" ? null : text(input.reason, "a reason");
      const returned = input.returned === true;
      return operation(
        actor,
        key,
        {
          action: "delivery-transition",
          id,
          expected,
          scheduleId,
          status,
          reason,
          returned,
        },
        async (query) => {
          await lockOrder(query, id, expected, ["Confirmed", "Processing"]);
          const row = await attempt(query, id, scheduleId);
          if (status === "InTransit") {
            if (row.status !== "Scheduled" || row.day > pharmacyDate())
              throw new WholesaleError(
                409,
                "Only a delivery scheduled for today or earlier may be dispatched.",
              );
          } else if (status === "Failed") {
            if (row.status !== "InTransit" || !returned)
              throw new WholesaleError(
                409,
                "Confirm all dispatched goods returned to custody before closing a failed delivery.",
              );
          } else if (row.status !== "Scheduled") {
            throw new WholesaleError(
              409,
              "An in-transit delivery must be marked failed after all goods return.",
            );
          }
          await query(
            "UPDATE delivery_schedules SET status=$2,notes=concat_ws(E'\\n',notes,$3::text) WHERE id=$1",
            [scheduleId, status, reason],
          );
          await query(
            "UPDATE wholesale_orders SET status=$2,draft_revision=draft_revision+1 WHERE id=$1",
            [id, status === "InTransit" ? "Processing" : "Confirmed"],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_DELIVERY_" + status.toUpperCase(),
            "Order " +
              id +
              "; attempt " +
              scheduleId +
              (reason ? "; " + reason : ""),
          );
          return { id, revision: expected + 1 };
        },
      );
    },
    async fulfill(
      actor: AuditActor,
      key: unknown,
      orderId: unknown,
      input: any,
    ) {
      const expected = validate(actor, input, [
        "revision",
        "scheduleId",
        "receivedBy",
        "dueDate",
      ]);
      const id = requireUuid(orderId);
      const scheduleId = requireUuid(input.scheduleId);
      const receivedBy = text(input.receivedBy, "the recipient's name", 255);
      const dueDate = date(input.dueDate, "payment due date");
      return operation(
        actor,
        key,
        {
          action: "fulfill-delivery",
          id,
          expected,
          scheduleId,
          receivedBy,
          dueDate,
        },
        async (query) => {
          if (dueDate < pharmacyDate())
            throw new WholesaleError(
              400,
              "The due date cannot precede delivery.",
            );
          const order = await lockOrder(query, id, expected, ["Processing"]);
          const schedule = await attempt(query, id, scheduleId);
          if (schedule.status !== "InTransit")
            throw new WholesaleError(
              409,
              "Dispatch this attempt before confirming delivery.",
            );
          const { rows: previous } = await query(
            "SELECT id FROM delivery_receipts WHERE order_id=$1 UNION ALL SELECT id FROM accounts_receivable WHERE order_id=$1",
            [id],
          );
          if (previous.length)
            throw new WholesaleError(
              409,
              "This order already has delivery or financial records. Review them before continuing.",
            );
          const source = order.confirmation_snapshot;
          if (
            !Array.isArray(source.lines) ||
            !source.lines.length ||
            source.total !== order.total_order_amount
          )
            throw new WholesaleError(
              409,
              "The confirmed order snapshot is incomplete.",
            );
          const ids = source.lines.map((line: any) => line.productId).sort();
          const { rows: products } = await query(
            "SELECT * FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
            [ids],
          );
          const { rows: batches } = await query(
            "SELECT *,expiration_date::text AS expiry FROM batch_info WHERE product_id=ANY($1::uuid[]) ORDER BY product_id,expiration_date,id FOR UPDATE",
            [ids],
          );
          const { rows: allocations } = await query(
            `SELECT r.*,r.expiry_at_reservation::text AS reserved_expiry,i.product_id FROM wholesale_reservations r JOIN wholesale_order_items i ON i.id=r.order_item_id
          WHERE r.order_id=$1 AND r.released_at IS NULL AND r.consumed_at IS NULL ORDER BY i.product_id,r.batch_id FOR UPDATE OF r`,
            [id],
          );
          if (products.length !== ids.length)
            throw new WholesaleError(409, "A reserved product is missing.");
          for (const product of products) {
            if (
              Number(product.current_stock) !==
              batches
                .filter((b) => b.product_id === product.id)
                .reduce((sum, b) => sum + Number(b.quantity_remaining), 0)
            )
              throw new WholesaleError(
                409,
                "Physical stock totals disagree. Review inventory before delivery.",
              );
          }
          if (allocations.some((a) => !ids.includes(a.product_id)))
            throw new WholesaleError(
              409,
              "Reservations do not match this order.",
            );
          for (const line of source.lines) {
            if (
              allocations
                .filter((a) => a.product_id === line.productId)
                .reduce((sum, a) => sum + a.quantity, 0) !== line.quantity
            )
              throw new WholesaleError(
                409,
                "The entire order must be reserved before delivery.",
              );
          }
          for (const allocation of allocations) {
            const batch = batches.find(
              (b) =>
                b.id === allocation.batch_id &&
                b.product_id === allocation.product_id,
            );
            const expiry = allocation.reserved_expiry;
            if (
              !batch ||
              batch.quantity_remaining < allocation.quantity ||
              batch.expiry < pharmacyDate() ||
              batch.expiry !== expiry ||
              batch.batch_number !== allocation.batch_number_at_reservation
            )
              throw new WholesaleError(
                409,
                "A reserved batch is expired, missing or changed. Delivery was not recorded.",
              );
          }
          const deliveredAt = new Date().toISOString();
          const {
            rows: [number],
          } = await query(
            "SELECT nextval('wholesale_delivery_receipt_seq')::text AS value",
          );
          const receiptNumber = "WDR-" + number.value.padStart(8, "0");
          const {
            rows: [receipt],
          } = await query(
            "INSERT INTO delivery_receipts(order_id,delivery_date,receipt_number,received_by) VALUES($1,$2,$3,$4) RETURNING id",
            [id, deliveredAt, receiptNumber, receivedBy],
          );
          const receiptBatches = [];
          await query(
            "UPDATE wholesale_reservations SET consumed_at=$2 WHERE order_id=$1 AND released_at IS NULL AND consumed_at IS NULL",
            [id, deliveredAt],
          );
          for (const allocation of allocations) {
            const batch = batches.find((b) => b.id === allocation.batch_id)!;
            await query(
              "UPDATE batch_info SET quantity_remaining=quantity_remaining-$2,updated_at=now() WHERE id=$1",
              [batch.id, allocation.quantity],
            );
            await query(
              "INSERT INTO stock_movements(product_id,batch_id,movement_type,quantity,notes,movement_date) VALUES($1,$2,'StockOut',$3,$4,$5)",
              [
                allocation.product_id,
                batch.id,
                allocation.quantity,
                "Wholesale delivery " + receiptNumber,
                deliveredAt,
              ],
            );
            await query(
              "INSERT INTO delivery_receipt_items(receipt_id,product_id,batch_number,expiration_date,quantity_delivered) VALUES($1,$2,$3,$4,$5)",
              [
                receipt.id,
                allocation.product_id,
                batch.batch_number,
                batch.expiry,
                allocation.quantity,
              ],
            );
            receiptBatches.push({
              productId: allocation.product_id,
              batchNumber: batch.batch_number,
              expiry: batch.expiry,
              quantity: allocation.quantity,
            });
          }
          for (const line of source.lines) {
            await query(
              "UPDATE products SET current_stock=current_stock-$2,updated_at=now() WHERE id=$1",
              [line.productId, line.quantity],
            );
          }
          const {
            rows: [ar],
          } = await query(
            "INSERT INTO accounts_receivable(client_id,order_id,total_owed,total_paid,balance,due_date) VALUES($1,$2,$3,0,$3,$4) RETURNING id",
            [order.client_id, id, source.total, dueDate],
          );
          const snapshot = {
            merchantName: "MEDPRIX",
            orderNumber: order.order_number,
            receiptNumber,
            clientName: source.clientName,
            address: source.address,
            lines: source.lines.map((line: any) => ({
              productId: line.productId,
              name: line.name,
              sku: line.sku,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              total: line.total,
              vat: line.vat,
              isVatExempt: line.isVatExempt,
            })),
            total: source.total,
            vat: source.vat,
            calculationVersion: source.calculationVersion,
            batches: receiptBatches,
            deliveredAt,
            receivedBy,
            dueDate,
          };
          await query(
            `INSERT INTO wholesale_fulfillments(order_id,schedule_id,receipt_id,ar_id,snapshot,delivered_by,delivered_at)
          VALUES($1,$2,$3,$4,$5::text::jsonb,$6,$7)`,
            [
              id,
              scheduleId,
              receipt.id,
              ar.id,
              JSON.stringify(snapshot),
              actor.id,
              deliveredAt,
            ],
          );
          await query(
            "UPDATE delivery_schedules SET status='Completed' WHERE id=$1",
            [scheduleId],
          );
          await query(
            "UPDATE wholesale_orders SET status='Delivered',draft_revision=draft_revision+1 WHERE id=$1",
            [id],
          );
          await wholesaleAudit(
            query,
            actor,
            "WHOLESALE_DELIVERED",
            "Order " +
              id +
              "; " +
              receiptNumber +
              "; AR " +
              ar.id +
              "; total " +
              source.total,
          );
          return {
            id,
            receiptId: receipt.id,
            revision: expected + 1,
            status: "Delivered",
          };
        },
      );
    },
  };
}
