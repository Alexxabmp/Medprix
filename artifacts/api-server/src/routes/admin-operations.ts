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
        user: row.actor_name || row.actor_username || "System / archived actor", role: row.actor_role || "Unavailable",
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
        user: row.actor_name || row.actor_username || "System / archived actor", role: row.actor_role || "Unavailable",
        activity: row.activity,module: row.module,description: row.description,flag: row.flag }))
        .filter(row => (!input.flag || input.flag === "All" || row.flag.toLowerCase() === input.flag.toLowerCase()) &&
          (!input.role || input.role === "All" || row.role.toLowerCase() === input.role.toLowerCase()) &&
          (!input.module || input.module === "All" || includes(row.module,input.module)) &&
          (!input.search || [row.user,row.activity,row.module,row.description].some(value => includes(value,input.search)))));
    } catch { return res.status(503).json({ error: "Activity records are temporarily unavailable." }); }
  });
  router.post(["/admin/system-logs", "/admin/user-activities"], (_req, res) =>
    res.status(409).json({ error: "Audit events are recorded by server operations. Direct audit creation is unavailable." }));
  return router;
}
export default createAuditRouter();
