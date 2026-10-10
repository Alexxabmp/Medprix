import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { hashPassword, validatePassword } from "../lib/password";
import { requireAuth, requireRole } from "../middleware/auth";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const VALID_ROLES = ["Admin", "Cashier", "FrontDesk"] as const;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return typeof value === "string" && uuidRegex.test(value);
}

router.use("/users", requireAuth, requireRole("Admin"));

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
  } catch {
    return res.status(500).json({ error: "Failed to fetch users." });
  }
});

function normalizeRole(roleInput: any): "Admin" | "Cashier" | "FrontDesk" | null {
  if (typeof roleInput !== "string") return null;
  const lower = roleInput.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (lower === "admin" || lower === "administrator") return "Admin";
  if (lower === "cashier") return "Cashier";
  if (lower === "frontdesk" || lower === "frontdeskstaff") return "FrontDesk";
  return null;
}

function normalizePhone(phoneInput: any): string | null {
  if (
    phoneInput === undefined ||
    phoneInput === null ||
    phoneInput === "" ||
    phoneInput === "—" ||
    phoneInput === "\u2014"
  ) {
    return null;
  }
  if (typeof phoneInput !== "string") return null;
  const cleaned = phoneInput.trim();
  const digits = cleaned.replace(/\D/g, "");
  if (digits.startsWith("639") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith("09") && digits.length === 11) {
    return `+63${digits.slice(1)}`;
  }
  if (digits.startsWith("9") && digits.length === 10) {
    return `+63${digits}`;
  }
  if (/^\+639\d{9}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

router.post("/users", async (req, res) => {
  const {
    username,
    password,
    role,
    fullName,
    contactNumber,
  } = req.body ?? {};

  const normalizedUsername =
    typeof username === "string" ? username.trim() : "";

  if (!normalizedUsername || typeof password !== "string" || !role) {
    return res.status(400).json({
      error: "username, password, and role are required.",
    });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const validRole = normalizeRole(role);
  if (!validRole) {
    return res.status(400).json({
      error: "Invalid user role. Choose Administrator, Cashier, or Front Desk.",
    });
  }

  try {
    const displayName =
      typeof fullName === "string" && fullName.trim()
        ? fullName.trim()
        : normalizedUsername;

    const passwordHash = await hashPassword(password);

    const [result] = await db
      .insert(usersTable)
      .values({
        username: normalizedUsername,
        password: passwordHash,
        role: validRole,
        fullName: displayName,
        contactNumber: normalizePhone(contactNumber),
        isActive: true,
      })
      .returning();

    return res.status(201).json({
      id: result.id,
      username: result.username,
      fullName: result.fullName,
      contactNumber: result.contactNumber,
      role: result.role,
      isActive: result.isActive,
    });
  } catch {
    return res.status(409).json({
      error: "Username is already taken.",
    });
  }
});

const handleUpdateUser = async (req: any, res: any) => {
  const userId = req.params.id;

  const {
    username,
    role,
    fullName,
    contactNumber,
    isActive,
  } = req.body ?? {};

  // Check target user
  const [targetUser] = await db
    .select()
    .from(usersTable)
    .where(
      isValidUuid(userId)
        ? eq(usersTable.id, userId)
        : eq(usersTable.username, userId),
    );

  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }

  // Prevent admin from deactivating or demoting self
  if (
    targetUser.username === res.locals.user?.username ||
    targetUser.id === res.locals.user?.id
  ) {
    if (role !== undefined) {
      const parsedRole = normalizeRole(role);
      if (parsedRole && parsedRole !== res.locals.user.role) {
        return res.status(400).json({
          error: "You cannot change your own role.",
        });
      }
    }

    if (isActive === false) {
      return res.status(400).json({
        error: "You cannot deactivate your own account.",
      });
    }
  }

  let finalRole = undefined;
  if (role !== undefined) {
    finalRole = normalizeRole(role);
    if (!finalRole) {
      return res.status(400).json({
        error: "Invalid user role.",
      });
    }
  }

  if (username !== undefined) {
    if (typeof username !== "string" || !username.trim()) {
      return res.status(400).json({
        error: "Username is required.",
      });
    }
  }

  try {
    const [updatedUser] = await db
      .update(usersTable)
      .set({
        ...(username !== undefined
          ? { username: username.trim() }
          : {}),
        ...(finalRole !== undefined
          ? { role: finalRole }
          : {}),
        ...(fullName !== undefined
          ? { fullName: fullName.trim() }
          : {}),
        ...(contactNumber !== undefined
          ? { contactNumber: normalizePhone(contactNumber) }
          : {}),
        ...(isActive !== undefined
          ? { isActive: Boolean(isActive) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, targetUser.id))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        fullName: usersTable.fullName,
        contactNumber: usersTable.contactNumber,
        role: usersTable.role,
        isActive: usersTable.isActive,
        lastLogin: usersTable.lastLogin,
      });

    return res.json(updatedUser);
  } catch {
    return res.status(409).json({
      error: "Username is already taken.",
    });
  }
};

router.patch("/users/:id", handleUpdateUser);
router.put("/users/:id", handleUpdateUser);

router.patch("/users/:id/password", async (req, res) => {
  const userId = req.params.id;
  const { password } = req.body ?? {};

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      error: "Invalid user id.",
    });
  }

  if (typeof password !== "string") {
    return res.status(400).json({
      error: "Password is required.",
    });
  }

  const passwordError = validatePassword(password);

  if (passwordError) {
    return res.status(400).json({
      error: passwordError,
    });
  }

  try {
    const passwordHash = await hashPassword(password);

    const [updatedUser] = await db
      .update(usersTable)
      .set({
        password: passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
      });

    if (!updatedUser) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    return res.status(204).send();
  } catch {
    return res.status(500).json({
      error: "Failed to reset password.",
    });
  }
});

router.delete("/users/:id", async (req, res) => {
  const userId = req.params.id;

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      error: "Invalid user id.",
    });
  }

  try {
    const [deletedUser] = await db
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
      });

    if (!deletedUser) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    return res.status(204).send();
  } catch {
    return res.status(500).json({
      error: "Failed to delete user.",
    });
  }
});

export default router;