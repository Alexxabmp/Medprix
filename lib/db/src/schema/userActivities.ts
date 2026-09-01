import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";

export const userActivitiesTable = mysqlTable("user_activities", {
  id: int("id").autoincrement().primaryKey(),
  dateTime: varchar("date_time", { length: 100 }).notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(),
  activity: varchar("action", { length: 255 }).notNull(),
  module: varchar("module", { length: 100 }).notNull(),
  description: text("description").notNull(),
  flag: mysqlEnum("flag", ["Normal", "Suspicious", "Flagged"]).notNull().default("Normal"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserActivityRecord = typeof userActivitiesTable.$inferSelect;
export type InsertUserActivityRecord = typeof userActivitiesTable.$inferInsert;
