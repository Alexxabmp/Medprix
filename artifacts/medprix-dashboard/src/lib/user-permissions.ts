import type { UserRecord } from "@/lib/types";

/**
 * What the signed-in admin may do to one account on the User Management page.
 * Mirrors the server rules in api-server/src/lib/user-store.ts; the server stays the final check.
 * Each field is null when allowed, or the reason shown in the tooltip when locked.
 */
export type AccountLocks = { role: string | null; status: string | null; edit: string | null; reset: string | null };

export const ADMIN_LOCK_REASON = "Only the primary admin can change other administrators' accounts.";

export function accountLocks(target: UserRecord, me: { username: string | null; isPrimary: boolean }): AccountLocks {
  const self = Boolean(me.username) && target.username.toLowerCase() === me.username!.toLowerCase();
  if (self)
    return {
      role: target.isPrimary ? "The primary admin's role can't be changed." : "You can't change your own role.",
      status: "You can't deactivate your own account.",
      edit: null,
      reset: null,
    };
  if (target.role === "Administrator" && !me.isPrimary)
    return { role: ADMIN_LOCK_REASON, status: ADMIN_LOCK_REASON, edit: ADMIN_LOCK_REASON, reset: ADMIN_LOCK_REASON };
  return { role: null, status: null, edit: null, reset: null };
}

/** Only the primary admin may give someone the Administrator role (or create an administrator). */
export function canGrantAdmin(me: { isPrimary: boolean }) {
  return me.isPrimary;
}

export const ROLE_TO_API: Record<string, "Admin" | "FrontDesk" | "Cashier"> = {
  Administrator: "Admin",
  "Front Desk": "FrontDesk",
  Cashier: "Cashier",
};

export function initialsOf(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();
}
