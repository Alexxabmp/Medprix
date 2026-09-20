import { pgTable, pgEnum, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const logStatusEnum = pgEnum("log_status_enum", ["Success", "Failed", "Warning"]);

export const systemLogsTable = pgTable(
  "system_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    actionType: varchar("action_type", { length: 100 }).notNull(),
    module: varchar("module", { length: 100 }).notNull(),
    description: text("description").notNull(),
    status: logStatusEnum("status").notNull().default("Success"),
    deviceIp: varchar("device_ip", { length: 50 }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_system_logs_user_id").on(t.userId),
    index("idx_system_logs_module").on(t.module),
    index("idx_system_logs_timestamp").on(t.timestamp),
  ],
);

export type SystemLogRecord = typeof systemLogsTable.$inferSelect;
export type InsertSystemLogRecord = typeof systemLogsTable.$inferInsert;
export type LogStatusEnum = (typeof logStatusEnum.enumValues)[number];