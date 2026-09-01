import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";

export const systemLogsTable = mysqlTable("system_logs", {
  id: int("id").autoincrement().primaryKey(),
  dateTime: varchar("date_time", { length: 100 }).notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  module: varchar("module", { length: 100 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["Success", "Failed"]).notNull().default("Success"),
  deviceIp: varchar("device_ip", { length: 100 }).default("Desktop – 192.168.1.45"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SystemLogRecord = typeof systemLogsTable.$inferSelect;
export type InsertSystemLogRecord = typeof systemLogsTable.$inferInsert;
