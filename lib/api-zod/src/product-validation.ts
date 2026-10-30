export const PRODUCT_CODE_HINT = "Use three letters, a hyphen, and 4–10 digits (for example MED-0421).";
export const PRODUCT_CODE_PATTERN = /^[A-Z]{3}-[0-9]{4,10}$/;
export const PRODUCT_BATCH_FIELDS = ["batchNumber", "quantity", "expiryDate", "mfgDate", "dateReceived", "supplier"] as const;
export type ProductErrors = Record<string, string>;

export function composeProductName(name: string, strength = "", medicineForm = ""): string {
  return [name, strength, medicineForm].map((part) => part.trim()).filter(Boolean).join(" ");
}

export function normalizeProductCode(value: string, original?: string): string {
  return value === original ? original : value.trim().toUpperCase();
}

export function parseProductMoney(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim().replace(/^₱\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replaceAll(",", ""));
  return Number.isFinite(amount) && amount <= 9999999999.99 ? amount.toFixed(2) : null;
}

function validDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateProductInput(input: Record<string, unknown>, options: { partial?: boolean; originalSku?: string; batch?: boolean } = {}): ProductErrors {
  const errors: ProductErrors = {};
  const supplied = (key: string) => !options.partial || input[key] !== undefined;
  for (const [key, label, limit] of [["name", "Product name", 255], ["genericName", "Generic name", 255]] as const) {
    if (supplied(key) && (typeof input[key] !== "string" || !(input[key] as string).trim() || (input[key] as string).trim().length > limit)) {
      errors[key] = `${label} is required and must be at most ${limit} characters.`;
    }
  }
  if (supplied("sku") && (typeof input.sku !== "string" || (input.sku !== options.originalSku && !PRODUCT_CODE_PATTERN.test(normalizeProductCode(input.sku))))) errors.sku = PRODUCT_CODE_HINT;
  if (input.category !== undefined && (typeof input.category !== "string" || input.category.trim().length > 100)) errors.category = "Category must be at most 100 characters.";
  for (const key of ["price", "costPrice"]) {
    if (supplied(key) && parseProductMoney(input[key]) === null) errors[key] = "Enter a nonnegative price with at most two decimal places (maximum 9,999,999,999.99).";
  }
  if (supplied("reorder") && !wholeNumber(input.reorder, 0, 2147483647)) errors.reorder = "Enter a nonnegative whole-number reorder level (maximum 2,147,483,647).";
  if (input.isDangerousDrug !== undefined && typeof input.isDangerousDrug !== "boolean") errors.isDangerousDrug = "Controlled item must be on or off.";
  if (options.batch && PRODUCT_BATCH_FIELDS.some((key) => input[key] !== undefined && input[key] !== null)) {
    if (typeof input.batchNumber !== "string" || !input.batchNumber.trim() || input.batchNumber.trim().length > 100) errors.batchNumber = "Enter a batch number of at most 100 characters.";
    if (!wholeNumber(input.quantity, 1, 1000000)) errors.quantity = "Enter a whole-number quantity from 1 to 1,000,000.";
    if (!validDate(input.expiryDate)) errors.expiryDate = "Enter a valid expiry date.";
    for (const key of ["mfgDate", "dateReceived"]) {
      if (input[key] !== undefined && input[key] !== "" && input[key] !== null && !validDate(input[key])) errors[key] = "Enter a valid date or leave this blank.";
    }
    if (input.supplier !== undefined && input.supplier !== null && (typeof input.supplier !== "string" || input.supplier.trim().length > 255)) errors.supplier = "Supplier must be at most 255 characters.";
  }
  return errors;
}

function wholeNumber(value: unknown, min: number, max: number): boolean {
  if (typeof value !== "number" && typeof value !== "string") return false;
  return /^\d+$/.test(String(value).trim()) && Number(value) >= min && Number(value) <= max;
}
