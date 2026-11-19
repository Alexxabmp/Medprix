import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  integer,
  jsonb,
  text,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { wholesaleOrdersTable } from "./wholesale";
import { usersTable } from "./users";

export const wholesaleTermsOverridesTable = pgTable(
  "wholesale_terms_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => wholesaleOrdersTable.id, { onDelete: "restrict" }),
    orderRevision: integer("order_revision").notNull(),
    binding: jsonb("binding").notNull(),
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
  (t) => [
    index("idx_wholesale_terms_overrides_order").on(t.orderId, t.orderRevision),
    check(
      "wholesale_terms_overrides_order_revision_check",
      sql`${t.orderRevision}>0`,
    ),
    check(
      "wholesale_terms_overrides_check",
      sql`(${t.approvedBy} IS NULL AND ${t.approvedAt} IS NULL AND ${t.approvalReason} IS NULL) OR (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL AND ${t.approvalReason} IS NOT NULL)`,
    ),
  ],
);
