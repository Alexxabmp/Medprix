import { Router, type IRouter } from "express";
import { db, usersTable, systemLogsTable, userActivitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { validatePassword, verifyPassword } from "../lib/password";
import {
  clearSessionCookie,
  createSessionToken,
  setSessionCookie,
} from "../lib/session";
import { requireAuth } from "../middleware/auth";
import type { UserRoleEnum } from "@workspace/db/schema";
import { recordSystemLog, recordUserActivity } from "./systemAdmin";
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

    const token = createSessionToken({
      id: user.id.toString(),
      username: user.username,
      role: user.role as UserRoleEnum,
    });

    const now = new Date();
    const clientIp = String(req.ip || req.headers["x-forwarded-for"] || "127.0.0.1").slice(0, 50);

    // 1. Update user last login and active timestamp in database
    try {
      await db
        .update(usersTable)
        .set({ lastLogin: now, updatedAt: now })
        .where(eq(usersTable.id, user.id));
    } catch (updateErr) {
      logger.warn({ updateErr }, "Could not update lastLogin on user in database");
    }

    // 2. Audit system log and user activity in database on every login
    try {
      await db.insert(systemLogsTable).values({
        userId: user.id,
        actionType: "LOGIN",
        module: "Authentication",
        description: `User ${user.fullName || user.username} (${user.role}) logged in successfully`,
        status: "Success",
        deviceIp: clientIp,
        timestamp: now,
      });
    } catch (logErr) {
      logger.warn({ logErr }, "Could not write systemLog on login to DB");
    }

    try {
      await db.insert(userActivitiesTable).values({
        userId: user.id,
        activity: "User Login",
        module: "🔐 Authentication",
        description: `User ${user.fullName || user.username} logged into Medprix workspace`,
        flag: "Normal",
        timestamp: now,
      });
    } catch (actErr) {
      logger.warn({ actErr }, "Could not write userActivity on login to DB");
    }

    // 3. Keep system administrator logs and activities updated
    try {
      recordSystemLog({
        user: user.fullName || user.username,
        role: user.role,
        action: "LOGIN",
        module: "Authentication",
        description: `User ${user.fullName || user.username} logged into system`,
        status: "Success",
        deviceIp: clientIp,
      });

      recordUserActivity({
        user: user.fullName || user.username,
        role: user.role,
        activity: "User Login",
        module: "🔐 Authentication",
        description: `User ${user.fullName || user.username} logged into workspace`,
        flag: "Normal",
      });
    } catch (fileErr) {
      logger.warn({ fileErr }, "Could not record system audit in storage");
    }

    setSessionCookie(res, token);

    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      contactNumber: user.contactNumber,
      token,
    });
  } catch (err) {
    logger.error({ err }, "Login error in auth route");
    return res.status(500).json({ error: "Login failed." });
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
