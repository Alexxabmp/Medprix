import type { ProductItem } from "./types";

// Use the server's pharmacy calendar date, never the device's local calendar.
const eligible = (product: ProductItem) => (product.batches || []).filter(batch =>
  Boolean(product.pharmacyDate) && batch.expiryDate >= product.pharmacyDate! && Number(batch.quantity) > 0);

export function productStock(product: ProductItem): number {
  return eligible(product).reduce((sum, batch) => sum + Number(batch.quantity), 0);
}

export function productAvailability(product: ProductItem, inCart = 0) {
  const stock = productStock(product);
  if (!product.pharmacyDate) return "Stock unavailable";
  if (!product.batches?.length && Number(product.stock) > 0) return "Stock unavailable";
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
  const batches = eligible(product)
    .sort(
      (a, b) =>
        a.expiryDate.localeCompare(b.expiryDate) || (a.id ?? a.batchNumber).localeCompare(b.id ?? b.batchNumber),
    );
  for (const batch of batches) {
    const allocated = Math.min(Number(batch.quantity), remaining);
    if (allocated <= 0) break;
    allocations.push({ batchNumber: batch.batchNumber, quantity: allocated });
    remaining -= allocated;
  }
  return remaining === 0 ? allocations : null;
}
