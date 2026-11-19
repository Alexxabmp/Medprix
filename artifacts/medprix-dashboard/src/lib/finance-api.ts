import type { ExpenseCategory } from "@workspace/api-zod";

/** Shapes returned by /api/finance/* (api-server finance-read-model and expense-store). Amounts are decimal strings. */
export type FinanceSummaryData = {
  from: string; to: string; asOf: string;
  revenue: { retail: string; wholesale: string; total: string };
  costOfGoodsSold: string; grossProfit: string; grossMargin: number | null;
  operatingExpenses: string; operatingExpenseEntries: number; netIncome: string; netMargin: number | null;
  moneyIn: { retailSales: string; wholesaleCollections: string; total: string };
  moneyOut: { supplierPayments: string; operatingExpenses: string; total: string };
  accountsReceivable: { outstanding: string; overdue: string; overdueCount: number; needsReviewCount: number; needsReviewAmount: string };
  accountsPayable: { outstanding: string; overdue: string; overdueCount: number; needsReviewCount: number; needsReviewAmount: string; pendingVerificationCount: number; pendingVerificationAmount: string };
  itemsMissingCost: { count: number; affectedRevenue: string };
  warnings: string[]; operatingExpensesNote: string;
};
export type OverdueRow = { id: string; name: string; reference: string | null; balance: string; overdue: string; oldestDue: string | null; daysOverdue: number | null };
export type FinanceDetails = {
  from: string; to: string;
  overdueReceivables: OverdueRow[]; overduePayables: OverdueRow[];
  expensesByCategory: { category: ExpenseCategory; total: string; entries: number }[];
  discounts: { type: string; transactions: number; amount: string }[];
  regulatedItems: { id: string; name: string; sku: string; dangerousDrug: boolean; prescription: boolean; transactions: number; units: number; sales: string }[];
};
export type Expense = {
  id: string; expenseDate: string; category: ExpenseCategory; amount: string; payee: string | null; referenceNumber: string | null;
  description: string; recordedBy: string | null; createdAt: string; voidedAt: string | null; voidedBy: string | null; voidReason: string | null;
};

export class FinanceRequestError extends Error {
  constructor(message: string, public status: number, public errors: Record<string, string> = {}) { super(message); }
}
async function call<T>(path: string, init: RequestInit & { key?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.key) headers.set("Idempotency-Key", init.key);
  let response: Response;
  try { response = await fetch(path, { ...init, headers, credentials: "include", cache: "no-store" }); }
  catch { throw new FinanceRequestError("No connection. Nothing was saved; check your connection and try again.", 0); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 401 ? "Your session has expired. Sign in again." : data?.error || "Financial records are unavailable right now.";
    throw new FinanceRequestError(message, response.status, data?.errors ?? {});
  }
  return data as T;
}
const range = (from: string, to: string) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

export const financeApi = {
  summary: (from: string, to: string) => call<FinanceSummaryData>(`/api/finance/summary?${range(from, to)}`),
  details: (from: string, to: string) => call<FinanceDetails>(`/api/finance/details?${range(from, to)}`),
  expenses: (from: string, to: string) => call<{ expenses: Expense[] }>(`/api/finance/expenses?${range(from, to)}`),
  recordExpense: (key: string, body: { expenseDate: string; category: ExpenseCategory; amount: string; description: string; payee?: string; referenceNumber?: string }) =>
    call<{ expense: Expense; replayed: boolean }>("/api/finance/expenses", { method: "POST", body: JSON.stringify(body), key }),
  voidExpense: (id: string, reason: string) => call<{ expense: Expense }>(`/api/finance/expenses/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) }),
};

/** Calendar helpers in Manila time. */
export const manilaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
export type PeriodKey = "thisMonth" | "lastMonth" | "thisYear" | "allTime" | "custom";
export function periodRange(key: Exclude<PeriodKey, "custom">, today = manilaToday()): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case "thisMonth": return { from: `${today.slice(0, 7)}-01`, to: today };
    case "lastMonth": return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) };
    case "thisYear": return { from: `${y}-01-01`, to: today };
    case "allTime": return { from: "2000-01-01", to: today };
  }
}
export const money = (value: string | number | null | undefined) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "0").replace(/[₱,\s]/g, ""));
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
};
export const percent = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);
