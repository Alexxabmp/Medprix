/**
 * Senior citizen / PWD details recorded on every discounted retail sale, shared by the POS and the API.
 * BIR requires the name and the OSCA/PWD ID number in the separate record of discounted sales
 * (RR 7-2010 as amended, RR 5-2017) and on the receipt. Nothing about a disability is recorded.
 * The database enforces the stored shape (migration 0017_discount_holders).
 */
export type DiscountType = "None" | "Senior" | "PWD";

export const DISCOUNT_ID_LABELS: Record<Exclude<DiscountType, "None">, string> = {
  Senior: "OSCA ID no.",
  PWD: "PWD ID no.",
};

/** Trim and collapse inner spaces. */
export function cleanDiscountHolderName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

/** Trim, collapse spaces and use capitals; ID formats differ by city, so separators are kept. */
export function cleanDiscountHolderId(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function discountHolderNameError(name: string): string | null {
  if (!name) return "Enter the name shown on the ID.";
  if (name.length < 2 || !/\p{L}/u.test(name)) return "Enter the full name shown on the ID.";
  if (name.length > 120) return "Names can be at most 120 characters.";
  return null;
}

export function discountHolderIdError(type: Exclude<DiscountType, "None">, id: string): string | null {
  const label = DISCOUNT_ID_LABELS[type];
  if (!id) return `Enter the ${label} shown on the ID.`;
  if (!/^[A-Z0-9][A-Z0-9 ./-]{2,39}$/.test(id) || !/\d/.test(id))
    return `${label.replace(" no.", " numbers")} have 3 to 40 letters, digits, dashes or slashes.`;
  return null;
}
