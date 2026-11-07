import { safeError } from "./feedback";

export type WholesaleProduct = {
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  id: string;
  sku: string;
  name: string;
  wholesalePrice: string | null;
  isVatExempt: boolean | null;
};

export type WholesaleClient = {
  id: string;
  name: string;
  address: string | null;
};

export type WholesaleLine = {
  productId: string;
  quantity: number;
};

export type WholesaleOrder = {
  id: string;
  orderNumber: string;
  revision: number;
  status: string;
  clientId: string;
  clientName: string;
  total: string;
  updatedAt: string;
  lines: Array<WholesaleLine & { unitPrice: string; name: string }>;
};

export type WholesaleRequest = {
  key: string;
  path: string;
  method: string;
  body: unknown;
};

export async function wholesaleGet<T>(path: string): Promise<T> {
  const response = await fetch("/api/wholesale" + path, {
    credentials: "include",
  });
  if (!response.ok)
    throw new Error("Wholesale records are unavailable. Refresh to retry.");
  return response.json();
}

export async function wholesaleWrite(request: WholesaleRequest) {
  const response = await fetch("/api/wholesale" + request.path, {
    method: request.method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": request.key,
    },
    body: JSON.stringify(request.body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      safeError(
        { status: response.status, data },
        "The result is uncertain. Retry the saved request.",
      ),
    );
    Object.assign(error, {
      definitive: response.status >= 400 && response.status < 500,
    });
    throw error;
  }
  if (!data)
    throw new Error("The result is uncertain. Retry the saved request.");
  return data;
}
export const wholesalePeso = (value: string | null) =>
  value === null
    ? "Not configured"
    : new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(Number(value));

export type WholesaleOverride = {
  id: string;
  productId: string;
  revision: number;
  price: string;
  reason: string;
  approvalReason: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
};
export type WholesaleOrderDetail = {
  attempts: Array<{
    id: string;
    date: string;
    status: string;
    notes: string | null;
  }>;
  receipt: { receiptId: string; snapshot: DeliveryReceipt } | null;
  snapshot: null | {
    clientName: string;
    address: string;
    total: string;
    vat: string;
    lines: Array<
      WholesaleLine & {
        name: string;
        unitPrice: string;
        originalPrice: string;
        override: null | { adminId: string; reason: string };
      }
    >;
  };
  overrides: WholesaleOverride[];
  reservations: Array<{
    id: string;
    quantity: number;
    batchNumber: string;
    expiry: string;
    product: string;
    releasedAt: string | null;
    consumedAt: string | null;
  }>;
};

export type DeliveryReceipt = {
  merchantName: string;
  receiptNumber: string;
  orderNumber: string;
  clientName: string;
  address: string;
  deliveredAt: string;
  receivedBy: string;
  dueDate: string;
  total: string;
  vat: string;
  calculationVersion: string;
  lines: Array<{
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: string;
    total: string;
    vat: string;
    isVatExempt: boolean;
  }>;
  batches: Array<{
    productId: string;
    batchNumber: string;
    expiry: string;
    quantity: number;
  }>;
};
export type DeliveryReceiptSummary = {
  id: string;
  receiptNumber: string;
  orderNumber: string;
  clientName: string;
  deliveredAt: string;
};
