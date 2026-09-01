import { Router, type IRouter } from "express";

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

// GET /api/admin/transactions
router.get("/admin/transactions", (req, res) => {
  const { businessType, search, status } = req.query;
  let results = [...initialTransactions];

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
  const item = initialTransactions.find((t) => t.id === id);
  if (!item) {
    return res.status(404).json({ error: "Transaction not found." });
  }
  return res.json(item);
});

// GET /api/admin/system-logs
router.get("/admin/system-logs", (req, res) => {
  const { search, status, module: mod } = req.query;
  let results = [...initialSystemLogs];

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

// GET /api/admin/user-activities
router.get("/admin/user-activities", (req, res) => {
  const { search, flag, role, module: mod } = req.query;
  let results = [...initialUserActivities];

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

export default router;
