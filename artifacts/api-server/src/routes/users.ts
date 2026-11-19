import { Router, type IRouter } from "express";
import { queryDb, withTransaction } from "@workspace/db";
import { hashPassword, validatePassword, verifyPassword } from "../lib/password";
import { requireAuth, requireRole } from "../middleware/auth";
import { createUserStore, UserError } from "../lib/user-store";

/**
 * Staff accounts. /users is for admins only (the primary-admin rules live in ../lib/user-store.ts).
 * /account is "My account" for every signed-in role: their own details and password.
 */
export function createUsersRouter(
  store = createUserStore(withTransaction, queryDb, { validate: validatePassword, hash: hashPassword, verify: verifyPassword }),
): IRouter {
  const router = Router();
  router.use("/users", requireAuth, requireRole("Admin"), (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const actorOf = (req: any, res: any) => ({ ...res.locals.user!, deviceIp: String(req.ip || "").slice(0, 50) });
  const fail = (req: any, res: any, error: unknown, fallback: string, attempted?: string) => {
    if (error instanceof UserError) {
      if (error.status === 403 && attempted)
        void store.recordRefused(actorOf(req, res), attempted, req.params?.id ? String(req.params.id) : null, error.message)
          .catch((err) => req.log?.error({ err }, "Could not record a refused account change"));
      return res.status(error.status).json({ error: error.message });
    }
    req.log?.error({ err: error }, fallback);
    return res.status(503).json({ error: `${fallback} Please try again.` });
  };

  router.get("/users", async (req, res) => {
    try { return res.json(await store.list()); } catch (error) { return fail(req, res, error, "Could not load accounts."); }
  });
  router.post("/users", async (req, res) => {
    try { return res.status(201).json(await store.create(req.body ?? {}, actorOf(req, res))); }
    catch (error) { return fail(req, res, error, "Could not create the account.", "create an account"); }
  });
  const update = async (req: any, res: any) => {
    try { return res.json(await store.update(String(req.params.id), req.body ?? {}, actorOf(req, res))); }
    catch (error) { return fail(req, res, error, "Could not update the account.", "change an account"); }
  };
  router.patch("/users/:id", update);
  router.put("/users/:id", update);
  router.patch("/users/:id/password", async (req, res) => {
    try { await store.resetPassword(String(req.params.id), req.body ?? {}, actorOf(req, res)); return res.status(204).send(); }
    catch (error) { return fail(req, res, error, "Could not reset the password.", "reset a password"); }
  });
  router.post("/users/:id/unlock", async (req, res) => {
    try { return res.json(await store.unlock(String(req.params.id), actorOf(req, res))); }
    catch (error) { return fail(req, res, error, "Could not unlock the account.", "unlock an account"); }
  });
  router.post("/users/:id/transfer-primary", async (req, res) => {
    try { return res.json(await store.transferPrimary(String(req.params.id), req.body ?? {}, actorOf(req, res))); }
    catch (error) { return fail(req, res, error, "Could not hand over the primary admin role.", "hand over the primary admin role"); }
  });
  router.get("/account", requireAuth, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { return res.json(await store.getOwnAccount(actorOf(req, res))); } catch (error) { return fail(req, res, error, "Could not load your account."); }
  });
  router.patch("/account", requireAuth, async (req, res) => {
    try { return res.json(await store.updateOwnProfile(req.body ?? {}, actorOf(req, res))); } catch (error) { return fail(req, res, error, "Could not save your details."); }
  });
  router.post("/account/password", requireAuth, async (req, res) => {
    try { await store.changeOwnPassword(req.body ?? {}, actorOf(req, res)); return res.status(204).send(); }
    catch (error) { return fail(req, res, error, "Could not change your password."); }
  });
  // Accounts are retained so audit and transaction relationships stay intact.
  router.delete("/users/:id", (_req, res) => res.status(409).json({ error: "Accounts cannot be deleted. Deactivate the account instead." }));
  return router;
}
export default createUsersRouter();
