import { composeProductName, normalizeProductCode, validateProductInput } from "@workspace/api-zod";
import type { ProductItem } from "./types";

export function emptyProductForm() {
  return {
    name: "", genericName: "", sku: "", category: "", strength: "", medicineForm: "",
    price: "", costPrice: "", reorder: "", isDangerousDrug: false, includeStock: false,
    batchNumber: "", quantity: "", expiryDate: "", mfgDate: "", dateReceived: "", supplier: "",
  };
}
export type ProductFormValues = ReturnType<typeof emptyProductForm>;

export function productFormPayload(values: ProductFormValues, original?: ProductItem) {
  const payload = {
    name: original ? values.name.trim() : composeProductName(values.name, values.strength, values.medicineForm),
    genericName: values.genericName.trim(), sku: normalizeProductCode(values.sku, original?.sku),
    category: values.category.trim(), price: values.price, costPrice: values.costPrice,
    reorder: values.reorder, isDangerousDrug: values.isDangerousDrug,
    ...(!original && values.includeStock ? {
      batchNumber: values.batchNumber.trim(), quantity: values.quantity, expiryDate: values.expiryDate,
      mfgDate: values.mfgDate, dateReceived: values.dateReceived, supplier: values.supplier.trim(),
    } : {}),
  };
  const errors = validateProductInput(payload, { originalSku: original?.sku, batch: !original && values.includeStock });
  // An explicitly enabled but entirely empty batch still needs validation.
  if (!original && values.includeStock && !values.batchNumber.trim()) errors.batchNumber = "Enter a batch number of at most 100 characters.";
  if (!original && values.includeStock && !values.quantity.trim()) errors.quantity = "Enter a whole-number quantity from 1 to 1,000,000.";
  if (!original && values.includeStock && !values.expiryDate) errors.expiryDate = "Enter a valid expiry date.";
  return { payload, errors };
}

export function matchesProductSearch(product: ProductItem, search: string): boolean {
  const query = search.trim().toLowerCase();
  return !query || [product.name, product.genericName, product.sku, product.category, ...product.batches.map((batch) => batch.batchNumber)]
    .some((value) => (value ?? "").toLowerCase().includes(query));
}
