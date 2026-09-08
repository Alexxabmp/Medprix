import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  timestamp,
  boolean,
} from "drizzle-orm/mysql-core";

export const usersTable = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  contactNumber: varchar("contact_number", { length: 20 }),
  isActive: boolean("is_active").default(true).notNull(),
  role: mysqlEnum("role", ["admin", "cashier", "frontdesk"])
    .notNull()
    .default("cashier"),
  createdAt: timestamp("created_at").defaultNow(),
  lastLogin: timestamp("last_login")
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;