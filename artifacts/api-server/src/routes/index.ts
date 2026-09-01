import { Router, type IRouter } from "express";
import healthRouter from "./health";
import systemAdminRouter from "./systemAdmin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(systemAdminRouter);

export default router;
