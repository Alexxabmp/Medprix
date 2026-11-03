import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  purchaseOrdersTable,
  supplierDeliveriesTable,
  deliveryItemsTable,
} from "@workspace/db";
import { isCalendarDate, pharmacyDate } from "@workspace/api-zod";
import {
  inspectSupplierBatch,
  normalizeSupplierBatch,
  readOrderReceivingState,
  receiveSupplierStock,
  ReceivingError,
} from "./supplier-stock-receipts";

type Reader = Pick<typeof db, "select">;
type DeliveryLine = {
  productId: string;
  batchNumber: string;
  expirationDate: string;
  quantityDelivered: number;
};
export class DeliveryReferenceConflict extends ReceivingError {
  readonly code = "reference_conflict";
}
export class DeliveryInputError extends Error {
  readonly status = 400;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function deliveryKey(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value))
    throw new DeliveryInputError(
      "A UUID Idempotency-Key is required. Refresh the app before saving this receiving report.",
    );
  return value.toLowerCase();
}

/** Pure request validation: replay does not depend on today's stock/expiry/PO state. */
export function deliveryPayload(body: any) {
  if (
    !body ||
    Object.keys(body).some(
      (key) =>
        !["poId", "deliveryDate", "deliveryStatus", "items"].includes(key),
    )
  )
    throw new DeliveryInputError(
      "Unsupported receiving report details. Refresh and review the form.",
    );
  if (typeof body.poId !== "string" || !uuid.test(body.poId) || !isCalendarDate(body.deliveryDate))
    throw new DeliveryInputError(
      "Select a purchase order and enter a valid delivery date.",
    );
  const status = body.deliveryStatus ?? "Received";
  if (!supplierDeliveriesTable.deliveryStatus.enumValues.includes(status))
    throw new DeliveryInputError("Select a valid delivery status.");
  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 200
  )
    throw new DeliveryInputError("Enter between 1 and 200 receiving items.");
  const items: DeliveryLine[] = body.items.map((item: any) => {
    if (
      !item ||
      Object.keys(item).some(
        (key) =>
          ![
            "productId",
            "batchNumber",
            "expirationDate",
            "quantityDelivered",
          ].includes(key),
      ) ||
      typeof item.productId !== "string" || !uuid.test(item.productId)
    )
      throw new DeliveryInputError(
        "Select a valid inventory product and supported receiving details.",
      );
    const batchNumber =
      typeof item.batchNumber === "string"
        ? normalizeSupplierBatch(item.batchNumber)
        : "";
    if (
      !batchNumber ||
      batchNumber.length > 100 ||
      !/^[A-Z0-9-]+$/.test(batchNumber)
    )
      throw new DeliveryInputError(
        "Enter a batch number of at most 100 letters, numbers, or hyphens.",
      );
    if (!isCalendarDate(item.expirationDate))
      throw new DeliveryInputError("Enter a valid expiration date.");
    const quantityDelivered = Number(item.quantityDelivered);
    if (
      !["number", "string"].includes(typeof item.quantityDelivered) ||
      !Number.isInteger(quantityDelivered) ||
      quantityDelivered < 1 ||
      quantityDelivered > 1_000_000
    )
      throw new DeliveryInputError(
        "Delivered quantity must be a whole number between 1 and 1,000,000.",
      );
    return {
      productId: item.productId.toLowerCase() as string,
      batchNumber,
      expirationDate: item.expirationDate as string,
      quantityDelivered,
    };
  });
  return {
    poId: body.poId.toLowerCase() as string,
    deliveryDate: body.deliveryDate,
    deliveryStatus:
      status as typeof supplierDeliveriesTable.$inferInsert.deliveryStatus,
    items,
  };
}
type Payload = ReturnType<typeof deliveryPayload>;
const tuples = (items: Payload["items"]) =>
  items
    .map((item) =>
      JSON.stringify([
        item.productId,
        item.batchNumber,
        item.expirationDate,
        item.quantityDelivered,
      ]),
    )
    .sort();

export async function readDelivery(reader: Reader, id: string) {
  const [delivery] = await reader
    .select()
    .from(supplierDeliveriesTable)
    .where(eq(supplierDeliveriesTable.id, id));
  if (!delivery) return null;
  const items = await reader
    .select()
    .from(deliveryItemsTable)
    .where(eq(deliveryItemsTable.deliveryId, id))
    .orderBy(asc(deliveryItemsTable.id));
  return { delivery, items };
}

export async function submitDelivery(id: string, payload: Payload) {
  return db.transaction(async (tx) => {
    // Serialize this UUID across all POs; collisions serialize only, never identify a report.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`,
    );
    const saved = await readDelivery(tx, id);
    if (saved) {
      if (
        saved.delivery.poId !== payload.poId ||
        saved.delivery.deliveryDate.toISOString().slice(0, 10) !==
          payload.deliveryDate ||
        saved.delivery.deliveryStatus !== payload.deliveryStatus ||
        JSON.stringify(tuples(saved.items)) !==
          JSON.stringify(tuples(payload.items))
      )
        throw new DeliveryReferenceConflict(
          "This receiving reference was already used with different details. Check its saved report before creating another.",
        );
      return { ...saved, replayed: true };
    }
    const [order] = await tx
      .select()
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, payload.poId))
      .for("update");
    if (!order) throw new DeliveryInputError("Purchase order not found.");
    if (["Cancelled", "Fulfilled"].includes(order.status))
      throw new ReceivingError(
        "This purchase order is closed. Refresh the order list before receiving.",
      );
    const receiving = await readOrderReceivingState(tx, order.id);
    const requested = new Map<string, number>();
    const lots = new Map<string, string>();
    const today = pharmacyDate();
    for (const item of payload.items) {
      if (item.expirationDate < today)
        throw new DeliveryInputError(
          "Enter an expiration date today or later in the pharmacy's Philippine calendar.",
        );
      const lot = `${item.productId}:${item.batchNumber}`;
      if (lots.has(lot) && lots.get(lot) !== item.expirationDate)
        throw new DeliveryInputError(
          "The same product and batch cannot have different expiration dates in one report.",
        );
      lots.set(lot, item.expirationDate);
      requested.set(
        item.productId,
        (requested.get(item.productId) || 0) + item.quantityDelivered,
      );
    }
    const products = await tx
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(inArray(productsTable.id, [...requested.keys()]))
      .orderBy(asc(productsTable.id))
      .for("update");
    if (products.length !== requested.size)
      throw new DeliveryInputError(
        "Selected product no longer exists. Refresh inventory.",
      );
    for (const [productId, quantity] of requested) {
      const item = receiving.find((item) => item.productId === productId);
      if (!item)
        throw new ReceivingError(
          "This product is not on the selected purchase order.",
        );
      if (quantity > item.quantityRemaining)
        throw new ReceivingError(
          `This product has ${item.quantityRemaining} unit(s) left to receive on this purchase order. Refresh and review the quantity.`,
        );
    }

    for (const item of payload.items) await inspectSupplierBatch(tx, item);
    const [delivery] = await tx
      .insert(supplierDeliveriesTable)
      .values({
        id,
        poId: order.id,
        deliveryDate: new Date(`${payload.deliveryDate}T00:00:00Z`),
        deliveryStatus: payload.deliveryStatus,
      })
      .returning();
    const items = await tx
      .insert(deliveryItemsTable)
      .values(payload.items.map((item) => ({ ...item, deliveryId: id })))
      .returning();
    const postsStock = ["Received", "Inspected", "Partial"].includes(
      delivery.deliveryStatus,
    );
    if (postsStock) {
      for (const item of payload.items)
        await receiveSupplierStock(tx, {
          ...item,
          quantity: item.quantityDelivered,
          dateReceived: payload.deliveryDate,
          deliveryId: id,
          notes: `Supplier delivery ${id.slice(0, 8)} (${order.poNumber})`,
        });
      if (
        receiving.length &&
        receiving.every(
          (item) =>
            item.quantityRemaining === (requested.get(item.productId) || 0),
        )
      )
        await tx
          .update(purchaseOrdersTable)
          .set({ status: "Fulfilled", updatedAt: new Date() })
          .where(eq(purchaseOrdersTable.id, order.id));
    }
    return { delivery, items, replayed: false };
  });
}
