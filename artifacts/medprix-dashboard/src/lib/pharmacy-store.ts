import { useState, useEffect, useCallback } from "react";
import type { ProductItem, ShiftReceipt } from "./types";
import { products as initialFallbackProducts } from "./data";

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
      printSource: {
        transactionNumber: t.transactionNumber,
        dateTime: t.dateTime,
        user: t.user,
        payment: t.payment,
        status: t.status,
        total: t.total,
        itemsSummary: t.itemsSummary,
      },
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
      cashier: t.user || "Cashier Staff",
      status: t.status || "Completed",
    };
  });
}

// Read localStorage initial values safely
function getLocalInventory(): ProductItem[] | null {
  try {
    const raw = localStorage.getItem("medprix_cached_inventory");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return null;
}

function getLocalTransactions(): any[] | null {
  try {
    const raw = localStorage.getItem("medprix_cached_transactions");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return null;
}

function saveLocalInventory(items: ProductItem[]) {
  try {
    localStorage.setItem("medprix_cached_inventory", JSON.stringify(items));
  } catch {}
}

function saveLocalTransactions(txs: any[]) {
  try {
    localStorage.setItem("medprix_cached_transactions", JSON.stringify(txs));
  } catch {}
}

// Global in-memory cache shared across the single-page application
let globalInventory: ProductItem[] | null = getLocalInventory();
let globalTransactions: any[] | null = getLocalTransactions();
let globalReceipts: ShiftReceipt[] | null = globalTransactions
  ? mapTransactionsToReceipts(globalTransactions)
  : null;

let isInventoryLoading = false;
let isTransactionsLoading = false;
let transactionRevision = 0;
let transactionRequest = 0;
let isBackendConnected = false;

const inventoryListeners = new Set<() => void>();
const transactionListeners = new Set<() => void>();

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

export async function fetchInventoryData(force = false): Promise<ProductItem[]> {
  if (!force && isInventoryLoading && globalInventory) return globalInventory;
  isInventoryLoading = true;
  try {
    const res = await fetch("/api/inventory", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.products) && data.products.length > 0) {
        globalInventory = data.products;
        saveLocalInventory(data.products);
        isBackendConnected = true;
        notifyInventory();
        return data.products;
      }
    }
  } catch (err) {
    console.warn("Inventory fetch notice:", err);
  } finally {
    isInventoryLoading = false;
  }
  return globalInventory || initialFallbackProducts;
}

export async function fetchTransactionsData(force = false): Promise<any[]> {
  if (!force && isTransactionsLoading && globalTransactions) return globalTransactions;
  const request = ++transactionRequest;
  const revision = transactionRevision;
  isTransactionsLoading = true;
  try {
    const res = await fetch("/api/admin/transactions", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        // A confirmed local save or newer fetch wins over an older response.
        if (request !== transactionRequest || revision !== transactionRevision) return globalTransactions || [];
        globalTransactions = [...data].sort((a, b) => Number(b.id) - Number(a.id));
        globalReceipts = mapTransactionsToReceipts(globalTransactions);
        saveLocalTransactions(globalTransactions);
        notifyTransactions();
        return globalTransactions;
      }
    }
  } catch (err) {
    console.warn("Transactions fetch notice:", err);
  } finally {
    if (request === transactionRequest) isTransactionsLoading = false;
  }
  return globalTransactions || [];
}

export function setCachedInventory(products: ProductItem[]) {
  globalInventory = products;
  saveLocalInventory(products);
  notifyInventory();
}

export function setCachedTransactions(transactions: any[]) {
  transactionRevision++;
  globalTransactions = transactions;
  globalReceipts = mapTransactionsToReceipts(transactions);
  saveLocalTransactions(transactions);
  notifyTransactions();
}

export function deductProductStock(
  allocations: Array<{ productId: string; batchNumber?: string; quantity: number }>
) {
  const current = globalInventory ?? initialFallbackProducts;
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
  const currentTx = globalTransactions ?? getLocalTransactions() ?? [];
  const updatedTx = [
    transaction,
    ...currentTx.filter(
      (t) =>
        !(transaction.id != null && t.id === transaction.id) &&
        !(transaction.transactionNumber && t.transactionNumber === transaction.transactionNumber)
    ),
  ];
  setCachedTransactions(updatedTx);
}

export function prefetchPharmacyData() {
  fetchInventoryData();
  fetchTransactionsData();
}

/**
 * Hook for Inventory products
 */
export function usePharmacyInventory() {
  const [items, setItemsState] = useState<ProductItem[]>(() => globalInventory ?? initialFallbackProducts);
  const [loading, setLoading] = useState<boolean>(() => globalInventory === null);

  useEffect(() => {
    const handler = () => {
      if (globalInventory) {
        setItemsState([...globalInventory]);
        setLoading(false);
      }
    };
    inventoryListeners.add(handler);

    fetchInventoryData().then((data) => {
      setItemsState([...data]);
      setLoading(false);
    });

    return () => {
      inventoryListeners.delete(handler);
    };
  }, []);

  const setItems = useCallback((newItems: ProductItem[] | ((prev: ProductItem[]) => ProductItem[])) => {
    if (typeof newItems === "function") {
      const updated = newItems(globalInventory ?? initialFallbackProducts);
      setCachedInventory(updated);
    } else {
      setCachedInventory(newItems);
    }
  }, []);

  const refresh = useCallback(() => fetchInventoryData(true), []);

  return { items, setItems, loading, refresh, isBackendConnected };
}

/**
 * Hook for Transactions & Shift Receipts
 */
export function usePharmacyTransactions() {
  const [transactions, setTransactionsState] = useState<any[]>(() => globalTransactions ?? []);
  const [receipts, setReceiptsState] = useState<ShiftReceipt[]>(() => globalReceipts ?? []);
  const [loading, setLoading] = useState<boolean>(() => globalTransactions === null);

  useEffect(() => {
    const handler = () => {
      if (globalTransactions) {
        setTransactionsState([...globalTransactions]);
        setReceiptsState([...(globalReceipts ?? [])]);
        setLoading(false);
      }
    };
    transactionListeners.add(handler);
    const refreshOnFocus = () => { void fetchTransactionsData(true); };
    const refreshOnStorage = (event: StorageEvent) => {
      if (event.key === "medprix_cached_transactions") refreshOnFocus();
    };
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("storage", refreshOnStorage);

    fetchTransactionsData().then((data) => {
      setTransactionsState([...data]);
      setReceiptsState([...mapTransactionsToReceipts(data)]);
      setLoading(false);
    });

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
