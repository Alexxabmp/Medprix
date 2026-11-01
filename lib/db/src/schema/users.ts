import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role_enum", ["Admin", "Cashier", "FrontDesk"]);

/**
 * Philippine mobile number in international format: +639XXXXXXXXX (13 chars).
 * The DB CHECK on users.contact_number uses the same pattern — reuse this in API/zod validation:
 *   z.string().regex(PH_MOBILE_REGEX, "Use +639XXXXXXXXX")
 */
export const PH_MOBILE_REGEX = /^\+639[0-9]{9}$/;

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 100 }).notNull(),
    password: varchar("password_hash", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    contactNumber: varchar("contact_number", { length: 13 }),
    employeeCode: varchar("employee_code", { length: 50 }),
    role: userRoleEnum("role").notNull().default("Cashier"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLogin: timestamp("last_login", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_users_username_ci").on(sql`lower(btrim(${t.username}))`),
    // NULL passes a CHECK, so contact_number stays optional; when present it must be +639XXXXXXXXX.
    check("users_contact_number_ph_mobile_check", sql`${t.contactNumber} ~ '^\\+639[0-9]{9}$'`),
  ],
);

export const backupRecordsTable = pgTable("backup_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  initiatedByUserId: uuid("initiated_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  backupDate: timestamp("backup_date", { withTimezone: true }).notNull().defaultNow(),
  filePath: text("file_path").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("Completed"),
});

// ─── Types ───────────────────────────────────────────────────────────────────
export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
export type BackupRecord = typeof backupRecordsTable.$inferSelect;
export type InsertBackupRecord = typeof backupRecordsTable.$inferInsert;
export type UserRoleEnum = (typeof userRoleEnum.enumValues)[number];
