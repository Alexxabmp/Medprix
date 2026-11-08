import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { arPaymentsTable } from "./wholesale";
import { usersTable } from "./users";

export const wholesaleCollectionsTable = pgTable(
  "wholesale_collections",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => arPaymentsTable.id, { onDelete: "restrict" }),
    collectorId: uuid("collector_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    collectorName: varchar("collector_name", { length: 255 }).notNull(),
    method: varchar("method", { length: 30 }).notNull(),
    reference: varchar("reference", { length: 255 }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_wholesale_collections_collector").on(
      table.collectorId,
      table.recordedAt,
    ),
    check(
      "wholesale_collections_method_check",
      sql`${table.method} IN ('Cash','Bank transfer','GCash')`,
    ),
    check(
      "wholesale_collections_check",
      sql`(${table.method}='Cash' AND ${table.reference} IS NULL) OR (${table.method}<>'Cash' AND ${table.reference} IS NOT NULL AND length(btrim(${table.reference})) BETWEEN 1 AND 255)`,
    ),
  ],
);

export const wholesaleCollectionReversalsTable = pgTable(
  "wholesale_collection_reversals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .unique()
      .references(() => wholesaleCollectionsTable.id, { onDelete: "restrict" }),
    reversedBy: uuid("reversed_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    reversedAt: timestamp("reversed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "wholesale_collection_reversals_reason_check",
      sql`length(btrim(${table.reason})) BETWEEN 1 AND 500`,
    ),
  ],
);
