import { and, eq, inArray } from "drizzle-orm";
import { batchInfoTable, productsTable, stockMovementsTable, poItemsTable, supplierDeliveriesTable, deliveryItemsTable, type db } from "@workspace/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ReceivingError extends Error {
  readonly status = 409;
}

export async function readReceivedQuantities(reader: Pick<Transaction, "select">, poIds?: string[]) {
  const rows = await reader.select({
    poId: supplierDeliveriesTable.poId,
    productId: deliveryItemsTable.productId,
    quantity: deliveryItemsTable.quantityDelivered,
  }).from(deliveryItemsTable)
    .innerJoin(supplierDeliveriesTable, eq(supplierDeliveriesTable.id, deliveryItemsTable.deliveryId))
    .where(and(
      inArray(supplierDeliveriesTable.deliveryStatus, ["Received", "Inspected", "Partial"]),
      poIds ? inArray(supplierDeliveriesTable.poId, poIds) : undefined,
    ));
  const quantities = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.poId}:${row.productId}`;
    quantities.set(key, (quantities.get(key) || 0) + row.quantity);
  }
  return quantities;
}

/** The caller holds the PO row lock before using this to authorize a receipt. */
export async function readOrderReceivingState(reader: Pick<Transaction, "select">, poId: string) {
  const [items, received] = await Promise.all([
    reader.select().from(poItemsTable).where(eq(poItemsTable.poId, poId)),
    readReceivedQuantities(reader, [poId]),
  ]);
  const ordered = new Map<string, number>();
  for (const item of items) ordered.set(item.productId, (ordered.get(item.productId) || 0) + item.quantityOrdered);
  return Array.from(ordered, ([productId, quantityOrdered]) => {
    const quantityReceived = received.get(`${poId}:${productId}`) || 0;
    return {productId, quantityOrdered, quantityReceived, quantityRemaining: Math.max(0, quantityOrdered - quantityReceived)};
  });
}

export const normalizeSupplierBatch = (value: string) => value.trim().toUpperCase();

/** Validate known lot identity even for reports that do not yet post inventory. */
export async function inspectSupplierBatch(
  tx: Transaction,
  input: { productId: string; batchNumber: string; expirationDate: string },
) {
  const batches = await tx.select().from(batchInfoTable)
    .where(eq(batchInfoTable.productId, input.productId)).for("update");
  const matches = batches.filter(batch => normalizeSupplierBatch(batch.batchNumber) === normalizeSupplierBatch(input.batchNumber));
  if (matches.length > 1)
    throw new ReceivingError("Multiple inventory lots match this product and batch number. Review the existing lots before receiving.");
  const existing = matches[0];
  if (existing && existing.expirationDate !== input.expirationDate)
    throw new ReceivingError(`Batch ${existing.batchNumber} already has expiration date ${existing.expirationDate}. Use that expiry for this product's existing lot.`);
  return { batches, existing };
}

/** Caller locks all affected products in ID order before calling this per line. */
export async function receiveSupplierStock(
  tx: Transaction,
  input: {
    productId: string;
    batchNumber: string;
    expirationDate: string;
    quantity: number;
    dateReceived: string;
    deliveryId: string;
    notes: string;
  },
) {
  const [product] = await tx.select().from(productsTable)
    .where(eq(productsTable.id, input.productId)).for("update");
  if (!product) throw new ReceivingError("Product no longer exists. Refresh the purchase order.");
  const { batches, existing } = await inspectSupplierBatch(tx, input);
  const physical = batches.reduce((total, batch) => total + batch.quantityRemaining, 0);
  if (physical !== product.currentStock)
    throw new ReceivingError(`${product.productName}: stored stock and batch quantities disagree. Review inventory before receiving more stock.`);

  const batchNumber = normalizeSupplierBatch(input.batchNumber);
  const [batch] = existing
    ? await tx.update(batchInfoTable).set({
        quantityRemaining: existing.quantityRemaining + input.quantity,
        updatedAt: new Date(),
      }).where(and(eq(batchInfoTable.id, existing.id), eq(batchInfoTable.productId, input.productId))).returning()
    : await tx.insert(batchInfoTable).values({
        productId: input.productId, batchNumber, expirationDate: input.expirationDate,
        quantityRemaining: input.quantity, dateReceived: input.dateReceived,
      }).returning();
  await tx.update(productsTable).set({
    currentStock: physical + input.quantity, updatedAt: new Date(),
  }).where(eq(productsTable.id, input.productId));
  await tx.insert(stockMovementsTable).values({
    productId: input.productId, batchId: batch.id, referenceId: input.deliveryId,
    movementType: "StockIn", quantity: input.quantity, notes: input.notes,
  });
}
