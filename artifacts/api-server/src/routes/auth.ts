import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { validatePassword, verifyPassword } from "../lib/password";
import {
  clearSessionCookie,
  createSessionToken,
  setSessionCookie,
} from "../lib/session";
import { requireAuth } from "../middleware/auth";

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

    const token = createSessionToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    try {
      await db
        .update(usersTable)
        .set({ lastLogin: new Date() })
        .where(eq(usersTable.id, user.id));
    } catch {
      // Do not reject an otherwise valid login because audit metadata failed.
    }

    setSessionCookie(res, token);

    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      contactNumber: user.contactNumber,
    });
  } catch {
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

