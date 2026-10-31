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

export function stockExplanation(
  product: ProductItem | undefined,
  inCart: number,
  state: "ready" | "loading" | "error",
) {
  if (state === "loading")
    return "Checking stock. Please wait before adding medicines.";
  if (state === "error")
    return "Stock could not be verified. Refresh stock before adding medicines or taking payment.";
  if (!product) return "Select a product to see availability.";
  const stock = productStock(product);
  if (!stock)
    return `${product.name}: Out of stock. This medicine cannot be added.`;
  if (!product.batches?.some((batch) => Number(batch.quantity) > 0))
    return `${product.name}: Stock has no available batches. Ask an administrator to review inventory before selling.`;
  if (stock <= inCart)
    return `${product.name}: All available units are already in your cart. Adjust the cart quantity.`;
  return `${product.name}: ${stock - inCart} available to add.`;
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
