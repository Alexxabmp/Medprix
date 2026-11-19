import { Router, type IRouter } from "express";
import { queryDb } from "@workspace/db";
import { requireAuth, requireRoles } from "../middleware/auth";

type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
const includes = (value: unknown, search: string) => String(value ?? "").toLowerCase().includes(search.toLowerCase());
const iso = (value: string | Date) => new Date(value).toISOString();
function filters(query: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const key of ["search", "status", "module", "flag", "role", "businessType"]) {
    const value = query[key];
    if (value !== undefined && (typeof value !== "string" || value.length > 500)) throw new Error("Invalid filters");
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

/** Staged replacement: contract-tested independently before switching the route import. */
export function createAuditRouter(read: Query = queryDb): IRouter {
  const router = Router();
  router.use("/admin", requireAuth, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.get("/admin/system-logs", requireRoles("Admin"), async (req, res) => {
    let input: Record<string, string>;
    try { input = filters(req.query); } catch { return res.status(400).json({ error: "Invalid audit filters." }); }
    try {
      const result = await read(`SELECT l.*,u.full_name AS actor_name,u.username AS actor_username,u.role AS actor_role
        FROM system_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.timestamp DESC,l.id DESC`);
      return res.json(result.rows.map(row => ({ id: row.id, dateTime: iso(row.timestamp),
        user: row.actor_name || row.actor_username || (!row.user_id && row.module === "Authentication" ? "Unknown user" : "System / archived actor"), role: row.actor_role || "Unavailable",
        action: row.action_type, module: row.module, description: row.description, status: row.status, deviceIp: row.device_ip || "" }))
        .filter(row => (!input.status || input.status === "All" || row.status.toLowerCase() === input.status.toLowerCase()) &&
          (!input.module || input.module === "All" || includes(row.module, input.module)) &&
          (!input.search || [row.user,row.action,row.module,row.description,row.deviceIp].some(value => includes(value,input.search)))));
    } catch { return res.status(503).json({ error: "Audit records are temporarily unavailable." }); }
  });
  router.get("/admin/user-activities", requireRoles("Admin"), async (req, res) => {
    let input: Record<string, string>;
    try { input = filters(req.query); } catch { return res.status(400).json({ error: "Invalid activity filters." }); }
    try {
      const result = await read(`SELECT a.*,u.full_name AS actor_name,u.username AS actor_username,u.role AS actor_role
        FROM user_activities a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.timestamp DESC,a.id DESC`);
      return res.json(result.rows.map(row => ({ id: row.id, dateTime: iso(row.timestamp),
        user: row.actor_name || row.actor_username || (!row.user_id && row.module === "Authentication" ? "Unknown user" : "System / archived actor"), role: row.actor_role || "Unavailable",
        activity: row.activity,module: row.module,description: row.description,flag: row.flag }))
        .filter(row => (!input.flag || input.flag === "All" || row.flag.toLowerCase() === input.flag.toLowerCase()) &&
          (!input.role || input.role === "All" || row.role.toLowerCase() === input.role.toLowerCase()) &&
          (!input.module || input.module === "All" || includes(row.module,input.module)) &&
          (!input.search || [row.user,row.activity,row.module,row.description].some(value => includes(value,input.search)))));
    } catch { return res.status(503).json({ error: "Activity records are temporarily unavailable." }); }
  });
  // Admin dashboard "Security & access" panel (Part D). "Today" is the pharmacy's Manila calendar day.
  router.get("/admin/security-summary", requireRoles("Admin"), async (_req, res) => {
    try {
      const today = `timestamp >= (date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')`;
      const [counts, locked, recent] = await Promise.all([
        read(`SELECT
          (SELECT count(*)::int FROM system_logs WHERE action_type='LOGIN' AND status='Failed' AND ${today}) AS failed_today,
          (SELECT count(*)::int FROM user_activities WHERE flag<>'Normal' AND ${today}) AS suspicious_today,
          (SELECT count(*)::int FROM users WHERE is_active AND must_change_password) AS temporary_passwords`),
        read(`SELECT username,full_name,locked_until FROM users WHERE locked_until > now() ORDER BY locked_until`),
        read(`SELECT a.id,a.timestamp,a.activity,a.module,a.description,a.flag,u.full_name AS actor_name,u.username AS actor_username,a.user_id
          FROM user_activities a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.timestamp DESC,a.id DESC LIMIT 8`),
      ]);
      const row = counts.rows[0] ?? {};
      return res.json({
        failedLoginsToday: Number(row.failed_today ?? 0),
        suspiciousToday: Number(row.suspicious_today ?? 0),
        temporaryPasswords: Number(row.temporary_passwords ?? 0),
        lockedAccounts: locked.rows.map(r => ({ username: r.username, name: r.full_name, lockedUntil: iso(r.locked_until) })),
        recent: recent.rows.map(r => ({ id: r.id, dateTime: iso(r.timestamp), activity: r.activity, module: r.module, flag: r.flag,
          user: r.actor_name || r.actor_username || (!r.user_id && r.module === "Authentication" ? "Unknown user" : "System / archived actor") })),
      });
    } catch { return res.status(503).json({ error: "Security summary is temporarily unavailable." }); }
  });
  // Cash drawer till status & shift reconciliations across recorded history
  router.get("/admin/cash-reconciliations", requireRoles("Admin", "FrontDesk", "Cashier"), async (_req, res) => {
    try {
      const result = await read(`
        SELECT 
          c.id,
          c.reconciliation_date,
          c.cashier_id,
          c.cash_on_hand,
          c.total_reported_sales,
          c.discrepancy_amount,
          c.has_flagged_inconsistency,
          c.notes,
          c.reconciled_at,
          u.full_name AS cashier_name,
          u.username AS cashier_username
        FROM cash_reconciliations c
        LEFT JOIN users u ON u.id = c.cashier_id
        ORDER BY c.reconciliation_date DESC, c.reconciled_at DESC
      `);
      return res.json(
        result.rows.map((row) => ({
          id: String(row.id),
          reconciliationDate: row.reconciliation_date instanceof Date
            ? row.reconciliation_date.toISOString().slice(0, 10)
            : String(row.reconciliation_date || "").slice(0, 10),
          cashierId: row.cashier_id ? String(row.cashier_id) : null,
          cashierName: row.cashier_name || row.cashier_username || "Cashier",
          cashOnHand: Number(row.cash_on_hand) || 0,
          totalReportedSales: Number(row.total_reported_sales) || 0,
          discrepancyAmount: Number(row.discrepancy_amount) || 0,
          hasFlaggedInconsistency: Boolean(row.has_flagged_inconsistency),
          notes: row.notes || "",
          reconciledAt: row.reconciled_at ? iso(row.reconciled_at) : new Date().toISOString(),
        }))
      );
    } catch {
      return res.status(503).json({ error: "Cash reconciliation records are temporarily unavailable." });
    }
  });

  router.post("/admin/cash-reconciliations", requireRoles("Admin", "FrontDesk", "Cashier"), async (req, res) => {
    try {
      const user = res.locals.user!;
      const {
        reconciliationDate,
        cashierId,
        cashOnHand,
        totalReportedSales,
        discrepancyAmount,
        notes,
      } = req.body || {};

      const recDate = String(reconciliationDate || new Date().toISOString().slice(0, 10));
      const targetCashierId = cashierId || user.id;
      const onHand = Number(cashOnHand) || 0;
      const reportedSales = Number(totalReportedSales) || 0;
      const diff = discrepancyAmount !== undefined ? Number(discrepancyAmount) : Number((onHand - reportedSales).toFixed(2));
      const flagged = Math.abs(diff) >= 50;
      const noteStr = typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null;

      const existing = await read(
        `SELECT id FROM cash_reconciliations WHERE reconciliation_date = $1 AND cashier_id = $2`,
        [recDate, targetCashierId]
      );

      let recordId: string;
      if (existing.rows.length > 0) {
        recordId = String(existing.rows[0].id);
        await read(
          `UPDATE cash_reconciliations SET
            cash_on_hand = $1,
            total_reported_sales = $2,
            discrepancy_amount = $3,
            has_flagged_inconsistency = $4,
            notes = $5,
            reconciled_at = now()
           WHERE id = $6`,
          [onHand, reportedSales, diff, flagged, noteStr, recordId]
        );
      } else {
        const inserted = await read(
          `INSERT INTO cash_reconciliations (
            reconciliation_date, cashier_id, cash_on_hand, total_reported_sales, discrepancy_amount, has_flagged_inconsistency, notes, reconciled_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
          [recDate, targetCashierId, onHand, reportedSales, diff, flagged, noteStr]
        );
        recordId = String(inserted.rows[0].id);
      }

      if (flagged) {
        await read(
          `INSERT INTO user_activities (user_id, activity, module, description, flag, timestamp)
           VALUES ($1, 'Cash drawer discrepancy', 'Cash Reconciliation', $2, 'Flagged', now())`,
          [targetCashierId, `Drawer ${diff < 0 ? "short" : "over"} by ₱${Math.abs(diff).toFixed(2)} on ${recDate}`]
        );
      }

      return res.status(200).json({
        id: recordId,
        reconciliationDate: recDate,
        cashierId: targetCashierId,
        cashOnHand: onHand,
        totalReportedSales: reportedSales,
        discrepancyAmount: diff,
        hasFlaggedInconsistency: flagged,
        notes: noteStr,
        reconciledAt: new Date().toISOString(),
      });
    } catch {
      return res.status(500).json({ error: "Failed to record cash reconciliation." });
    }
  });

  router.delete(
    ["/admin/cash-reconciliations/:date", "/admin/cash-reconciliations"],
    requireRoles("Admin", "FrontDesk", "Cashier"),
    async (req, res) => {
      try {
        const dateParam =
          req.params.date ||
          req.query.date ||
          req.body?.reconciliationDate ||
          req.body?.date;
        if (!dateParam) {
          return res.status(400).json({ error: "Reconciliation date is required." });
        }
        const recDate = String(dateParam).slice(0, 10);
        await read(
          `DELETE FROM cash_reconciliations WHERE reconciliation_date = $1`,
          [recDate]
        );
        await read(
          `DELETE FROM user_activities 
           WHERE module = 'Cash Reconciliation' 
             AND description LIKE $1`,
          [`%${recDate}%`]
        );
        return res.status(200).json({ ok: true, deletedDate: recDate });
      } catch {
        return res.status(500).json({ error: "Failed to reset cash reconciliation." });
      }
    }
  );

  router.post(["/admin/system-logs", "/admin/user-activities"], (_req, res) =>
    res.status(409).json({ error: "Audit events are recorded by server operations. Direct audit creation is unavailable." }));
  return router;
}
export default createAuditRouter();
