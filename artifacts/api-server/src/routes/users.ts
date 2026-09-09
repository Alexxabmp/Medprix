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
        isActive: usersTable.isActive,
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

  if (contactNumber !== undefined && contactNumber !== null && contactNumber !== "") {
    if (typeof contactNumber !== "string") {
      return res.status(400).json({ error: "Contact number must be a valid string." });
    }
    const cleaned = contactNumber.trim();
    const phoneRegex = /^\+639\d{9}$/;
    if (!phoneRegex.test(cleaned)) {
      return res.status(400).json({ error: "Invalid phone number format. Expected +639XXXXXXXXX." });
    }
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
      isActive: true,
    });
    return res.status(201).json({
      id: result?.insertId,
      username: normalizedUsername,
      fullName: displayName,
      contactNumber: contactNumber || null,
      role,
      isActive: true,
    });
  } catch (err) {
    return res.status(409).json({ error: "Username may already be taken." });
  }
});

router.patch("/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const { role, fullName, contactNumber, isActive } = req.body ?? {};

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  if (role && !["admin", "cashier", "frontdesk"].includes(role)) {
    return res
      .status(400)
      .json({ error: "Role must be admin, cashier, or frontdesk." });
  }

  if (contactNumber !== undefined && contactNumber !== null && contactNumber !== "") {
    if (typeof contactNumber !== "string") {
      return res.status(400).json({ error: "Contact number must be a valid string." });
    }
    const cleaned = contactNumber.trim();
    const phoneRegex = /^\+639\d{9}$/;
    if (!phoneRegex.test(cleaned)) {
      return res.status(400).json({ error: "Invalid phone number format. Expected +639XXXXXXXXX." });
    }
  }

  try {
    await db
      .update(usersTable)
      .set({
        ...(role ? { role } : {}),
        ...(fullName ? { fullName } : {}),
        ...(contactNumber !== undefined ? { contactNumber: contactNumber || null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      })
      .where(eq(usersTable.id, userId));

    return res.json({
      id: userId,
      role,
      fullName,
      contactNumber,
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update user." });
  }
});
export default router;
