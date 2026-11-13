import type { FinanceSummary } from "@workspace/api-client-react";
import { formatCalendarDate, localDateKey, parseCalendarDate, recordsOnDate, transactionDateKey } from "./business-date";
import type { CashMismatch, MovementItem, ProductItem, ReportType } from "./types";

export const parseMoney = (val: unknown): number => {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const cleaned = String(val ?? "0").replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatPeso = (val: number): string =>
  `₱${val.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const formatSignedPeso = (val: number): string => {
  const abs = formatPeso(Math.abs(val));
  if (val < -0.005) return `-${abs}`;
  if (val > 0.005) return `+${abs}`;
  return abs;
};

export function getProductStock(product: any): number {
  if (Array.isArray(product?.batches)) {
    return product.batches.reduce(
      (sum: number, b: any) => sum + (Number(b?.quantity) || 0),
      0,
    );
  }
  return Number(product?.stock) || 0;
}

export interface LiveCashMismatch extends CashMismatch {
  dateKey: string;
  fullDateLabel: string;
  expectedNum: number;
  recordedNum: number;
  differenceNum: number;
  transactionCount: number;
  discrepantTransactions: {
    transactionNumber: string;
    time: string;
    user: string;
    status: string;
    total: string;
    amountReceived: string;
    change: string;
  }[];
}

export interface LiveMovementItem extends MovementItem {
  sku?: string;
  category?: string;
  revenue: number;
  stock: number;
}

export interface DashboardFinanceData {
  from: string;
  to: string;
  asOf: string;
  revenue: { retail: number; wholesale: number; total: number };
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPct: number | null;
  accountsReceivable: { needsReviewCount: number; needsReviewAmount: number };
  itemsMissingCost: { count: number; affectedRevenue: number };
  warnings: string[];
  costBasis: string;
  operatingExpensesNote: string;
}

export type DashboardFinanceState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready";
      data: DashboardFinanceData;
      isRefreshing: boolean;
      refreshError?: string;
    };

export interface DashboardFinanceInput {
  data?: FinanceSummary;
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: string;
}

function mapDashboardFinance(
  input?: DashboardFinanceInput,
): DashboardFinanceState {
  if (!input?.data) {
    return input?.isLoading
      ? { status: "loading" }
      : {
          status: "error",
          error: input?.error || "Financial summary is unavailable.",
        };
  }
  const data = input.data;
  return {
    status: "ready",
    isRefreshing: !!input.isRefreshing,
    refreshError: input.error,
    data: {
      from: data.from,
      to: data.to,
      asOf: data.asOf,
      revenue: {
        retail: parseMoney(data.revenue.retail),
        wholesale: parseMoney(data.revenue.wholesale),
        total: parseMoney(data.revenue.total),
      },
      costOfGoodsSold: parseMoney(data.costOfGoodsSold),
      grossProfit: parseMoney(data.grossProfit),
      grossMarginPct: data.grossMargin === null ? null : data.grossMargin * 100,
      accountsReceivable: {
        needsReviewCount: data.accountsReceivable.needsReviewCount,
        needsReviewAmount: parseMoney(
          data.accountsReceivable.needsReviewAmount,
        ),
      },
      itemsMissingCost: {
        count: data.itemsMissingCost.count,
        affectedRevenue: parseMoney(data.itemsMissingCost.affectedRevenue),
      },
      warnings: data.warnings,
      costBasis: data.costBasis,
      operatingExpensesNote: data.operatingExpensesNote,
    },
  };
}

export function financialPeriodLabel(fin: DashboardFinanceData): string {
  return fin.from + " to " + fin.to;
}

export function financialArReviewMessage(fin: DashboardFinanceData): string {
  const ar = fin.accountsReceivable;
  return ar.needsReviewCount > 0
    ? ar.needsReviewCount +
        " AR record(s) need review (" +
        formatPeso(ar.needsReviewAmount) +
        ")"
    : "No AR records need review";
}

export function financialReportRows(fin: DashboardFinanceData): string[][] {
  return [
    ["Total revenue", formatPeso(fin.revenue.total)],
    ["Retail revenue", formatPeso(fin.revenue.retail)],
    ["Wholesale revenue", formatPeso(fin.revenue.wholesale)],
    ["Cost of goods sold (COGS)", formatPeso(fin.costOfGoodsSold)],
    ["Gross profit", formatPeso(fin.grossProfit)],
    [
      "Gross margin",
      fin.grossMarginPct === null
        ? "\u2014"
        : fin.grossMarginPct.toFixed(1) + "%",
    ],
  ];
}

export function financialReportNotes(fin: DashboardFinanceData): string[] {
  const costBasis =
    fin.costBasis === "current-product-cost-excluding-missing-cost-lines"
      ? "Current product costs, excluding sold lines without a positive cost."
      : fin.costBasis;
  return [
    financialArReviewMessage(fin),
    "Missing-cost sold line items: " +
      fin.itemsMissingCost.count +
      "; affected revenue (before transaction discounts): " +
      formatPeso(fin.itemsMissingCost.affectedRevenue) +
      ". These lines are excluded from COGS.",
    "Cost basis: " + costBasis,
    fin.operatingExpensesNote,
    "As of: " + fin.asOf,
    ...fin.warnings,
  ];
}

function requireFinancialData(
  financial: DashboardFinanceState,
): DashboardFinanceData {
  if (financial.status !== "ready")
    throw new Error(
      "Financial summary is unavailable. Load it before exporting.",
    );
  return financial.data;
}

export interface DashboardAnalytics {
  salesDateKey: string;
  salesDateLabel: string;
  periodLabel: string;
  dailySales: {
    totalSales: number;
    transactionCount: number;
    productsSold: number;
    cashSales: number;
    cashCount: number;
    cardSales: number;
    cardCount: number;
    gcashSales: number;
    gcashCount: number;
    mayaSales: number;
    mayaCount: number;
    walletSales: number;
    walletCount: number;
    transactions: any[];
  };
  inventory: {
    totalProducts: number;
    inStockCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    totalUnits: number;
    rows: {
      id: string;
      name: string;
      sku: string;
      category: string;
      stock: number;
      reorder: number;
      price: number;
      cost: number;
      retailValue: number;
      costValue: number;
      status: "Available" | "Low stock" | "Out of stock";
    }[];
  };
  financial: DashboardFinanceState;
  valuation: {
    totalRetailValue: number;
    totalCostValue: number;
    estimatedProfitValue: number;
    totalUnits: number;
    skusTracked: number;
  };
  movement: {
    totalUnitsSold: number;
    fastMovers: LiveMovementItem[];
    slowMovers: LiveMovementItem[];
    chartFast: LiveMovementItem[];
    chartSlow: LiveMovementItem[];
  };
  cash: {
    mismatches: LiveCashMismatch[];
    openAlertsCount: number;
    totalShortAmount: number;
    totalOverAmount: number;
  };
}

function formatShortDate(dateKey: string): string {
  const parsed = parseCalendarDate(dateKey);
  if (!parsed) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function getManilaShift(dateTime: unknown): { shift: "Morning" | "Afternoon" | "Evening"; timeLabel: string } {
  const raw = typeof dateTime === "string" ? dateTime : "";
  const instant = raw ? new Date(raw) : null;
  if (!instant || Number.isNaN(instant.getTime())) {
    return { shift: "Morning", timeLabel: raw || "—" };
  }
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: false,
  }).format(instant);
  const hour = Number(hourStr) % 24;
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
  if (hour < 12) return { shift: "Morning", timeLabel };
  if (hour < 18) return { shift: "Afternoon", timeLabel };
  return { shift: "Evening", timeLabel };
}

export function computeDashboardAnalytics(
  allTransactions: any[] = [],
  inventoryProducts: ProductItem[] = [],
  salesDate = new Date(),
  finance?: DashboardFinanceInput,
): DashboardAnalytics {
  const safeTransactions = Array.isArray(allTransactions) ? allTransactions : [];
  const safeProducts = Array.isArray(inventoryProducts) ? inventoryProducts : [];
  const salesDateKey = localDateKey(salesDate);
  const salesDateLabel = formatCalendarDate(salesDate);

  // 1. Daily Sales (for selected date)
  const onDateTransactions = recordsOnDate(safeTransactions, salesDate);
  const dailyCompleted = onDateTransactions.filter((t) => t.status === "Completed");
  const dailyTotalSales = dailyCompleted.reduce((sum, t) => sum + parseMoney(t.total), 0);
  const dailyTxCount = dailyCompleted.length;
  const dailyProductsSold = dailyCompleted.reduce((sum, t) => {
    if (Array.isArray(t.items) && t.items.length > 0) {
      return sum + t.items.reduce((iSum: number, item: any) => iSum + (Number(item.quantity) || 1), 0);
    }
    return sum + 1;
  }, 0);

  const isCash = (p: string) => p.toLowerCase().includes("cash") && !p.toLowerCase().includes("gcash");
  const isCard = (p: string) => {
    const m = p.toLowerCase();
    return m.includes("card") || m.includes("credit") || m.includes("debit");
  };
  const isGcash = (p: string) => p.toLowerCase().includes("gcash");
  const isMaya = (p: string) => p.toLowerCase().includes("maya");
  const isWallet = (p: string) => {
    const m = p.toLowerCase();
    return m.includes("gcash") || m.includes("maya") || m.includes("wallet");
  };

  const cashTxs = dailyCompleted.filter((t) => isCash(String(t.payment || "")));
  const cardTxs = dailyCompleted.filter((t) => isCard(String(t.payment || "")));
  const gcashTxs = dailyCompleted.filter((t) => isGcash(String(t.payment || "")));
  const mayaTxs = dailyCompleted.filter((t) => isMaya(String(t.payment || "")));
  const walletTxs = dailyCompleted.filter((t) => isWallet(String(t.payment || "")));

  // 2. Inventory & Stock Valuation
  const stockByName = new Map<string, { stock: number; sku: string; category: string }>();

  const inventoryRows = safeProducts.map((p: any) => {
    const stock = getProductStock(p);
    const reorder = Number(p.reorder) || 10;
    const price = parseMoney(p.price);
    const rawCost = parseMoney(p.cost);
    const cost = rawCost > 0 ? rawCost : Number((price * 0.68).toFixed(2));
    const status: "Available" | "Low stock" | "Out of stock" =
      stock <= 0 ? "Out of stock" : stock <= reorder ? "Low stock" : "Available";

    if (p.name) {
      const key = String(p.name).trim().toLowerCase();
      stockByName.set(key, { stock, sku: p.sku || "—", category: p.category || "General" });
    }

    return {
      id: String(p.id || p.sku || p.name),
      name: String(p.name || "Unnamed Product"),
      sku: String(p.sku || "—"),
      category: String(p.category || "General"),
      stock,
      reorder,
      price,
      cost,
      retailValue: stock * price,
      costValue: stock * cost,
      status,
    };
  });

  const totalProducts = inventoryRows.length;
  const outOfStockCount = inventoryRows.filter((r) => r.stock <= 0).length;
  const lowStockCount = inventoryRows.filter((r) => r.stock <= r.reorder).length;
  const inStockCount = Math.max(0, totalProducts - lowStockCount);
  const totalUnits = inventoryRows.reduce((sum, r) => sum + r.stock, 0);
  const totalRetailValue = inventoryRows.reduce((sum, r) => sum + r.retailValue, 0);
  const totalCostValue = inventoryRows.reduce((sum, r) => sum + r.costValue, 0);

  // 3. Product Movement across all Completed Transactions
  const allCompleted = safeTransactions.filter((t) => t.status === "Completed");

  const movementMap = new Map<string, LiveMovementItem>();
  for (const row of inventoryRows) {
    movementMap.set(row.name.trim().toLowerCase(), {
      name: row.name,
      sku: row.sku,
      category: row.category,
      units: 0,
      revenue: 0,
      stock: row.stock,
    });
  }

  const completedDateKeys: string[] = [];

  for (const tx of allCompleted) {
    const dk = transactionDateKey(tx.dateTime || tx.createdAt);
    if (dk) completedDateKeys.push(dk);

    if (Array.isArray(tx.items) && tx.items.length > 0) {
      for (const item of tx.items) {
        const qty = Number(item.quantity) || 1;
        const prodName = String(item.product || "Item").trim();
        const nameKey = prodName.toLowerCase();
        const itemRevenue = parseMoney(item.subtotal) || parseMoney(item.unitPrice) * qty;

        const existing = movementMap.get(nameKey);
        if (existing) {
          existing.units += qty;
          existing.revenue += itemRevenue;
        } else {
          const stockInfo = stockByName.get(nameKey);
          movementMap.set(nameKey, {
            name: prodName,
            sku: stockInfo?.sku ?? "—",
            category: stockInfo?.category ?? "Pharmacy",
            units: qty,
            revenue: itemRevenue,
            stock: stockInfo?.stock ?? 0,
          });
        }
      }
    }
  }

  completedDateKeys.sort();
  const minDateKey = completedDateKeys[0];
  const maxDateKey = completedDateKeys[completedDateKeys.length - 1];
  const periodLabel =
    minDateKey && maxDateKey
      ? minDateKey === maxDateKey
        ? formatCalendarDate(parseCalendarDate(minDateKey) ?? salesDate)
        : `${formatShortDate(minDateKey)} – ${formatCalendarDate(parseCalendarDate(maxDateKey) ?? salesDate)}`
      : salesDateLabel;

  // 4. Fast & Slow Moving Products
  const allMovementItems = Array.from(movementMap.values());
  const totalUnitsSold = allMovementItems.reduce((sum, item) => sum + item.units, 0);

  const sortedDesc = [...allMovementItems].sort(
    (a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name),
  );
  const fastMovers = sortedDesc.slice(0, 10);
  const chartFast = sortedDesc.slice(0, 3);

  const fastNames = new Set(chartFast.map((i) => i.name));
  const sortedAsc = [...allMovementItems]
    .filter((i) => !fastNames.has(i.name))
    .sort((a, b) => a.units - b.units || a.revenue - b.revenue || a.name.localeCompare(b.name));
  const slowMovers = sortedAsc.slice(0, 10);
  const chartSlow = sortedAsc.slice(0, 3);

  // 5. Cash Mismatch Detection from Live Cash Transactions
  const shiftGroups = new Map<
    string,
    {
      dateKey: string;
      shift: "Morning" | "Afternoon" | "Evening";
      completedCash: number;
      voidedCash: number;
      cancelledCash: number;
      txCount: number;
      discrepantTransactions: LiveCashMismatch["discrepantTransactions"];
    }
  >();

  for (const tx of safeTransactions) {
    const paymentStr = String(tx.payment || "");
    if (!isCash(paymentStr)) continue;
    const dk = transactionDateKey(tx.dateTime || tx.createdAt);
    if (!dk) continue;
    const { shift, timeLabel } = getManilaShift(tx.dateTime || tx.createdAt);
    const groupKey = `${dk}__${shift}`;
    let group = shiftGroups.get(groupKey);
    if (!group) {
      group = {
        dateKey: dk,
        shift,
        completedCash: 0,
        voidedCash: 0,
        cancelledCash: 0,
        txCount: 0,
        discrepantTransactions: [],
      };
      shiftGroups.set(groupKey, group);
    }

    const totalNum = parseMoney(tx.total);
    group.txCount += 1;

    if (tx.status === "Completed") {
      group.completedCash += totalNum;
    } else if (tx.status === "Voided") {
      group.voidedCash += totalNum;
      group.discrepantTransactions.push({
        transactionNumber: String(tx.transactionNumber || tx.id),
        time: timeLabel,
        user: String(tx.user || "Cashier"),
        status: String(tx.status),
        total: formatPeso(totalNum),
        amountReceived: String(tx.amountReceived || formatPeso(totalNum)),
        change: String(tx.change || "₱0.00"),
      });
    } else {
      group.cancelledCash += totalNum;
      group.discrepantTransactions.push({
        transactionNumber: String(tx.transactionNumber || tx.id),
        time: timeLabel,
        user: String(tx.user || "Cashier"),
        status: String(tx.status || "Cancelled"),
        total: formatPeso(totalNum),
        amountReceived: String(tx.amountReceived || "₱0.00"),
        change: String(tx.change || "₱0.00"),
      });
    }
  }

  const shiftOrder = { Evening: 3, Afternoon: 2, Morning: 1 };
  const mismatches: LiveCashMismatch[] = [];

  for (const group of shiftGroups.values()) {
    const expectedNum = group.completedCash + group.cancelledCash;
    const recordedNum = group.completedCash + group.voidedCash;
    const differenceNum = Number((recordedNum - expectedNum).toFixed(2));

    if (Math.abs(differenceNum) >= 0.01) {
      const parsedDate = parseCalendarDate(group.dateKey);
      mismatches.push({
        dateKey: group.dateKey,
        date: formatShortDate(group.dateKey),
        fullDateLabel: parsedDate ? formatCalendarDate(parsedDate) : group.dateKey,
        shift: group.shift,
        expected: formatPeso(expectedNum),
        recorded: formatPeso(recordedNum),
        difference: formatSignedPeso(differenceNum),
        type: differenceNum < 0 ? "short" : "over",
        expectedNum,
        recordedNum,
        differenceNum,
        transactionCount: group.txCount,
        discrepantTransactions: group.discrepantTransactions,
      });
    }
  }

  mismatches.sort(
    (a, b) =>
      b.dateKey.localeCompare(a.dateKey) ||
      shiftOrder[b.shift as keyof typeof shiftOrder] - shiftOrder[a.shift as keyof typeof shiftOrder],
  );

  const totalShortAmount = mismatches
    .filter((m) => m.type === "short")
    .reduce((sum, m) => sum + Math.abs(m.differenceNum), 0);
  const totalOverAmount = mismatches
    .filter((m) => m.type === "over")
    .reduce((sum, m) => sum + Math.abs(m.differenceNum), 0);

  return {
    salesDateKey,
    salesDateLabel,
    periodLabel,
    dailySales: {
      totalSales: dailyTotalSales,
      transactionCount: dailyTxCount,
      productsSold: dailyProductsSold,
      cashSales: cashTxs.reduce((s, t) => s + parseMoney(t.total), 0),
      cashCount: cashTxs.length,
      cardSales: cardTxs.reduce((s, t) => s + parseMoney(t.total), 0),
      cardCount: cardTxs.length,
      gcashSales: gcashTxs.reduce((s, t) => s + parseMoney(t.total), 0),
      gcashCount: gcashTxs.length,
      mayaSales: mayaTxs.reduce((s, t) => s + parseMoney(t.total), 0),
      mayaCount: mayaTxs.length,
      walletSales: walletTxs.reduce((s, t) => s + parseMoney(t.total), 0),
      walletCount: walletTxs.length,
      transactions: dailyCompleted,
    },
    inventory: {
      totalProducts,
      inStockCount,
      lowStockCount,
      outOfStockCount,
      totalUnits,
      rows: inventoryRows,
    },
    financial: mapDashboardFinance(finance),
    valuation: {
      totalRetailValue,
      totalCostValue,
      estimatedProfitValue: totalRetailValue - totalCostValue,
      totalUnits,
      skusTracked: totalProducts,
    },
    movement: {
      totalUnitsSold,
      fastMovers,
      slowMovers,
      chartFast,
      chartSlow,
    },
    cash: {
      mismatches,
      openAlertsCount: mismatches.length,
      totalShortAmount,
      totalOverAmount,
    },
  };
}

export function buildReportText(type: ReportType, analytics: DashboardAnalytics): string {
  const generatedAt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const divider = "================================================================================";
  const subDivider = "--------------------------------------------------------------------------------";

  if (type === "sales") {
    const d = analytics.dailySales;
    const txLines =
      d.transactions.length > 0
        ? d.transactions.map(
            (t, idx) =>
              `${String(idx + 1).padStart(3, " ")}. ${String(t.transactionNumber || t.id).padEnd(18, " ")} | ${String(t.payment || "Cash").padEnd(8, " ")} | ${String(t.user || "Cashier").padEnd(18, " ")} | ${formatPeso(parseMoney(t.total))}`,
          )
        : ["  No completed sales recorded on this date."];

    return [
      divider,
      "MEDPRIX PHARMACY - DAILY SALES REPORT",
      divider,
      `Report Date : ${analytics.salesDateLabel}`,
      `Generated   : ${generatedAt}`,
      subDivider,
      "SUMMARY METRICS",
      `  Total Sales          : ${formatPeso(d.totalSales)}`,
      `  Completed Orders     : ${d.transactionCount}`,
      `  Products Sold (Units): ${d.productsSold}`,
      subDivider,
      "PAYMENT METHOD BREAKDOWN",
      `  Cash                 : ${formatPeso(d.cashSales)} (${d.cashCount} order(s))`,
      `  Card                 : ${formatPeso(d.cardSales)} (${d.cardCount} order(s))`,
      `  E-Wallet (GCash/Maya): ${formatPeso(d.walletSales)} (${d.walletCount} order(s))`,
      `    - GCash            : ${formatPeso(d.gcashSales)} (${d.gcashCount} order(s))`,
      `    - Maya             : ${formatPeso(d.mayaSales)} (${d.mayaCount} order(s))`,
      subDivider,
      `COMPLETED TRANSACTIONS (${d.transactionCount})`,
      "  #  Receipt Number     | Payment  | Cashier            | Total",
      ...txLines,
      divider,
    ].join("\n");
  }

  if (type === "inventory") {
    const inv = analytics.inventory;
    const lines = inv.rows.map(
      (r, idx) =>
        `${String(idx + 1).padStart(3, " ")}. ${r.sku.padEnd(10, " ")} | ${r.name.slice(0, 32).padEnd(32, " ")} | ${String(r.stock).padStart(6, " ")} units (Reorder: ${String(r.reorder).padStart(3, " ")}) | ${r.status}`,
    );

    return [
      divider,
      "MEDPRIX PHARMACY - INVENTORY REPORT",
      divider,
      `As of Date  : ${analytics.salesDateLabel}`,
      `Generated   : ${generatedAt}`,
      subDivider,
      "SUMMARY METRICS",
      `  Total Products       : ${inv.totalProducts}`,
      `  In Stock (Healthy)   : ${inv.inStockCount}`,
      `  Low Stock            : ${inv.lowStockCount}`,
      `  Out of Stock         : ${inv.outOfStockCount}`,
      `  Total Units Held     : ${inv.totalUnits.toLocaleString()} units`,
      subDivider,
      `PRODUCT INVENTORY WATCHLIST (${inv.rows.length} SKUs)`,
      "  #  SKU        | Product Name                     |Current Stock          | Status",
      ...lines,
      divider,
    ].join("\n");
  }

  if (type === "financial") {
    const fin = requireFinancialData(analytics.financial);
    return [
      divider,
      "MEDPRIX PHARMACY - FINANCIAL SUMMARY REPORT",
      divider,
      "Period      : " + financialPeriodLabel(fin),
      "Generated   : " + generatedAt,
      subDivider,
      ...financialReportRows(fin).map(([label, value]) => label + ": " + value),
      ...(analytics.financial.status === "ready" &&
      analytics.financial.refreshError
        ? [
            "Refresh failed; showing the last successful financial summary. " +
              analytics.financial.refreshError,
          ]
        : []),
      divider,
    ].join("\n");
  }

  if (type === "valuation") {
    const val = analytics.valuation;
    const lines = analytics.inventory.rows.map(
      (r, idx) =>
        `${String(idx + 1).padStart(3, " ")}. ${r.sku.padEnd(10, " ")} | ${r.name.slice(0, 30).padEnd(30, " ")} | Qty: ${String(r.stock).padStart(6, " ")} | Price: ${formatPeso(r.price).padStart(9, " ")} | Value: ${formatPeso(r.retailValue)}`,
    );

    return [
      divider,
      "MEDPRIX PHARMACY - STOCK VALUATION REPORT",
      divider,
      `As of Date  : ${analytics.salesDateLabel}`,
      `Generated   : ${generatedAt}`,
      subDivider,
      "VALUATION SUMMARY",
      `  Current Stock Value (Retail) : ${formatPeso(val.totalRetailValue)}`,
      `  Total Cost Valuation (COGS)  : ${formatPeso(val.totalCostValue)}`,
      `  Estimated Retail Markup      : ${formatPeso(val.estimatedProfitValue)}`,
      `  Total Units Held             : ${val.totalUnits.toLocaleString()} units`,
      `  SKUs Tracked                 : ${val.skusTracked}`,
      subDivider,
      `VALUATION BY PRODUCT (${analytics.inventory.rows.length} SKUs)`,
      "  #  SKU        | Product Name                   | Quantity    | Unit Price       | Total Value",
      ...lines,
      divider,
    ].join("\n");
  }

  if (type === "movement") {
    const mov = analytics.movement;
    const fastLines = mov.fastMovers.map(
      (item, idx) =>
        `${String(idx + 1).padStart(3, " ")}. ${item.name.slice(0, 34).padEnd(34, " ")} | ${String(item.units).padStart(6, " ")} units sold | Revenue: ${formatPeso(item.revenue)} | Stock: ${item.stock}`,
    );
    const slowLines = mov.slowMovers.map(
      (item, idx) =>
        `${String(idx + 1).padStart(3, " ")}. ${item.name.slice(0, 34).padEnd(34, " ")} | ${String(item.units).padStart(6, " ")} units sold | Revenue: ${formatPeso(item.revenue)} | Stock: ${item.stock}`,
    );

    return [
      divider,
      "MEDPRIX PHARMACY - PRODUCT MOVEMENT REPORT (FAST & SLOW MOVERS)",
      divider,
      `Period      : ${analytics.periodLabel}`,
      `Generated   : ${generatedAt}`,
      `Total Sold  : ${mov.totalUnitsSold.toLocaleString()} units across all completed sales`,
      subDivider,
      `FAST-MOVING PRODUCTS (TOP ${mov.fastMovers.length})`,
      ...fastLines,
      subDivider,
      `SLOW-MOVING PRODUCTS (BOTTOM ${mov.slowMovers.length})`,
      ...slowLines,
      divider,
    ].join("\n");
  }

  // type === "cash"
  const c = analytics.cash;
  const mismatchLines =
    c.mismatches.length > 0
      ? c.mismatches.map(
          (row, idx) =>
            `${String(idx + 1).padStart(3, " ")}. ${row.fullDateLabel.padEnd(14, " ")} | ${row.shift.padEnd(9, " ")} | Expected: ${row.expected.padStart(10, " ")} | Recorded: ${row.recorded.padStart(10, " ")} | Diff: ${row.difference} (${row.type.toUpperCase()})`,
        )
      : ["  No cash discrepancies detected."];

  return [
    divider,
    "MEDPRIX PHARMACY - CASH MISMATCH & RECONCILIATION REPORT",
    divider,
    `Period      : ${analytics.periodLabel}`,
    `Generated   : ${generatedAt}`,
    subDivider,
    "DISCREPANCY SUMMARY",
    `  Open Alerts Detected : ${c.openAlertsCount}`,
    `  Total Short Variance : ${formatPeso(c.totalShortAmount)}`,
    `  Total Over Variance  : ${formatPeso(c.totalOverAmount)}`,
    subDivider,
    `DETECTED SHIFT INCONSISTENCIES (${c.mismatches.length})`,
    ...mismatchLines,
    divider,
  ].join("\n");
}

function pdfSafeText(input: unknown): string {
  return String(input ?? "")
    .replace(/₱/g, "PHP ")
    .replace(/[–—]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

interface PdfTableColumn {
  header: string;
  width: number;
}

interface PdfTableSection {
  title: string;
  columns: PdfTableColumn[];
  rows: string[][];
}

interface PdfReportSpec {
  title: string;
  periodLabel: string;
  kpis: { label: string; value: string }[];
  sections: PdfTableSection[];
}

function buildPdfReportSpec(type: ReportType, analytics: DashboardAnalytics): PdfReportSpec {
  if (type === "sales") {
    const d = analytics.dailySales;
    return {
      title: "DAILY SALES REPORT",
      periodLabel: `Report Date: ${analytics.salesDateLabel}`,
      kpis: [
        { label: "TOTAL SALES", value: formatPeso(d.totalSales) },
        { label: "TRANSACTIONS", value: String(d.transactionCount) },
        { label: "PRODUCTS SOLD", value: `${d.productsSold} units` },
      ],
      sections: [
        {
          title: "Payment Method Breakdown",
          columns: [
            { header: "Payment Method", width: 220 },
            { header: "Completed Orders", width: 140 },
            { header: "Total Amount", width: 155 },
          ],
          rows: [
            ["Cash", `${d.cashCount} order(s)`, formatPeso(d.cashSales)],
            ["Card (Credit / Debit)", `${d.cardCount} order(s)`, formatPeso(d.cardSales)],
            ["E-Wallet (GCash + Maya)", `${d.walletCount} order(s)`, formatPeso(d.walletSales)],
            ["  - GCash", `${d.gcashCount} order(s)`, formatPeso(d.gcashSales)],
            ["  - Maya", `${d.mayaCount} order(s)`, formatPeso(d.mayaSales)],
          ],
        },
        {
          title: `Completed Orders on ${analytics.salesDateLabel} (${d.transactionCount})`,
          columns: [
            { header: "#", width: 35 },
            { header: "Receipt Number", width: 150 },
            { header: "Payment", width: 95 },
            { header: "Cashier", width: 125 },
            { header: "Total", width: 110 },
          ],
          rows:
            d.transactions.length > 0
              ? d.transactions.map((t, idx) => [
                  String(idx + 1),
                  String(t.transactionNumber || t.id),
                  String(t.payment || "Cash"),
                  String(t.user || "Cashier").slice(0, 22),
                  formatPeso(parseMoney(t.total)),
                ])
              : [["-", "No completed sales recorded on this date", "-", "-", "PHP 0.00"]],
        },
      ],
    };
  }

  if (type === "inventory") {
    const inv = analytics.inventory;
    return {
      title: "INVENTORY REPORT",
      periodLabel: `As of Date: ${analytics.salesDateLabel}`,
      kpis: [
        { label: "TOTAL PRODUCTS", value: `${inv.totalProducts} SKUs` },
        { label: "IN STOCK", value: `${inv.inStockCount} SKUs` },
        { label: "LOW / OUT OF STOCK", value: `${inv.lowStockCount} SKUs (${inv.outOfStockCount} out)` },
      ],
      sections: [
        {
          title: `Stock Watchlist (${inv.rows.length} SKUs | ${inv.totalUnits.toLocaleString()} Total Units)`,
          columns: [
            { header: "#", width: 30 },
            { header: "SKU", width: 75 },
            { header: "Product Name", width: 195 },
            { header: "Category", width: 90 },
            { header: "Stock (Min)", width: 65 },
            { header: "Status", width: 60 },
          ],
          rows: inv.rows.map((r, idx) => [
            String(idx + 1),
            r.sku,
            r.name.slice(0, 34),
            r.category.slice(0, 16),
            `${r.stock} (${r.reorder})`,
            r.status,
          ]),
        },
      ],
    };
  }

  if (type === "financial") {
    const fin = requireFinancialData(analytics.financial);
    const notes = financialReportNotes(fin);
    if (
      analytics.financial.status === "ready" &&
      analytics.financial.refreshError
    ) {
      notes.unshift(
        "Refresh failed; showing the last successful financial summary. " +
          analytics.financial.refreshError,
      );
    }
    return {
      title: "FINANCIAL SUMMARY REPORT",
      periodLabel: financialPeriodLabel(fin),
      kpis: [
        { label: "TOTAL REVENUE", value: formatPeso(fin.revenue.total) },
        { label: "COGS", value: formatPeso(fin.costOfGoodsSold) },
        { label: "GROSS PROFIT", value: formatPeso(fin.grossProfit) },
      ],
      sections: [
        {
          title: "Financial & Profitability Summary",
          columns: [
            { header: "Financial Metric", width: 315 },
            { header: "Value", width: 200 },
          ],
          rows: financialReportRows(fin),
        },
      ],
    };
  }

  if (type === "valuation") {
    const val = analytics.valuation;
    return {
      title: "STOCK VALUATION REPORT",
      periodLabel: `As of Date: ${analytics.salesDateLabel}`,
      kpis: [
        { label: "CURRENT STOCK VALUE", value: formatPeso(val.totalRetailValue) },
        { label: "UNITS HELD", value: `${val.totalUnits.toLocaleString()} units` },
        { label: "SKUS TRACKED", value: `${val.skusTracked} SKUs` },
      ],
      sections: [
        {
          title: "Valuation Totals",
          columns: [
            { header: "Valuation Metric", width: 315 },
            { header: "Amount", width: 200 },
          ],
          rows: [
            ["Current Stock Value (Retail Selling Value)", formatPeso(val.totalRetailValue)],
            ["Total Cost Valuation (Inventory Cost Basis)", formatPeso(val.totalCostValue)],
            ["Estimated Retail Markup Value", formatPeso(val.estimatedProfitValue)],
          ],
        },
        {
          title: `Value by Product (${analytics.inventory.rows.length} SKUs)`,
          columns: [
            { header: "#", width: 30 },
            { header: "SKU", width: 75 },
            { header: "Product Name", width: 185 },
            { header: "Qty", width: 55 },
            { header: "Unit Price", width: 80 },
            { header: "Retail Value", width: 90 },
          ],
          rows: analytics.inventory.rows.map((r, idx) => [
            String(idx + 1),
            r.sku,
            r.name.slice(0, 32),
            String(r.stock),
            formatPeso(r.price),
            formatPeso(r.retailValue),
          ]),
        },
      ],
    };
  }

  if (type === "movement") {
    const mov = analytics.movement;
    return {
      title: "PRODUCT MOVEMENT REPORT",
      periodLabel: `Period: ${analytics.periodLabel}`,
      kpis: [
        { label: "TOTAL UNITS SOLD", value: `${mov.totalUnitsSold.toLocaleString()} units` },
        { label: "TOP FAST MOVER", value: mov.fastMovers[0] ? `${mov.fastMovers[0].name.split(" ")[0]} (${mov.fastMovers[0].units})` : "N/A" },
        { label: "SLOWEST MOVER", value: mov.slowMovers[0] ? `${mov.slowMovers[0].name.split(" ")[0]} (${mov.slowMovers[0].units})` : "N/A" },
      ],
      sections: [
        {
          title: `Fast-Moving Products (Top ${mov.fastMovers.length})`,
          columns: [
            { header: "Rank", width: 40 },
            { header: "Product Name", width: 235 },
            { header: "Units Sold", width: 80 },
            { header: "Revenue", width: 90 },
            { header: "Stock", width: 70 },
          ],
          rows: mov.fastMovers.map((item, idx) => [
            `#${idx + 1}`,
            item.name.slice(0, 40),
            String(item.units),
            formatPeso(item.revenue),
            String(item.stock),
          ]),
        },
        {
          title: `Slow-Moving Products (Bottom ${mov.slowMovers.length})`,
          columns: [
            { header: "Rank", width: 40 },
            { header: "Product Name", width: 235 },
            { header: "Units Sold", width: 80 },
            { header: "Revenue", width: 90 },
            { header: "Stock", width: 70 },
          ],
          rows: mov.slowMovers.map((item, idx) => [
            `#${idx + 1}`,
            item.name.slice(0, 40),
            String(item.units),
            formatPeso(item.revenue),
            String(item.stock),
          ]),
        },
      ],
    };
  }

  const c = analytics.cash;
  return {
    title: "CASH MISMATCH & RECONCILIATION REPORT",
    periodLabel: `Period: ${analytics.periodLabel}`,
    kpis: [
      { label: "OPEN ALERTS", value: String(c.openAlertsCount) },
      { label: "TOTAL SHORT", value: formatPeso(c.totalShortAmount) },
      { label: "TOTAL OVER", value: formatPeso(c.totalOverAmount) },
    ],
    sections: [
      {
        title: `Detected Shift Inconsistencies (${c.mismatches.length})`,
        columns: [
          { header: "Date", width: 90 },
          { header: "Shift", width: 75 },
          { header: "Expected Cash", width: 115 },
          { header: "Recorded Cash", width: 115 },
          { header: "Difference", width: 120 },
        ],
        rows:
          c.mismatches.length > 0
            ? c.mismatches.map((row) => [
                row.fullDateLabel,
                row.shift,
                row.expected,
                row.recorded,
                `${row.difference} (${row.type.toUpperCase()})`,
              ])
            : [["-", "-", "PHP 0.00", "PHP 0.00", "No discrepancies"]],
      },
    ],
  };
}

export function buildReportPdf(type: ReportType, analytics: DashboardAnalytics): Uint8Array {
  const spec = buildPdfReportSpec(type, analytics);
  const generatedAt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = 58;

  const pages: string[][] = [];
  let currentCommands: string[] = [];
  let cursorY = pageHeight - 40;

  const startNewPage = (isFirstPage: boolean) => {
    if (currentCommands.length > 0) {
      pages.push(currentCommands);
    }
    currentCommands = [];
    if (isFirstPage) {
      // Top dark banner
      currentCommands.push(
        `0.09 0.11 0.14 rg`,
        `${marginX} ${pageHeight - 96} ${contentWidth} 58 re f`,
        `1 1 1 rg`,
        `BT /F2 14 Tf ${marginX + 16} ${pageHeight - 62} Td (${pdfSafeText("MEDPRIX PHARMACY")}) Tj ET`,
        `0.78 0.82 0.88 rg`,
        `BT /F2 10 Tf ${marginX + 16} ${pageHeight - 80} Td (${pdfSafeText(spec.title)}) Tj ET`,
        `BT /F1 8.5 Tf ${marginX + 310} ${pageHeight - 61} Td (${pdfSafeText(spec.periodLabel)}) Tj ET`,
        `BT /F1 8.5 Tf ${marginX + 310} ${pageHeight - 77} Td (${pdfSafeText(`Generated: ${generatedAt}`)}) Tj ET`,
      );

      // 3 KPI summary cards
      const cardGap = 10;
      const cardWidth = (contentWidth - cardGap * 2) / 3;
      const cardY = pageHeight - 158;
      const cardHeight = 48;

      spec.kpis.forEach((kpi, idx) => {
        const cx = marginX + idx * (cardWidth + cardGap);
        currentCommands.push(
          `0.96 0.97 0.98 rg`,
          `0.85 0.87 0.90 RG 0.8 w`,
          `${cx.toFixed(2)} ${cardY} ${cardWidth.toFixed(2)} ${cardHeight} re B`,
          `0.42 0.45 0.50 rg`,
          `BT /F2 7.5 Tf ${(cx + 12).toFixed(2)} ${cardY + 31} Td (${pdfSafeText(kpi.label)}) Tj ET`,
          `0.09 0.11 0.14 rg`,
          `BT /F2 12.5 Tf ${(cx + 12).toFixed(2)} ${cardY + 13} Td (${pdfSafeText(kpi.value)}) Tj ET`,
        );
      });

      cursorY = cardY - 22;
    } else {
      // Continuation header
      currentCommands.push(
        `0.09 0.11 0.14 rg`,
        `BT /F2 10 Tf ${marginX} ${pageHeight - 45} Td (${pdfSafeText(`MEDPRIX PHARMACY - ${spec.title} (CONTINUED)`)}) Tj ET`,
        `0.85 0.87 0.90 RG 0.7 w`,
        `${marginX} ${pageHeight - 52} m ${pageWidth - marginX} ${pageHeight - 52} l S`,
      );
      cursorY = pageHeight - 72;
    }
  };

  const drawTableHeader = (columns: PdfTableColumn[]) => {
    const headerHeight = 20;
    const headerBottom = cursorY - headerHeight;
    currentCommands.push(
      `0.15 0.18 0.22 rg`,
      `${marginX} ${headerBottom.toFixed(2)} ${contentWidth} ${headerHeight} re f`,
      `1 1 1 rg`,
    );
    let colX = marginX + 8;
    for (const col of columns) {
      currentCommands.push(
        `BT /F2 8 Tf ${colX.toFixed(2)} ${(headerBottom + 6).toFixed(2)} Td (${pdfSafeText(col.header)}) Tj ET`,
      );
      colX += col.width;
    }
    cursorY = headerBottom;
  };

  startNewPage(true);

  for (const section of spec.sections) {
    if (cursorY - 58 < bottomLimit) {
      startNewPage(false);
    }

    // Section title
    currentCommands.push(
      `0.09 0.11 0.14 rg`,
      `BT /F2 9.5 Tf ${marginX} ${(cursorY - 10).toFixed(2)} Td (${pdfSafeText(section.title)}) Tj ET`,
    );
    cursorY -= 16;

    drawTableHeader(section.columns);

    const rowHeight = 18;
    section.rows.forEach((row, rowIndex) => {
      if (cursorY - rowHeight < bottomLimit) {
        startNewPage(false);
        drawTableHeader(section.columns);
      }

      const rowBottom = cursorY - rowHeight;
      if (rowIndex % 2 === 1) {
        currentCommands.push(
          `0.975 0.98 0.99 rg`,
          `${marginX} ${rowBottom.toFixed(2)} ${contentWidth} ${rowHeight} re f`,
        );
      }
      currentCommands.push(
        `0.90 0.91 0.93 RG 0.5 w`,
        `${marginX} ${rowBottom.toFixed(2)} m ${pageWidth - marginX} ${rowBottom.toFixed(2)} l S`,
        `0.12 0.14 0.17 rg`,
      );

      let colX = marginX + 8;
      section.columns.forEach((col, colIndex) => {
        const cellText = row[colIndex] ?? "";
        const maxChars = Math.max(4, Math.floor((col.width - 10) / 4.3));
        const clipped =
          cellText.length > maxChars ? `${cellText.slice(0, maxChars - 1)}...` : cellText;
        currentCommands.push(
          `BT /F1 8 Tf ${colX.toFixed(2)} ${(rowBottom + 5.5).toFixed(2)} Td (${pdfSafeText(clipped)}) Tj ET`,
        );
        colX += col.width;
      });

      cursorY = rowBottom;
    });

    cursorY -= 16;
  }

  if (currentCommands.length > 0) {
    pages.push(currentCommands);
  }

  // Add footers with page numbers
  const totalPages = pages.length;
  pages.forEach((cmds, idx) => {
    cmds.push(
      `0.85 0.87 0.90 RG 0.6 w`,
      `${marginX} 42 m ${pageWidth - marginX} 42 l S`,
      `0.45 0.48 0.53 rg`,
      `BT /F1 8 Tf ${marginX} 29 Td (${pdfSafeText("Medprix Pharmacy Management System - Official Operations Report")}) Tj ET`,
      `BT /F1 8 Tf ${pageWidth - marginX - 55} 29 Td (${pdfSafeText(`Page ${idx + 1} of ${totalPages}`)}) Tj ET`,
    );
  });

  // Assemble PDF 1.4 binary with exact byte offsets
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let byteLength = 0;

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  const startObj = (id: number) => {
    offsets[id] = byteLength;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr(`endobj\n`);
  };

  pushStr(`%PDF-1.4\n`);

  // 1: Catalog
  startObj(1);
  pushStr(`<< /Type /Catalog /Pages 2 0 R >>\n`);
  endObj();

  // 2: Pages
  const pageObjIds = pages.map((_, idx) => 5 + idx * 2);
  startObj(2);
  pushStr(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\n`,
  );
  endObj();

  // 3: Font F1 (Helvetica)
  startObj(3);
  pushStr(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n`);
  endObj();

  // 4: Font F2 (Helvetica-Bold)
  startObj(4);
  pushStr(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n`,
  );
  endObj();

  // Page and Content objects
  pages.forEach((cmds, idx) => {
    const pageObjId = 5 + idx * 2;
    const contentObjId = pageObjId + 1;
    const streamBody = cmds.join("\n");
    const streamBytes = encoder.encode(streamBody);

    startObj(pageObjId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\n`,
    );
    endObj();

    startObj(contentObjId);
    pushStr(`<< /Length ${streamBytes.length} >>\nstream\n`);
    chunks.push(streamBytes);
    byteLength += streamBytes.length;
    pushStr(`\nendstream\n`);
    endObj();
  });

  const totalObjects = 4 + pages.length * 2;
  const xrefOffset = byteLength;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr(`0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjects; id++) {
    pushStr(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const output = new Uint8Array(byteLength);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }
  return output;
}
