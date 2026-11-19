import { pgTable, uuid, varchar, numeric, integer, date, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { wholesaleCollectionsTable } from "./wholesale-collections";
import { wholesaleOrdersTable } from "./wholesale";

/** One numbered acknowledgment receipt per client payment (migration 0027). Immutable except a late official-receipt number. */
export const wholesaleCollectionReceiptsTable = pgTable("wholesale_collection_receipts", {
  collectionId: uuid("collection_id").primaryKey().references(() => wholesaleCollectionsTable.id, { onDelete: "restrict" }),
  receiptNumber: varchar("receipt_number", { length: 30 }).notNull().unique(),
  officialReceiptNumber: varchar("official_receipt_number", { length: 100 }),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Credit hold decisions for orders from clients with an overdue balance (migration 0027). */
export const wholesaleCreditApprovalsTable = pgTable(
  "wholesale_credit_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => wholesaleOrdersTable.id, { onDelete: "restrict" }),
    orderRevision: integer("order_revision").notNull(),
    overdueAmount: numeric("overdue_amount", { precision: 12, scale: 2 }).notNull(),
    oldestDueDate: date("oldest_due_date"),
    reason: varchar("reason", { length: 500 }).notNull(),
    requestedBy: uuid("requested_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decision: varchar("decision", { length: 10 }),
    decidedBy: uuid("decided_by").references(() => usersTable.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: varchar("decision_note", { length: 500 }),
  },
  (t) => [index("idx_wholesale_credit_approvals_order").on(t.orderId, t.requestedAt)],
);
