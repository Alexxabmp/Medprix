import {
  pgTable,
  varchar,
  date,
  uuid,
  integer,
  timestamp,
  jsonb,
  text,
  check,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money } from "./_columns";
import { wholesaleOrdersTable, wholesaleOrderItemsTable } from "./wholesale";
import { usersTable } from "./users";
import { productsTable, batchInfoTable } from "./inventory";

export const wholesalePriceOverridesTable = pgTable(
  "wholesale_price_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => wholesaleOrdersTable.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    orderRevision: integer("order_revision").notNull(),
    binding: jsonb("binding").notNull(),
    requestedPrice: money("requested_price").notNull(),
    reason: text("reason").notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedBy: uuid("approved_by").references(() => usersTable.id, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalReason: text("approval_reason"),
  },
  (table) => [
    index("idx_wholesale_overrides_order").on(
      table.orderId,
      table.orderRevision,
      table.productId,
    ),
    check(
      "wholesale_price_overrides_order_revision_check",
      sql`${table.orderRevision} > 0`,
    ),
    check(
      "wholesale_price_overrides_requested_price_check",
      sql`${table.requestedPrice} >= 0 AND ${table.requestedPrice} <= 9999999999.99`,
    ),
    check(
      "wholesale_price_overrides_reason_check",
      sql`length(btrim(${table.reason})) BETWEEN 1 AND 500`,
    ),
    check(
      "wholesale_price_overrides_check",
      sql`(${table.approvedBy} IS NULL AND ${table.approvedAt} IS NULL AND ${table.approvalReason} IS NULL)
    OR (${table.approvedBy} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND length(btrim(${table.approvalReason})) BETWEEN 1 AND 500)`,
    ),
  ],
);

export const wholesaleReservationsTable = pgTable(
  "wholesale_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => wholesaleOrdersTable.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => wholesaleOrderItemsTable.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batchInfoTable.id, { onDelete: "restrict" }),
    batchNumberAtReservation: varchar("batch_number_at_reservation", {
      length: 100,
    }).notNull(),
    expiryAtReservation: date("expiry_at_reservation").notNull(),
    quantity: integer("quantity").notNull(),
    reservedBy: uuid("reserved_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    reservedAt: timestamp("reserved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedBy: uuid("released_by").references(() => usersTable.id, {
      onDelete: "restrict",
    }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    unique("wholesale_reservations_order_item_id_batch_id_key").on(
      table.orderItemId,
      table.batchId,
    ),
    check("wholesale_reservations_quantity_check", sql`${table.quantity} > 0`),
    check(
      "wholesale_reservations_check",
      sql`(${table.releasedAt} IS NULL) = (${table.releasedBy} IS NULL)`,
    ),
    check(
      "wholesale_reservations_check1",
      sql`${table.releasedAt} IS NULL OR ${table.consumedAt} IS NULL`,
    ),
    index("idx_wholesale_reservations_active_batch")
      .on(table.batchId)
      .where(sql`${table.releasedAt} IS NULL AND ${table.consumedAt} IS NULL`),
    index("idx_wholesale_reservations_order").on(table.orderId),
  ],
);
