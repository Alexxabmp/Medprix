import type { ProductItem, ProductBatch } from "./types";

const freeQuantity = (batch: ProductBatch) =>
  typeof batch.reservedQuantity === "number" && batch.reservedQuantity >= 0
    ? Math.max(0, Number(batch.quantity) - batch.reservedQuantity)
    : 0;

// Use the server's pharmacy calendar date, never the device's local calendar.
const eligible = (product: ProductItem) =>
  (product.batches || []).filter(
    (batch) =>
      Boolean(product.pharmacyDate) &&
      batch.expiryDate >= product.pharmacyDate! &&
      freeQuantity(batch) > 0,
  );

export function productStock(product: ProductItem): number {
  return eligible(product).reduce((sum, batch) => sum + freeQuantity(batch), 0);
}

export function productAvailability(product: ProductItem, inCart = 0) {
  const stock = productStock(product);
  if (!product.pharmacyDate) return "Stock unavailable";
  if (!product.batches?.length && Number(product.stock) > 0)
    return "Stock unavailable";
  if (!stock) return "Out of stock";
  if (!product.batches?.some((batch) => Number(batch.quantity) > 0))
    return "Stock unavailable";
  if (stock <= inCart) return "All stock in cart";
  return "";
}

export function batchAllocations(product: ProductItem, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  let remaining = quantity;
  const allocations: { batchNumber: string; quantity: number }[] = [];
  const batches = eligible(product).sort(
    (a, b) =>
      a.expiryDate.localeCompare(b.expiryDate) ||
      (a.id ?? a.batchNumber).localeCompare(b.id ?? b.batchNumber),
  );
  for (const batch of batches) {
    const allocated = Math.min(freeQuantity(batch), remaining);
    if (allocated <= 0) break;
    allocations.push({ batchNumber: batch.batchNumber, quantity: allocated });
    remaining -= allocated;
  }
  return remaining === 0 ? allocations : null;
}

/**
 * Batches the next `quantity` units would come from, after the units already in the cart.
 * Checkout sells earliest-expiring stock first, so the cart's units use up the earliest batches.
 */
export function nextSaleBatches(product: ProductItem, inCart: number, quantity: number) {
  const all = batchAllocations(product, inCart + quantity);
  if (!all) return null;
  const expiry = new Map(eligible(product).map((batch) => [batch.batchNumber, batch.expiryDate]));
  let skip = inCart;
  const next: { batchNumber: string; quantity: number; expiryDate: string }[] = [];
  for (const allocation of all) {
    const used = Math.min(skip, allocation.quantity);
    skip -= used;
    if (allocation.quantity > used)
      next.push({ ...allocation, quantity: allocation.quantity - used, expiryDate: expiry.get(allocation.batchNumber) ?? "" });
  }
  return next;
}

/** "2027-02-15" → "Feb 2027" without shifting the calendar date through local time zones. */
export function formatExpiryMonth(date: string) {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  if (!match) return date || "unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}
