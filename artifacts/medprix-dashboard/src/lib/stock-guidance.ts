import type { ProductItem } from "./types";

// Preserve the current server policy: positive batch quantities are counted,
// including dated batches. Changing expiry eligibility needs a separate policy fix.
export function productStock(product: ProductItem): number {
  if (product.batches?.length)
    return product.batches.reduce(
      (sum, batch) => sum + Math.max(0, Number(batch.quantity) || 0),
      0,
    );
  return Math.max(0, Number(product.stock) || 0);
}

export function productAvailability(product: ProductItem, inCart = 0) {
  const stock = productStock(product);
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
  const batches = [...(product.batches || [])]
    .filter((batch) => Number(batch.quantity) > 0)
    .sort(
      (a, b) =>
        new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    );
  for (const batch of batches) {
    const allocated = Math.min(Number(batch.quantity), remaining);
    if (allocated <= 0) break;
    allocations.push({ batchNumber: batch.batchNumber, quantity: allocated });
    remaining -= allocated;
  }
  return remaining === 0 ? allocations : null;
}
