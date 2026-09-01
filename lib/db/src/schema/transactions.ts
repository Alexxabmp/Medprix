import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";

export const transactionsTable = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  transactionNumber: varchar("transaction_number", { length: 50 }).notNull().unique(),
  dateTime: varchar("date_time", { length: 100 }).notNull(),
  userId: int("user_id"),
  userName: varchar("user_name", { length: 255 }).notNull(),
  businessType: mysqlEnum("business_type", ["Retail", "Wholesale"]).notNull(),
  customer: varchar("customer", { length: 255 }).notNull(),
  total: varchar("total", { length: 50 }).notNull(),
  subtotal: varchar("subtotal", { length: 50 }).notNull(),
  discount: varchar("discount", { length: 50 }).notNull().default("₱0.00"),
  vat: varchar("vat", { length: 50 }).notNull().default("₱0.00"),
  amountReceived: varchar("amount_received", { length: 50 }).notNull(),
  changeAmount: varchar("change_amount", { length: 50 }).notNull().default("₱0.00"),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull().default("Cash"),
  status: mysqlEnum("status", ["Completed", "Voided", "Refunded", "Pending"]).notNull().default("Completed"),
  itemsJson: text("items_json").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TransactionRecord = typeof transactionsTable.$inferSelect;
export type InsertTransactionRecord = typeof transactionsTable.$inferInsert;
