import { useEffect, useSyncExternalStore } from "react";
import { financeApi, periodRange, type Expense, type FinanceDetails, type FinanceSummaryData, type PeriodKey } from "@/lib/finance-api";

/**
 * One shared copy of the dashboard's finance figures. The Net income card, the Finance section and the
 * Financial summary report all read it, so they always show the same period and the same numbers.
 * It reloads every 30 s while something on screen uses it and the tab is visible, and when the tab regains focus.
 */
export type FinanceState = {
  period: PeriodKey;
  custom: { from: string; to: string };
  range: { from: string; to: string };
  summary: FinanceSummaryData | null;
  details: FinanceDetails | null;
  expenses: Expense[];
  error: string;
  loading: boolean;
  updatedAt: Date | null;
};

const REFRESH_MS = 30_000;
const listeners = new Set<() => void>();
let state: FinanceState = {
  period: "thisMonth", custom: periodRange("thisMonth"), range: periodRange("thisMonth"),
  summary: null, details: null, expenses: [], error: "", loading: false, updatedAt: null,
};
let latest = 0;
let inFlight = false;
let users = 0;
let timer: number | undefined;

function set(patch: Partial<FinanceState>) { state = { ...state, ...patch }; listeners.forEach(l => l()); }
const rangeFor = (period: PeriodKey, custom: FinanceState["custom"]) => (period === "custom" ? custom : periodRange(period));

/** Load the current period. A newer load always wins; background refreshes are skipped while one is running. */
export async function refreshFinance(quiet = false) {
  if (quiet && inFlight) return;
  const range = rangeFor(state.period, state.custom);
  if (range.from > range.to) { set({ error: "The start date is after the end date." }); return; }
  const id = ++latest;
  inFlight = true;
  set({ range, ...(quiet ? {} : { loading: true }) });
  try {
    const [summary, details, list] = await Promise.all([
      financeApi.summary(range.from, range.to), financeApi.details(range.from, range.to), financeApi.expenses(range.from, range.to),
    ]);
    if (id === latest) set({ summary, details, expenses: list.expenses, error: "", updatedAt: new Date() });
  } catch (failure) {
    if (id === latest) set({ error: failure instanceof Error ? failure.message : "Financial records are unavailable right now." });
  } finally {
    if (id === latest) { inFlight = false; set({ loading: false }); }
  }
}

export function setFinancePeriod(period: PeriodKey) { set({ period }); void refreshFinance(); }
export function setFinanceCustom(custom: FinanceState["custom"]) { set({ custom }); if (state.period === "custom") void refreshFinance(); }

function onVisible() { if (document.visibilityState === "visible") void refreshFinance(true); }
function start() {
  if (users++ > 0) return;
  void refreshFinance(state.summary !== null);
  timer = window.setInterval(onVisible, REFRESH_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
}
function stop() {
  if (--users > 0) return;
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("focus", onVisible);
}

export function useFinance(): FinanceState {
  useEffect(() => { start(); return stop; }, []);
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => state);
}

/** The figures currently on screen (for PDF export outside React). */
export const getFinanceState = () => state;
