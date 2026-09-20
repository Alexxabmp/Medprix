import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role_enum", ["Admin", "Cashier", "FrontDesk"]);

// ─── Roles ───────────────────────────────────────────────────────────────────
export const rolesTable = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleName: varchar("role_name", { length: 100 }).notNull().unique("roles_role_name_key"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Permissions ─────────────────────────────────────────────────────────────
export const permissionsTable = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleName: varchar("module_name", { length: 100 }).notNull(),
    permissionType: varchar("permission_type", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_permissions_module_type").on(t.moduleName, t.permissionType)],
);

// ─── Users ───────────────────────────────────────────────────────────────────
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
    username: varchar("username", { length: 100 }).notNull().unique("users_username_key"),
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
    // NULL passes a CHECK, so contact_number stays optional; when present it must be +639XXXXXXXXX.
    check("users_contact_number_ph_mobile_check", sql`${t.contactNumber} ~ '^\\+639[0-9]{9}$'`),
  ],
);

// ─── User ↔ Role assignments ─────────────────────────────────────────────────
export const userRolesTable = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_user_roles").on(t.userId, t.roleId)],
);

// ─── Role ↔ Permission grants ────────────────────────────────────────────────
export const rolePermissionsTable = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissionsTable.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_role_permissions").on(t.roleId, t.permissionId)],
);

// ─── Backup records ──────────────────────────────────────────────────────────
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
export type Role = typeof rolesTable.$inferSelect;
export type InsertRole = typeof rolesTable.$inferInsert;
export type Permission = typeof permissionsTable.$inferSelect;
export type InsertPermission = typeof permissionsTable.$inferInsert;
export type UserRoleAssignment = typeof userRolesTable.$inferSelect;
export type InsertUserRoleAssignment = typeof userRolesTable.$inferInsert;
export type RolePermission = typeof rolePermissionsTable.$inferSelect;
export type InsertRolePermission = typeof rolePermissionsTable.$inferInsert;
export type BackupRecord = typeof backupRecordsTable.$inferSelect;
export type InsertBackupRecord = typeof backupRecordsTable.$inferInsert;
export type UserRoleEnum = (typeof userRoleEnum.enumValues)[number];