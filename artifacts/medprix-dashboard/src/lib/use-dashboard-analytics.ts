import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFinanceSummaryQueryKey,
  useGetFinanceSummary,
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
  const finance = useGetFinanceSummary(params, {
    query: {
      queryKey,
      staleTime: 30_000,
      refetchOnMount: "always",
      // The focus handler below also advances the date before requesting new data.
      refetchOnWindowFocus: false,
      retry: false,
    },
    request: { credentials: "include" },
  });

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
      else void queryClient.invalidateQueries({ queryKey, exact: true });
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
  }, [to, queryClient, queryKey]);

  const previousSources = useRef({ transactions, inventoryProducts });
  useEffect(() => {
    const previous = previousSources.current;
    previousSources.current = { transactions, inventoryProducts };
    if (
      previous.transactions !== transactions ||
      previous.inventoryProducts !== inventoryProducts
    ) {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    }
  }, [transactions, inventoryProducts, queryClient, queryKey]);

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
