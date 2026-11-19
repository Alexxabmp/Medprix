import { Router, type IRouter, type Request, type Response } from "express";
import { queryDb, withTransaction } from "@workspace/db";
import { requireAuth, requireRoles } from "../middleware/auth";
import { FinanceInputError, financeQuery, readFinanceSummary, readFinanceDetails } from "../lib/finance-read-model";
import { createExpenseStore, ExpenseError } from "../lib/expense-store";

const router: IRouter = Router();
const expenses = createExpenseStore(withTransaction, queryDb);

router.use(requireAuth, requireRoles("Admin", "FrontDesk"));

/** Every finance response is computed from the database at request time, so it is never cached. */
const handle = (what: string, work: (req: Request, res: Response) => Promise<unknown>, created = false) =>
  async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    try {
      const result: any = await work(req, res);
      return res.status(created && !result?.replayed ? 201 : 200).json(result);
    } catch (error) {
      if (error instanceof FinanceInputError) return res.status(error.status).json({ error: error.message });
      if (error instanceof ExpenseError) return res.status(error.status).json({ error: error.message, ...error.details });
      req.log?.error({ err: error }, what);
      return res.status(503).json({ error: "Financial records are unavailable right now. Try again." });
    }
  };
const actorOf = (req: Request, res: Response) => ({ ...res.locals.user!, deviceIp: String(req.ip || "").slice(0, 50) });

router.get("/finance/summary", handle("Finance summary failed", req => readFinanceSummary(financeQuery, req.query.from, req.query.to)));
router.get("/finance/details", handle("Finance details failed", req => readFinanceDetails(financeQuery, req.query.from, req.query.to)));
router.get("/finance/expenses", handle("Expense list failed", req => expenses.list(req.query.from, req.query.to)));
router.post("/finance/expenses", handle("Expense record failed", (req, res) => expenses.record(req.get("Idempotency-Key"), req.body, actorOf(req, res)), true));
router.post("/finance/expenses/:id/void", handle("Expense void failed", (req, res) => expenses.voidExpense(String(req.params.id), req.body, actorOf(req, res))));

export default router;
