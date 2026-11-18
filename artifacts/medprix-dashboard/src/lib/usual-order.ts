import { productStock } from "./stock-guidance";
import type { ProductItem } from "./types";

export type UsualCartItem = { id: string; name: string; sku: string; price: number; isVatExempt: boolean; qty: number };

const priceOf = (product: ProductItem) => parseFloat(product.price.replace("₱", "").replace(",", "")) || 0;

/**
 * Adds a customer's usual order on top of `base`, up to the stock that is left.
 * Prices are always today's; controlled drugs and products missing from inventory are skipped with a note.
 */
export function withUsualOrder(usualItems: { productId: string; quantity: number }[], base: UsualCartItem[], products: ProductItem[]) {
  const cart = base.map((item) => ({ ...item }));
  const notes: string[] = [];
  let added = 0;
  for (const usual of usualItems) {
    const product = products.find((item) => item.id === usual.productId);
    if (!product) { notes.push("1 medicine is no longer in inventory"); continue; }
    if (product.isDangerousDrug) { notes.push(`${product.name}: skipped (controlled drug)`); continue; }
    if (typeof product.isVatExempt !== "boolean") { notes.push(`${product.name}: skipped (check its category VAT setting)`); continue; }
    const existing = cart.find((item) => item.id === product.id);
    const left = Math.max(0, productStock(product) - (existing?.qty ?? 0));
    const quantity = Math.min(usual.quantity, left);
    if (quantity <= 0) { notes.push(`${product.name}: out of stock`); continue; }
    if (quantity < usual.quantity) notes.push(`${product.name}: only ${quantity} of the usual ${usual.quantity} in stock`);
    if (existing) existing.qty += quantity;
    else cart.push({ id: product.id, name: product.name, sku: product.sku, price: priceOf(product), isVatExempt: product.isVatExempt, qty: quantity });
    added++;
  }
  return { cart, added, notes };
}

/** One-line message for the notice strip above the cart. */
export function usualOrderMessage(total: number, added: number, notes: string[]) {
  const details = notes.length ? ` ${notes.join("; ").replace(/^./, (first) => first.toUpperCase())}.` : "";
  return added
    ? `Usual order added (${added} of ${total} ${total === 1 ? "item" : "items"}).${details}`
    : `None of the usual order could be added.${details}`;
}
