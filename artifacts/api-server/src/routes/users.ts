import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/users", async (req, res) => {
  const { username, password, role } = req.body ?? {};
  if (!username || !password || !role) {
    return res
      .status(400)
      .json({ error: "username, password, and role are required." });
  }
  if (!["admin", "cashier", "frontdesk"].includes(role)) {
    return res
      .status(400)
      .json({ error: "Role must be admin, cashier, or frontdesk." });
  }
  try {
    await db.insert(usersTable).values({ username, password, role });
    return res.status(201).json({ username, role });
  } catch (err) {
    return res.status(409).json({ error: "Username may already be taken." });
  }
});

export default router;
