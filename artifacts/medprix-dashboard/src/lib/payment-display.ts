import { PAYMENT_METHOD_LABELS, PAYMENT_REFERENCE_LABELS } from "@workspace/api-zod";

/** "GCash" → "GCash / QR"; other stored methods (including older ones such as "Maya") show as recorded. */
export function paymentMethodLabel(method: string | undefined) {
  return (method && PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS]) || method || "—";
}

/**
 * Proof-of-payment line for receipts and admin details.
 * GCash / QR and Card sales always get a line; sales saved before references existed say "Not recorded".
 */
export function paymentReferenceLine(method: string | undefined, reference: string | null | undefined) {
  if (method !== "GCash" && method !== "Card") return null;
  return { label: PAYMENT_REFERENCE_LABELS[method], value: reference || "Not recorded" };
}

/** Senior/PWD lines for receipts and admin details; null for sales without a 20% discount. */
export function discountHolderLines(discountType: string | undefined, name: string | undefined, idNumber: string | undefined) {
  if (discountType !== "Senior" && discountType !== "PWD") return null;
  return {
    nameLabel: discountType === "Senior" ? "Senior citizen" : "PWD",
    name: name || "Not recorded",
    idLabel: discountType === "Senior" ? "OSCA ID no." : "PWD ID no.",
    idNumber: idNumber || "Not recorded",
  };
}
