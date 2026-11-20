/**
 * Supplier payment terms. Terms belong to the supplier; every invoice copies them
 * when it is recorded, so changing a supplier's terms never moves an existing due date.
 * Wholesale clients keep their own Net30/Net60 installment plan (wholesale-payment-plan.ts).
 */
export const SUPPLIER_TERMS = ["Immediate", "Net30", "Net60"] as const;
export type SupplierTerms = (typeof SUPPLIER_TERMS)[number] | "EndOfMonth" | "EndOfNextMonth";

/** Where the due date counts from. */
export const SUPPLIER_TERMS_BASES = ["InvoiceDate", "DeliveryDate"] as const;
export type SupplierTermsBasis = (typeof SUPPLIER_TERMS_BASES)[number];

export const SUPPLIER_TERMS_LABEL: Record<SupplierTerms, string> = {
  Immediate: "Immediate (pay now)",
  EndOfMonth: "End of current month",
  EndOfNextMonth: "End of following month",
  Net30: "Net 30",
  Net60: "Net 60",
};

export const SUPPLIER_TERMS_BASIS_LABEL: Record<SupplierTermsBasis, string> = {
  InvoiceDate: "invoice date",
  DeliveryDate: "delivery date",
};

export function isSupplierTerms(value: unknown): value is SupplierTerms {
  return typeof value === "string" && (["Immediate", "Net30", "Net60", "EndOfMonth", "EndOfNextMonth"] as readonly string[]).includes(value);
}

export function isSupplierTermsBasis(value: unknown): value is SupplierTermsBasis {
  return typeof value === "string" && (SUPPLIER_TERMS_BASES as readonly string[]).includes(value);
}

/** Accepts legacy spellings ("Net 30", "COD") so old data and forms map onto one value. */
export function normalizeSupplierTerms(value: unknown): SupplierTerms | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/[\s_-]+/g, "").toLowerCase();
  const map: Record<string, SupplierTerms> = {
    immediate: "Immediate", paynow: "Immediate", cod: "Immediate", cashondelivery: "Immediate",
    endofmonth: "EndOfMonth", endofcurrentmonth: "EndOfMonth", eom: "EndOfMonth",
    endofnextmonth: "EndOfNextMonth", endoffollowingmonth: "EndOfNextMonth",
    net30: "Net30", net60: "Net60",
  };
  return map[compact] ?? null;
}

function lastDayOfMonth(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

/** Due date for a calendar start date (YYYY-MM-DD). Pure and timezone-free. */
export function supplierDueDate(terms: SupplierTerms, startDate: string): string {
  const [y, m, d] = startDate.split("-").map(Number) as [number, number, number];
  switch (terms) {
    case "Immediate":
      return startDate;
    case "EndOfMonth":
      return lastDayOfMonth(y, m - 1);
    case "EndOfNextMonth":
      return lastDayOfMonth(y, m);
    case "Net30":
    case "Net60":
      return new Date(Date.UTC(y, m - 1, d + (terms === "Net30" ? 30 : 60))).toISOString().slice(0, 10);
  }
}

/** One plain sentence for forms: "Due Dec 31, 2026 (end of following month, from the invoice date)". */
export function describeSupplierTerms(terms: SupplierTerms, basis: SupplierTermsBasis): string {
  const from = SUPPLIER_TERMS_BASIS_LABEL[basis];
  switch (terms) {
    case "Immediate": return `Due on the ${from}.`;
    case "EndOfMonth": return `Due on the last day of the month of the ${from}.`;
    case "EndOfNextMonth": return `Due on the last day of the month after the ${from}.`;
    case "Net30": return `Due 30 days after the ${from}.`;
    case "Net60": return `Due 60 days after the ${from}.`;
  }
}

export const SUPPLIER_PAYMENT_MODES = ["Cash", "BankTransfer", "Check", "GCash"] as const;
export type SupplierPaymentMode = (typeof SUPPLIER_PAYMENT_MODES)[number] | "Maya";
export const SUPPLIER_PAYMENT_MODE_LABEL: Record<SupplierPaymentMode, string> = {
  Cash: "Cash", BankTransfer: "Bank transfer", Check: "Check", GCash: "GCash", Maya: "Maya",
};

export const PO_SEND_METHODS = ["Viber", "SMS", "Email", "Phone", "Printed", "Other"] as const;
export type PoSendMethod = (typeof PO_SEND_METHODS)[number];

export const DELIVERY_REJECTION_REASONS = ["Damaged", "Expired", "ShortExpiry", "WrongItem", "Other"] as const;
export type DeliveryRejectionReason = (typeof DELIVERY_REJECTION_REASONS)[number];
export const DELIVERY_REJECTION_REASON_LABEL: Record<DeliveryRejectionReason, string> = {
  Damaged: "Damaged", Expired: "Expired", ShortExpiry: "Expiry too short", WrongItem: "Wrong item", Other: "Other",
};

/** Lots expiring sooner than this get a warning when received (not a block). */
export const SHORT_EXPIRY_MONTHS = 6;
