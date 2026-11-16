import { safeError } from "./feedback";
import { formatDisplayDateTime } from "./business-date";
import type {
  WholesaleAgreement,
  WholesalePaymentPlan,
  WholesaleInstallmentSchedule,
  WholesaleInstallmentBalance,
  WholesalePaymentAllocation,
} from "@workspace/api-zod";

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
  paymentPlan: WholesalePaymentPlan | null;
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

const wholesaleMemoryCache = new Map<
  string,
  { data: unknown; fetchedAt: number }
>();
const wholesaleInFlight = new Map<string, Promise<unknown>>();
const WHOLESALE_STORAGE_PREFIX = "medprix_wholesale_cache:";

export function getCachedWholesale<T>(path: string): T | null {
  const mem = wholesaleMemoryCache.get(path);
  if (mem) return mem.data as T;
  try {
    const raw =
      sessionStorage.getItem(WHOLESALE_STORAGE_PREFIX + path) ||
      localStorage.getItem(WHOLESALE_STORAGE_PREFIX + path);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      wholesaleMemoryCache.set(path, { data: parsed, fetchedAt: 0 });
      return parsed;
    }
  } catch {}
  return null;
}

function setCachedWholesale(path: string, data: unknown) {
  wholesaleMemoryCache.set(path, { data, fetchedAt: Date.now() });
  try {
    const json = JSON.stringify(data);
    sessionStorage.setItem(WHOLESALE_STORAGE_PREFIX + path, json);
    localStorage.setItem(WHOLESALE_STORAGE_PREFIX + path, json);
  } catch {}
}

export function clearWholesaleCache() {
  wholesaleMemoryCache.clear();
}

export async function wholesaleGet<T>(path: string, force = false): Promise<T> {
  const mem = wholesaleMemoryCache.get(path);
  if (!force && mem && Date.now() - mem.fetchedAt < 30_000) {
    return mem.data as T;
  }
  const existing = wholesaleInFlight.get(path);
  if (!force && existing) {
    return existing as Promise<T>;
  }
  const requestPromise = (async () => {
    try {
      const response = await fetch("/api/wholesale" + path, {
        credentials: "include",
      });
      if (!response.ok)
        throw new Error("Wholesale records are unavailable. Refresh to retry.");
      const data = await response.json();
      setCachedWholesale(path, data);
      return data as T;
    } finally {
      wholesaleInFlight.delete(path);
    }
  })();
  wholesaleInFlight.set(path, requestPromise);
  return requestPromise;
}

export function prefetchWholesaleData() {
  void Promise.allSettled([
    wholesaleGet("/clients"),
    wholesaleGet("/catalog"),
    wholesaleGet("/orders"),
    wholesaleGet("/delivery-receipts"),
    wholesaleGet("/overview"),
    wholesaleGet("/accounts-receivable?search=&page=1&status=all"),
  ]);
}

export async function wholesaleWrite(request: WholesaleRequest) {
  const result = await writeWholesaleRequest("/api/wholesale", request);
  clearWholesaleCache();
  return result;
}

async function writeWholesaleRequest(base: string, request: WholesaleRequest) {
  let response: Response;
  try {
    response = await fetch(base + request.path, {
      method: request.method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": request.key,
      },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(
      "The result is uncertain. Retry the saved request. You can close this window and browse records.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      safeError(
        { status: response.status, data },
        "The result is uncertain. Retry the saved request.",
      ),
    );
    Object.assign(error, {
      definitive:
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408,
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
  client?: WholesaleClient;
  attempts: Array<{
    id: string;
    date: string;
    status: string;
    notes: string | null;
    dispatchedAt: string | null;
  }>;
  receipt: { receiptId: string; snapshot: DeliveryReceipt } | null;
  snapshot:
    | null
    | (WholesaleAgreement & {
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
      });
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
  recordedAt: string;
  installmentSchedule: WholesaleInstallmentSchedule;
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

export type WholesaleAccountFilter =
  "all" | "outstanding" | "overdue" | "paid" | "deadline";

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
  paymentPlan: WholesalePaymentPlan;
  asOfDate: string;
  overdueAmount: string;
  overdueInstallmentCount: number;
  nextDueDate: string | null;
  nextDueAmount: string;
  finalDeadlineBreached: boolean;
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
  method: string;
  reference: string | null;
  notes: string | null;
  collectorId: string;
  collectorName: string;
  reversalId: string | null;
  reversalReason: string | null;
  reversedAt: string | null;
  allocations: WholesalePaymentAllocation[];
};
export type WholesaleReceivableDetail = WholesaleReceivable & {
  payments: WholesaleCollection[];
  schedule: WholesaleInstallmentSchedule;
  installments: WholesaleInstallmentBalance[];
  methods: string[];
};
export function wholesaleDateTime(value: string) {
  return formatDisplayDateTime(value, "Asia/Manila");
}
export function wholesaleManilaInput(instant = new Date()) {
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
  }).formatToParts(instant);
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
