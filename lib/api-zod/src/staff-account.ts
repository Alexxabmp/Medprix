/**
 * Staff account rules (User Management, Part A), shared by the dashboard and the API.
 * Mobile numbers are typed and shown as 09XXXXXXXXX, like customer numbers, and stored as +639XXXXXXXXX
 * because the users.contact_number CHECK requires that format.
 */
import { cleanCustomerMobile, customerMobileError } from "./customer-profile";

export type StaffRole = "Admin" | "Cashier" | "FrontDesk";
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = { Admin: "Administrator", FrontDesk: "Front Desk", Cashier: "Cashier" };

/** Trim and collapse inner spaces. */
export function cleanStaffName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

/** Letters (ñ and accents included), spaces, periods, hyphens and apostrophes: "Ma. Clara Dela Cruz-Santos", "O'Neil". */
export function staffNameError(name: string): string | null {
  if (!name) return "Enter the staff member's full name.";
  if (name.length < 2 || name.length > 100) return "Full names have 2 to 100 characters.";
  if (!/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(name)) return "Full names can only have letters, spaces, periods, hyphens and apostrophes.";
  return null;
}

/** "+63 917 123 4567", "639171234567" or "0917-123-4567" → "09171234567". Blank stays blank. */
export const cleanStaffMobile = cleanCustomerMobile;

export function staffMobileError(mobile: string): string | null {
  return customerMobileError(mobile) ? "Enter an 11-digit mobile number starting with 09, or leave it blank." : null;
}

/** "09171234567" → "+639171234567" (the stored format). Blank → null. */
export function toStoredStaffMobile(mobile: string): string | null {
  return mobile ? `+63${mobile.slice(1)}` : null;
}

/** Stored "+639171234567" → "09171234567" for forms and tables. */
export function toDisplayStaffMobile(stored: string | null | undefined): string {
  return stored ? cleanStaffMobile(stored) : "";
}

/** "09171234567" → "0917 123 4567" for reading. */
export function formatStaffMobile(mobile: string | null | undefined): string {
  const digits = toDisplayStaffMobile(mobile);
  return /^09\d{9}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : digits;
}
