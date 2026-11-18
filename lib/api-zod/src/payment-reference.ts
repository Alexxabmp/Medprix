/**
 * Proof-of-payment rules for non-cash retail sales, shared by the POS screen and the API.
 * The database enforces the same formats (migration 0016_payment_references).
 *
 * - GCash / QR: the reference number from the payment confirmation, 10–13 digits.
 * - Card: the approval code printed on the card terminal slip, 6 letters or digits.
 * Card numbers, expiry dates, CVV and PINs are never collected.
 */
export type PaymentMethod = "Cash" | "GCash" | "Card";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  Cash: "Cash",
  GCash: "GCash / QR",
  Card: "Card",
};

export const PAYMENT_REFERENCE_LABELS: Record<Exclude<PaymentMethod, "Cash">, string> = {
  GCash: "GCash / QR reference no.",
  Card: "Card approval code",
};

/** Remove spaces and dashes; card approval codes are stored in capitals. */
export function cleanPaymentReference(method: PaymentMethod, value: unknown): string {
  const text = String(value ?? "").replace(/[\s-]/g, "");
  return method === "Card" ? text.toUpperCase() : text;
}

/** Returns an error message, or null when the reference is valid for the method. */
export function paymentReferenceError(method: PaymentMethod, cleaned: string): string | null {
  if (method === "Cash") return cleaned ? "Cash sales do not take a reference number." : null;
  if (method === "GCash") {
    if (!cleaned) return "Enter the GCash / QR reference number.";
    if (!/^\d+$/.test(cleaned)) return "GCash / QR reference numbers contain digits only.";
    if (cleaned.length < 10 || cleaned.length > 13) return "GCash / QR reference numbers have 10 to 13 digits.";
    return null;
  }
  if (!cleaned) return "Enter the approval code from the card terminal slip.";
  if (!/^[A-Z0-9]{6}$/.test(cleaned)) return "Card approval codes have 6 letters or digits.";
  return null;
}
