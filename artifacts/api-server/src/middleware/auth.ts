import type { NextFunction, Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  readSessionCookie,
  verifySessionToken,
  type SessionUser,
  type UserRole,
} from "../lib/session";

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
  const session = verifySessionToken(readSessionCookie(req.cookies));

  if (!session) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(eq(usersTable.id, session.id));

    if (!user || user.username !== session.username) {
      return res.status(401).json({ error: "Authentication required." });
    }

    res.locals.user = user;
    return next();
  } catch {
    return res.status(500).json({ error: "Authentication check failed." });
  }
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (res.locals.user?.role !== role) {
      return res.status(403).json({ error: "Insufficient permissions." });
    }

    return next();
  };
}
