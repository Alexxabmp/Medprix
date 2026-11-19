import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
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
    /** Exactly one active Admin is the primary admin (migration 0020); only it may change other admin accounts. */
    isPrimaryAdmin: boolean("is_primary_admin").notNull().default(false),
    /** Set after an admin creates the account or resets the password; cleared when the person sets their own (migration 0021). */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /** Login lockout (migration 0022): 5 wrong passwords within 15 minutes lock the account for 15 minutes. */
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lastFailedLoginAt: timestamp("last_failed_login_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLogin: timestamp("last_login", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_users_username_ci").on(sql`lower(btrim(${t.username}))`),
    // NULL passes a CHECK, so contact_number stays optional; when present it must be +639XXXXXXXXX.
    check("users_contact_number_ph_mobile_check", sql`${t.contactNumber} ~ '^\\+639[0-9]{9}$'`),
    check("users_primary_admin_check", sql`NOT ${t.isPrimaryAdmin} OR (${t.role} = 'Admin' AND ${t.isActive})`),
    check("users_failed_login_count_check", sql`${t.failedLoginCount} >= 0`),
    uniqueIndex("uq_users_single_primary_admin").on(t.isPrimaryAdmin).where(sql`${t.isPrimaryAdmin}`),
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
