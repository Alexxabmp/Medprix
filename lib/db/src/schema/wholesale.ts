import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  date,
  timestamp,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money } from "./_columns";
import { productsTable } from "./inventory";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const wholesaleOrderStatusEnum = pgEnum("wholesale_order_status_enum", [
  "Pending",
  "Confirmed",
  "Processing",
  "Delivered",
  "Cancelled",
]);
export const deliveryScheduleStatusEnum = pgEnum("delivery_schedule_status_enum", [
  "Scheduled",
  "InTransit",
  "Completed",
  "Failed",
  "Cancelled",
]);

// ─── Clients & contracts ─────────────────────────────────────────────────────
export const wholesaleClientsTable = pgTable("wholesale_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  contactPerson: varchar("contact_person", { length: 255 }),
  contactNumber: varchar("contact_number", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientContractsTable = pgTable(
  "client_contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => wholesaleClientsTable.id, { onDelete: "cascade" }),
    effectiveDate: date("effective_date").notNull(),
    expiryDate: date("expiry_date").notNull(),
    paymentTerms: varchar("payment_terms", { length: 100 }),
    status: varchar("status", { length: 50 }).notNull().default("Active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_client_contracts_client_id").on(t.clientId)],
);

export const clientContractItemsTable = pgTable(
  "client_contract_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => clientContractsTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    agreedUnitPrice: money("agreed_unit_price").notNull(),
  },
  (t) => [
    unique("uq_contract_product").on(t.contractId, t.productId),
    check("client_contract_items_agreed_unit_price_check", sql`${t.agreedUnitPrice} >= 0`),
  ],
);

// ─── Wholesale orders ────────────────────────────────────────────────────────
export const wholesaleOrdersTable = pgTable(
  "wholesale_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => wholesaleClientsTable.id, { onDelete: "restrict" }),
    contractId: uuid("contract_id").references(() => clientContractsTable.id, {
      onDelete: "set null",
    }),
    orderDate: timestamp("order_date", { withTimezone: true }).notNull().defaultNow(),
    status: wholesaleOrderStatusEnum("status").notNull().default("Pending"),
    totalOrderAmount: money("total_order_amount").notNull().default("0.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("wholesale_orders_total_order_amount_check", sql`${t.totalOrderAmount} >= 0`),
    index("idx_wholesale_orders_client_id").on(t.clientId),
    index("idx_wholesale_orders_status").on(t.status),
  ],
);

export const wholesaleOrderItemsTable = pgTable(
  "wholesale_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => wholesaleOrdersTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [
    check("wholesale_order_items_quantity_check", sql`${t.quantity} > 0`),
    check("wholesale_order_items_unit_price_check", sql`${t.unitPrice} >= 0`),
    check("wholesale_order_items_line_total_check", sql`${t.lineTotal} >= 0`),
    index("idx_wholesale_order_items_order_id").on(t.orderId),
  ],
);

// ─── Delivery schedules & receipts ───────────────────────────────────────────
export const deliverySchedulesTable = pgTable(
  "delivery_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => wholesaleOrdersTable.id, { onDelete: "cascade" }),
    scheduledDate: date("scheduled_date").notNull(),
    status: deliveryScheduleStatusEnum("status").notNull().default("Scheduled"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_delivery_schedules_order_id").on(t.orderId)],
);

export const deliveryReceiptsTable = pgTable(
  "delivery_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => wholesaleOrdersTable.id, { onDelete: "restrict" }),
    deliveryDate: timestamp("delivery_date", { withTimezone: true }).notNull().defaultNow(),
    receiptNumber: varchar("receipt_number", { length: 100 })
      .notNull()
      .unique("delivery_receipts_receipt_number_key"),
    receivedBy: varchar("received_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_delivery_receipts_order_id").on(t.orderId)],
);

export const deliveryReceiptItemsTable = pgTable(
  "delivery_receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => deliveryReceiptsTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    batchNumber: varchar("batch_number", { length: 100 }).notNull(),
    expirationDate: date("expiration_date").notNull(),
    quantityDelivered: integer("quantity_delivered").notNull(),
  },
  (t) => [check("delivery_receipt_items_quantity_delivered_check", sql`${t.quantityDelivered} > 0`)],
);

// ─── Accounts receivable & payments ──────────────────────────────────────────
export const accountsReceivableTable = pgTable(
  "accounts_receivable",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => wholesaleClientsTable.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .unique("accounts_receivable_order_id_key")
      .references(() => wholesaleOrdersTable.id, { onDelete: "cascade" }),
    totalOwed: money("total_owed").notNull().default("0.00"),
    totalPaid: money("total_paid").notNull().default("0.00"),
    balance: money("balance").notNull().default("0.00"),
    dueDate: date("due_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("accounts_receivable_total_owed_check", sql`${t.totalOwed} >= 0`),
    check("accounts_receivable_total_paid_check", sql`${t.totalPaid} >= 0`),
    check("accounts_receivable_balance_check", sql`${t.balance} >= 0`),
    index("idx_accounts_receivable_client_id").on(t.clientId),
    index("idx_accounts_receivable_order_id").on(t.orderId),
  ],
);

export const arPaymentsTable = pgTable(
  "ar_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    arId: uuid("ar_id")
      .notNull()
      .references(() => accountsReceivableTable.id, { onDelete: "cascade" }),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull().defaultNow(),
    amountPaid: money("amount_paid").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ar_payments_amount_paid_check", sql`${t.amountPaid} > 0`),
    index("idx_ar_payments_ar_id").on(t.arId),
  ],
);

// ─── Types ───────────────────────────────────────────────────────────────────
export type WholesaleClient = typeof wholesaleClientsTable.$inferSelect;
export type InsertWholesaleClient = typeof wholesaleClientsTable.$inferInsert;
export type ClientContract = typeof clientContractsTable.$inferSelect;
export type InsertClientContract = typeof clientContractsTable.$inferInsert;
export type ClientContractItem = typeof clientContractItemsTable.$inferSelect;
export type InsertClientContractItem = typeof clientContractItemsTable.$inferInsert;
export type WholesaleOrder = typeof wholesaleOrdersTable.$inferSelect;
export type InsertWholesaleOrder = typeof wholesaleOrdersTable.$inferInsert;
export type WholesaleOrderItem = typeof wholesaleOrderItemsTable.$inferSelect;
export type InsertWholesaleOrderItem = typeof wholesaleOrderItemsTable.$inferInsert;
export type DeliverySchedule = typeof deliverySchedulesTable.$inferSelect;
export type InsertDeliverySchedule = typeof deliverySchedulesTable.$inferInsert;
export type DeliveryReceipt = typeof deliveryReceiptsTable.$inferSelect;
export type InsertDeliveryReceipt = typeof deliveryReceiptsTable.$inferInsert;
export type DeliveryReceiptItem = typeof deliveryReceiptItemsTable.$inferSelect;
export type InsertDeliveryReceiptItem = typeof deliveryReceiptItemsTable.$inferInsert;
export type AccountsReceivable = typeof accountsReceivableTable.$inferSelect;
export type InsertAccountsReceivable = typeof accountsReceivableTable.$inferInsert;
export type ArPayment = typeof arPaymentsTable.$inferSelect;
export type InsertArPayment = typeof arPaymentsTable.$inferInsert;
export type WholesaleOrderStatus = (typeof wholesaleOrderStatusEnum.enumValues)[number];
export type DeliveryScheduleStatus = (typeof deliveryScheduleStatusEnum.enumValues)[number];