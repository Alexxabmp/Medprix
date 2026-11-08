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
  return writeWholesaleRequest("/api/wholesale", request);
}

async function writeWholesaleRequest(base: string, request: WholesaleRequest) {
  const response = await fetch(base + request.path, {
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

export type WholesaleAccountFilter = "all" | "outstanding" | "overdue" | "paid";

export type WholesaleOverview = {
  today: string;
  openOrders: number;
  activeDeliveries: number;
  drafts: number;
  outstanding: string;
  overdue: string;
  overdueCount: number;
};

export type WholesaleReceivable = {
  status: string;
  id: string;
  orderNumber: string;
  clientName: string;
  total: string;
  paid: string;
  balance: string;
  dueDate: string;
  deliveredAt: string;
};
export type WholesaleReceivablePage = {
  items: WholesaleReceivable[];
  total: number;
  page: number;
  pageSize: number;
};
export type WholesaleCollection = {
  id: string;
  amount: string;
  collectedAt: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  collectorId: string | null;
  collectorName: string | null;
  reversalId: string | null;
  reversalReason: string | null;
  reversedAt: string | null;
};
export type WholesaleReceivableDetail = WholesaleReceivable & {
  payments: WholesaleCollection[];
  reviewRequired: boolean;
  methods: string[];
};
export function wholesaleDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function wholesaleManilaInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    fractionalSecondDigits: 3,
  }).formatToParts(new Date());
  const value = (name: string) =>
    parts.find((part) => part.type === name)!.value;
  return (
    value("year") +
    "-" +
    value("month") +
    "-" +
    value("day") +
    "T" +
    value("hour") +
    ":" +
    value("minute") +
    ":" +
    value("second") +
    "." +
    value("fractionalSecond")
  );
}

export type WholesalePendingOrder = {
  id: string;
  orderNumber: string;
  clientName: string;
  status: string;
  total: string;
};
export type WholesaleDelivery = {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  date: string;
  status: string;
  notes: string | null;
};
export type WholesalePageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
