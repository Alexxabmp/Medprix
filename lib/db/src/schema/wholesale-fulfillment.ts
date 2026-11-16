import { pgTable, uuid, jsonb, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  wholesaleOrdersTable,
  deliverySchedulesTable,
  deliveryReceiptsTable,
  accountsReceivableTable,
} from "./wholesale";
import { usersTable } from "./users";

export const wholesaleFulfillmentsTable = pgTable(
  "wholesale_fulfillments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => wholesaleOrdersTable.id, { onDelete: "restrict" }),
    scheduleId: uuid("schedule_id")
      .notNull()
      .unique()
      .references(() => deliverySchedulesTable.id, { onDelete: "restrict" }),
    receiptId: uuid("receipt_id")
      .notNull()
      .unique()
      .references(() => deliveryReceiptsTable.id, { onDelete: "restrict" }),
    arId: uuid("ar_id")
      .notNull()
      .unique()
      .references(() => accountsReceivableTable.id, { onDelete: "restrict" }),
    snapshot: jsonb("snapshot").notNull(),
    deliveredBy: uuid("delivered_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    // Required by schedule activation; populated by the receipt workflow in checkpoint 2.
    receivedAt: timestamp("received_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "wholesale_fulfillments_snapshot_check",
      sql`jsonb_typeof(${table.snapshot})='object'`,
    ),
  ],
);
