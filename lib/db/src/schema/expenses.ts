import { pgTable, uuid, date, varchar, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Operating expenses (migration 0026). Never deleted; voided with a reason. */
export const operatingExpensesTable = pgTable(
  "operating_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseDate: date("expense_date").notNull(),
    category: varchar("category", { length: 30 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    payee: varchar("payee", { length: 120 }),
    referenceNumber: varchar("reference_number", { length: 100 }),
    description: varchar("description", { length: 500 }).notNull(),
    recordedBy: uuid("recorded_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => usersTable.id, { onDelete: "set null" }),
    voidReason: varchar("void_reason", { length: 500 }),
  },
  (t) => [index("idx_operating_expenses_date").on(t.expenseDate)],
);
export type OperatingExpense = typeof operatingExpensesTable.$inferSelect;
