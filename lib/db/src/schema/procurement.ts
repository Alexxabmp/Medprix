import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  date,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money } from "./_columns";
import { productsTable } from "./inventory";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const poStatusEnum = pgEnum("po_status_enum", [
  "Draft",
  "Pending",
  "Approved",
  "Submitted",
  "Fulfilled",
  "Cancelled",
]);
export const deliveryStatusEnum = pgEnum("delivery_status_enum", [
  "Pending",
  "Received",
  "Partial",
  "Inspected",
  "Rejected",
]);

// ─── Suppliers ───────────────────────────────────────────────────────────────
export const suppliersTable = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierName: varchar("supplier_name", { length: 255 }).notNull(),
  contactPerson: varchar("contact_person", { length: 255 }),
  contactNumber: varchar("contact_number", { length: 50 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Purchase orders ─────────────────────────────────────────────────────────
export const purchaseOrdersTable = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliersTable.id, { onDelete: "restrict" }),
    poNumber: varchar("po_number", { length: 100 }).notNull().unique("purchase_orders_po_number_key"),
    orderDate: timestamp("order_date", { withTimezone: true }).notNull().defaultNow(),
    status: poStatusEnum("status").notNull().default("Pending"),
    totalOrderAmount: money("total_order_amount").notNull().default("0.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("purchase_orders_total_order_amount_check", sql`${t.totalOrderAmount} >= 0`),
    index("idx_purchase_orders_supplier_id").on(t.supplierId),
    index("idx_purchase_orders_status").on(t.status),
  ],
);

export const poItemsTable = pgTable(
  "po_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    quantityOrdered: integer("quantity_ordered").notNull(),
    unitCost: money("unit_cost").notNull().default("0.00"),
    lineTotal: money("line_total").notNull().default("0.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("po_items_quantity_ordered_check", sql`${t.quantityOrdered} > 0`),
    check("po_items_unit_cost_check", sql`${t.unitCost} >= 0`),
    check("po_items_line_total_check", sql`${t.lineTotal} >= 0`),
    index("idx_po_items_po_id").on(t.poId),
  ],
);

// ─── Supplier deliveries ─────────────────────────────────────────────────────
export const supplierDeliveriesTable = pgTable(
  "supplier_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrdersTable.id, { onDelete: "restrict" }),
    deliveryDate: timestamp("delivery_date", { withTimezone: true }).notNull().defaultNow(),
    deliveryStatus: deliveryStatusEnum("delivery_status").notNull().default("Received"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_supplier_deliveries_po_id").on(t.poId)],
);

export const deliveryItemsTable = pgTable(
  "delivery_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => supplierDeliveriesTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    batchNumber: varchar("batch_number", { length: 100 }).notNull(),
    expirationDate: date("expiration_date").notNull(),
    quantityDelivered: integer("quantity_delivered").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("delivery_items_quantity_delivered_check", sql`${t.quantityDelivered} > 0`),
    index("idx_delivery_items_delivery_id").on(t.deliveryId),
  ],
);

// ─── Supplier invoices / accounts payable / payments ─────────────────────────
export const supplierInvoicesTable = pgTable(
  "supplier_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id").references(() => purchaseOrdersTable.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliersTable.id, { onDelete: "restrict" }),
    invoiceNumber: varchar("invoice_number", { length: 100 })
      .notNull()
      .unique("supplier_invoices_invoice_number_key"),
    dueDate: date("due_date").notNull(),
    invoiceAmount: money("invoice_amount").notNull().default("0.00"),
    isPaid: boolean("is_paid").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("supplier_invoices_invoice_amount_check", sql`${t.invoiceAmount} >= 0`),
    index("idx_supplier_invoices_supplier_id").on(t.supplierId),
    index("idx_supplier_invoices_po_id").on(t.poId),
  ],
);

export const accountsPayableTable = pgTable(
  "accounts_payable",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliersTable.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .unique("accounts_payable_invoice_id_key")
      .references(() => supplierInvoicesTable.id, { onDelete: "cascade" }),
    totalOwed: money("total_owed").notNull().default("0.00"),
    totalPaid: money("total_paid").notNull().default("0.00"),
    balance: money("balance").notNull().default("0.00"),
    lastPaymentDate: date("last_payment_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("accounts_payable_total_owed_check", sql`${t.totalOwed} >= 0`),
    check("accounts_payable_total_paid_check", sql`${t.totalPaid} >= 0`),
    check("accounts_payable_balance_check", sql`${t.balance} >= 0`),
    index("idx_accounts_payable_supplier_id").on(t.supplierId),
    index("idx_accounts_payable_invoice_id").on(t.invoiceId),
  ],
);

export const supplierPaymentsTable = pgTable(
  "supplier_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apId: uuid("ap_id")
      .notNull()
      .references(() => accountsPayableTable.id, { onDelete: "cascade" }),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull().defaultNow(),
    amountPaid: money("amount_paid").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("supplier_payments_amount_paid_check", sql`${t.amountPaid} > 0`),
    index("idx_supplier_payments_ap_id").on(t.apId),
  ],
);

// ─── Types ───────────────────────────────────────────────────────────────────
export type Supplier = typeof suppliersTable.$inferSelect;
export type InsertSupplier = typeof suppliersTable.$inferInsert;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrdersTable.$inferInsert;
export type PoItem = typeof poItemsTable.$inferSelect;
export type InsertPoItem = typeof poItemsTable.$inferInsert;
export type SupplierDelivery = typeof supplierDeliveriesTable.$inferSelect;
export type InsertSupplierDelivery = typeof supplierDeliveriesTable.$inferInsert;
export type DeliveryItem = typeof deliveryItemsTable.$inferSelect;
export type InsertDeliveryItem = typeof deliveryItemsTable.$inferInsert;
export type SupplierInvoice = typeof supplierInvoicesTable.$inferSelect;
export type InsertSupplierInvoice = typeof supplierInvoicesTable.$inferInsert;
export type AccountsPayable = typeof accountsPayableTable.$inferSelect;
export type InsertAccountsPayable = typeof accountsPayableTable.$inferInsert;
export type SupplierPayment = typeof supplierPaymentsTable.$inferSelect;
export type InsertSupplierPayment = typeof supplierPaymentsTable.$inferInsert;
export type PoStatus = (typeof poStatusEnum.enumValues)[number];
export type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];