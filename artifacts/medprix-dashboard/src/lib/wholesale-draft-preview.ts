import {
  wholesaleAmount,
  wholesaleCents,
  WHOLESALE_MAX_CENTS,
  wholesalePlanTerms,
  type WholesalePaymentPlan,
} from "@workspace/api-zod";
import type { WholesaleLine, WholesaleProduct } from "./wholesale-api";

/** Catalog estimate only; saving and confirmation recalculate prices on the server. */
export function wholesaleDraftPreview(
  products: WholesaleProduct[],
  lines: WholesaleLine[],
  plan: WholesalePaymentPlan | "",
) {
  const amounts = lines.map((line) => {
    const price = products.find(
      (product) => product.id === line.productId,
    )?.wholesalePrice;
    if (
      price == null ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 1_000_000
    )
      return null;
    return wholesaleCents(price) * BigInt(line.quantity);
  });
  const cents = amounts.every((amount) => amount !== null)
    ? amounts.reduce<bigint>((sum, amount) => sum + amount!, 0n)
    : null;
  const overflow =
    amounts.some((amount) => amount !== null && amount > WHOLESALE_MAX_CENTS) ||
    (cents !== null && cents > WHOLESALE_MAX_CENTS);
  const total = cents === null || overflow ? null : wholesaleAmount(cents);
  const count = plan ? wholesalePlanTerms[plan].installmentCount : 0;
  const installments =
    total !== null && count
      ? Array.from({ length: count }, (_, index) =>
          wholesaleAmount(
            index === count - 1
              ? cents! - (cents! / BigInt(count)) * BigInt(count - 1)
              : cents! / BigInt(count),
          ),
        )
      : [];
  return {
    total,
    overflow,
    installments,
    lineTotals: amounts.map((amount) =>
      amount === null || amount > WHOLESALE_MAX_CENTS
        ? null
        : wholesaleAmount(amount),
    ),
  };
}
