/**
 * Returning-customer profile rules, shared by the POS screen and the API (Phase 2a).
 * A profile keeps a name, an optional mobile number, the Senior/PWD discount with its ID number,
 * and a usual order (quantities only). Saving one needs the customer's consent, because a list of
 * maintenance medicines is health information under the Data Privacy Act.
 */
import { cleanDiscountHolderId, cleanDiscountHolderName, discountHolderIdError } from "./discount-holder";

/** Stored values follow the customers table ("Regular" / "Senior Citizen" / "PWD"). */
export type CustomerDiscount = "Regular" | "Senior Citizen" | "PWD";
export const CUSTOMER_DISCOUNTS: CustomerDiscount[] = ["Regular", "Senior Citizen", "PWD"];
export const MAX_USUAL_ITEMS = 30;

/** The POS discount buttons use "None" / "Senior" / "PWD". */
export function customerDiscountToPos(value: string | null | undefined): "None" | "Senior" | "PWD" {
  return value === "Senior Citizen" || value === "Senior" ? "Senior" : value === "PWD" ? "PWD" : "None";
}
export function posDiscountToCustomer(value: "None" | "Senior" | "PWD"): CustomerDiscount {
  return value === "Senior" ? "Senior Citizen" : value === "PWD" ? "PWD" : "Regular";
}

export const cleanCustomerName = cleanDiscountHolderName;
export const cleanCustomerIdNumber = cleanDiscountHolderId;

/** Digits only, with +63 / 63 turned into a leading 0: "+63 917 123 5521" → "09171235521". */
export function cleanCustomerMobile(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("63") && digits.length === 12 ? `0${digits.slice(2)}` : digits;
}

export function customerMobileError(mobile: string): string | null {
  if (!mobile) return null;
  return /^09\d{9}$/.test(mobile) ? null : "Mobile numbers have 11 digits and start with 09.";
}

export function customerNameError(name: string): string | null {
  if (!name) return "Enter the customer's name.";
  if (name.length < 2 || !/\p{L}/u.test(name)) return "Enter the customer's full name.";
  if (name.length > 120) return "Names can be at most 120 characters.";
  return null;
}

export function customerIdNumberError(discount: CustomerDiscount, idNumber: string): string | null {
  if (discount === "Regular") return null;
  return discountHolderIdError(discount === "PWD" ? "PWD" : "Senior", idNumber);
}

/** Last 4 characters, for lists and search results: "2019-0034821" → "ending 4821". */
export function maskEnding(value: string | null | undefined): string {
  const tail = String(value ?? "").replace(/[\s-]/g, "").slice(-4);
  return tail ? `ending ${tail}` : "";
}
