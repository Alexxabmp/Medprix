import {
  STAFF_ROLE_LABELS,
  cleanStaffMobile,
  cleanStaffName,
  staffMobileError,
  staffNameError,
  toDisplayStaffMobile,
  toStoredStaffMobile,
  type StaffRole,
} from "@workspace/api-zod";
import { writeAuditEvent, type AuditActor } from "./audit-events";
import { clearFailedLogins } from "./sign-in-guard";

/**
 * Staff accounts (User Management, Part A). Every change runs in one transaction that also writes its
 * System log and User activity rows, so a change is never saved without its record (or the other way round).
 *
 * Primary admin rules:
 * - Exactly one active Admin is the primary admin (the database enforces this, migration 0020).
 * - Any admin manages Cashier and Front Desk accounts.
 * - Only the primary admin creates, edits, deactivates, re-roles or resets the password of another admin,
 *   or gives someone the Administrator role.
 * - Nobody changes their own role or deactivates themselves, so the primary admin always stays an active Admin.
 * - The primary admin hands the role to another active admin after re-entering their own password.
 */
export class UserError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
export type Passwords = {
  validate: (password: unknown) => string | null;
  hash: (password: string) => Promise<string>;
  verify: (password: string, hash: string) => Promise<boolean>;
};
type Actor = AuditActor & { deviceIp?: string };
type UserRow = {
  id: string; username: string; full_name: string; contact_number: string | null; role: StaffRole;
  is_active: boolean; is_primary_admin: boolean; must_change_password: boolean; created_at: string; last_login: string | null;
  locked_until: string | null; password_hash?: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// locked_until is only returned while the lock is still running.
const COLUMNS = "id,username,full_name,contact_number,role,is_active,is_primary_admin,must_change_password,created_at,last_login,CASE WHEN locked_until > now() THEN locked_until END AS locked_until";
const MODULE = "User Management";

export function toApiUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    contactNumber: row.contact_number ?? null,
    role: row.role,
    isActive: Boolean(row.is_active),
    isPrimaryAdmin: Boolean(row.is_primary_admin),
    /** True until the person replaces the temporary password an admin gave them. */
    mustChangePassword: Boolean(row.must_change_password),
    /** Set while the account is locked after too many wrong passwords. */
    lockedUntil: row.locked_until ?? null,
    createdAt: row.created_at,
    lastLogin: row.last_login ?? null,
  };
}

export function normalizeRole(value: unknown): StaffRole | null {
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (lower === "admin" || lower === "administrator") return "Admin";
  if (lower === "cashier") return "Cashier";
  if (lower === "frontdesk" || lower === "frontdeskstaff") return "FrontDesk";
  return null;
}

const label = (role: StaffRole) => STAFF_ROLE_LABELS[role] ?? role;
const showMobile = (stored: string | null) => toDisplayStaffMobile(stored) || "(none)";

function cleanUsername(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new UserError(400, "Enter a username.");
  const username = value.trim();
  if (username.length > 100) throw new UserError(400, "Usernames can be at most 100 characters.");
  return username;
}
function cleanName(value: unknown): string {
  const name = cleanStaffName(value);
  const problem = staffNameError(name);
  if (problem) throw new UserError(400, problem);
  return name;
}
/** Returns the stored form (+639…) or null for blank. */
function cleanMobile(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const mobile = cleanStaffMobile(value);
  const problem = staffMobileError(mobile);
  if (problem) throw new UserError(400, problem);
  return toStoredStaffMobile(mobile);
}

export function createUserStore(transaction: Transaction, read: Query, passwords: Passwords) {
  /** Serializes account changes, so two admins can't race on usernames, mobile numbers or the primary role. */
  const lockAccounts = (query: Query) => query("SELECT pg_advisory_xact_lock(hashtext('medprix-user-accounts'))");

  /** The signed-in admin as stored now (not as the session says). Repairs a missing primary admin. */
  async function loadActor(query: Query, actor: Actor) {
    const row = (await query(`SELECT ${COLUMNS} FROM users WHERE id=$1`, [actor.id])).rows[0] as UserRow | undefined;
    if (!row || !row.is_active || row.role !== "Admin") throw new UserError(403, "Only active administrators can manage accounts.");
    const hasPrimary = (await query("SELECT 1 AS found FROM users WHERE is_primary_admin")).rows.length > 0;
    if (!hasPrimary) {
      // Only possible if every admin was inactive when migration 0020 ran. The first active admin to manage accounts takes it.
      await query("UPDATE users SET is_primary_admin=true,updated_at=now() WHERE id=$1", [row.id]);
      row.is_primary_admin = true;
      await writeAuditEvent(query, { actor: auditActor(row), action: "PRIMARY_ASSIGNED", activity: "Became primary admin", module: MODULE,
        description: "No primary admin existed, so this administrator became the primary admin", deviceIp: actor.deviceIp });
    }
    return row;
  }
  const auditActor = (row: UserRow): AuditActor => ({ id: row.id, username: row.username, role: row.role });

  async function lockTarget(query: Query, idOrUsername: string) {
    const key = String(idOrUsername ?? "").trim();
    if (!key) throw new UserError(404, "That account doesn't exist.");
    const row = (uuid.test(key)
      ? await query(`SELECT ${COLUMNS} FROM users WHERE id=$1 FOR UPDATE`, [key])
      : await query(`SELECT ${COLUMNS} FROM users WHERE lower(btrim(username))=lower($1) FOR UPDATE`, [key])).rows[0] as UserRow | undefined;
    if (!row) throw new UserError(404, "That account doesn't exist.");
    return row;
  }

  async function checkUsernameFree(query: Query, username: string, exceptId: string | null) {
    const taken = (await query("SELECT id FROM users WHERE lower(btrim(username))=lower(btrim($1)) AND ($2::uuid IS NULL OR id<>$2::uuid)", [username, exceptId])).rows[0];
    if (taken) throw new UserError(409, "That username is already taken.");
  }
  async function checkMobileFree(query: Query, mobile: string | null, exceptId: string | null) {
    if (!mobile) return;
    const owner = (await query("SELECT username FROM users WHERE contact_number=$1 AND ($2::uuid IS NULL OR id<>$2::uuid) ORDER BY username LIMIT 1", [mobile, exceptId])).rows[0];
    if (owner) throw new UserError(409, `This mobile number is already used by ${owner.username}.`);
  }

  /** Another admin's account can only be changed by the primary admin. */
  function guardAdminTarget(actor: UserRow, target: UserRow, message: string) {
    if (target.role === "Admin" && target.id !== actor.id && !actor.is_primary_admin) throw new UserError(403, message);
  }

  return {
    async list() {
      return (await read(`SELECT ${COLUMNS} FROM users ORDER BY created_at,id`)).rows.map(toApiUser);
    },

    async create(body: any, actor: Actor) {
      const username = cleanUsername(body?.username);
      const role = normalizeRole(body?.role);
      if (!role) throw new UserError(400, "Choose Administrator, Front Desk or Cashier for the role.");
      const fullName = cleanName(body?.fullName);
      const mobile = cleanMobile(body?.contactNumber);
      const passwordProblem = passwords.validate(body?.password);
      if (passwordProblem) throw new UserError(400, passwordProblem);
      const passwordHash = await passwords.hash(body.password);
      return transaction(async (query) => {
        await lockAccounts(query);
        const me = await loadActor(query, actor);
        if (role === "Admin" && !me.is_primary_admin) throw new UserError(403, "Only the primary admin can create administrator accounts.");
        await checkUsernameFree(query, username, null);
        await checkMobileFree(query, mobile, null);
        // The admin chose this password, so it is temporary: the person replaces it at their first sign-in.
        const row = (await query(`INSERT INTO users(username,password_hash,full_name,contact_number,role,is_active,must_change_password)
          VALUES($1,$2,$3,$4,$5,true,true) RETURNING ${COLUMNS}`, [username, passwordHash, fullName, mobile, role])).rows[0] as UserRow;
        await writeAuditEvent(query, { actor: auditActor(me), action: "USER_CREATE", activity: "Created user account", module: MODULE,
          description: `Created ${label(role)} account ${username} (${fullName})`, deviceIp: actor.deviceIp });
        return toApiUser(row);
      });
    },

    /** Any of username, fullName, contactNumber, role, isActive; fields left out are not changed. */
    async update(id: string, body: any, actor: Actor) {
      return transaction(async (query) => {
        await lockAccounts(query);
        const me = await loadActor(query, actor);
        const target = await lockTarget(query, id);
        const self = target.id === me.id;
        guardAdminTarget(me, target, "Only the primary admin can change another administrator's account.");

        const next = { ...target };
        // Unchanged values are not re-checked, so an older record that predates these rules can still be edited.
        if (body?.username !== undefined) {
          const username = cleanUsername(body.username);
          if (username !== target.username) { await checkUsernameFree(query, username, target.id); next.username = username; }
        }
        if (body?.fullName !== undefined && cleanStaffName(body.fullName) !== target.full_name) next.full_name = cleanName(body.fullName);
        if (body?.contactNumber !== undefined) {
          const mobile = cleanMobile(body.contactNumber);
          if (mobile !== target.contact_number) { await checkMobileFree(query, mobile, target.id); next.contact_number = mobile; }
        }
        if (body?.role !== undefined) {
          const role = normalizeRole(body.role);
          if (!role) throw new UserError(400, "Choose Administrator, Front Desk or Cashier for the role.");
          if (role !== target.role) {
            if (self) throw new UserError(400, "You can't change your own role.");
            if (target.is_primary_admin) throw new UserError(400, "The primary admin's role can't be changed. Hand over the primary admin role first.");
            if (role === "Admin" && !me.is_primary_admin) throw new UserError(403, "Only the primary admin can give someone the Administrator role.");
            next.role = role;
          }
        }
        if (body?.isActive !== undefined) {
          if (typeof body.isActive !== "boolean") throw new UserError(400, "Account status must be active or inactive.");
          if (body.isActive !== target.is_active) {
            if (self) throw new UserError(400, "You can't deactivate your own account.");
            if (target.is_primary_admin) throw new UserError(400, "The primary admin can't be deactivated. Hand over the primary admin role first.");
            next.is_active = body.isActive;
          }
        }

        const details: string[] = [];
        if (next.full_name !== target.full_name) details.push(`full name "${target.full_name}" → "${next.full_name}"`);
        if (next.username !== target.username) details.push(`username ${target.username} → ${next.username}`);
        if (next.contact_number !== target.contact_number) details.push(`mobile ${showMobile(target.contact_number)} → ${showMobile(next.contact_number)}`);
        const roleChanged = next.role !== target.role;
        const statusChanged = next.is_active !== target.is_active;
        if (!details.length && !roleChanged && !statusChanged) return toApiUser(target);

        const row = (await query(`UPDATE users SET username=$2,full_name=$3,contact_number=$4,role=$5,is_active=$6,updated_at=now()
          WHERE id=$1 RETURNING ${COLUMNS}`, [target.id, next.username, next.full_name, next.contact_number, next.role, next.is_active])).rows[0] as UserRow;
        const who = self ? "own account" : next.username;
        const base = { actor: auditActor(me), module: MODULE, deviceIp: actor.deviceIp };
        if (details.length)
          await writeAuditEvent(query, { ...base, action: "USER_UPDATE", activity: "Edited user details", description: `Edited ${who}: ${details.join("; ")}` });
        if (roleChanged)
          await writeAuditEvent(query, { ...base, action: "ROLE_CHANGE", activity: "Changed user role", description: `Changed ${next.username}'s role from ${label(target.role)} to ${label(next.role)}` });
        if (statusChanged)
          await writeAuditEvent(query, next.is_active
            ? { ...base, action: "USER_REACTIVATE", activity: "Reactivated user account", description: `Reactivated ${next.username}'s account` }
            : { ...base, action: "USER_DEACTIVATE", activity: "Deactivated user account", description: `Deactivated ${next.username}'s account; they are signed out on their next action` });
        return toApiUser(row);
      });
    },

    async resetPassword(id: string, body: any, actor: Actor) {
      const problem = passwords.validate(body?.password);
      if (problem) throw new UserError(400, problem);
      const passwordHash = await passwords.hash(body.password);
      return transaction(async (query) => {
        await lockAccounts(query);
        const me = await loadActor(query, actor);
        const target = await lockTarget(query, id);
        guardAdminTarget(me, target, "Only the primary admin can reset another administrator's password.");
        // Someone else's new password is temporary; an admin resetting their own is not.
        await query("UPDATE users SET password_hash=$2,must_change_password=$3,updated_at=now() WHERE id=$1", [target.id, passwordHash, target.id !== me.id]);
        // A reset is usually for someone who got locked out, so it also clears the lock.
        await clearFailedLogins(query, target.id);
        await writeAuditEvent(query, { actor: auditActor(me), action: "PASSWORD_RESET", activity: "Reset user password", module: MODULE,
          description: target.id === me.id ? "Changed own password from User Management" : `Reset the password for ${target.username}; they must choose a new one at their next sign-in`, deviceIp: actor.deviceIp });
        return { ok: true };
      });
    },

    /** Ends a lockout early (same admin rules as other account changes). */
    async unlock(id: string, actor: Actor) {
      return transaction(async (query) => {
        await lockAccounts(query);
        const me = await loadActor(query, actor);
        const target = await lockTarget(query, id);
        guardAdminTarget(me, target, "Only the primary admin can unlock another administrator's account.");
        if (!target.locked_until) return toApiUser(target);
        await clearFailedLogins(query, target.id);
        await writeAuditEvent(query, { actor: auditActor(me), action: "USER_UNLOCK", activity: "Unlocked user account", module: MODULE,
          description: `Unlocked ${target.username}'s account before the lock ended`, deviceIp: actor.deviceIp });
        return toApiUser({ ...target, locked_until: null });
      });
    },

    /**
     * Records an account change the server refused for lack of permission. The page hides those controls, so this
     * normally means someone called the server directly: flagged Suspicious for the User activity tab.
     */
    async recordRefused(actor: Actor, attempted: string, targetId: string | null, reason: string) {
      const target = targetId && uuid.test(targetId) ? (await read("SELECT username FROM users WHERE id=$1", [targetId])).rows[0]?.username : null;
      await transaction((query) => writeAuditEvent(query, { actor, action: "ACCESS_REFUSED", activity: "Refused account change", module: MODULE,
        description: `Refused: ${attempted}${target ? ` (${target})` : ""}. ${reason}`, status: "Warning", flag: "Suspicious", deviceIp: actor.deviceIp }));
    },

    /** The primary admin hands the role to another active admin, after re-entering their own password. */
    async transferPrimary(id: string, body: any, actor: Actor) {
      const typed = typeof body?.password === "string" ? body.password : "";
      if (!typed) throw new UserError(400, "Enter your password to confirm.");
      const stored = (await read("SELECT password_hash FROM users WHERE id=$1", [actor.id])).rows[0];
      if (!stored || !(await passwords.verify(typed, stored.password_hash))) {
        // Recorded in its own transaction: the refusal must stay in the log even though nothing else is saved.
        await transaction((query) => writeAuditEvent(query, { actor, action: "PRIMARY_TRANSFER", activity: "Primary admin hand-over refused", module: MODULE,
          description: "Primary admin hand-over refused: the password entered was incorrect", status: "Failed", deviceIp: actor.deviceIp }));
        throw new UserError(400, "That password is incorrect.");
      }
      return transaction(async (query) => {
        await lockAccounts(query);
        const me = await loadActor(query, actor);
        if (!me.is_primary_admin) throw new UserError(403, "Only the primary admin can hand over the primary admin role.");
        const target = await lockTarget(query, id);
        if (target.id === me.id) throw new UserError(400, "You're already the primary admin.");
        if (target.role !== "Admin") throw new UserError(400, `${target.username} isn't an administrator. Only an active administrator can become the primary admin.`);
        if (!target.is_active) throw new UserError(400, `${target.username}'s account is inactive. Reactivate it first.`);
        // Clear first: only one account may hold the flag at any moment.
        await query("UPDATE users SET is_primary_admin=false,updated_at=now() WHERE id=$1", [me.id]);
        const row = (await query(`UPDATE users SET is_primary_admin=true,updated_at=now() WHERE id=$1 RETURNING ${COLUMNS}`, [target.id])).rows[0] as UserRow;
        await writeAuditEvent(query, { actor: auditActor(me), action: "PRIMARY_TRANSFER", activity: "Handed over primary admin", module: MODULE,
          description: `Handed the primary admin role from ${me.username} to ${target.username}`, deviceIp: actor.deviceIp });
        return toApiUser(row);
      });
    },

    // ── Self-service (My account), for every role ────────────────────────────────

    async getOwnAccount(actor: Actor) {
      const row = (await read(`SELECT ${COLUMNS} FROM users WHERE id=$1`, [actor.id])).rows[0] as UserRow | undefined;
      if (!row) throw new UserError(404, "Your account no longer exists.");
      return toApiUser(row);
    },

    /** Full name and mobile number only; username and role stay with the administrators. */
    async updateOwnProfile(body: any, actor: Actor) {
      return transaction(async (query) => {
        await lockAccounts(query);
        const me = (await query(`SELECT ${COLUMNS} FROM users WHERE id=$1 FOR UPDATE`, [actor.id])).rows[0] as UserRow | undefined;
        if (!me || !me.is_active) throw new UserError(403, "Your account is inactive.");
        const next = { ...me };
        if (body?.fullName !== undefined && cleanStaffName(body.fullName) !== me.full_name) next.full_name = cleanName(body.fullName);
        if (body?.contactNumber !== undefined) {
          const mobile = cleanMobile(body.contactNumber);
          if (mobile !== me.contact_number) { await checkMobileFree(query, mobile, me.id); next.contact_number = mobile; }
        }
        const details: string[] = [];
        if (next.full_name !== me.full_name) details.push(`full name "${me.full_name}" → "${next.full_name}"`);
        if (next.contact_number !== me.contact_number) details.push(`mobile ${showMobile(me.contact_number)} → ${showMobile(next.contact_number)}`);
        if (!details.length) return toApiUser(me);
        const row = (await query(`UPDATE users SET full_name=$2,contact_number=$3,updated_at=now() WHERE id=$1 RETURNING ${COLUMNS}`,
          [me.id, next.full_name, next.contact_number])).rows[0] as UserRow;
        await writeAuditEvent(query, { actor: auditActor(me), action: "PROFILE_UPDATE", activity: "Edited own details", module: "My Account",
          description: `Edited own details: ${details.join("; ")}`, deviceIp: actor.deviceIp });
        return toApiUser(row);
      });
    },

    /** Needs the current password (the temporary one, if an admin just set it). Clears the temporary-password flag. */
    async changeOwnPassword(body: any, actor: Actor) {
      const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
      const next = typeof body?.newPassword === "string" ? body.newPassword : "";
      if (!current) throw new UserError(400, "Enter your current password.");
      const problem = passwords.validate(next);
      if (problem) throw new UserError(400, problem);
      if (next === current) throw new UserError(400, "Choose a new password that's different from your current one.");
      const stored = (await read("SELECT password_hash,must_change_password FROM users WHERE id=$1", [actor.id])).rows[0];
      if (!stored || !(await passwords.verify(current, stored.password_hash))) {
        // Kept in the log even though nothing else is saved.
        await transaction((query) => writeAuditEvent(query, { actor, action: "PASSWORD_CHANGE", activity: "Password change refused", module: "My Account",
          description: "Password change refused: the current password entered was incorrect", status: "Failed", deviceIp: actor.deviceIp }));
        throw new UserError(400, "Your current password is incorrect.");
      }
      const passwordHash = await passwords.hash(next);
      return transaction(async (query) => {
        const me = (await query(`SELECT ${COLUMNS} FROM users WHERE id=$1 FOR UPDATE`, [actor.id])).rows[0] as UserRow | undefined;
        if (!me || !me.is_active) throw new UserError(403, "Your account is inactive.");
        await query("UPDATE users SET password_hash=$2,must_change_password=false,updated_at=now() WHERE id=$1", [me.id, passwordHash]);
        await writeAuditEvent(query, { actor: auditActor(me), action: "PASSWORD_CHANGE", activity: "Changed own password", module: "My Account",
          description: me.must_change_password ? "Replaced the temporary password with their own" : "Changed own password", deviceIp: actor.deviceIp });
        return { ok: true };
      });
    },
  };
}
