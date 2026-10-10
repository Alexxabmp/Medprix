import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { hashPassword, validatePassword } from "../lib/password";
import { requireAuth, requireRole } from "../middleware/auth";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const VALID_ROLES = ["Admin", "Cashier", "FrontDesk"] as const;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return uuidRegex.test(value);
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

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({
      error: "Invalid user role.",
    });
  }

  if (
    contactNumber !== undefined &&
    contactNumber !== null &&
    contactNumber !== ""
  ) {
    if (typeof contactNumber !== "string") {
      return res.status(400).json({
        error: "Contact number must be a valid string.",
      });
    }

    const cleaned = contactNumber.trim();
    const phoneRegex = /^\+639\d{9}$/;

    if (cleaned && !phoneRegex.test(cleaned)) {
      return res.status(400).json({
        error: "Invalid phone number format. Expected +639XXXXXXXXX.",
      });
    }
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
        role,
        fullName: displayName,
        contactNumber: contactNumber?.trim() || null,
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

router.patch("/users/:id", async (req, res) => {
  const userId = req.params.id;

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      error: "Invalid user id.",
    });
  }

  const {
    username,
    role,
    fullName,
    contactNumber,
    isActive,
  } = req.body ?? {};

  if (userId === res.locals.user?.id) {
    if (role !== undefined && role !== res.locals.user.role) {
      return res.status(400).json({
        error: "You cannot change your own role.",
      });
    }

    if (isActive === false) {
      return res.status(400).json({
        error: "You cannot deactivate your own account.",
      });
    }
  }

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({
      error: "Invalid user role.",
    });
  }

  if (username !== undefined) {
    if (typeof username !== "string" || !username.trim()) {
      return res.status(400).json({
        error: "Username is required.",
      });
    }
  }

  if (contactNumber !== undefined && contactNumber !== null && contactNumber !== "") {
    if (typeof contactNumber !== "string") {
      return res.status(400).json({
        error: "Contact number must be a valid string.",
      });
    }

    const cleaned = contactNumber.trim();
    const phoneRegex = /^\+639\d{9}$/;

    if (cleaned && !phoneRegex.test(cleaned)) {
      return res.status(400).json({
        error: "Invalid phone number format. Expected +639XXXXXXXXX.",
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
        ...(role !== undefined
          ? { role }
          : {}),
        ...(fullName !== undefined
          ? { fullName: fullName.trim() }
          : {}),
        ...(contactNumber !== undefined
          ? { contactNumber: contactNumber?.trim() || null }
          : {}),
        ...(isActive !== undefined
          ? { isActive: Boolean(isActive) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        fullName: usersTable.fullName,
        contactNumber: usersTable.contactNumber,
        role: usersTable.role,
        isActive: usersTable.isActive,
        lastLogin: usersTable.lastLogin,
      });

    if (!updatedUser) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    return res.json(updatedUser);
  } catch {
    return res.status(409).json({
      error: "Username is already taken.",
    });
  }
});

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