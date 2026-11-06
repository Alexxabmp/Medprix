import wholesaleRouter from "./wholesale";
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import systemAdminRouter from "./systemAdmin";
import inventoryRouter from "./inventory";
import procurementRouter from "./procurement";
import posCheckoutRouter from "./pos-checkouts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(posCheckoutRouter);
router.use(systemAdminRouter);
router.use(inventoryRouter);
router.use(procurementRouter);
router.use(wholesaleRouter);

export default router;
