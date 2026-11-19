import { safeError, readResponse } from "./feedback";
import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import type { ProductItem, ShiftReceipt, SystemLog, UserActivity, CashReconciliationRecord } from "./types";

const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

let receiptTimeFormatter: Intl.DateTimeFormat | undefined;

export function mapTransactionsToReceipts(data: any[]): ShiftReceipt[] {
  if (!Array.isArray(data)) return [];
  return data.map((t: any) => {
    const instant = typeof t.dateTime === "string" && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(t.dateTime)
      ? new Date(t.dateTime) : null;
    const totalNum =
      parseFloat(String(t.total || "0").replace("₱", "").replace(/,/g, "")) || 0;
    const itemCount = Array.isArray(t.items)
      ? t.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)
      : 1;
    const itemsSummary =
      Array.isArray(t.items) && t.items.length > 0
        ? t.items.map((it: any) => `${it.product} (${it.quantity})`).join(", ")
        : `${itemCount} item(s)`;
    return {
      printSource: {
        transactionNumber: t.transactionNumber,
        merchantNameAtIssue: t.merchantNameAtIssue,
        calculationVersion: t.calculationVersion,
        dateTime: t.dateTime,
        user: t.user,
        payment: t.payment,
        status: t.status,
        total: t.total,
        itemsSummary: t.itemsSummary,
      },
      id: t.transactionNumber || `TRX-${t.id}`,
      rawId: t.id,
      time: instant && Number.isFinite(instant.getTime())
        ? (receiptTimeFormatter ??= new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" })).format(instant)
        : t.dateTime
        ? t.dateTime.includes(" – ")
          ? t.dateTime.split(" – ")[1]
          : t.dateTime.includes(", ")
          ? t.dateTime.split(", ").slice(-1)[0]
          : t.dateTime
        : "Time not recorded",
      dateTime: t.dateTime || "Date not recorded",
      items: itemCount,
      itemsList: t.items || [],
      itemsSummary,
      total: totalNum,
      totalFormatted: t.total || formatPeso(totalNum),
      subtotal: t.subtotal,
      vat: t.vat,
      vatRelief: t.vatRelief,
      discount: t.discount,
      discountType: t.discountType,
      amountReceived: t.amountReceived,
      change: t.change,
      method: t.payment || "Cash",
      paymentReference: t.paymentReference,
      discountHolderName: t.discountHolderName,
      discountHolderId: t.discountHolderId,
      cashier: t.user || "Cashier Staff",
      status: t.status || "Completed",
    };
  });
}

function getLocalTransactions(): any[] | null {
  try {
    const raw = sessionStorage.getItem("medprix_cached_transactions") || localStorage.getItem("medprix_cached_transactions");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return null;
}

function saveLocalTransactions(transactions: any[]) {
  try {
    const json = JSON.stringify(transactions);
    sessionStorage.setItem("medprix_cached_transactions", json);
    localStorage.setItem("medprix_cached_transactions", json);
  } catch {}
}

function getCachedAuditList<T>(key: string): T[] | null {
  try {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return null;
}

function saveCachedAuditList<T>(key: string, items: T[]) {
  try {
    const json = JSON.stringify(items);
    sessionStorage.setItem(key, json);
    localStorage.setItem(key, json);
  } catch {}
}

// Global in-memory cache shared across the single-page application
let globalInventory: ProductItem[] | null = null;
let globalTransactions: any[] | null = getLocalTransactions();
let globalReceipts: ShiftReceipt[] | null = globalTransactions
  ? mapTransactionsToReceipts(globalTransactions)
  : null;
let globalSystemLogs: SystemLog[] | null = getCachedAuditList<SystemLog>("medprix_system_logs");
let globalUserActivities: UserActivity[] | null = getCachedAuditList<UserActivity>("medprix_user_activities");

let inventoryLoadError = "";
let transactionsLoadError = "";
let hasTransactionData = globalTransactions !== null;
let inventoryRequestsPending = 0;
let isTransactionsLoading = false;
let inventoryInFlight: Promise<ProductItem[]> | null = null;
let transactionsInFlight: Promise<any[]> | null = null;
let auditInFlight: Promise<{ logs: SystemLog[]; activities: UserActivity[] }> | null = null;
let lastInventoryFetchedAt = 0;
let lastTransactionsFetchedAt = 0;
let lastAuditFetchedAt = 0;
let transactionRevision = 0;
let transactionRequest = 0;
let isBackendConnected = false;

const CACHE_TTL_MS = 60_000;

const inventoryListeners = new Set<() => void>();
const transactionListeners = new Set<() => void>();

export type PharmacySourceStatus = Readonly<{
  hasData: boolean;
  pending: boolean;
  error: string;
}>;

const inventoryStatusListeners = new Set<() => void>();
let inventoryStatus: PharmacySourceStatus = { hasData: false, pending: false, error: "" };

function publishInventoryStatus() {
  const hasData = globalInventory !== null;
  const pending = inventoryRequestsPending > 0;
  if (inventoryStatus.hasData === hasData && inventoryStatus.pending === pending && inventoryStatus.error === inventoryLoadError) return;
  inventoryStatus = { hasData, pending, error: inventoryLoadError };
  inventoryStatusListeners.forEach(listener => listener());
}

const subscribeInventoryStatus = (listener: () => void) => {
  inventoryStatusListeners.add(listener);
  return () => { inventoryStatusListeners.delete(listener); };
};
export const getPharmacyInventoryStatus = () => inventoryStatus;

/** Observe request state locally without fetching or waking data-only consumers. */
export function usePharmacyInventoryStatus() {
  return useSyncExternalStore(subscribeInventoryStatus, getPharmacyInventoryStatus, getPharmacyInventoryStatus);
}

const emptyInventory: ProductItem[] = [];
const emptyTransactions: any[] = [];
const emptyReceipts: ShiftReceipt[] = [];

const transactionStatusListeners = new Set<() => void>();
let transactionStatus: PharmacySourceStatus = { hasData: hasTransactionData, pending: false, error: "" };

function publishTransactionStatus() {
  if (transactionStatus.hasData === hasTransactionData && transactionStatus.pending === isTransactionsLoading && transactionStatus.error === transactionsLoadError) return;
  transactionStatus = { hasData: hasTransactionData, pending: isTransactionsLoading, error: transactionsLoadError };
  transactionStatusListeners.forEach(listener => listener());
}

const subscribeTransactionStatus = (listener: () => void) => {
  transactionStatusListeners.add(listener);
  return () => { transactionStatusListeners.delete(listener); };
};
export const getPharmacyTransactionsStatus = () => transactionStatus;

/** Observe transaction availability/activity without fetching or copying receipts. */
export function usePharmacyTransactionsStatus() {
  return useSyncExternalStore(subscribeTransactionStatus, getPharmacyTransactionsStatus, getPharmacyTransactionsStatus);
}

function notifyInventory() {
  inventoryListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function notifyTransactions() {
  transactionListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function getCachedSystemLogs(): SystemLog[] | null {
  return globalSystemLogs;
}

export function getCachedUserActivities(): UserActivity[] | null {
  return globalUserActivities;
}

export async function fetchAuditRecords(force = false): Promise<{ logs: SystemLog[]; activities: UserActivity[] }> {
  if (!force && globalSystemLogs && globalUserActivities && Date.now() - lastAuditFetchedAt < CACHE_TTL_MS) {
    return { logs: globalSystemLogs, activities: globalUserActivities };
  }
  if (!force && auditInFlight) {
    return auditInFlight;
  }
  const requestPromise = (async () => {
    try {
      const [logs, activities] = await Promise.all([
        fetch("/api/admin/system-logs", { credentials: "include" }).then((res) =>
          readResponse(res, "Audit records are unavailable. Refresh to retry.")
        ),
        fetch("/api/admin/user-activities", { credentials: "include" }).then((res) =>
          readResponse(res, "Audit records are unavailable. Refresh to retry.")
        ),
      ]);
      if (!Array.isArray(logs) || !Array.isArray(activities)) {
        throw new Error("Invalid audit response");
      }
      globalSystemLogs = logs;
      globalUserActivities = activities;
      lastAuditFetchedAt = Date.now();
      saveCachedAuditList("medprix_system_logs", logs);
      saveCachedAuditList("medprix_user_activities", activities);
      return { logs, activities };
    } finally {
      auditInFlight = null;
    }
  })();
  auditInFlight = requestPromise;
  return requestPromise;
}

export interface CashReconciliationRecord {
  id: string;
  reconciliationDate: string;
  cashierId?: string | null;
  cashierName: string;
  cashOnHand: number;
  totalReportedSales: number;
  discrepancyAmount: number;
  hasFlaggedInconsistency: boolean;
  notes?: string;
  reconciledAt: string;
}

let globalCashReconciliations: CashReconciliationRecord[] | null = getCachedAuditList<CashReconciliationRecord>("medprix_cash_reconciliations");
let cashReconciliationsInFlight: Promise<CashReconciliationRecord[]> | null = null;
let lastCashReconciliationsFetchedAt = 0;
const cashReconciliationListeners = new Set<() => void>();

export async function fetchCashReconciliations(force = false): Promise<CashReconciliationRecord[]> {
  if (!force && globalCashReconciliations && Date.now() - lastCashReconciliationsFetchedAt < CACHE_TTL_MS) {
    return globalCashReconciliations;
  }
  if (!force && cashReconciliationsInFlight) {
    return cashReconciliationsInFlight;
  }
  const requestPromise = (async () => {
    try {
      const res = await fetch("/api/admin/cash-reconciliations", { credentials: "include" });
      const data = await readResponse(res, "Cash reconciliation records are unavailable.");
      if (Array.isArray(data)) {
        globalCashReconciliations = data;
        lastCashReconciliationsFetchedAt = Date.now();
        saveCachedAuditList("medprix_cash_reconciliations", data);
        cashReconciliationListeners.forEach((fn) => {
          try { fn(); } catch {}
        });
        return data;
      }
      return globalCashReconciliations ?? [];
    } catch {
      return globalCashReconciliations ?? [];
    } finally {
      cashReconciliationsInFlight = null;
    }
  })();
  cashReconciliationsInFlight = requestPromise;
  return requestPromise;
}

export function usePharmacyCashReconciliations() {
  const [records, setRecords] = useState<CashReconciliationRecord[]>(() => globalCashReconciliations ?? []);
  const [loading, setLoading] = useState<boolean>(() => globalCashReconciliations === null);

  useEffect(() => {
    let mounted = true;
    const handler = () => {
      if (mounted) {
        setRecords(globalCashReconciliations ?? []);
        setLoading(false);
      }
    };
    cashReconciliationListeners.add(handler);
    fetchCashReconciliations().then((data) => {
      if (mounted) {
        setRecords(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
      cashReconciliationListeners.delete(handler);
    };
  }, []);

  const refresh = useCallback(() => fetchCashReconciliations(true), []);
  return { records, loading, refresh };
}

export async function fetchInventoryData(force = false): Promise<ProductItem[]> {
  if (!force && isBackendConnected && globalInventory && Date.now() - lastInventoryFetchedAt < CACHE_TTL_MS) {
    return globalInventory;
  }
  if (!force && inventoryInFlight) {
    return inventoryInFlight;
  }
  inventoryRequestsPending++;
  const requestPromise = (async () => {
    try {
      const response = await fetch("/api/inventory", { credentials: "include" });
      const data = await readResponse(response, "Could not refresh inventory. Please try again.");
      if (!Array.isArray(data.products)) throw new Error("Invalid stock response. Please refresh inventory.");
      globalInventory = data.products;
      inventoryLoadError = "";
      lastInventoryFetchedAt = Date.now();
      isBackendConnected = true;
      return data.products;
    } catch (failure) {
      inventoryLoadError = safeError(failure, "Could not refresh inventory. Please try again.");
    } finally {
      inventoryRequestsPending--;
      inventoryInFlight = null;
      publishInventoryStatus();
      notifyInventory();
    }
    return globalInventory ?? [];
  })();
  inventoryInFlight = requestPromise;
  publishInventoryStatus();
  return requestPromise;
}

export async function fetchTransactionsData(force = false): Promise<any[]> {
  if (!force && globalTransactions && Date.now() - lastTransactionsFetchedAt < CACHE_TTL_MS) {
    return globalTransactions;
  }
  if (transactionsInFlight) {
    return transactionsInFlight;
  }
  const request = ++transactionRequest;
  const revision = transactionRevision;
  isTransactionsLoading = true;
  const requestPromise = (async () => {
    try {
      const res = await fetch("/api/admin/transactions", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        if (request === transactionRequest && revision === transactionRevision) {
          clearTransactionSession();
          transactionsLoadError = safeError({ status: res.status });
          publishTransactionStatus();
        }
        return [];
      }
      const data = await readResponse(res, "Could not refresh transactions. Please try again.");
      if (!Array.isArray(data)) throw new Error("Invalid transaction response. Please refresh transactions.");
      // A confirmed local save or newer fetch wins over an older response.
      if (revision !== transactionRevision) return globalTransactions || [];
      globalTransactions = [...data].sort((a, b) => new Date(b.createdAt ?? b.dateTime).getTime() - new Date(a.createdAt ?? a.dateTime).getTime());
      globalReceipts = mapTransactionsToReceipts(globalTransactions);
      hasTransactionData = true;
      transactionsLoadError = "";
      lastTransactionsFetchedAt = Date.now();
      saveLocalTransactions(globalTransactions);
      return globalTransactions;
    } catch (err) {
      if (request === transactionRequest && revision === transactionRevision) {
        transactionsLoadError = safeError(err, "Could not refresh transactions. Please try again.");
      }
    } finally {
      if (request === transactionRequest) {
        isTransactionsLoading = false;
        transactionsInFlight = null;
        publishTransactionStatus();
        notifyTransactions();
      }
    }
    return globalTransactions || [];
  })();
  transactionsInFlight = requestPromise;
  publishTransactionStatus();
  return requestPromise;
}

export function setCachedInventory(products: ProductItem[]) {
  globalInventory = products;
  lastInventoryFetchedAt = Date.now();
  publishInventoryStatus();
  notifyInventory();
}

// Clear history at authentication boundaries, invalidating older in-flight responses.
// Unconfirmed checkout state in sessionStorage is deliberately retained for reconciliation.
export function clearTransactionSession() {
  transactionRequest++;
  transactionRevision++;
  globalTransactions = [];
  globalReceipts = [];
  globalSystemLogs = null;
  globalUserActivities = null;
  lastTransactionsFetchedAt = 0;
  lastAuditFetchedAt = 0;
  isTransactionsLoading = false;
  hasTransactionData = false;
  transactionsLoadError = "";
  transactionsInFlight = null;
  auditInFlight = null;
  try {
    for (const key of ["medprix_cached_transactions", "medprix_system_logs", "medprix_user_activities"]) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {}
  publishTransactionStatus();
  notifyTransactions();
}

export function setCachedTransactions(transactions: any[]) {
  transactionRevision++;
  globalTransactions = transactions;
  globalReceipts = mapTransactionsToReceipts(transactions);
  hasTransactionData = true;
  transactionsLoadError = "";
  lastTransactionsFetchedAt = Date.now();
  saveLocalTransactions(transactions);
  publishTransactionStatus();
  notifyTransactions();
}

export function deductProductStock(
  allocations: Array<{ productId: string; batchNumber?: string; quantity: number }>
) {
  const current = globalInventory ?? [];
  const updated = current.map((p) => {
    const matchingAllocations = allocations.filter(
      (a) => a.productId === p.id || a.productId === p.sku
    );
    if (matchingAllocations.length === 0) return p;

    let newBatches = [...(p.batches || [])];
    let totalDeducted = 0;

    for (const alloc of matchingAllocations) {
      const targetBatch = newBatches.find(
        (b) =>
          alloc.batchNumber &&
          b.batchNumber.toLowerCase() === alloc.batchNumber.toLowerCase()
      );
      if (targetBatch) {
        targetBatch.quantity = Math.max(0, targetBatch.quantity - alloc.quantity);
      } else if (newBatches.length > 0) {
        newBatches[0].quantity = Math.max(0, newBatches[0].quantity - alloc.quantity);
      }
      totalDeducted += alloc.quantity;
    }

    const newStock = Math.max(0, (p.stock || 0) - totalDeducted);
    return {
      ...p,
      stock: newStock,
      batches: newBatches,
      status: newStock === 0 ? "Out of stock" : newStock <= p.reorder ? "Low stock" : "Available",
    };
  });

  setCachedInventory(updated);
}

export function recordTransaction(transaction: any) {
  const currentTx = globalTransactions ?? [];
  const updatedTx = [
    transaction,
    ...currentTx.filter(
      (t) =>
        !(transaction.id != null && t.id === transaction.id && t.source === transaction.source)
    ),
  ];
  setCachedTransactions(updatedTx);
}

export function prefetchPharmacyData(role?: string) {
  void fetchInventoryData();
  void fetchTransactionsData();
  if (!role || role === "Admin") {
    void fetchAuditRecords().catch(() => undefined);
  }
}

/**
 * Hook for Inventory products
 */
export function usePharmacyInventory() {
  const [error, setError] = useState(inventoryLoadError);
  const [items, setItemsState] = useState<ProductItem[]>(() => globalInventory ?? emptyInventory);
  const [loading, setLoading] = useState<boolean>(() => globalInventory === null);

  useEffect(() => {
    const handler = () => {
      setError(inventoryLoadError);
      setLoading(false);
      setItemsState(globalInventory ?? emptyInventory);
    };
    inventoryListeners.add(handler);

    void fetchInventoryData().then(handler);

    return () => {
      inventoryListeners.delete(handler);
    };
  }, []);

  const setItems = useCallback((newItems: ProductItem[] | ((prev: ProductItem[]) => ProductItem[])) => {
    if (typeof newItems === "function") {
      const updated = newItems(globalInventory ?? []);
      setCachedInventory(updated);
    } else {
      setCachedInventory(newItems);
    }
  }, []);

  const refresh = useCallback(() => fetchInventoryData(true), []);

  return { items, setItems, loading, refresh, isBackendConnected, error };
}

/**
 * Hook for Transactions & Shift Receipts
 */
export function usePharmacyTransactions() {
  const [transactions, setTransactionsState] = useState<any[]>(() => globalTransactions ?? emptyTransactions);
  const [receipts, setReceiptsState] = useState<ShiftReceipt[]>(() => globalReceipts ?? emptyReceipts);
  const [loading, setLoading] = useState<boolean>(() => globalTransactions === null);

  useEffect(() => {
    const handler = () => {
      setTransactionsState(globalTransactions ?? emptyTransactions);
      setReceiptsState(globalReceipts ?? emptyReceipts);
      setLoading(false);
    };
    transactionListeners.add(handler);
    const refreshOnFocus = () => { void fetchTransactionsData(false); };
    const refreshOnStorage = (event: StorageEvent) => {
      if (event.key === "medprix_cached_transactions") void fetchTransactionsData(true);
    };
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("storage", refreshOnStorage);

    void fetchTransactionsData().then(handler);

    return () => {
      transactionListeners.delete(handler);
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("storage", refreshOnStorage);
    };
  }, []);

  const setTransactions = useCallback((newTx: any[] | ((prev: any[]) => any[])) => {
    if (typeof newTx === "function") {
      const updated = newTx(globalTransactions ?? []);
      setCachedTransactions(updated);
    } else {
      setCachedTransactions(newTx);
    }
  }, []);

  const setReceipts = useCallback((newReceipts: ShiftReceipt[] | ((prev: ShiftReceipt[]) => ShiftReceipt[])) => {
    if (typeof newReceipts === "function") {
      const updated = newReceipts(globalReceipts ?? []);
      globalReceipts = updated;
    } else {
      globalReceipts = newReceipts;
    }
    notifyTransactions();
  }, []);

  const refresh = useCallback(() => fetchTransactionsData(true), []);

  return { transactions, receipts, loading, refresh, setTransactions, setReceipts };
}
