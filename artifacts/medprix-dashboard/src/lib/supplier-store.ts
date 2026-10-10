export type SupplierRecord = {
  id: string;
  name: string;
  code: string;
  contact: string;
  contactPerson?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  orders: number;
  orderValue: string;
  status: string;
};

export type AccountsPayableRecord = {
  id: string;
  supplierId: string;
  invoiceId: string;
  supplier: string;
  invoiceNumber: string;
  dueDate: string | null;
  totalOwed: string;
  totalPaid: string;
  balance: string;
  lastPaymentDate: string | null;
  status: string;
};

export type PayableSummary = {
  totalOpen: string;
  overdue: string;
  dueThisWeek: string;
};

type PayablesCache = {
  accountsPayable: AccountsPayableRecord[];
  summary: PayableSummary;
};

const suppliersKey = "medprix_supplier_records";
const payablesKey = "medprix_supplier_payables";
const emptyPayableSummary: PayableSummary = {
  totalOpen: "0.00",
  overdue: "0.00",
  dueThisWeek: "0.00",
};

function readSessionValue<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

let suppliersCache = readSessionValue<SupplierRecord[]>(suppliersKey);
let payablesCache = readSessionValue<PayablesCache>(payablesKey);
let suppliersRequest: Promise<SupplierRecord[]> | null = null;
let payablesRequest: Promise<PayablesCache> | null = null;

export function getCachedSuppliers() {
  return Array.isArray(suppliersCache) ? suppliersCache : null;
}

export function getCachedPayables() {
  if (!payablesCache || !Array.isArray(payablesCache.accountsPayable))
    return null;
  return payablesCache;
}

export async function fetchSupplierRecords() {
  if (suppliersRequest) return suppliersRequest;
  suppliersRequest = (async () => {
    const response = await fetch("/api/suppliers", { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.error || "Failed to load suppliers.");
    const suppliers = Array.isArray(data.suppliers)
      ? (data.suppliers as SupplierRecord[])
      : [];
    suppliersCache = suppliers;
    writeSessionValue(suppliersKey, suppliers);
    return suppliers;
  })();
  try {
    return await suppliersRequest;
  } finally {
    suppliersRequest = null;
  }
}

export async function fetchAccountsPayable() {
  if (payablesRequest) return payablesRequest;
  payablesRequest = (async () => {
    const response = await fetch("/api/accounts-payable", {
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.error || "Failed to load supplier payables.");
    const summary =
      data.summary && typeof data.summary === "object" ? data.summary : {};
    const result: PayablesCache = {
      accountsPayable: Array.isArray(data.accountsPayable)
        ? (data.accountsPayable as AccountsPayableRecord[])
        : [],
      summary: {
        totalOpen: String(summary.totalOpen || emptyPayableSummary.totalOpen),
        overdue: String(summary.overdue || emptyPayableSummary.overdue),
        dueThisWeek: String(
          summary.dueThisWeek || emptyPayableSummary.dueThisWeek,
        ),
      },
    };
    payablesCache = result;
    writeSessionValue(payablesKey, result);
    return result;
  })();
  try {
    return await payablesRequest;
  } finally {
    payablesRequest = null;
  }
}
