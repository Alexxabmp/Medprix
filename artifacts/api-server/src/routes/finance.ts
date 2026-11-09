import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth, requireRoles } from "../middleware/auth";
import { FinanceInputError, financeQuery, readFinanceSummary } from "../lib/finance-read-model";

const router: IRouter = Router();

router.use(requireAuth, requireRoles("Admin", "FrontDesk"));

router.get(
  "/finance/summary",
  async (req: Request, res: Response) => {
    try {
      const summary = await readFinanceSummary(
        financeQuery,
        req.query.from,
        req.query.to,
      );
      return res.json(summary);
    } catch (error) {
      if (error instanceof FinanceInputError) {
        return res.status(error.status).json({ error: error.message });
      }
      throw error;
    }
  },
);

export default router;
