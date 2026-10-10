import {
    pgTable,
    pgEnum,
    uuid,
    varchar,
    text,
    boolean,
    integer,
    date,
    timestamp,
    unique,
    index,
    check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money } from "./_columns";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const stockMovementTypeEnum = pgEnum("stock_movement_type_enum", [
    "StockIn",
    "StockOut",
    "Sale",
    "Adjustment",
    "Disposal",
    "Return",
]);
export const alertTypeEnum = pgEnum("alert_type_enum", ["LowStock", "NearExpiry", "Expired"]);
export const alertSeverityEnum = pgEnum("alert_severity_enum", ["Low", "Medium", "High", "Critical"]);

// ─── Products ────────────────────────────────────────────────────────────────
export const productsTable = pgTable(
    "products",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        sku: varchar("sku", { length: 100 }).notNull(),
        productName: varchar("product_name", { length: 255 }).notNull(),
        genericName: varchar("generic_name", { length: 255 }).notNull(),
        category: varchar("category", { length: 100 }).notNull(),
        isDangerousDrug: boolean("is_dangerous_drug").notNull().default(false),
        sellingPrice: money("selling_price").notNull().default("0.00"),
        costPrice: money("cost_price").notNull().default("0.00"),
        minimumStockLevel: integer("minimum_stock_level").notNull().default(0),
        currentStock: integer("current_stock").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique("uq_products_sku").on(t.sku),
        check("products_selling_price_check", sql`${t.sellingPrice} >= 0`),
        check("products_cost_price_check", sql`${t.costPrice} >= 0`),
        check("products_minimum_stock_level_check", sql`${t.minimumStockLevel} >= 0`),
        index("idx_products_category").on(t.category),
        index("idx_products_generic_name").on(t.genericName),
    ],
);

// ─── Batches (lot + expiry tracking) ─────────────────────────────────────────
export const batchInfoTable = pgTable(
    "batch_info",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        productId: uuid("product_id")
            .notNull()
            .references(() => productsTable.id, { onDelete: "cascade" }),
        batchNumber: varchar("batch_number", { length: 100 }).notNull(),
        expirationDate: date("expiration_date").notNull(),
        quantityRemaining: integer("quantity_remaining").notNull().default(0),
        mfgDate: date("mfg_date"),
        dateReceived: date("date_received"),
        supplier: varchar("supplier", { length: 255 }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique("uq_product_batch").on(t.productId, t.batchNumber),
        check("batch_info_quantity_remaining_check", sql`${t.quantityRemaining} >= 0`),
        index("idx_batch_info_product_id").on(t.productId),
        index("idx_batch_info_expiration_date").on(t.expirationDate),
    ],
);

// ─── Stock movements ─────────────────────────────────────────────────────────
// `referenceId` is a soft reference (sale, delivery, PO … depending on movementType) — no FK.
export const stockMovementsTable = pgTable(
    "stock_movements",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        productId: uuid("product_id")
            .notNull()
            .references(() => productsTable.id, { onDelete: "cascade" }),
        batchId: uuid("batch_id").references(() => batchInfoTable.id, { onDelete: "set null" }),
        movementType: stockMovementTypeEnum("movement_type").notNull(),
        quantity: integer("quantity").notNull(),
        movementDate: timestamp("movement_date", { withTimezone: true }).notNull().defaultNow(),
        referenceId: uuid("reference_id"),
        notes: text("notes"),
    },
    (t) => [
        index("idx_stock_movements_product_id").on(t.productId),
        index("idx_stock_movements_batch_id").on(t.batchId),
        index("idx_stock_movements_movement_date").on(t.movementDate),
    ],
);

// ─── Inventory alerts ────────────────────────────────────────────────────────
export const inventoryAlertsTable = pgTable(
    "inventory_alerts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        productId: uuid("product_id")
            .notNull()
            .references(() => productsTable.id, { onDelete: "cascade" }),
        batchId: uuid("batch_id").references(() => batchInfoTable.id, { onDelete: "set null" }),
        alertType: alertTypeEnum("alert_type").notNull(),
        severity: alertSeverityEnum("severity").notNull().default("Medium"),
        triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
        isResolved: boolean("is_resolved").notNull().default(false),
        resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    },
    (t) => [
        index("idx_inventory_alerts_product_id").on(t.productId),
        index("idx_inventory_alerts_is_resolved").on(t.isResolved),
    ],
);

// ─── Types ───────────────────────────────────────────────────────────────────
export type Product = typeof productsTable.$inferSelect;
export type InsertProduct = typeof productsTable.$inferInsert;
export type BatchInfo = typeof batchInfoTable.$inferSelect;
export type InsertBatchInfo = typeof batchInfoTable.$inferInsert;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
export type InsertStockMovement = typeof stockMovementsTable.$inferInsert;
export type InventoryAlert = typeof inventoryAlertsTable.$inferSelect;
export type InsertInventoryAlert = typeof inventoryAlertsTable.$inferInsert;
export type StockMovementType = (typeof stockMovementTypeEnum.enumValues)[number];
export type AlertType = (typeof alertTypeEnum.enumValues)[number];
export type AlertSeverity = (typeof alertSeverityEnum.enumValues)[number];