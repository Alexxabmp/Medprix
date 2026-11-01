import { Router, type IRouter } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { queryDb } from "@workspace/db";
import { createPaymentStore, paymentFromRow } from "../lib/cashier-payments";

const router: IRouter = Router();
const paymentStore = createPaymentStore(queryDb);

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
  id: number;
  dateTime: string;
  user: string;
  role: string;
  action: string;
  module: string;
  description: string;
  status: "Success" | "Failed";
  deviceIp: string;
}

export interface UserActivity {
  id: number;
  dateTime: string;
  user: string;
  role: string;
  activity: string;
  module: string;
  description: string;
  flag: "Normal" | "Suspicious" | "Flagged";
}

// Initial realistic dataset
export const initialTransactions: UserTransaction[] = [
  {
    id: 1,
    transactionNumber: "TRX-0001",
    dateTime: "Sept. 1, 2026 – 9:00 AM",
    user: "Maria Santos",
    businessType: "Retail",
    customer: "Walk-in Customer",
    total: "₱450.00",
    subtotal: "₱401.79",
    discount: "₱0.00",
    vat: "₱48.21",
    amountReceived: "₱500.00",
    change: "₱50.00",
    payment: "Cash",
    status: "Completed",
    items: [
      { product: "Paracetamol 500mg (10 tabs)", quantity: 2, unitPrice: "₱50.00", subtotal: "₱100.00" },
      { product: "Vitamin C 1000mg", quantity: 1, unitPrice: "₱150.00", subtotal: "₱150.00" },
      { product: "Cough Relief Syrup 120ml", quantity: 1, unitPrice: "₱200.00", subtotal: "₱200.00" },
    ],
  },
  {
    id: 2,
    transactionNumber: "TRX-0002",
    dateTime: "Sept. 1, 2026 – 9:15 AM",
    user: "John Cruz",
    businessType: "Wholesale",
    customer: "ABC Pharmacy - Branch 2",
    total: "₱5,250.00",
    subtotal: "₱4,687.50",
    discount: "₱250.00",
    vat: "₱562.50",
    amountReceived: "₱5,250.00",
    change: "₱0.00",
    payment: "GCash",
    status: "Completed",
    items: [
      { product: "Amoxicillin 500mg Box (100s)", quantity: 5, unitPrice: "₱650.00", subtotal: "₱3,250.00" },
      { product: "Cetirizine 10mg Box (100s)", quantity: 4, unitPrice: "₱500.00", subtotal: "₱2,000.00" },
    ],
  },
  {
    id: 3,
    transactionNumber: "TRX-0003",
    dateTime: "Sept. 1, 2026 – 9:30 AM",
    user: "Maria Santos",
    businessType: "Retail",
    customer: "Walk-in Customer",
    total: "₱320.00",
    subtotal: "₱285.71",
    discount: "₱0.00",
    vat: "₱34.29",
    amountReceived: "₱320.00",
    change: "₱0.00",
    payment: "Cash",
    status: "Voided",
    items: [
      { product: "Mefenamic Acid 500mg", quantity: 4, unitPrice: "₱30.00", subtotal: "₱120.00" },
      { product: "Antacid Chewables Bottle", quantity: 1, unitPrice: "₱200.00", subtotal: "₱200.00" },
    ],
  },
  {
    id: 4,
    transactionNumber: "TRX-0004",
    dateTime: "Sept. 1, 2026 – 10:05 AM",
    user: "Maria Santos",
    businessType: "Retail",
    customer: "Walk-in Customer",
    total: "₱1,280.00",
    subtotal: "₱1,142.86",
    discount: "₱50.00",
    vat: "₱137.14",
    amountReceived: "₱1,500.00",
    change: "₱220.00",
    payment: "Cash",
    status: "Completed",
    items: [
      { product: "Multivitamins + Minerals (30s)", quantity: 2, unitPrice: "₱450.00", subtotal: "₱900.00" },
      { product: "Digital Thermometer", quantity: 1, unitPrice: "₱380.00", subtotal: "₱380.00" },
    ],
  },
  {
    id: 5,
    transactionNumber: "TRX-0005",
    dateTime: "Sept. 1, 2026 – 11:20 AM",
    user: "John Cruz",
    businessType: "Wholesale",
    customer: "St. Jude Medical Clinic",
    total: "₱18,450.00",
    subtotal: "₱16,473.21",
    discount: "₱1,000.00",
    vat: "₱1,976.79",
    amountReceived: "₱18,450.00",
    change: "₱0.00",
    payment: "30-Day Terms",
    status: "Completed",
    items: [
      { product: "Sterile Normal Saline 500ml Box (24s)", quantity: 5, unitPrice: "₱1,800.00", subtotal: "₱9,000.00" },
      { product: "Surgical Gloves Medium (100s)", quantity: 10, unitPrice: "₱350.00", subtotal: "₱3,500.00" },
      { product: "Disposable Syringes 5ml (100s)", quantity: 7, unitPrice: "₱850.00", subtotal: "₱5,950.00" },
    ],
  },
];

export const initialSystemLogs: SystemLog[] = [
  {
    id: 1,
    dateTime: "September 1, 2026, 8:45 AM",
    user: "Juan Dela Cruz",
    role: "Admin",
    action: "Added Product",
    module: "Inventory Management",
    description: "Added Paracetamol 500mg (SKU: MED-0421, Batch: B2026-09) to inventory",
    status: "Success",
    deviceIp: "Desktop – 192.168.1.10",
  },
  {
    id: 2,
    dateTime: "September 1, 2026, 8:50 AM",
    user: "Maria Santos",
    role: "Cashier",
    action: "Login",
    module: "Authentication",
    description: "Successful login to Retail POS Terminal 1",
    status: "Success",
    deviceIp: "POS Terminal 1 – 192.168.1.21",
  },
  {
    id: 3,
    dateTime: "September 1, 2026, 9:10 AM",
    user: "John Cruz",
    role: "Front Desk",
    action: "Sales Transaction",
    module: "Wholesale Management",
    description: "Created Wholesale Purchase Order TRX-0002 for ABC Pharmacy (₱5,250.00)",
    status: "Success",
    deviceIp: "Front Desk PC – 192.168.1.15",
  },
  {
    id: 4,
    dateTime: "September 1, 2026, 9:32 AM",
    user: "Maria Santos",
    role: "Cashier",
    action: "Voided/Cancelled Transaction",
    module: "Sales POS",
    description: "Voided retail receipt TRX-0003 upon customer cancellation request (₱320.00)",
    status: "Success",
    deviceIp: "POS Terminal 1 – 192.168.1.21",
  },
  {
    id: 5,
    dateTime: "September 1, 2026, 10:15 AM",
    user: "Juan Dela Cruz",
    role: "Admin",
    action: "Failed Login Attempt",
    module: "Authentication",
    description: "Invalid password attempt for account 'admin' (Attempt 1 of 3)",
    status: "Failed",
    deviceIp: "Remote Desktop – 192.168.1.105",
  },
  {
    id: 6,
    dateTime: "September 1, 2026, 11:00 AM",
    user: "Juan Dela Cruz",
    role: "Admin",
    action: "Stock Adjustment",
    module: "Inventory Management",
    description: "Stock recount adjustment for Amoxicillin 500mg: adjusted from 12 to 8 units due to damaged packaging",
    status: "Success",
    deviceIp: "Admin Tablet – 192.168.1.45",
  },
  {
    id: 7,
    dateTime: "September 1, 2026, 12:00 PM",
    user: "Juan Dela Cruz",
    role: "Admin",
    action: "Backup and Restore Activities",
    module: "System Settings",
    description: "Automated midday database backup completed and verified (backup_20260901_1200.sql)",
    status: "Success",
    deviceIp: "Server – 127.0.0.1",
  },
];

export const initialUserActivities: UserActivity[] = [
  {
    id: 1,
    dateTime: "Sept. 1, 2026 – 8:30 AM",
    user: "Juan Dela Cruz",
    role: "Admin",
    activity: "Login",
    module: "🔐 Authentication",
    description: "User logged into system dashboard with full administrator privileges",
    flag: "Normal",
  },
  {
    id: 2,
    dateTime: "Sept. 1, 2026 – 8:45 AM",
    user: "Juan Dela Cruz",
    role: "Admin",
    activity: "Product added",
    module: "📦 Inventory Activity",
    description: "Registered new pharmaceutical SKU MED-0421 (Paracetamol 500mg) with initial batch 120 units",
    flag: "Normal",
  },
  {
    id: 3,
    dateTime: "Sept. 1, 2026 – 8:50 AM",
    user: "Maria Santos",
    role: "Cashier",
    activity: "Login",
    module: "🔐 Authentication",
    description: "Authenticated on POS Terminal 1",
    flag: "Normal",
  },
  {
    id: 4,
    dateTime: "Sept. 1, 2026 – 9:00 AM",
    user: "Maria Santos",
    role: "Cashier",
    activity: "Transaction completed",
    module: "💰 Sales & Wholesale Activity",
    description: "Processed retail cash receipt TRX-0001 (₱450.00)",
    flag: "Normal",
  },
  {
    id: 5,
    dateTime: "Sept. 1, 2026 – 9:15 AM",
    user: "John Cruz",
    role: "Front Desk",
    activity: "Transaction completed",
    module: "💰 Sales & Wholesale Activity",
    description: "Processed wholesale order TRX-0002 for ABC Pharmacy (₱5,250.00)",
    flag: "Normal",
  },
  {
    id: 6,
    dateTime: "Sept. 1, 2026 – 9:32 AM",
    user: "Maria Santos",
    role: "Cashier",
    activity: "Transaction voided",
    module: "💰 Sales & Wholesale Activity",
    description: "Voided retail receipt TRX-0003 after total calculation",
    flag: "Suspicious",
  },
  {
    id: 7,
    dateTime: "Sept. 1, 2026 – 10:15 AM",
    user: "Maria Santos",
    role: "Cashier",
    activity: "Shift review opened",
    module: "💰 Sales & Wholesale Activity",
    description: "Opened Shift Sales and Cash Drawer reconciliation review on POS Terminal 1",
    flag: "Normal",
  },
  {
    id: 8,
    dateTime: "Sept. 1, 2026 – 10:30 AM",
    user: "John Cruz",
    role: "Front Desk",
    activity: "Order dispatched",
    module: "💰 Sales & Wholesale Activity",
    description: "Processed wholesale shipment for Greenfield Care Home",
    flag: "Normal",
  },
  {
    id: 9,
    dateTime: "Sept. 1, 2026 – 11:00 AM",
    user: "Juan Dela Cruz",
    role: "Admin",
    activity: "Stock adjusted",
    module: "📦 Inventory Activity",
    description: "Manual stock recount adjustment on Amoxicillin 500mg (-4 units)",
    flag: "Normal",
  },
  {
    id: 10,
    dateTime: "Sept. 1, 2026 – 12:00 PM",
    user: "Juan Dela Cruz",
    role: "Admin",
    activity: "Backup performed",
    module: "⚙️ System Activity",
    description: "Database backup archive generated automatically",
    flag: "Normal",
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getStorageDir(): string {
  const isServerless = Boolean(
    process.env["VERCEL"] ||
    process.env["AWS_LAMBDA_FUNCTION_NAME"] ||
    process.cwd().includes("/var/task") ||
    (process.platform !== "win32" && process.env.NODE_ENV === "production")
  );
  if (isServerless) {
    const tmpStorage = path.join("/tmp", ".storage");
    try {
      if (!fs.existsSync(tmpStorage)) {
        fs.mkdirSync(tmpStorage, { recursive: true });
      }
    } catch {}
    return tmpStorage;
  }
  const candidates = [
    path.resolve(process.cwd(), "lib/db/.storage"),
    path.resolve(process.cwd(), "../../lib/db/.storage"),
    path.resolve(__dirname, "../../../../../lib/db/.storage"),
    path.resolve(__dirname, "../../../../lib/db/.storage"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.dirname(c))) {
        if (!fs.existsSync(c)) {
          fs.mkdirSync(c, { recursive: true });
        }
        return c;
      }
    } catch {}
  }
  const fallback = path.resolve(process.cwd(), ".storage");
  try {
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
  } catch {}
  return fallback;
}

function saveJsonFile(filename: string, data: any): void {
  try {
    const dir = getStorageDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Silently continue if disk write is unsupported on serverless
  }
}

// Empty caches are populated only from database reads; legacy files are not authoritative.
let persistentTransactions: UserTransaction[] = [];

let persistentSystemLogs: SystemLog[] = [];

let persistentUserActivities: UserActivity[] = [];

async function saveSystemLogToDb(l: SystemLog) {
  try {
    await queryDb(
      `INSERT INTO cashier_system_logs (
        date_time, user_name, role, action, module, description, status, device_ip
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [l.dateTime, l.user, l.role, l.action, l.module, l.description, l.status, l.deviceIp]
    );
  } catch (err) {
    console.error("Failed to save system log to DB:", err);
  }
}

async function saveUserActivityToDb(a: UserActivity) {
  try {
    await queryDb(
      `INSERT INTO cashier_user_activities (
        date_time, user_name, role, activity, module, description, flag
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [a.dateTime, a.user, a.role, a.activity, a.module, a.description, a.flag]
    );
  } catch (err) {
    console.error("Failed to save user activity to DB:", err);
  }
}

export function recordSystemLog(logInput: {
  user: string;
  role?: string;
  action: string;
  module: string;
  description: string;
  status?: "Success" | "Failed";
  deviceIp?: string;
}) {
  const nextId =
    persistentSystemLogs.reduce((max, log) => Math.max(max, Number(log.id) || 0), 0) + 1;
  const log: SystemLog = {
    id: nextId,
    dateTime: new Date().toLocaleString(),
    user: logInput.user || "System",
    role: logInput.role || "Cashier",
    action: logInput.action || "Event",
    module: logInput.module || "System",
    description: logInput.description || "System log event",
    status: logInput.status === "Failed" ? "Failed" : "Success",
    deviceIp: logInput.deviceIp || "127.0.0.1",
  };
  persistentSystemLogs.unshift(log);
  saveJsonFile("system_logs.json", persistentSystemLogs);
  void saveSystemLogToDb(log);
  return log;
}

export function recordUserActivity(actInput: {
  user: string;
  role?: string;
  activity: string;
  module: string;
  description: string;
  flag?: "Normal" | "Suspicious" | "Flagged";
}) {
  const nextId =
    persistentUserActivities.reduce(
      (max, activity) => Math.max(max, Number(activity.id) || 0),
      0
    ) + 1;
  const activity: UserActivity = {
    id: nextId,
    dateTime: new Date().toLocaleString(),
    user: actInput.user || "Cashier",
    role: actInput.role || "Cashier",
    activity: actInput.activity || "Activity",
    module: actInput.module || "Workspace Activity",
    description: actInput.description || "User activity recorded",
    flag:
      actInput.flag === "Suspicious" || actInput.flag === "Flagged"
        ? actInput.flag
        : "Normal",
  };
  persistentUserActivities.unshift(activity);
  saveJsonFile("user_activities.json", persistentUserActivities);
  void saveUserActivityToDb(activity);
  return activity;
}

// Read-only startup: no DDL, file imports, marker writes or empty-table backfill.
async function syncWithDatabase() {
  persistentTransactions = await paymentStore.list();
  const logRes = await queryDb<any>("SELECT * FROM cashier_system_logs ORDER BY id DESC");
  persistentSystemLogs = logRes.rows.map(row => ({
    id: Number(row.id), dateTime: row.date_time, user: row.user_name, role: row.role,
    action: row.action, module: row.module, description: row.description,
    status: row.status === "Failed" ? "Failed" : "Success", deviceIp: row.device_ip,
  }));
  const actRes = await queryDb<any>("SELECT * FROM cashier_user_activities ORDER BY id DESC");
  persistentUserActivities = actRes.rows.map(row => ({
    id: Number(row.id), dateTime: row.date_time, user: row.user_name, role: row.role,
    activity: row.activity, module: row.module, description: row.description,
    flag: row.flag === "Suspicious" || row.flag === "Flagged" ? row.flag : "Normal",
  }));
}

const paymentStartup = syncWithDatabase();
// Handle the eager promise while preserving rejection for callers awaiting readiness.
void paymentStartup.catch(() => {});

async function refreshPayments() {
  await paymentStartup;
  persistentTransactions = await paymentStore.list();
  saveJsonFile("transactions.json", persistentTransactions);
  return persistentTransactions;
}

// GET /api/admin/transactions
router.get("/admin/transactions", async (req, res) => {
  try { await refreshPayments(); } catch {
    return res.status(503).json({ error: "Payment records are temporarily unavailable. Please retry." });
  }
  const { businessType, search, status } = req.query;
  let results = [...persistentTransactions];

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
router.get("/admin/transactions/:id", async (req, res) => {
  try { await refreshPayments(); } catch {
    return res.status(503).json({ error: "Payment records are temporarily unavailable. Please retry." });
  }
  const id = Number(req.params.id);
  const item = persistentTransactions.find((t) => t.id === id);
  if (!item) {
    return res.status(404).json({ error: "Transaction not found." });
  }
  return res.json(item);
});

// Payment creation is handled exclusively by the atomic checkout router.

router.delete("/admin/transactions/:id", async (req, res) => {
  const param = req.params.id;
  const numId = Number(param);
  try {
    await paymentStartup;
    const result = await queryDb("DELETE FROM cashier_transactions WHERE id = $1 OR transaction_number = $2 RETURNING *", [numId || 0, param]);
    if (!result.rows.length) return res.status(404).json({ error: "Transaction not found." });
    const removed = paymentFromRow(result.rows[0]);
    persistentTransactions = persistentTransactions.filter((entry) => entry.id !== removed.id);
    saveJsonFile("transactions.json", persistentTransactions);
    return res.json({ success: true, removed });
  } catch {
    return res.status(503).json({ error: "Could not remove the payment record. Please retry." });
  }
});

// GET /api/admin/system-logs
router.get("/admin/system-logs", async (req, res) => {
  try { await syncWithDatabase(); } catch { return res.status(503).json({ error: "Audit storage is unavailable." }); }
  const { search, status, module: mod } = req.query;
  let results = [...persistentSystemLogs];

  if (status && status !== "All") {
    results = results.filter(
      (l) => l.status.toLowerCase() === String(status).toLowerCase()
    );
  }

  if (mod && mod !== "All") {
    results = results.filter((l) =>
      l.module.toLowerCase().includes(String(mod).toLowerCase())
    );
  }

  if (search) {
    const q = String(search).toLowerCase();
    results = results.filter(
      (l) =>
        l.user.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.module.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.deviceIp.toLowerCase().includes(q)
    );
  }

  return res.json(results);
});

router.post("/admin/system-logs", (req, res) => {
  const nextId =
    persistentSystemLogs.reduce((max, log) => Math.max(max, Number(log.id) || 0), 0) + 1;
  const log: SystemLog = {
    id: nextId,
    dateTime: req.body.dateTime || new Date().toLocaleString(),
    user: req.body.user || "System",
    role: req.body.role || "Cashier",
    action: req.body.action || "Transaction",
    module: req.body.module || "Sales POS",
    description: req.body.description || "System event recorded",
    status: req.body.status === "Failed" ? "Failed" : "Success",
    deviceIp: req.body.deviceIp || "POS Terminal 1",
  };

  persistentSystemLogs.unshift(log);
  saveJsonFile("system_logs.json", persistentSystemLogs);
  void saveSystemLogToDb(log);

  return res.status(201).json(log);
});

// GET /api/admin/user-activities
router.get("/admin/user-activities", async (req, res) => {
  try { await syncWithDatabase(); } catch { return res.status(503).json({ error: "Audit storage is unavailable." }); }
  const { search, flag, role, module: mod } = req.query;
  let results = [...persistentUserActivities];

  if (flag && flag !== "All") {
    results = results.filter(
      (a) => a.flag.toLowerCase() === String(flag).toLowerCase()
    );
  }

  if (role && role !== "All") {
    results = results.filter(
      (a) => a.role.toLowerCase() === String(role).toLowerCase()
    );
  }

  if (mod && mod !== "All") {
    results = results.filter((a) =>
      a.module.toLowerCase().includes(String(mod).toLowerCase())
    );
  }

  if (search) {
    const q = String(search).toLowerCase();
    results = results.filter(
      (a) =>
        a.user.toLowerCase().includes(q) ||
        a.activity.toLowerCase().includes(q) ||
        a.module.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
  }

  return res.json(results);
});

router.post("/admin/user-activities", (req, res) => {
  const nextId =
    persistentUserActivities.reduce(
      (max, activity) => Math.max(max, Number(activity.id) || 0),
      0
    ) + 1;
  const activity: UserActivity = {
    id: nextId,
    dateTime: req.body.dateTime || new Date().toLocaleString(),
    user: req.body.user || "Cashier",
    role: req.body.role || "Cashier",
    activity: req.body.activity || "Transaction completed",
    module: req.body.module || "Sales & Wholesale Activity",
    description: req.body.description || "User activity recorded",
    flag:
      req.body.flag === "Suspicious" || req.body.flag === "Flagged"
        ? req.body.flag
        : "Normal",
  };

  persistentUserActivities.unshift(activity);
  saveJsonFile("user_activities.json", persistentUserActivities);
  void saveUserActivityToDb(activity);

  return res.status(201).json(activity);
});

// PATCH /api/admin/transactions/:id/status
router.patch("/admin/transactions/:id/status", async (req, res) => {
  const param = req.params.id;
  const numId = Number(param);
  const { status } = req.body as { status?: string };
  const validStatus = (["Completed", "Voided", "Refunded", "Pending"] as const).find(
    (s) => s.toLowerCase() === String(status).toLowerCase()
  );
  if (!validStatus) return res.status(400).json({ error: "Invalid payment status." });
  try {
    await paymentStartup;
    const result = await queryDb("UPDATE cashier_transactions SET status = $1 WHERE id = $2 OR transaction_number = $3 RETURNING *", [validStatus, numId || 0, param]);
    if (!result.rows.length) return res.status(404).json({ error: "Transaction not found." });
    const transaction = paymentFromRow(result.rows[0]);
    persistentTransactions = persistentTransactions.map((entry) => entry.id === transaction.id ? transaction : entry);
    saveJsonFile("transactions.json", persistentTransactions);
    return res.json(transaction);
  } catch {
    return res.status(503).json({ error: "Could not update the payment status. Please retry." });
  }
});

// POST /api/admin/backup
router.post("/admin/backup", (req, res) => {
  const backupId = `BKP-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  const log: SystemLog = {
    id: persistentSystemLogs.reduce((max, l) => Math.max(max, Number(l.id) || 0), 0) + 1,
    dateTime: new Date().toLocaleString(),
    user: (req as any).user?.username || "Admin",
    role: "Admin",
    action: "BACKUP",
    module: "System Administration",
    description: `Created full system database backup snapshot (${backupId})`,
    status: "Success",
    deviceIp: (req as any).ip || "127.0.0.1",
  };
  persistentSystemLogs.unshift(log);
  saveJsonFile("system_logs.json", persistentSystemLogs);
  void saveSystemLogToDb(log);

  return res.json({
    success: true,
    backupId,
    timestamp: new Date().toISOString(),
    message: "System state and database backup created successfully.",
  });
});

export default router;
