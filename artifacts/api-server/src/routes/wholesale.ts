import { createWholesaleWorkspace } from "../lib/wholesale-workspace";
import { createWholesaleOverview } from "../lib/wholesale-overview";
import { createWholesaleCollections } from "../lib/wholesale-collections";
import { createWholesaleDelivery } from "../lib/wholesale-delivery";
import { createWholesaleConfirmation } from "../lib/wholesale-confirmation";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { queryDb, withTransaction } from "@workspace/db";
import { requireAuth, requireRoles } from "../middleware/auth";
import { createWholesaleDrafts, WholesaleError } from "../lib/wholesale-drafts";

const router: IRouter = Router();
const service = createWholesaleDrafts(queryDb, withTransaction);
const workspace = createWholesaleWorkspace(queryDb);
const overview = createWholesaleOverview(queryDb);
const collections = createWholesaleCollections(queryDb, withTransaction);
const delivery = createWholesaleDelivery(queryDb, withTransaction);
const confirmation = createWholesaleConfirmation(queryDb, withTransaction);

router.use(
  "/wholesale",
  requireAuth,
  requireRoles("Admin", "FrontDesk"),
  (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
);

function handle(work: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await work(req, res);
    } catch (error) {
      if (error instanceof WholesaleError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      next(error);
    }
  };
}

router.get(
  "/wholesale/pending-orders",
  handle(async (req, res) => {
    res.json(
      await workspace.pendingOrders(
        req.query.search ?? "",
        req.query.page ?? "1",
      ),
    );
  }),
);
router.get(
  "/wholesale/deliveries",
  handle(async (req, res) => {
    res.json(
      await workspace.deliveries(
        req.query.search ?? "",
        req.query.page ?? "1",
        req.query.status ?? "active",
      ),
    );
  }),
);

router.get(
  "/wholesale/overview",
  handle(async (_req, res) => {
    res.json(await overview(res.locals.user!));
  }),
);

router.get(
  "/wholesale/catalog",
  handle(async (_req, res) => {
    res.json(await service.catalog());
  }),
);
router.get(
  "/wholesale/clients",
  handle(async (_req, res) => {
    res.json(await service.clients());
  }),
);
router.post(
  "/wholesale/clients",
  handle(async (req, res) => {
    res
      .status(201)
      .json(
        await service.createClient(
          res.locals.user!,
          req.get("Idempotency-Key"),
          req.body,
        ),
      );
  }),
);
router.get(
  "/wholesale/orders",
  handle(async (_req, res) => {
    res.json(await service.orders());
  }),
);
router.post(
  "/wholesale/orders",
  handle(async (req, res) => {
    res
      .status(201)
      .json(
        await service.save(
          res.locals.user!,
          req.get("Idempotency-Key"),
          req.body,
        ),
      );
  }),
);
router.put(
  "/wholesale/orders/:id",
  handle(async (req, res) => {
    res.json(
      await service.save(
        res.locals.user!,
        req.get("Idempotency-Key"),
        req.body?.draft,
        String(req.params.id),
        req.body?.revision,
      ),
    );
  }),
);
router.put(
  "/wholesale/products/:id/price",
  requireRoles("Admin"),
  handle(async (req, res) => {
    res.json(
      await service.setPrice(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);

router.get(
  "/wholesale/orders/:id",
  handle(async (req, res) => {
    res.json({
      order: (await service.orders(String(req.params.id)))[0],
      ...(await confirmation.detail(String(req.params.id))),
      ...(await delivery.detail(String(req.params.id))),
    });
  }),
);
router.post(
  "/wholesale/orders/:id/overrides",
  handle(async (req, res) => {
    res
      .status(201)
      .json(
        await confirmation.requestOverride(
          res.locals.user!,
          req.get("Idempotency-Key"),
          String(req.params.id),
          req.body,
        ),
      );
  }),
);
router.post(
  "/wholesale/overrides/:id/approve",
  requireRoles("Admin"),
  handle(async (req, res) => {
    res.json(
      await confirmation.approveOverride(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
router.post(
  "/wholesale/orders/:id/confirm",
  handle(async (req, res) => {
    res.json(
      await confirmation.confirm(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
router.post(
  "/wholesale/orders/:id/cancel",
  handle(async (req, res) => {
    res.json(
      await confirmation.cancel(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
router.put(
  "/wholesale/clients/:id",
  handle(async (req, res) => {
    res.json(
      await service.updateClient(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);

router.get(
  "/wholesale/delivery-receipts",
  handle(async (_req, res) => {
    res.set("Cache-Control", "no-store").json(await delivery.receipts());
  }),
);
router.get(
  "/wholesale/delivery-receipts/:id",
  handle(async (req, res) => {
    res
      .set("Cache-Control", "no-store")
      .json(await delivery.receipt(String(req.params.id)));
  }),
);
router.post(
  "/wholesale/orders/:id/schedule",
  handle(async (req, res) => {
    res.json(
      await delivery.schedule(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
router.post(
  "/wholesale/orders/:id/delivery-status",
  handle(async (req, res) => {
    res.json(
      await delivery.transition(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
router.post(
  "/wholesale/orders/:id/deliver",
  handle(async (req, res) => {
    res.json(
      await delivery.fulfill(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);

router.get(
  "/wholesale/accounts-receivable",
  handle(async (req, res) => {
    res.json(
      await collections.list(
        res.locals.user!,
        req.query.search ?? "",
        req.query.page ?? "1",
        req.query.status ?? "all",
      ),
    );
  }),
);
router.get(
  "/wholesale/accounts-receivable/:id",
  handle(async (req, res) => {
    res.json(await collections.detail(res.locals.user!, String(req.params.id)));
  }),
);
router.post(
  "/wholesale/accounts-receivable/:id/payments",
  handle(async (req, res) => {
    res.json(
      await collections.collect(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
router.post(
  "/wholesale/payments/:id/reverse",
  requireRoles("Admin"),
  handle(async (req, res) => {
    res.json(
      await collections.reverse(
        res.locals.user!,
        req.get("Idempotency-Key"),
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
export default router;
