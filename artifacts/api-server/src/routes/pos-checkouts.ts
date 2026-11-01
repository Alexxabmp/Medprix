import { Router, type IRouter } from "express";
import { queryDb, withTransaction } from "@workspace/db";
import { createAtomicCheckout, CheckoutError } from "../lib/atomic-checkout";
import { requireAuth, requireRoles } from "../middleware/auth";

export function createCheckoutRouter(
  service = createAtomicCheckout(withTransaction, queryDb),
): IRouter {
  const router = Router();
  router.post(
    ["/pos/checkouts", "/admin/transactions"],
    requireAuth,
    requireRoles("Admin", "Cashier"),
    async (req, res) => {
      try {
        return res
          .status(201)
          .json(await service.save(req.body, res.locals.user!));
      } catch (error) {
        if (error instanceof CheckoutError)
          return res
            .status(error.status)
            .json({ error: error.message, ...error.details });
        req.log?.error({ err: error }, "Atomic checkout failed");
        return res
          .status(503)
          .json({
            error:
              "Checkout could not be confirmed. Check its result before trying again.",
          });
      }
    },
  );
  router.get(
    "/pos/checkouts/:key",
    requireAuth,
    requireRoles("Admin", "Cashier"),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        return res.json(
          await service.reconcile(String(req.params.key), res.locals.user!),
        );
      } catch (error) {
        if (error instanceof CheckoutError)
          return res.status(error.status).json({ error: error.message });
        return res
          .status(503)
          .json({
            error:
              "Could not check this checkout. Keep its reference and try checking again.",
          });
      }
    },
  );
  return router;
}
export default createCheckoutRouter();
