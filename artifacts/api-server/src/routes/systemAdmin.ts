import { Router, type IRouter } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { queryDb, execDb } from "@workspace/db";

const router: IRouter = Router();

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
  const candidates = [
    path.resolve(process.cwd(), "lib/db/.storage"),
    path.resolve(process.cwd(), "../../lib/db/.storage"),
    path.resolve(__dirname, "../../../../../lib/db/.storage"),
    path.resolve(__dirname, "../../../../lib/db/.storage"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.dirname(c))) {
      if (!fs.existsSync(c)) {
        try {
          fs.mkdirSync(c, { recursive: true });
        } catch {}
      }
      return c;
    }
  }
  const fallback = path.resolve(process.cwd(), ".storage");
  if (!fs.existsSync(fallback)) {
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch {}
  }
  return fallback;
}

function loadJsonFile<T>(filename: string, fallback: T): T {
  try {
    const filePath = path.join(getStorageDir(), filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as T;
      }
    }
  } catch (err) {
    console.error(`Error reading ${filename} from storage:`, err);
  }
  return fallback;
}

function saveJsonFile(filename: string, data: any): void {
  try {
    const filePath = path.join(getStorageDir(), filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Error writing ${filename} to storage:`, err);
  }
}

// In-memory data initialized from persistent JSON files immediately on module load
let persistentTransactions: UserTransaction[] = loadJsonFile<UserTransaction[]>(
  "transactions.json",
  [...initialTransactions]
);

let persistentSystemLogs: SystemLog[] = loadJsonFile<SystemLog[]>(
  "system_logs.json",
  [...initialSystemLogs]
);

let persistentUserActivities: UserActivity[] = loadJsonFile<UserActivity[]>(
  "user_activities.json",
  [...initialUserActivities]
);

// If file was not on disk yet, write initial data to seed the file
if (!fs.existsSync(path.join(getStorageDir(), "transactions.json"))) {
  saveJsonFile("transactions.json", persistentTransactions);
}
if (!fs.existsSync(path.join(getStorageDir(), "system_logs.json"))) {
  saveJsonFile("system_logs.json", persistentSystemLogs);
}
if (!fs.existsSync(path.join(getStorageDir(), "user_activities.json"))) {
  saveJsonFile("user_activities.json", persistentUserActivities);
}

async function saveTransactionToDb(t: UserTransaction) {
  try {
    await queryDb(
      `INSERT INTO cashier_transactions (
        transaction_number, date_time, user_name, business_type,
        customer, total, subtotal, discount, vat,
        amount_received, change, payment, status, items
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (transaction_number) DO UPDATE SET
        total = EXCLUDED.total,
        status = EXCLUDED.status,
        items = EXCLUDED.items`,
      [
        t.transactionNumber,
        t.dateTime,
        t.user,
        t.businessType,
        t.customer,
        t.total,
        t.subtotal,
        t.discount,
        t.vat,
        t.amountReceived,
        t.change,
        t.payment,
        t.status,
        JSON.stringify(t.items || []),
      ]
    );
  } catch (err) {
    console.error("Failed to save cashier transaction to DB:", err);
  }
}

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

async function syncWithDatabase() {
  try {
    // 1. Ensure tables exist in case of fresh DB
    await execDb(`
      CREATE TABLE IF NOT EXISTS cashier_transactions (
        id SERIAL PRIMARY KEY,
        transaction_number VARCHAR(100) UNIQUE NOT NULL,
        date_time VARCHAR(100) NOT NULL,
        user_name VARCHAR(150) NOT NULL,
        business_type VARCHAR(50) NOT NULL DEFAULT 'Retail',
        customer VARCHAR(150) NOT NULL DEFAULT 'Walk-in Customer',
        total VARCHAR(50) NOT NULL,
        subtotal VARCHAR(50) NOT NULL,
        discount VARCHAR(50) NOT NULL DEFAULT '₱0.00',
        vat VARCHAR(50) NOT NULL DEFAULT '₱0.00',
        amount_received VARCHAR(50) NOT NULL DEFAULT '₱0.00',
        change VARCHAR(50) NOT NULL DEFAULT '₱0.00',
        payment VARCHAR(50) NOT NULL DEFAULT 'Cash',
        status VARCHAR(50) NOT NULL DEFAULT 'Completed',
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cashier_system_logs (
        id SERIAL PRIMARY KEY,
        date_time VARCHAR(100) NOT NULL,
        user_name VARCHAR(150) NOT NULL,
        role VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        module VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Success',
        device_ip VARCHAR(50) NOT NULL DEFAULT '127.0.0.1',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cashier_user_activities (
        id SERIAL PRIMARY KEY,
        date_time VARCHAR(100) NOT NULL,
        user_name VARCHAR(150) NOT NULL,
        role VARCHAR(50) NOT NULL,
        activity VARCHAR(150) NOT NULL,
        module VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        flag VARCHAR(50) NOT NULL DEFAULT 'Normal',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Sync transactions
    const txRes = await queryDb<any>("SELECT * FROM cashier_transactions ORDER BY id ASC");
    if (txRes.rows && txRes.rows.length > 0) {
      const dbTxMap = new Map<string, UserTransaction>();
      for (const row of txRes.rows) {
        let items = row.items;
        if (typeof items === "string") {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }
        const tx: UserTransaction = {
          id: Number(row.id),
          transactionNumber: row.transaction_number,
          dateTime: row.date_time,
          user: row.user_name,
          businessType: (row.business_type === "Wholesale" ? "Wholesale" : "Retail"),
          customer: row.customer,
          total: row.total,
          subtotal: row.subtotal,
          discount: row.discount,
          vat: row.vat,
          amountReceived: row.amount_received,
          change: row.change,
          payment: row.payment,
          status: row.status as any,
          items: Array.isArray(items) ? items : [],
        };
        dbTxMap.set(tx.transactionNumber, tx);
      }

      for (const fileTx of persistentTransactions) {
        if (!dbTxMap.has(fileTx.transactionNumber)) {
          await saveTransactionToDb(fileTx);
          dbTxMap.set(fileTx.transactionNumber, fileTx);
        }
      }

      persistentTransactions = Array.from(dbTxMap.values()).sort(
        (a, b) => b.id - a.id
      );
      saveJsonFile("transactions.json", persistentTransactions);
    } else {
      for (const tx of [...persistentTransactions].reverse()) {
        await saveTransactionToDb(tx);
      }
    }

    // 3. Sync system logs
    const logRes = await queryDb<any>("SELECT * FROM cashier_system_logs ORDER BY id DESC");
    if (logRes.rows && logRes.rows.length > 0) {
      const dbLogs: SystemLog[] = logRes.rows.map((row) => ({
        id: Number(row.id),
        dateTime: row.date_time,
        user: row.user_name,
        role: row.role,
        action: row.action,
        module: row.module,
        description: row.description,
        status: (row.status === "Failed" ? "Failed" : "Success"),
        deviceIp: row.device_ip,
      }));
      persistentSystemLogs = dbLogs;
      saveJsonFile("system_logs.json", persistentSystemLogs);
    } else {
      for (const l of [...persistentSystemLogs].reverse()) {
        await saveSystemLogToDb(l);
      }
    }

    // 4. Sync user activities
    const actRes = await queryDb<any>("SELECT * FROM cashier_user_activities ORDER BY id DESC");
    if (actRes.rows && actRes.rows.length > 0) {
      const dbActivities: UserActivity[] = actRes.rows.map((row) => ({
        id: Number(row.id),
        dateTime: row.date_time,
        user: row.user_name,
        role: row.role,
        activity: row.activity,
        module: row.module,
        description: row.description,
        flag: (row.flag === "Suspicious" || row.flag === "Flagged" ? row.flag : "Normal"),
      }));
      persistentUserActivities = dbActivities;
      saveJsonFile("user_activities.json", persistentUserActivities);
    } else {
      for (const a of [...persistentUserActivities].reverse()) {
        await saveUserActivityToDb(a);
      }
    }
  } catch (err) {
    console.warn("DB synchronization note (file persistence remains fully active):", err);
  }
}

void syncWithDatabase();

// GET /api/admin/transactions
router.get("/admin/transactions", (req, res) => {
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
router.get("/admin/transactions/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = persistentTransactions.find((t) => t.id === id);
  if (!item) {
    return res.status(404).json({ error: "Transaction not found." });
  }
  return res.json(item);
});

router.post("/admin/transactions", (req, res) => {
  const nextId =
    persistentTransactions.reduce(
      (max, transaction) => Math.max(max, Number(transaction.id) || 0),
      0
    ) + 1;
  const transaction: UserTransaction = {
    id: nextId,
    transactionNumber:
      req.body.transactionNumber || `TRX-${String(nextId).padStart(4, "0")}`,
    dateTime: req.body.dateTime || new Date().toLocaleString(),
    user: req.body.user || "Cashier",
    businessType:
      req.body.businessType === "Wholesale" ? "Wholesale" : "Retail",
    customer: req.body.customer || "Walk-in Customer",
    total: req.body.total || "₱0.00",
    subtotal: req.body.subtotal || "₱0.00",
    discount: req.body.discount || "₱0.00",
    vat: req.body.vat || "₱0.00",
    amountReceived: req.body.amountReceived || "₱0.00",
    change: req.body.change || "₱0.00",
    payment: req.body.payment || "Cash",
    status: req.body.status || "Completed",
    items: Array.isArray(req.body.items) ? req.body.items : [],
  };

  persistentTransactions.unshift(transaction);
  saveJsonFile("transactions.json", persistentTransactions);
  void saveTransactionToDb(transaction);

  return res.status(201).json(transaction);
});

router.delete("/admin/transactions/:id", (req, res) => {
  const param = req.params.id;
  const numId = Number(param);
  const idx = persistentTransactions.findIndex(
    (t) => t.id === numId || t.transactionNumber === param
  );
  if (idx === -1) {
    return res.status(404).json({ error: "Transaction not found." });
  }
  const removed = persistentTransactions.splice(idx, 1)[0];
  saveJsonFile("transactions.json", persistentTransactions);
  void queryDb(
    "DELETE FROM cashier_transactions WHERE id = $1 OR transaction_number = $2",
    [numId || 0, param]
  );
  return res.json({ success: true, removed });
});

// GET /api/admin/system-logs
router.get("/admin/system-logs", (req, res) => {
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
router.get("/admin/user-activities", (req, res) => {
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

export default router;
