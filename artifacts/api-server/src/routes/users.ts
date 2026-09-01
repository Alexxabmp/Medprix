import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { hashPassword, validatePassword } from "../lib/password";
import { requireAuth, requireRole } from "../middleware/auth";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.use("/users", requireAuth, requireRole("admin"));

router.get("/users", async (_req, res) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        fullName: usersTable.fullName,
        contactNumber: usersTable.contactNumber,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
        lastLogin: usersTable.lastLogin,
      })
      .from(usersTable);
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch users." });
  }
});

router.post("/users", async (req, res) => {
  const { username, password, role, fullName, contactNumber } = req.body ?? {};
  const normalizedUsername =
    typeof username === "string" ? username.trim() : "";

  if (!normalizedUsername || !password || !role) {
    return res
      .status(400)
      .json({ error: "username, password, and role are required." });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  if (!["admin", "cashier", "frontdesk"].includes(role)) {
    return res
      .status(400)
      .json({ error: "Role must be admin, cashier, or frontdesk." });
  }
  try {
    const displayName =
      typeof fullName === "string" && fullName.trim()
        ? fullName.trim()
        : normalizedUsername;
    const passwordHash = await hashPassword(password);
    const [result] = await db.insert(usersTable).values({
      username: normalizedUsername,
      password: passwordHash,
      role,
      fullName: displayName,
      contactNumber: contactNumber || null,
    });
    return res.status(201).json({
      id: result?.insertId,
      username: normalizedUsername,
      fullName: displayName,
      contactNumber: contactNumber || null,
      role,
    });
  } catch (err) {
    return res.status(409).json({ error: "Username may already be taken." });
  }
});

router.patch("/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const { role, fullName, contactNumber } = req.body ?? {};

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  if (role && !["admin", "cashier", "frontdesk"].includes(role)) {
    return res
      .status(400)
      .json({ error: "Role must be admin, cashier, or frontdesk." });
  }

  try {
    await db
      .update(usersTable)
      .set({
        ...(role ? { role } : {}),
        ...(fullName ? { fullName } : {}),
        ...(contactNumber !== undefined ? { contactNumber } : {}),
      })
      .where(eq(usersTable.id, userId));

    return res.json({ id: userId, role, fullName, contactNumber });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update user." });
  }
});
export default router;
