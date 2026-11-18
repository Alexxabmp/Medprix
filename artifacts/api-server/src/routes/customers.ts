import { Router, type IRouter } from "express";
import { queryDb, withTransaction } from "@workspace/db";
import { createCustomerStore, CustomerError } from "../lib/customer-store";
import { requireAuth, requireRoles } from "../middleware/auth";

/** Returning customers (Phase 2a/2b). Admin, Front desk and Cashier can find, save, edit and delete customers. */
export function createCustomerRouter(store = createCustomerStore(withTransaction, queryDb)): IRouter {
  const router = Router();
  const roles = requireRoles("Admin", "FrontDesk", "Cashier");
  const actorOf = (req: any, res: any) => ({ ...res.locals.user!, deviceIp: String(req.ip || "").slice(0, 50) });
  const fail = (req: any, res: any, error: unknown, what: string) => {
    if (error instanceof CustomerError) return res.status(error.status).json({ error: error.message, ...error.details });
    req.log?.error({ err: error }, what);
    return res.status(503).json({ error: "Customer records are unavailable right now. Try again." });
  };

  router.get("/customers", requireAuth, roles, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { return res.json(await store.list()); } catch (error) { return fail(req, res, error, "Customer list failed"); }
  });
  router.post("/customers", requireAuth, roles, async (req, res) => {
    try { return res.status(201).json(await store.create(req.body, actorOf(req, res))); } catch (error) { return fail(req, res, error, "Customer create failed"); }
  });
  router.put("/customers/:id", requireAuth, roles, async (req, res) => {
    try { return res.json(await store.update(String(req.params.id), req.body, actorOf(req, res))); } catch (error) { return fail(req, res, error, "Customer update failed"); }
  });
  // Deleting is allowed for Admin, Front desk and Cashier (decided with the pharmacy).
  router.delete("/customers/:id", requireAuth, roles, async (req, res) => {
    try { return res.json(await store.remove(String(req.params.id), actorOf(req, res))); } catch (error) { return fail(req, res, error, "Customer delete failed"); }
  });
  router.put("/customers/:id/usual-items", requireAuth, roles, async (req, res) => {
    try { return res.json(await store.replaceUsualItems(String(req.params.id), req.body, actorOf(req, res))); }
    catch (error) { return fail(req, res, error, "Usual order update failed"); }
  });
  return router;
}
export default createCustomerRouter();
