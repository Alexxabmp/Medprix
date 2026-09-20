import {
    pgTable,
    pgEnum,
    uuid,
    varchar,
    text,
    integer,
    numeric,
    timestamp,
    index,
    check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money } from "./_columns";
import { usersTable } from "./users";
import { productsTable, batchInfoTable } from "./inventory";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const transactionStatusEnum = pgEnum("transaction_status_enum", [
    "Pending",
    "Completed",
    "Cancelled",
    "Voided",
]);

// ─── Customers ───────────────────────────────────────────────────────────────
export const customersTable = pgTable("customers", {
    id: uuid("id").primaryKey().defaultRandom(),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    discountType: varchar("discount_type", { length: 100 }).default("Regular"),
    idNumber: varchar("id_number", { length: 100 }),
    contactNumber: varchar("contact_number", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Transactions ────────────────────────────────────────────────────────────
export const transactionsTable = pgTable(
    "transactions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        cashierId: uuid("cashier_id").references(() => usersTable.id, { onDelete: "set null" }),
        customerId: uuid("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
        transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull().defaultNow(),
        status: transactionStatusEnum("status").notNull().default("Completed"),
        grossAmount: money("gross_amount").notNull().default("0.00"),
        totalDiscount: money("total_discount").notNull().default("0.00"),
        vatAmount: money("vat_amount").notNull().default("0.00"),
        netAmount: money("net_amount").notNull().default("0.00"),
        amountTendered: money("amount_tendered").notNull().default("0.00"),
        changeAmount: money("change_amount").notNull().default("0.00"),
        paymentMethod: varchar("payment_method", { length: 50 }).notNull().default("Cash"),
        voidReason: text("void_reason"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("idx_transactions_cashier_id").on(t.cashierId),
        index("idx_transactions_customer_id").on(t.customerId),
        index("idx_transactions_date").on(t.transactionDate),
        index("idx_transactions_status").on(t.status),
    ],
);

// ─── Transaction line items ──────────────────────────────────────────────────
export const transactionItemsTable = pgTable(
    "transaction_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        transactionId: uuid("transaction_id")
            .notNull()
            .references(() => transactionsTable.id, { onDelete: "cascade" }),
        productId: uuid("product_id")
            .notNull()
            .references(() => productsTable.id, { onDelete: "restrict" }),
        batchId: uuid("batch_id").references(() => batchInfoTable.id, { onDelete: "set null" }),
        quantity: integer("quantity").notNull(),
        unitPriceAtSale: money("unit_price_at_sale").notNull(),
        subtotal: money("subtotal").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        check("transaction_items_quantity_check", sql`${t.quantity} > 0`),
        check("transaction_items_unit_price_at_sale_check", sql`${t.unitPriceAtSale} >= 0`),
        check("transaction_items_subtotal_check", sql`${t.subtotal} >= 0`),
        index("idx_transaction_items_transaction_id").on(t.transactionId),
        index("idx_transaction_items_product_id").on(t.productId),
    ],
);

// ─── Discounts applied to a transaction ──────────────────────────────────────
export const discountsTable = pgTable(
    "discounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        transactionId: uuid("transaction_id")
            .notNull()
            .references(() => transactionsTable.id, { onDelete: "cascade" }),
        discountType: varchar("discount_type", { length: 100 }).notNull(),
        discountRate: numeric("discount_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
        discountAmount: money("discount_amount").notNull().default("0.00"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        check("discounts_discount_rate_check", sql`${t.discountRate} >= 0`),
        check("discounts_discount_amount_check", sql`${t.discountAmount} >= 0`),
        index("idx_discounts_transaction_id").on(t.transactionId),
    ],
);

// ─── Receipts ────────────────────────────────────────────────────────────────
export const receiptsTable = pgTable("receipts", {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
        .notNull()
        .unique("receipts_transaction_id_key")
        .references(() => transactionsTable.id, { onDelete: "cascade" }),
    receiptNumber: varchar("receipt_number", { length: 100 })
        .notNull()
        .unique("receipts_receipt_number_key"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ───────────────────────────────────────────────────────────────────
export type Customer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
export type TransactionRecord = typeof transactionsTable.$inferSelect;
export type InsertTransactionRecord = typeof transactionsTable.$inferInsert;
export type TransactionItem = typeof transactionItemsTable.$inferSelect;
export type InsertTransactionItem = typeof transactionItemsTable.$inferInsert;
export type Discount = typeof discountsTable.$inferSelect;
export type InsertDiscount = typeof discountsTable.$inferInsert;
export type Receipt = typeof receiptsTable.$inferSelect;
export type InsertReceipt = typeof receiptsTable.$inferInsert;
export type TransactionStatus = (typeof transactionStatusEnum.enumValues)[number];