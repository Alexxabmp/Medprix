/**
 * One set of labels for the retail amount breakdown, shared by the POS order summary,
 * the receipt details window and the printed receipt so all three always read the same.
 *
 * Senior/PWD sale (Philippine rule: VAT is removed first, then 20% off the price before VAT):
 *   Subtotal (VAT included)      ₱940.80
 *   VAT discount (12%)          −₱100.80
 *   Price before VAT             ₱840.00
 *   Senior discount (20%)       −₱168.00
 * Regular sale:
 *   Subtotal                     ₱940.80
 *   VAT (included)               ₱100.80
 */

export type SummaryLine = {
  label: string;
  /** Amount in pesos, always positive; deductions are shown with a minus sign. */
  amount: number;
  kind: "plain" | "deduction";
};

type Amount = number | string | null | undefined;

/** Pesos from a number or a peso string such as "₱1,000.00", rounded to whole centavos. */
function cents(value: Amount): number {
  if (value === null || value === undefined || value === "") return 0;
  // Keep only digits, the decimal point and a minus sign, so any currency symbol or separator is ignored.
  const amount = typeof value === "number" ? value : Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function discountLabel(discountType?: string | null) {
  const who = discountType === "Senior" || discountType === "PWD" ? discountType : "Senior/PWD";
  return `${who} discount (20%)`;
}

export function retailSummaryLines(input: {
  subtotal: Amount;
  vat: Amount;
  vatRelief: Amount;
  discount: Amount;
  discountType?: string | null;
  /** True while a Senior/PWD discount is selected (POS) or was applied (receipt). */
  discounted: boolean;
  /** Label for the VAT line on regular sales; older receipts use "VAT". */
  vatLabel?: string;
}): SummaryLine[] {
  const subtotal = cents(input.subtotal);
  if (!input.discounted) {
    return [
      { label: "Subtotal", amount: subtotal / 100, kind: "plain" },
      { label: input.vatLabel ?? "VAT (included)", amount: cents(input.vat) / 100, kind: "plain" },
    ];
  }
  const relief = cents(input.vatRelief);
  const lines: SummaryLine[] = [];
  if (relief > 0) {
    lines.push(
      { label: "Subtotal (VAT included)", amount: subtotal / 100, kind: "plain" },
      { label: "VAT discount (12%)", amount: relief / 100, kind: "deduction" },
      { label: "Price before VAT", amount: (subtotal - relief) / 100, kind: "plain" },
    );
  } else {
    // Only VAT-exempt items: there is no VAT to remove, so the price is already before VAT.
    lines.push({ label: "Subtotal", amount: subtotal / 100, kind: "plain" });
  }
  lines.push({ label: discountLabel(input.discountType), amount: cents(input.discount) / 100, kind: "deduction" });
  return lines;
}

/** "₱1,234.50", or "−₱1,234.50" for deductions (true minus sign). */
export function formatSummaryAmount(line: SummaryLine) {
  const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(line.amount);
  return line.kind === "deduction" ? `−${peso}` : peso;
}

/** Breakdown for a saved sale (receipt window and printed receipt). */
export function receiptSummaryLines(receipt: {
  subtotal?: string;
  vat?: string;
  vatRelief?: string;
  discount?: string;
  discountType?: string;
  printSource?: { calculationVersion?: string };
}): SummaryLine[] {
  if (!receipt.subtotal) return [];
  const vatLabel = receipt.printSource?.calculationVersion ? "VAT (included)" : "VAT";
  const discounted = cents(receipt.discount) > 0 || receipt.discountType === "Senior" || receipt.discountType === "PWD";
  return retailSummaryLines({
    subtotal: receipt.subtotal,
    vat: receipt.vat,
    vatRelief: receipt.vatRelief,
    discount: receipt.discount,
    discountType: receipt.discountType,
    discounted,
    vatLabel,
  })
    // Some older sales did not record VAT; leave that line out instead of showing ₱0.00.
    .filter((line) => line.label !== vatLabel || Boolean(receipt.vat));
}
