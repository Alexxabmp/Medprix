import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  date,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { money } from "./_columns";
import { usersTable } from "./users";

// ─── Generated reports ───────────────────────────────────────────────────────
// reportType: 'Sales' | 'Inventory' | 'FinancialSummary' | 'Income' | 'Discount'
export const reportsTable = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportType: varchar("report_type", { length: 100 }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(),
    generatedByUserId: uuid("generated_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    summaryData: jsonb("summary_data").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_reports_report_type").on(t.reportType),
    index("idx_reports_date_range").on(t.dateFrom, t.dateTo),
  ],
);

// ─── Cash reconciliation ─────────────────────────────────────────────────────
export const cashReconciliationsTable = pgTable(
  "cash_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reconciliationDate: date("reconciliation_date").notNull(),
    cashierId: uuid("cashier_id").references(() => usersTable.id, { onDelete: "set null" }),
    cashOnHand: money("cash_on_hand").notNull().default("0.00"),
    totalReportedSales: money("total_reported_sales").notNull().default("0.00"),
    discrepancyAmount: money("discrepancy_amount").notNull().default("0.00"),
    hasFlaggedInconsistency: boolean("has_flagged_inconsistency").notNull().default(false),
    notes: text("notes"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_cash_reconciliations_date").on(t.reconciliationDate)],
);

// ─── Per-user dashboard config ───────────────────────────────────────────────
export const dashboardsTable = pgTable("dashboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique("dashboards_user_id_key")
    .references(() => usersTable.id, { onDelete: "cascade" }),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ───────────────────────────────────────────────────────────────────
export type Report = typeof reportsTable.$inferSelect;
export type InsertReport = typeof reportsTable.$inferInsert;
export type CashReconciliation = typeof cashReconciliationsTable.$inferSelect;
export type InsertCashReconciliation = typeof cashReconciliationsTable.$inferInsert;
export type Dashboard = typeof dashboardsTable.$inferSelect;
export type InsertDashboard = typeof dashboardsTable.$inferInsert;