import crypto from "node:crypto";
import type { Response } from "express";

export type UserRole = "admin" | "cashier" | "frontdesk";

export type SessionUser = {
  id: number;
  username: string;
  role: UserRole;
};

type SessionPayload = SessionUser & {
  expiresAt: number;
};

const SESSION_COOKIE_NAME = "medprix_session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }

  return "development-only-session-secret-change-me";
}

function getSessionTtlSeconds(): number {
  const ttl = Number(process.env.SESSION_TTL_SECONDS);

  if (!Number.isInteger(ttl) || ttl <= 0) {
    return DEFAULT_SESSION_TTL_SECONDS;
  }

  return ttl;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + getSessionTtlSeconds() * 1000,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    return null;
  }

  if (!constantTimeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    const validRole =
      payload.role === "admin" ||
      payload.role === "cashier" ||
      payload.role === "frontdesk";

    if (
      !Number.isInteger(payload.id) ||
      typeof payload.username !== "string" ||
      !validRole ||
      !Number.isInteger(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: getSessionTtlSeconds() * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function readSessionCookie(
  cookies: Record<string, unknown> | undefined,
): string | undefined {
  const token = cookies?.[SESSION_COOKIE_NAME];
  return typeof token === "string" ? token : undefined;
}
