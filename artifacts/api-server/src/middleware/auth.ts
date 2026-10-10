import type { NextFunction, Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
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
      })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.username, session.username),
          eq(usersTable.id, session.id),
        ),
      );

    if (!user || user.isActive === false) {
      return res.status(401).json({ error: "Authentication required." });
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
