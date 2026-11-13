import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFinanceSummaryQueryKey,
  useGetFinanceSummary,
  type FinanceSummary,
} from "@workspace/api-client-react";
import { computeDashboardAnalytics } from "./dashboard-analytics";
import { safeError } from "./feedback";
import {
  usePharmacyInventory,
  usePharmacyTransactions,
} from "./pharmacy-store";

export function manilaDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function millisecondsUntilManilaMidnight(now = new Date()): number {
  const midnight = new Date(manilaDateKey(now) + "T00:00:00+08:00");
  return midnight.getTime() + 86_400_000 - now.getTime() + 50;
}

const FINANCE_CACHE_KEY = "medprix_cached_finance_summary";

function getCachedFinanceSummary(): FinanceSummary | undefined {
  try {
    const raw =
      sessionStorage.getItem(FINANCE_CACHE_KEY) ||
      localStorage.getItem(FINANCE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.revenue) {
        return parsed as FinanceSummary;
      }
    }
  } catch {}
  return undefined;
}

function saveCachedFinanceSummary(data: FinanceSummary) {
  try {
    const json = JSON.stringify(data);
    sessionStorage.setItem(FINANCE_CACHE_KEY, json);
    localStorage.setItem(FINANCE_CACHE_KEY, json);
  } catch {}
}

/** Start each source independently and compose their results without blocking other sections. */
export function useDashboardAnalytics(salesDate: Date) {
  const { transactions } = usePharmacyTransactions();
  const { items: inventoryProducts } = usePharmacyInventory();
  const queryClient = useQueryClient();
  const [to, setTo] = useState(() => manilaDateKey());
  const params = useMemo(() => ({ from: "2000-01-01", to }), [to]);
  const queryKey = useMemo(
    () => getGetFinanceSummaryQueryKey(params),
    [params],
  );
  const initialFinanceData = useMemo(() => getCachedFinanceSummary(), []);
  const finance = useGetFinanceSummary(params, {
    query: {
      queryKey,
      initialData: initialFinanceData,
      staleTime: 60_000,
      refetchOnMount: true,
      // The focus handler below also advances the date before requesting new data.
      refetchOnWindowFocus: false,
      retry: false,
    },
    request: { credentials: "include" },
  });

  useEffect(() => {
    if (finance.data) {
      saveCachedFinanceSummary(finance.data);
    }
  }, [finance.data]);

  useEffect(() => {
    let timer: number;
    const scheduleMidnight = () => {
      timer = window.setTimeout(() => {
        setTo(manilaDateKey());
        scheduleMidnight();
      }, millisecondsUntilManilaMidnight());
    };
    const refreshOnFocus = () => {
      const today = manilaDateKey();
      if (today !== to) setTo(today);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshOnFocus();
    };
    scheduleMidnight();
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [to]);

  const previousSources = useRef({
    txCount: transactions.length,
    prodCount: inventoryProducts.length,
  });
  useEffect(() => {
    const previous = previousSources.current;
    const next = {
      txCount: transactions.length,
      prodCount: inventoryProducts.length,
    };
    previousSources.current = next;
    if (
      previous.txCount !== next.txCount ||
      previous.prodCount !== next.prodCount
    ) {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    }
  }, [transactions.length, inventoryProducts.length, queryClient, queryKey]);

  const financeError = finance.error
    ? safeError(finance.error, "Financial summary is unavailable.")
    : undefined;
  const analytics = useMemo(
    () =>
      computeDashboardAnalytics(transactions, inventoryProducts, salesDate, {
        data: finance.data,
        isLoading: finance.isPending,
        isRefreshing: finance.isFetching,
        error: financeError,
      }),
    [
      transactions,
      inventoryProducts,
      salesDate,
      finance.data,
      finance.isPending,
      finance.isFetching,
      financeError,
    ],
  );

  return {
    analytics,
    transactions,
    inventoryProducts,
    retryFinance: () => {
      void finance.refetch();
    },
  };
}
