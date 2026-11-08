import { Router, type IRouter } from "express";
import { queryDb } from "@workspace/db";
import { createPaymentStore } from "../lib/cashier-payments";
import { requireAuth, requireRoles } from "../middleware/auth";
import { createAuditRouter } from "./admin-operations";

const router: IRouter = Router();
const paymentStore = createPaymentStore(queryDb);
router.use("/admin", requireAuth, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
// Incremental audit-only cutover. Existing transaction endpoints stay in this module.
const canonicalAudit = createAuditRouter();
router.use((req, res, next) => {
  const auditPath = req.path.replace(/\/$/, "").toLowerCase();
  if (auditPath === "/admin/system-logs" || auditPath === "/admin/user-activities") return canonicalAudit(req, res, next);
  return next();
});

export interface TransactionItem {
  product: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface UserTransaction {
  id: number;
  transactionNumber: string;
  dateTime: string;
  user: string;
  businessType: "Retail" | "Wholesale";
  customer: string;
  total: string;
  subtotal: string;
  discount: string;
  vat: string;
  amountReceived: string;
  change: string;
  payment: string;
  status: "Completed" | "Voided" | "Refunded" | "Pending";
  items: TransactionItem[];
}

export interface SystemLog {
  id: string;
  dateTime: string;
  user: string;
  role: string;
  action: string;
  module: string;
  description: string;
  status: "Success" | "Failed" | "Warning";
  deviceIp: string;
}

export interface UserActivity {
  id: string;
  dateTime: string;
  user: string;
  role: string;
  activity: string;
  module: string;
  description: string;
  flag: "Normal" | "Suspicious" | "Flagged";
}

async function refreshPayments(actor: {id:string; role:string}) {
  return paymentStore.list(actor);
}

// GET /api/admin/transactions
router.get("/admin/transactions", requireRoles("Admin", "Cashier"), async (req, res) => {
  let visibleTransactions;
  try { visibleTransactions = await refreshPayments(res.locals.user!); } catch {
    return res.status(503).json({ error: "Payment records are temporarily unavailable. Please retry." });
  }
  const { businessType, search, status } = req.query;
  let results = [...visibleTransactions];

  if (businessType && businessType !== "All") {
    results = results.filter(
      (t) => t.businessType.toLowerCase() === String(businessType).toLowerCase()
    );
  }

  if (status && status !== "All") {
    results = results.filter(
      (t) => t.status.toLowerCase() === String(status).toLowerCase()
    );
  }

  if (search) {
    const q = String(search).toLowerCase();
    results = results.filter(
      (t) =>
        t.transactionNumber.toLowerCase().includes(q) ||
        t.user.toLowerCase().includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        t.payment.toLowerCase().includes(q)
    );
  }

  return res.json(results);
});

// GET /api/admin/transactions/:id
router.get("/admin/transactions/:id", requireRoles("Admin", "Cashier"), async (req, res) => {
  let visibleTransactions;
  try { visibleTransactions = await refreshPayments(res.locals.user!); } catch {
    return res.status(503).json({ error: "Payment records are temporarily unavailable. Please retry." });
  }
  const id = String(req.params.id);
  const item = visibleTransactions.find((t) => String(t.id) === id);
  if (!item) {
    return res.status(404).json({ error: "Transaction not found." });
  }
  return res.json(item);
});

// Payment creation is handled exclusively by the atomic checkout router.

router.delete("/admin/transactions/:id", requireRoles("Admin"), (_req, res) => {
  return res.status(409).json({ error: "Saved payments cannot be deleted. An audited reversal workflow is required." });
});

// Canonical audit GET/POST handlers are delegated above; no legacy file/table access.

// PATCH /api/admin/transactions/:id/status
router.patch("/admin/transactions/:id/status", requireRoles("Admin"), (_req, res) => {
  return res.status(409).json({ error: "Payment status cannot be changed independently of an audited stock/payment reversal." });
});

// POST /api/admin/backup
router.post("/admin/backup", requireRoles("Admin"), (_req, res) => {
  return res.status(501).json({ error: "Database backups are not configured. No backup was created." });
});

export default router;
