import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  timestamp,
} from "drizzle-orm/mysql-core";

export const usersTable = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  contactNumber: varchar("contactNumber", { length: 20 }),
  role: mysqlEnum("role", ["admin", "cashier", "frontdesk"])
    .notNull()
    .default("cashier"),
  createdAt: timestamp("created_at").defaultNow(),
  lastLogin: timestamp("lastLogin")
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
