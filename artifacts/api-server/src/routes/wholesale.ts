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

export default router;
