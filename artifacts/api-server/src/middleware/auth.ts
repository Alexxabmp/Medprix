import type { NextFunction, Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  readSessionCookie,
  verifySessionToken,
  type SessionUser,
} from "../lib/session";
import type { UserRoleEnum } from "@workspace/db/schema";

declare global {
  namespace Express {
    interface Locals {
      user?: SessionUser;
    }
  }
}

const PASSWORD_CHANGE_PATHS = /\/(me|account|account\/password)\/?$/;

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : undefined;

  const cookieToken = readSessionCookie(req.cookies);
  const token = bearerToken || cookieToken;

  const session = verifySessionToken(token);

  if (!session) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        isActive: usersTable.isActive,
        mustChangePassword: usersTable.mustChangePassword,
      })
      .from(usersTable)
      .where(
        eq(usersTable.id, session.id),
      );

    if (!user || user.isActive === false) {
      return res.status(401).json({ error: "Authentication required." });
    }

    // Until a temporary password is replaced, only My account, its password route and /me answer.
    // The server enforces this so the rule holds even if the page is bypassed.
    if (user.mustChangePassword && !PASSWORD_CHANGE_PATHS.test(req.originalUrl.split("?")[0])) {
      return res.status(403).json({ error: "Set your own password before continuing.", code: "password_change_required" });
    }

    res.locals.user = user as SessionUser;
    return next();
  } catch {
    return res.status(500).json({ error: "Authentication check failed." });
  }
}

export function requireRole(role: UserRoleEnum) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (res.locals.user?.role !== role) {
      return res.status(403).json({ error: "Insufficient permissions." });
    }

    return next();
  };
}

export function requireRoles(...roles: UserRoleEnum[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = res.locals.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions." });
    }

    return next();
  };
}
