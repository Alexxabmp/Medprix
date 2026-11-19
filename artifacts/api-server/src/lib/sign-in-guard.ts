import { loggableUsername, writeSignInEvent } from "./audit-events";

/**
 * Login lockout (Part D; the paper's "Lock Authorized Access" use case), for every role.
 * Five wrong passwords within 15 minutes lock the account for 15 minutes. While locked, even the right password is
 * refused. A successful sign-in, a password reset or an administrator's Unlock clears the count.
 * From the third wrong password in a row, attempts are flagged Suspicious in User activity.
 */
type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
export const LOCK_THRESHOLD = 5;
export const WINDOW_MINUTES = 15;
export const LOCK_MINUTES = 15;
const SUSPICIOUS_FROM = 3;

/** Whole minutes left on a lock (rounded up), or 0 when the account isn't locked. */
export function lockMinutesLeft(lockedUntil: Date | string | null | undefined, now = new Date()): number {
  if (!lockedUntil) return 0;
  const ms = new Date(lockedUntil).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

export function lockedMessage(minutes: number) {
  return `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask an administrator to unlock your account.`;
}

/** Counts one wrong password and locks the account on the fifth within the window. */
export async function recordWrongPassword(query: Query, user: { id: string; username: string }, deviceIp: string) {
  // Every expression in SET sees the row as it was, so "the count within the window" is computed once per clause.
  const row = (await query(`UPDATE users SET
      failed_login_count = CASE WHEN last_failed_login_at > now() - interval '${WINDOW_MINUTES} minutes' THEN failed_login_count + 1 ELSE 1 END,
      locked_until = CASE WHEN (CASE WHEN last_failed_login_at > now() - interval '${WINDOW_MINUTES} minutes' THEN failed_login_count + 1 ELSE 1 END) >= ${LOCK_THRESHOLD}
        THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END,
      last_failed_login_at = now(),
      updated_at = now()
    WHERE id=$1 RETURNING failed_login_count, locked_until`, [user.id])).rows[0];
  const attempts = Number(row?.failed_login_count ?? 1);
  const locked = attempts >= LOCK_THRESHOLD && lockMinutesLeft(row?.locked_until) > 0;
  await writeSignInEvent(query, {
    userId: user.id, action: "LOGIN", activity: "Failed login", status: "Failed", deviceIp,
    flag: attempts >= SUSPICIOUS_FROM ? "Suspicious" : "Normal",
    description: `Sign-in failed: wrong password for ${user.username} (attempt ${Math.min(attempts, LOCK_THRESHOLD)} of ${LOCK_THRESHOLD})`,
  });
  if (locked)
    await writeSignInEvent(query, {
      userId: user.id, action: "ACCOUNT_LOCKED", activity: "Account locked", status: "Warning", flag: "Suspicious", deviceIp,
      description: `${user.username} was locked for ${LOCK_MINUTES} minutes after ${LOCK_THRESHOLD} wrong passwords`,
    });
  return { attempts, locked };
}

/** A sign-in attempt on an account that is locked right now. */
export async function recordLockedAttempt(query: Query, user: { id: string; username: string }, minutesLeft: number, deviceIp: string) {
  await writeSignInEvent(query, {
    userId: user.id, action: "LOGIN", activity: "Refused login", status: "Failed", flag: "Suspicious", deviceIp,
    description: `Sign-in refused: ${user.username}'s account is locked (${minutesLeft} min left)`,
  });
}

/** No account has this name. Five or more from one device within the window are flagged Suspicious. */
export async function recordUnknownUsername(query: Query, typed: string, deviceIp: string) {
  const earlier = deviceIp
    ? Number((await query(`SELECT count(*)::int AS n FROM system_logs WHERE user_id IS NULL AND action_type='LOGIN' AND status='Failed'
        AND device_ip=$1 AND timestamp > now() - interval '${WINDOW_MINUTES} minutes'`, [deviceIp])).rows[0]?.n ?? 0)
    : 0;
  await writeSignInEvent(query, {
    userId: null, action: "LOGIN", activity: "Failed login", status: "Failed", deviceIp,
    flag: earlier + 1 >= LOCK_THRESHOLD ? "Suspicious" : "Normal",
    description: `Sign-in failed: no account named "${loggableUsername(typed)}"`,
  });
}

/** After a successful sign-in, a password reset or Unlock. */
export async function clearFailedLogins(query: Query, userId: string) {
  await query("UPDATE users SET failed_login_count=0,last_failed_login_at=NULL,locked_until=NULL WHERE id=$1", [userId]);
}
