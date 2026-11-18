import { retailSnapshotChecks } from "../retail-snapshot-contract";
import {
    pgTable,
    boolean,
    jsonb,
    pgEnum,
    uuid,
    varchar,
    text,
    integer,
    numeric,
    timestamp,
    index,
    uniqueIndex,
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
    /** When the customer agreed to have their details and usual medicines kept, and who recorded it. */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    consentRecordedBy: uuid("consent_recorded_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Customer usual orders (quantities only; prices come from the product at checkout) ───
export const customerUsualItemsTable = pgTable(
    "customer_usual_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        customerId: uuid("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
        productId: uuid("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
        quantity: integer("quantity").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        check("customer_usual_items_quantity_check", sql`${t.quantity} BETWEEN 1 AND 100000`),
        uniqueIndex("uq_customer_usual_items").on(t.customerId, t.productId),
    ],
);

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
        /** GCash / QR reference number (10–13 digits) or card terminal approval code (6 characters). */
        paymentReference: varchar("payment_reference", { length: 32 }),
        checkoutPayload: jsonb("checkout_payload"),
        cashierNameAtSale: varchar("cashier_name_at_sale", {length:255}),
        calculationVersion: varchar("calculation_version", {length:32}),
        voidReason: text("void_reason"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        ...retailSnapshotChecks.filter(c=>c.table_name==="transactions").map(c=>check(c.name,sql.raw(c.definition.slice(6)))),
        index("idx_transactions_cashier_id").on(t.cashierId),
        index("idx_transactions_customer_id").on(t.customerId),
        index("idx_transactions_date").on(t.transactionDate),
        index("idx_transactions_status").on(t.status),
        check("transactions_payment_reference_check", sql`payment_reference IS NULL OR (payment_method = 'GCash' AND payment_reference ~ '^[0-9]{10,13}$') OR (payment_method = 'Card' AND payment_reference ~ '^[A-Z0-9]{6}$')`),
        uniqueIndex("uq_transactions_payment_reference").on(t.paymentMethod, t.paymentReference).where(sql`payment_reference IS NOT NULL`),
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
        productNameAtSale: varchar("product_name_at_sale", {length:255}),
        isVatExemptAtSale: boolean("is_vat_exempt_at_sale"),
        vatRateAtSale: numeric("vat_rate_at_sale", {precision:5,scale:2}),
        vatAmount: money("vat_amount"),
        netAmount: money("net_amount"),
        discountAmount: money("discount_amount"),
        subtotal: money("subtotal").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        ...retailSnapshotChecks.filter(c=>c.table_name==="transaction_items").map(c=>check(c.name,sql.raw(c.definition.slice(6)))),
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
        /** Senior citizen / PWD name and OSCA or PWD ID number as shown on the ID (BIR discount record). */
        holderName: varchar("holder_name", { length: 120 }),
        holderIdNumber: varchar("holder_id_number", { length: 40 }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        check("discounts_discount_rate_check", sql`${t.discountRate} >= 0`),
        check("discounts_holder_check", sql`(holder_name IS NULL AND holder_id_number IS NULL) OR (btrim(holder_name) <> '' AND btrim(holder_id_number) <> '')`),
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
    merchantNameAtIssue: varchar("merchant_name_at_issue", {length:255}),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, () => retailSnapshotChecks.filter(c => c.table_name === "receipts")
    .map(c => check(c.name, sql.raw(c.definition.slice(6)))));

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
