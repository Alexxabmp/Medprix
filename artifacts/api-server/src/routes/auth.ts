import { Router, type IRouter } from "express";
import { db, usersTable, withTransaction } from "@workspace/db";
import { eq } from "drizzle-orm";
import { validatePassword, verifyPassword } from "../lib/password";
import {
  clearSessionCookie,
  createSessionToken,
  setSessionCookie,
} from "../lib/session";
import { requireAuth } from "../middleware/auth";
import type { UserRoleEnum } from "@workspace/db/schema";
import { writeAuditEvent } from "../lib/audit-events";
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

  if (validatePassword(password)) {
    return res.status(401).json(invalidLoginResponse);
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, normalizedUsername));

    const passwordMatches = await verifyPassword(
      password,
      user?.password ?? dummyPasswordHash,
    );

    if (!user || !passwordMatches) {
      return res.status(401).json(invalidLoginResponse);
    }

    if (!user.isActive) {
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
      await writeAuditEvent(query, {
        actor: current, action: "LOGIN", activity: "User Login", module: "Authentication",
        description: "Signed in to the workspace", deviceIp: String(req.ip || "").slice(0, 50),
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

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.status(204).send();
});

export default router;
