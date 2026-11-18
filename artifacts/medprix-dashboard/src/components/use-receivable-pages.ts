import { useCallback, useEffect, useRef, useState } from "react";
import {
  wholesaleGet,
  getCachedWholesale,
  type WholesaleReceivable,
  type WholesalePageResult,
} from "@/lib/wholesale-api";
import { safeError } from "@/lib/feedback";

/** 15-record display pages over the existing 50-record API transport.
 * The details-only modal path retains its existing owner. No API/query changes. */
export function useReceivablePages(
  enabled: boolean,
  search: string,
  status: string,
) {
  return useWholesalePages<WholesaleReceivable>(
    "/accounts-receivable",
    enabled,
    search,
    status,
  );
}

export function useWholesalePages<T>(
  endpoint: string,
  enabled: boolean,
  search: string,
  status: string,
) {
  const key = JSON.stringify([endpoint, search, status]);
  const [position, setPosition] = useState({ key, page: 1 });
  const page = position.key === key ? position.page : 1;
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const [result, setResult] = useState<{
    key: string;
    page: number;
    total: number;
    items: T[];
    loading: boolean;
    hasData: boolean;
    pending: boolean;
    error: string;
  }>(() => {
    const cached = getCachedWholesale<WholesalePageResult<T>>(endpoint + "?search=" + encodeURIComponent(search) + "&page=1&status=" + status);
    return { key, page: 1, total: cached?.total ?? 0, items: cached?.items.slice(0, 15) ?? [], loading: !cached, hasData: cached !== null, pending: true, error: "" };
  });
  const refresh = useCallback(async () => {
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const id = ++generation.current;
    // Refresh the current page in place; only a different query/page needs a placeholder.
    setResult((previous) => ({
      ...previous,
      loading: !previous.hasData || previous.key !== key || previous.page !== page,
      pending: true,
      error: "",
    }));
    const path = (block: number) =>
      endpoint +
      "?search=" +
      encodeURIComponent(search) +
      "&page=" +
      block +
      "&status=" +
      status;
    async function read() {
      const start = (page - 1) * 15;
      const block = Math.floor(start / 50) + 1;
      const first = await wholesaleGet<WholesalePageResult<T>>(
        path(block),
        revision > 0,
      );
      if (id !== generation.current) return;
      const pages = Math.max(1, Math.ceil(first.total / 15));
      if (page > pages) {
        setPosition({ key, page: pages });
        return;
      }
      const offset = start % 50;
      let items = first.items.slice(offset, offset + 15);
      if (offset + 15 > 50 && start + items.length < first.total) {
        const second = await wholesaleGet<WholesalePageResult<T>>(
          path(block + 1),
          revision > 0,
        );
        items = [...items, ...second.items.slice(0, 15 - items.length)];
      }
      if (id === generation.current)
        setResult({
          key,
          page,
          total: first.total,
          items,
          loading: false,
          hasData: true, pending: false,
          error: "",
        });
    }
    void read().catch((error) => {
      if (id === generation.current)
        setResult((previous) => ({
          key,
          page,
          total: previous.key === key ? previous.total : 0,
          items:
            previous.key === key && previous.page === page
              ? previous.items
              : [],
          loading: false,
          hasData: previous.key === key && previous.page === page && previous.hasData, pending: false,
          error: safeError(error),
        }));
    });
    return () => {
      generation.current++;
    };
  }, [endpoint, enabled, key, page, revision, search, status]);
  const current = result.key === key && result.page === page;
  return {
    items: current ? result.items : [],
    total: current ? result.total : 0,
    loading: !current || result.loading,
    hasData: current && result.hasData,
    pending: !current || result.pending,
    error: current ? result.error : "",
    page,
    pages: Math.max(1, Math.ceil(result.total / 15)),
    refresh,
    go: (next: number) => setPosition({ key, page: Math.max(1, next) }),
  };
}
