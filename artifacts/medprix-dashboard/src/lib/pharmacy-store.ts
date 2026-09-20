import { useState, useEffect, useCallback } from "react";
import type { ProductItem, ShiftReceipt } from "./types";

const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function mapTransactionsToReceipts(data: any[]): ShiftReceipt[] {
  if (!Array.isArray(data)) return [];
  return data.map((t: any) => {
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
      id: t.transactionNumber || `TRX-${t.id}`,
      rawId: t.id,
      time: t.dateTime
        ? t.dateTime.includes(" – ")
          ? t.dateTime.split(" – ")[1]
          : t.dateTime.includes(", ")
          ? t.dateTime.split(", ").slice(-1)[0]
          : t.dateTime
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      dateTime: t.dateTime || new Date().toLocaleString(),
      items: itemCount,
      itemsList: t.items || [],
      itemsSummary,
      total: totalNum,
      totalFormatted: t.total || formatPeso(totalNum),
      subtotal: t.subtotal,
      vat: t.vat,
      discount: t.discount,
      amountReceived: t.amountReceived,
      change: t.change,
      method: t.payment || "Cash",
      cashier: t.user || "Maria Santos",
      status: t.status || "Completed",
    };
  });
}

// Global in-memory cache shared across the entire single-page app
let globalInventory: ProductItem[] | null = null;
let globalTransactions: any[] | null = null;
let globalReceipts: ShiftReceipt[] | null = null;
let isInventoryLoading = false;
let isTransactionsLoading = false;
let isBackendConnected = false;

const inventoryListeners = new Set<() => void>();
const transactionListeners = new Set<() => void>();

function notifyInventory() {
  inventoryListeners.forEach((fn) => fn());
}

function notifyTransactions() {
  transactionListeners.forEach((fn) => fn());
}

export async function fetchInventoryData(): Promise<ProductItem[]> {
  if (isInventoryLoading && globalInventory) return globalInventory;
  isInventoryLoading = true;
  try {
    const res = await fetch("/api/inventory", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.products)) {
        globalInventory = data.products;
        isBackendConnected = true;
        notifyInventory();
        return globalInventory;
      }
    }
  } catch (err) {
    console.warn("Inventory fetch error:", err);
  } finally {
    isInventoryLoading = false;
  }
  return globalInventory || [];
}

export async function fetchTransactionsData(): Promise<any[]> {
  if (isTransactionsLoading && globalTransactions) return globalTransactions;
  isTransactionsLoading = true;
  try {
    const res = await fetch("/api/admin/transactions", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        globalTransactions = data;
        globalReceipts = mapTransactionsToReceipts(data);
        notifyTransactions();
        return globalTransactions;
      }
    }
  } catch (err) {
    console.warn("Transactions fetch error:", err);
  } finally {
    isTransactionsLoading = false;
  }
  return globalTransactions || [];
}

export function setCachedInventory(products: ProductItem[]) {
  globalInventory = products;
  notifyInventory();
}

export function setCachedTransactions(transactions: any[]) {
  globalTransactions = transactions;
  globalReceipts = mapTransactionsToReceipts(transactions);
  notifyTransactions();
}

export function prefetchPharmacyData() {
  fetchInventoryData();
  fetchTransactionsData();
}

/**
 * Hook for Inventory products
 * Synchronously provides cached items if already fetched so numbers never glitch or reset to []
 */
export function usePharmacyInventory() {
  const [items, setItemsState] = useState<ProductItem[]>(() => globalInventory ?? []);
  const [loading, setLoading] = useState<boolean>(() => globalInventory === null);

  useEffect(() => {
    const handler = () => {
      if (globalInventory) {
        setItemsState(globalInventory);
        setLoading(false);
      }
    };
    inventoryListeners.add(handler);

    if (globalInventory === null) {
      fetchInventoryData().then((data) => {
        setItemsState(data);
        setLoading(false);
      });
    } else {
      setItemsState(globalInventory);
      setLoading(false);
    }

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

  const refresh = useCallback(() => fetchInventoryData(), []);

  return { items, setItems, loading, refresh, isBackendConnected };
}

/**
 * Hook for Transactions & Shift Receipts
 * Synchronously provides cached receipts so numbers never glitch or jump from mock defaults
 */
export function usePharmacyTransactions() {
  const [transactions, setTransactionsState] = useState<any[]>(() => globalTransactions ?? []);
  const [receipts, setReceiptsState] = useState<ShiftReceipt[]>(() => globalReceipts ?? []);
  const [loading, setLoading] = useState<boolean>(() => globalTransactions === null);

  useEffect(() => {
    const handler = () => {
      if (globalTransactions) {
        setTransactionsState(globalTransactions);
        setReceiptsState(globalReceipts ?? []);
        setLoading(false);
      }
    };
    transactionListeners.add(handler);

    if (globalTransactions === null) {
      fetchTransactionsData().then((data) => {
        setTransactionsState(data);
        setReceiptsState(mapTransactionsToReceipts(data));
        setLoading(false);
      });
    } else {
      setTransactionsState(globalTransactions);
      setReceiptsState(globalReceipts ?? []);
      setLoading(false);
    }

    return () => {
      transactionListeners.delete(handler);
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

  const refresh = useCallback(() => fetchTransactionsData(), []);

  return { transactions, receipts, loading, refresh, setTransactions, setReceipts };
}

