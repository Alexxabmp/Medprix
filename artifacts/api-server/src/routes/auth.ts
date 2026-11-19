import { Router, type IRouter } from "express";
import { db, usersTable, withTransaction } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validatePassword, verifyPassword } from "../lib/password";
import {
  clearSessionCookie,
  createSessionToken,
  readSessionCookie,
  setSessionCookie,
  verifySessionToken,
} from "../lib/session";
import { requireAuth } from "../middleware/auth";
import type { UserRoleEnum } from "@workspace/db/schema";
import { writeAuditEvent, writeSignInEvent } from "../lib/audit-events";
import { clearFailedLogins, lockedMessage, lockMinutesLeft, LOCK_MINUTES, recordLockedAttempt, recordUnknownUsername, recordWrongPassword } from "../lib/sign-in-guard";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const invalidLoginResponse = { error: "Invalid username or password." };
const dummyPasswordHash =
  "$2b$12$tD/C7tMbn0ZTFw.SGAh6v.6SbJh0tdtTA1D/X1qKxFZkpuyrfXZx6";

router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  const normalizedUsername =
    typeof username === "string" ? username.trim() : "";

  if (!normalizedUsername || typeof password !== "string") {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  const deviceIp = String(req.ip || "").slice(0, 50);
  // Failed and refused sign-ins are recorded, but a logging problem never changes the answer the person gets.
  const quietly = async <T,>(work: (query: (text: string, params?: any[]) => Promise<{ rows: any[] }>) => Promise<T>): Promise<T | null> => {
    try {
      return await withTransaction(work);
    } catch (err) {
      logger.error({ err }, "Could not record a failed sign-in");
      return null;
    }
  };

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(btrim(${usersTable.username})) = lower(${normalizedUsername})`);

    // The hash is always checked (against a dummy for unknown names) so response time doesn't reveal which usernames exist.
    const passwordMatches = await verifyPassword(
      password,
      user?.password ?? dummyPasswordHash,
    ) && !validatePassword(password);

    if (!user) {
      await quietly(query => recordUnknownUsername(query, normalizedUsername, deviceIp));
      return res.status(401).json(invalidLoginResponse);
    }
    // A locked account refuses even the right password until the lock ends or an admin unlocks it.
    const minutesLeft = lockMinutesLeft(user.lockedUntil);
    if (minutesLeft) {
      await quietly(query => recordLockedAttempt(query, user, minutesLeft, deviceIp));
      return res.status(429).json({ error: lockedMessage(minutesLeft) });
    }
    if (!passwordMatches) {
      const result = await quietly(query => recordWrongPassword(query, user, deviceIp));
      if (result?.locked) return res.status(429).json({ error: lockedMessage(LOCK_MINUTES) });
      return res.status(401).json(invalidLoginResponse);
    }

    if (!user.isActive) {
      await quietly(query => writeSignInEvent(query, {
        userId: user.id, action: "LOGIN", activity: "Refused login", status: "Failed", deviceIp,
        description: `Sign-in refused: ${user.username}'s account is inactive`,
      }));
      return res
        .status(403)
        .json({ error: "Account is inactive. Please contact an administrator." });
    }

    // Sign-in state and its two canonical audit records commit together.
    // Never create a session that claims success when audit persistence failed.
    const actor = await withTransaction(async query => {
      const current = (await query("SELECT id,username,role,is_active FROM users WHERE id=$1 FOR UPDATE", [user.id])).rows[0];
      if (!current?.is_active) return null;
      await query("UPDATE users SET last_login=now(),updated_at=now() WHERE id=$1", [current.id]);
      await clearFailedLogins(query, current.id);
      await writeAuditEvent(query, {
        actor: current, action: "LOGIN", activity: "User Login", module: "Authentication",
        description: "Signed in to the workspace", deviceIp,
      });
      return current;
    });
    if (!actor) return res.status(403).json({ error: "Account is inactive. Please contact an administrator." });
    const token = createSessionToken({ id: actor.id, username: actor.username, role: actor.role as UserRoleEnum });

    setSessionCookie(res, token);

    return res.json({
      id: user.id,
      username: user.username,
      role: actor.role,
      fullName: user.fullName,
      contactNumber: user.contactNumber,
      // The page shows "Set your own password" before the workspace when this is true.
      mustChangePassword: user.mustChangePassword === true,
      token,
    });
  } catch (err) {
    logger.error({ err }, "Login error in auth route");
    return res.status(503).json({ error: "Sign-in could not be recorded. Please retry." });
  }
});

router.get("/me", requireAuth, (_req, res) => {
  return res.json(res.locals.user);
});

router.post("/logout", async (req, res) => {
  // Logging out always works; the record is written only when the session was still valid.
  const authHeader = req.headers.authorization;
  const token = (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined) || readSessionCookie(req.cookies);
  const session = verifySessionToken(token);
  if (session) {
    try {
      await withTransaction(async query => {
        const actor = (await query("SELECT id,username,role FROM users WHERE id=$1", [session.id])).rows[0];
        if (actor) await writeAuditEvent(query, {
          actor, action: "LOGOUT", activity: "User Logout", module: "Authentication",
          description: "Signed out of the workspace", deviceIp: String(req.ip || "").slice(0, 50),
        });
      });
    } catch (err) {
      logger.error({ err }, "Could not record a logout");
    }
  }
  clearSessionCookie(res);
  return res.status(204).send();
});

export default router;
