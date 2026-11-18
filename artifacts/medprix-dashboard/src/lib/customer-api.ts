import { readResponse } from "./feedback";
import type { CustomerDiscount } from "@workspace/api-zod";

/** A returning customer as the API returns it (see api-server/src/lib/customer-store.ts). */
export type Customer = {
  id: string;
  name: string;
  discountType: CustomerDiscount;
  idNumber: string | null;
  mobile: string | null;
  consentAt: string | null;
  createdAt?: string;
  usualItems: { productId: string; quantity: number }[];
};

export type NewCustomer = {
  name: string;
  mobile: string;
  discountType: CustomerDiscount;
  idNumber: string;
  consent: boolean;
  usualItems: { productId: string; quantity: number }[];
};

async function send(path: string, init: RequestInit, fallback: string) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    signal: AbortSignal.timeout(15000),
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  return readResponse(response, fallback);
}

export async function fetchCustomers(): Promise<Customer[]> {
  const data = await send("/customers", {}, "Could not load customers. Please try again.");
  if (!Array.isArray(data)) throw new Error("Invalid customer response. Please refresh.");
  return data as Customer[];
}

export async function createCustomer(body: NewCustomer): Promise<Customer> {
  return (await send("/customers", { method: "POST", body: JSON.stringify(body) }, "Could not save the customer. Please try again.")) as Customer;
}

export async function saveUsualItems(customerId: string, usualItems: Customer["usualItems"]): Promise<Customer> {
  return (await send(
    `/customers/${encodeURIComponent(customerId)}/usual-items`,
    { method: "PUT", body: JSON.stringify({ usualItems }) },
    "Could not save the usual order. Please try again.",
  )) as Customer;
}

/** Name, mobile digits and ID number (ignoring spaces and dashes) all match the search. */
export function matchesCustomer(customer: Customer, search: string) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  const compact = text.replace(/[\s-]/g, "");
  return customer.name.toLowerCase().includes(text)
    || (!!compact && (customer.mobile ?? "").includes(compact.replace(/^\+?63/, "0")))
    || (!!compact && (customer.idNumber ?? "").toLowerCase().replace(/[\s-]/g, "").includes(compact));
}

export type CustomerDetails = { name: string; mobile: string; discountType: CustomerDiscount; idNumber: string };

/** Phase 2b: edit name, mobile, discount and ID number. */
export async function updateCustomer(customerId: string, details: CustomerDetails): Promise<Customer> {
  return (await send(`/customers/${encodeURIComponent(customerId)}`, { method: "PUT", body: JSON.stringify(details) }, "Could not save the changes. Please try again.")) as Customer;
}

/** Phase 2b: delete the profile and usual order; past sales stay. */
export async function deleteCustomer(customerId: string): Promise<void> {
  await send(`/customers/${encodeURIComponent(customerId)}`, { method: "DELETE" }, "Could not delete the customer. Please try again.");
}
