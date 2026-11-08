/** retail-inclusive-v1: integer cent arithmetic, once per product line. */
export function calculateRetailLine(
  unitPrice: bigint,
  quantity: number,
  exempt: boolean,
  discounted: boolean,
) {
  if (unitPrice < 0n || !Number.isSafeInteger(quantity) || quantity < 1)
    throw new Error("Invalid retail line");
  const gross = unitPrice * BigInt(quantity);
  const base = exempt ? gross : (gross * 100n + 56n) / 112n;
  const relief = discounted ? gross - base : 0n;
  const discount = discounted ? (base * 20n + 50n) / 100n : 0n;
  return {
    gross,
    discount,
    relief,
    vat: discounted ? 0n : gross - base,
    net: gross - relief - discount,
  };
}

/** Stable largest-remainder allocation; input order breaks equal remainders. */
export function allocateRetailAmount(amount: bigint, weights: bigint[]) {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (amount < 0n || amount > sum || weights.some((weight) => weight < 0n))
    throw new Error("Invalid allocation");
  if (!sum) return weights.map(() => 0n);
  const values = weights.map((weight) => (amount * weight) / sum);
  const order = weights
    .map((weight, index) => ({ index, remainder: (amount * weight) % sum }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  let remaining = amount - values.reduce((a, b) => a + b, 0n);
  for (const item of order) {
    if (!remaining) break;
    values[item.index]++;
    remaining--;
  }
  return values;
}
