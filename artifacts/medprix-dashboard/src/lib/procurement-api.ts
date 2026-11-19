import { readResponse } from "@/lib/feedback";
import type { SupplierTerms, SupplierTermsBasis, SupplierPaymentMode, PoSendMethod, DeliveryRejectionReason } from "@workspace/api-zod";

/** Shapes returned by /api/purchase-orders (see api-server procurement-store). */
export type OrderStage = "Draft" | "For approval" | "Approved" | "Sent" | "Partly received" | "Received" | "Closed short" | "Cancelled";
export type NextStep = "submit" | "approve" | "send" | "receive" | "invoice" | "verify" | "pay" | null;

export type OrderSummary = {
  id: string; poNumber: string; supplierId: string; supplier: string; paymentTerms: SupplierTerms; termsBasis: SupplierTermsBasis;
  status: string; stage: OrderStage; nextStep: NextStep; orderDate: string; updatedAt: string; expectedDeliveryDate: string | null;
  sentAt: string | null; sentMethod: PoSendMethod | null; totalOrderAmount: string; itemCount: number; unitsOrdered: number;
  unitsReceived: number; lastDeliveryDate: string | null; invoiceCount: number; pendingInvoices: number; uninvoicedValue: string;
  balance: string; nextDueDate: string | null; overdue: boolean; late: boolean; createdBy: string | null; approvedBy: string | null;
  selfApproved: boolean;
};

export type OrderLine = {
  productId: string; product: string; sku: string; unitCost: string;
  quantityOrdered: number; quantityReceived: number; quantityRejected: number; quantityRemaining: number;
};
export type Delivery = {
  id: string; deliveryDate: string; status: string; receiptNumber: string | null; notes: string | null; receivedBy: string | null; createdAt: string;
  items: { productId: string; product: string; sku: string; batchNumber: string; expirationDate: string; quantity: number; shortExpiry: boolean }[];
  rejections: { productId: string; product: string; sku: string; quantity: number; reason: DeliveryRejectionReason; batchNumber: string | null; expirationDate: string | null; notes: string | null }[];
};
export type Payment = {
  id: string; paymentDate: string; amount: string; mode: SupplierPaymentMode | null; referenceNumber: string | null;
  supplierOrNumber: string | null; adviceNumber: string | null; isPrepayment: boolean; notes: string | null; recordedBy: string | null;
};
export type Invoice = {
  id: string; invoiceNumber: string; invoiceDate: string; dueDate: string; amount: string; status: "PendingVerification" | "Verified";
  terms: SupplierTerms; termsBasis: SupplierTermsBasis; termsOverrideReason: string | null; varianceReason: string | null;
  apId: string | null; totalPaid: string; balance: string; payable: boolean; recordedBy: string | null; verifiedBy: string | null;
  verifiedAt: string | null; overdue: boolean; payments: Payment[];
};
export type OrderEvent = { id: string; type: string; actor: string | null; role: string | null; details: string | null; at: string };
export type OrderDetail = {
  today: string;
  order: {
    id: string; poNumber: string; status: string; stage: OrderStage; orderDate: string; expectedDeliveryDate: string | null;
    notes: string | null; totalOrderAmount: string; sentAt: string | null; sentMethod: PoSendMethod | null; sentBy: string | null;
    createdBy: string | null; approvedBy: string | null; approvedAt: string | null; selfApproved: boolean;
    closedAt: string | null; closeReason: string | null;
    supplier: { id: string; name: string; contactPerson: string | null; contactNumber: string | null; email: string | null; address: string | null; paymentTerms: SupplierTerms; termsBasis: SupplierTermsBasis };
  };
  lines: OrderLine[]; deliveries: Delivery[]; invoices: Invoice[]; events: OrderEvent[];
  receivedValue: string; invoicedValue: string; uninvoicedValue: string;
};
export type PaymentAdvice = {
  payment: Payment & { createdAt: string; recordedByRole: string | null };
  invoice: { id: string; apId: string; invoiceNumber: string; invoiceDate: string; dueDate: string; amount: string; status: string; poNumber: string | null; poId: string | null; paidBefore: string; balanceAfter: string; currentBalance: string };
  supplier: { name: string; contactPerson: string | null; contactNumber: string | null; email: string | null; address: string | null };
};

export class ProcurementRequestError extends Error {
  constructor(message: string, public status: number, public errors: Record<string, string> = {}) { super(message); }
}

async function call<T>(path: string, init: RequestInit & { key?: string } = {}, fallback = "The request could not be completed. Try again."): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.key) headers.set("Idempotency-Key", init.key);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "include", cache: "no-store" });
  } catch {
    // Offline or dropped connection: nothing is known about the save, so the caller keeps its key and can retry safely.
    throw new ProcurementRequestError("No connection. Nothing was confirmed; check your connection and press the same button again.", 0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status >= 500 || response.status === 0)
      throw new ProcurementRequestError(data?.error && response.status === 503 ? data.error : fallback, response.status);
    throw new ProcurementRequestError(
      response.status === 401 ? "Your session has expired. Sign in again." : response.status === 403 ? data?.error || "You don't have permission for this step." : data?.error || fallback,
      response.status, data?.errors ?? {},
    );
  }
  return readResponse(response, fallback) as Promise<T>;
}
const post = <T>(path: string, body: unknown, key?: string) => call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}), key });

export const procurementApi = {
  listOrders: () => call<{ today: string; orders: OrderSummary[] }>("/api/purchase-orders", {}, "Could not load purchase orders."),
  readOrder: (id: string) => call<OrderDetail>(`/api/purchase-orders/${id}`, {}, "Could not load this purchase order."),
  createOrder: (body: { supplierId: string; items: { productId: string; quantityOrdered: number; unitCost: string }[]; expectedDeliveryDate?: string | null; notes?: string; submit: boolean }) =>
    post<OrderDetail>("/api/purchase-orders", body),
  updateOrder: (id: string, body: { items: { productId: string; quantityOrdered: number; unitCost: string }[]; expectedDeliveryDate?: string | null; notes?: string }) =>
    call<OrderDetail>(`/api/purchase-orders/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  submit: (id: string) => post<OrderDetail>(`/api/purchase-orders/${id}/submit`, {}),
  approve: (id: string) => post<OrderDetail>(`/api/purchase-orders/${id}/approve`, {}),
  returnForChanges: (id: string, reason: string) => post<OrderDetail>(`/api/purchase-orders/${id}/return`, { reason }),
  send: (id: string, body: { method: PoSendMethod; expectedDeliveryDate?: string | null }) => post<OrderDetail>(`/api/purchase-orders/${id}/send`, body),
  cancel: (id: string, reason: string) => post<OrderDetail>(`/api/purchase-orders/${id}/cancel`, { reason }),
  closeShort: (id: string, reason: string) => post<OrderDetail>(`/api/purchase-orders/${id}/close-short`, { reason }),
  receive: (id: string, key: string, body: ReceiveBody) => post<OrderDetail & { warnings: string[]; replayed: boolean }>(`/api/purchase-orders/${id}/deliveries`, body, key),
  recordInvoice: (id: string, key: string, body: InvoiceBody) => post<OrderDetail & { replayed: boolean }>(`/api/purchase-orders/${id}/invoices`, body, key),
  verifyInvoice: (invoiceId: string, varianceReason?: string) => post<OrderDetail>(`/api/supplier-invoices/${invoiceId}/verify`, { varianceReason }),
  recordPayment: (key: string, body: PaymentBody) => post<PaymentAdvice & { replayed: boolean }>("/api/supplier-payments", body, key),
  readPayment: (id: string) => call<PaymentAdvice>(`/api/supplier-payments/${id}`, {}, "Could not load this payment."),
  addReceipt: (id: string, supplierOrNumber: string) =>
    call<PaymentAdvice>(`/api/supplier-payments/${id}/receipt`, { method: "PATCH", body: JSON.stringify({ supplierOrNumber }) }),
  updateSupplierTerms: (id: string, paymentTerms: SupplierTerms, termsBasis: SupplierTermsBasis) =>
    call<{ supplier: unknown }>(`/api/suppliers/${id}/terms`, { method: "PATCH", body: JSON.stringify({ paymentTerms, termsBasis }) }),
};

export type ReceiveLine = {
  productId: string; quantityAccepted: number; batchNumber?: string; expirationDate?: string;
  quantityRejected?: number; rejectionReason?: DeliveryRejectionReason; rejectionNotes?: string;
};
export type ReceiveBody = { deliveryDate: string; receiptNumber?: string; notes?: string; lines: ReceiveLine[] };
export type InvoiceBody = {
  kind: "Received" | "Advance"; invoiceNumber: string; invoiceDate: string; amount: string;
  varianceReason?: string; termsOverride?: SupplierTerms; overrideReason?: string;
};
export type PaymentBody = {
  apId: string; amount: string; paymentDate: string; mode: SupplierPaymentMode;
  referenceNumber?: string; supplierOrNumber?: string; notes?: string;
};

/** Stage → pill colour, shared by the list, the panel and the supplier page. */
export function stageTone(stage: OrderStage): string {
  switch (stage) {
    case "Draft": return "pill neutral";
    case "For approval": return "pill orange";
    case "Approved": return "pill blue";
    case "Sent": return "pill yellow";
    case "Partly received": return "pill yellow";
    case "Received": return "pill success";
    case "Closed short": return "pill neutral";
    case "Cancelled": return "pill danger";
  }
}

export const NEXT_STEP_LABEL: Record<Exclude<NextStep, null>, string> = {
  submit: "Send for approval", approve: "Review", send: "Send to supplier", receive: "Receive delivery",
  invoice: "Record invoice", verify: "Verify invoice", pay: "Record payment",
};

export const peso = (value: string | number | null | undefined) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "0").replace(/[₱,\s]/g, ""));
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
};
export const newKey = () => crypto.randomUUID();


/**
 * Purchase-order list kept between page visits (like Inventory and Wholesale), so opening Procurement shows the last
 * list straight away while a fresh copy loads quietly. Filled at sign-in and on every load.
 */
export type ProcurementListCache = { orders: OrderSummary[]; today: string; suppliers: { id: string; name: string; paymentTerms: SupplierTerms }[] };
let procurementCache: ProcurementListCache | null = null;
let procurementInFlight: Promise<ProcurementListCache> | null = null;
export const getProcurementCache = () => procurementCache;
export function loadProcurementList(): Promise<ProcurementListCache> {
  if (procurementInFlight) return procurementInFlight;
  procurementInFlight = Promise.all([
    procurementApi.listOrders(),
    fetch("/api/suppliers", { credentials: "include", cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject(new Error("suppliers"))),
  ]).then(([list, supplierData]) => {
    procurementCache = {
      orders: list.orders, today: list.today,
      suppliers: (supplierData.suppliers ?? []).map((s: { id: string; name: string; paymentTerms: SupplierTerms }) => ({ id: s.id, name: s.name, paymentTerms: s.paymentTerms })),
    };
    return procurementCache;
  }).finally(() => { procurementInFlight = null; });
  return procurementInFlight;
}
export const clearProcurementCache = () => { procurementCache = null; };
