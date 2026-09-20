import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const argv = new Set(process.argv.slice(2));
const RESET = argv.has("--reset") || process.env.SEED_RESET === "1";
const ALLOW_PROD = argv.has("--allow-production");
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";
const RNG_SEED = Number(process.env.SEED_RNG ?? 20260920);

const HISTORY_DAYS = 60; // days of simulated retail history
const TX_PER_DAY: [number, number] = [25, 45]; // retail transactions per day (min, max)
const TZ_OFFSET_H = 8; // Asia/Manila (UTC+8)
const VAT_RATE = 0.12;
const SENIOR_PWD_DISCOUNT = 0.2;

// Insert order == FK dependency order. Also used for TRUNCATE on --reset.
const TABLE_ORDER = [
  "roles", "permissions", "users", "user_roles", "role_permissions",
  "system_logs", "user_activities", "backup_records",
  "products", "batch_info", "stock_movements", "inventory_alerts",
  "customers", "transactions", "transaction_items", "discounts", "receipts",
  "suppliers", "purchase_orders", "po_items", "supplier_deliveries", "delivery_items",
  "supplier_invoices", "accounts_payable", "supplier_payments",
  "reports", "cash_reconciliations", "dashboards",
  "wholesale_clients", "client_contracts", "client_contract_items",
  "wholesale_orders", "wholesale_order_items", "delivery_schedules",
  "delivery_receipts", "delivery_receipt_items", "accounts_receivable", "ar_payments",
] as const;
type TableName = (typeof TABLE_ORDER)[number];
type Row = Record<string, unknown>;
const T = Object.fromEntries(TABLE_ORDER.map((t) => [t, [] as Row[]])) as Record<TableName, Row[]>;

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers: seeded RNG, dates, money
// ─────────────────────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(RNG_SEED);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;
const pick = <X>(arr: readonly X[]): X => arr[Math.floor(rand() * arr.length)]!;
function weightedIndex(weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}
const weighted = <X>(items: readonly X[], weights: readonly number[]): X => items[weightedIndex(weights)]!;
function shuffle<X>(arr: readonly X[]): X[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const NOW = new Date();
const _manila = new Date(NOW.getTime() + TZ_OFFSET_H * 3_600_000);
const TODAY = { y: _manila.getUTCFullYear(), m: _manila.getUTCMonth(), d: _manila.getUTCDate() };
/** Timestamp at a Manila wall-clock time, `off` days from today (negative = past). */
const at = (off: number, hour = 12, minute = 0) =>
  new Date(Date.UTC(TODAY.y, TODAY.m, TODAY.d + off, hour - TZ_OFFSET_H, minute));
/** Same as `at` but never in the future (historic events "today" are clamped to now). */
const past = (off: number, hour = 12, minute = 0) => {
  const d = at(off, hour, minute);
  return d.getTime() > NOW.getTime() ? new Date(NOW.getTime() - 60_000) : d;
};
/** 'YYYY-MM-DD' for a DATE column, `off` days from today (Manila calendar). */
const dateStr = (off: number) => new Date(Date.UTC(TODAY.y, TODAY.m, TODAY.d + off)).toISOString().slice(0, 10);
const ymd = (off: number) => dateStr(off).replaceAll("-", "");
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const termsDays = (terms: string) => Number(/Net\s+(\d+)/i.exec(terms)?.[1] ?? 0);
/** Philippine mobile in international format (+639XXXXXXXXX) — matches the users.contact_number CHECK. */
const phone = () => `+639${randInt(100_000_000, 999_999_999)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Static reference data
// ─────────────────────────────────────────────────────────────────────────────
interface ProductDef {
  name: string;
  generic: string;
  cat: string;
  cost: number;
  price: number;
  /** popularity 1-5: relative share of retail sales */
  pop: number;
  dd?: boolean; // dangerous drug
  /** deliberately under-stocked & not re-ordered → ends up low / out of stock */
  low?: boolean;
  min?: number;
  qtyA?: number; // override first-batch size
  expA?: number; // override first-batch expiry (days from today; negative = already expired)
  dispose?: boolean; // expired batch that was written off
}

const PRODUCT_DEFS: ProductDef[] = [
  // Analgesic
  { name: "Biogesic 500mg Tablet", generic: "Paracetamol", cat: "Analgesic", cost: 1.1, price: 2, pop: 5 },
  { name: "Paracetamol 500mg Tablet", generic: "Paracetamol", cat: "Analgesic", cost: 0.55, price: 1.25, pop: 4 },
  { name: "Medicol Advance 400mg Softgel", generic: "Ibuprofen", cat: "Analgesic", cost: 5.5, price: 8.5, pop: 4 },
  { name: "Alaxan FR Capsule", generic: "Ibuprofen + Paracetamol", cat: "Analgesic", cost: 4.5, price: 7, pop: 4 },
  { name: "Mefenamic Acid 500mg Capsule", generic: "Mefenamic Acid", cat: "Analgesic", cost: 2, price: 4.5, pop: 4 },
  // Antibiotic
  { name: "Amoxicillin 500mg Capsule", generic: "Amoxicillin", cat: "Antibiotic", cost: 3.5, price: 7, pop: 4 },
  { name: "Cefalexin 500mg Capsule", generic: "Cefalexin", cat: "Antibiotic", cost: 6, price: 12, pop: 3 },
  { name: "Co-Amoxiclav 625mg Tablet", generic: "Amoxicillin + Clavulanic Acid", cat: "Antibiotic", cost: 22, price: 38, pop: 2 },
  { name: "Azithromycin 500mg Tablet", generic: "Azithromycin", cat: "Antibiotic", cost: 28, price: 48, pop: 2 },
  { name: "Ciprofloxacin 500mg Tablet", generic: "Ciprofloxacin", cat: "Antibiotic", cost: 12, price: 22, pop: 2 },
  { name: "Cotrimoxazole 800/160mg Tablet", generic: "Sulfamethoxazole + Trimethoprim", cat: "Antibiotic", cost: 3.5, price: 7, pop: 2 },
  // Antihypertensive
  { name: "Amlodipine 5mg Tablet", generic: "Amlodipine", cat: "Antihypertensive", cost: 2.5, price: 6, pop: 3, low: true },
  { name: "Losartan 50mg Tablet", generic: "Losartan Potassium", cat: "Antihypertensive", cost: 4, price: 9, pop: 3, low: true },
  { name: "Losartan 100mg Tablet", generic: "Losartan Potassium", cat: "Antihypertensive", cost: 7, price: 15, pop: 2 },
  { name: "Metoprolol 50mg Tablet", generic: "Metoprolol Tartrate", cat: "Antihypertensive", cost: 3, price: 7, pop: 2 },
  { name: "Atenolol 50mg Tablet", generic: "Atenolol", cat: "Antihypertensive", cost: 2, price: 5, pop: 1 },
  { name: "Aspirin 80mg Tablet", generic: "Acetylsalicylic Acid", cat: "Antihypertensive", cost: 1.5, price: 3.5, pop: 2 },
  // Cholesterol
  { name: "Simvastatin 20mg Tablet", generic: "Simvastatin", cat: "Cholesterol", cost: 3, price: 7, pop: 2 },
  { name: "Atorvastatin 20mg Tablet", generic: "Atorvastatin", cat: "Cholesterol", cost: 6, price: 14, pop: 3 },
  // Antidiabetic
  { name: "Metformin 500mg Tablet", generic: "Metformin Hydrochloride", cat: "Antidiabetic", cost: 1.8, price: 4.5, pop: 4, low: true },
  { name: "Gliclazide 80mg Tablet", generic: "Gliclazide", cat: "Antidiabetic", cost: 4, price: 9, pop: 2 },
  // Antihistamine
  { name: "Cetirizine 10mg Tablet", generic: "Cetirizine Dihydrochloride", cat: "Antihistamine", cost: 2, price: 5, pop: 4 },
  { name: "Loratadine 10mg Tablet", generic: "Loratadine", cat: "Antihistamine", cost: 3, price: 8, pop: 2, qtyA: 300, expA: 55 },
  // Respiratory
  { name: "Neozep Forte Tablet", generic: "Phenylephrine + Chlorphenamine + Paracetamol", cat: "Respiratory", cost: 3, price: 6.5, pop: 4 },
  { name: "Solmux 500mg Capsule", generic: "Carbocisteine", cat: "Respiratory", cost: 6, price: 11, pop: 3 },
  { name: "Salbutamol 2mg Tablet", generic: "Salbutamol", cat: "Respiratory", cost: 1, price: 3, pop: 2 },
  { name: "Ambroxol 30mg Tablet", generic: "Ambroxol Hydrochloride", cat: "Respiratory", cost: 2.5, price: 6, pop: 2 },
  { name: "Salbutamol 2.5mg Nebule", generic: "Salbutamol", cat: "Respiratory", cost: 28, price: 45, pop: 1 },
  // Gastrointestinal
  { name: "Loperamide 2mg Capsule", generic: "Loperamide Hydrochloride", cat: "Gastrointestinal", cost: 3, price: 7, pop: 1, qtyA: 120, expA: -12 },
  { name: "Kremil-S Tablet", generic: "Aluminum Hydroxide + Magnesium Hydroxide + Simethicone", cat: "Gastrointestinal", cost: 4, price: 8, pop: 3 },
  { name: "Omeprazole 20mg Capsule", generic: "Omeprazole", cat: "Gastrointestinal", cost: 3, price: 8, pop: 3, low: true },
  { name: "Oral Rehydration Salts Sachet", generic: "Oral Rehydration Salts", cat: "Gastrointestinal", cost: 8, price: 15, pop: 3 },
  // Vitamins & Supplements
  { name: "Ascorbic Acid 500mg Tablet", generic: "Ascorbic Acid", cat: "Vitamins & Supplements", cost: 2, price: 5, pop: 4 },
  { name: "Vitamin B Complex Tablet", generic: "Vitamin B1 + B6 + B12", cat: "Vitamins & Supplements", cost: 3, price: 7, pop: 1, qtyA: 120, expA: 85 },
  { name: "Multivitamins + Minerals Capsule", generic: "Multivitamins + Minerals", cat: "Vitamins & Supplements", cost: 6, price: 12, pop: 3 },
  { name: "Ferrous Sulfate 325mg Tablet", generic: "Ferrous Sulfate", cat: "Vitamins & Supplements", cost: 1.5, price: 4, pop: 1 },
  { name: "Calcium Carbonate + Vitamin D3 Tablet", generic: "Calcium Carbonate + Cholecalciferol", cat: "Vitamins & Supplements", cost: 5, price: 10, pop: 1 },
  // Topical
  { name: "Clotrimazole 1% Cream 15g", generic: "Clotrimazole", cat: "Topical", cost: 35, price: 65, pop: 1, qtyA: 100, expA: 18 },
  { name: "Betamethasone 0.05% Cream 15g", generic: "Betamethasone Dipropionate", cat: "Topical", cost: 40, price: 75, pop: 1 },
  { name: "Ketoconazole 2% Cream 15g", generic: "Ketoconazole", cat: "Topical", cost: 55, price: 95, pop: 1, qtyA: 90, expA: -30, dispose: true },
  { name: "Povidone-Iodine 10% Solution 60ml", generic: "Povidone-Iodine", cat: "Topical", cost: 45, price: 80, pop: 2 },
  { name: "Isopropyl Alcohol 70% 500ml", generic: "Isopropyl Alcohol", cat: "Topical", cost: 40, price: 75, pop: 3 },
  // Controlled (dangerous drugs)
  { name: "Alprazolam 0.5mg Tablet", generic: "Alprazolam", cat: "Controlled Substance", cost: 6, price: 14, pop: 1, dd: true, min: 20 },
  { name: "Diazepam 5mg Tablet", generic: "Diazepam", cat: "Controlled Substance", cost: 4, price: 10, pop: 1, dd: true, min: 20 },
  { name: "Clonazepam 2mg Tablet", generic: "Clonazepam", cat: "Controlled Substance", cost: 9, price: 20, pop: 1, dd: true, min: 20 },
  { name: "Tramadol 50mg Capsule", generic: "Tramadol Hydrochloride", cat: "Controlled Substance", cost: 8, price: 18, pop: 1, dd: true, min: 20 },
];

const SUPPLIER_DEFS = [
  { name: "Mindanao MedSupply Corp.", person: "Ramon Aquino", terms: "Net 30", code: "MMS", address: "Lanang, Davao City", domain: "mindanaomedsupply.example" },
  { name: "Davao Pharma Distributors Inc.", person: "Teresita Lim", terms: "Net 15", code: "DPD", address: "Ilustre St., Davao City", domain: "davaopharma.example" },
  { name: "Southern Health Wholesale", person: "Antonio Uy", terms: "Net 45", code: "SHW", address: "Bajada, Davao City", domain: "southernhealth.example" },
  { name: "Visayas-Mindanao Drug Trading", person: "Corazon Tan", terms: "COD", code: "VMD", address: "Carmen, Cagayan de Oro City", domain: "vmdrugtrading.example" },
  { name: "Prime Generics Trading", person: "Benjamin Ocampo", terms: "Net 30", code: "PGT", address: "Mandaue City, Cebu", domain: "primegenerics.example" },
] as const;
const CATEGORY_SUPPLIER: Record<string, number> = {
  Analgesic: 0, Antibiotic: 1, "Controlled Substance": 1,
  Antihypertensive: 2, Cholesterol: 2, Antidiabetic: 2,
  Antihistamine: 3, Respiratory: 3, Gastrointestinal: 3,
  "Vitamins & Supplements": 4, Topical: 4,
};

const CLIENT_DEFS = [
  { name: "Sunrise Family Clinic", person: "Dr. Elena Cruz", address: "Matina, Davao City", eff: -150, exp: 215, terms: "Net 30", status: "Active" },
  { name: "Bayanihan Rural Health Unit", person: "Nurse Roberto Silva", address: "Toril, Davao City", eff: -120, exp: 245, terms: "Net 15", status: "Active" },
  { name: "Kalinaw Medical Center", person: "Dr. Marites Ramos", address: "Buhangin, Davao City", eff: -90, exp: 275, terms: "Net 30", status: "Active" },
  { name: "GreenLeaf Mini Pharmacy", person: "Pedro Navarro", address: "Panabo City, Davao del Norte", eff: -300, exp: 20, terms: "Net 45", status: "Active" },
  { name: "Harbor Point Infirmary", person: "Dr. Luisa Fernandez", address: "Digos City, Davao del Sur", eff: -400, exp: -10, terms: "Net 30", status: "Expired" },
] as const;

const FIRST_NAMES = ["Juan", "Maria", "Jose", "Ana", "Pedro", "Rosa", "Miguel", "Carmen", "Antonio", "Luz", "Ramon", "Elena", "Carlos", "Teresa", "Rafael", "Josefina", "Eduardo", "Lourdes", "Fernando", "Imelda", "Ricardo", "Cristina", "Gabriel", "Norma", "Manuel", "Aurora", "Roberto", "Felicidad", "Andres", "Milagros"];
const LAST_NAMES = ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Aquino", "Castillo", "Villanueva", "Navarro", "Domingo", "Morales", "Salazar", "Aguilar", "Pascual", "Soriano", "Valdez"];

// ─────────────────────────────────────────────────────────────────────────────
// Build all rows in memory
// ─────────────────────────────────────────────────────────────────────────────
interface Batch {
  id: string;
  productId: string;
  batchNumber: string;
  expOff: number;
  expiration: string;
  receivedOff: number;
  receivedAt: Date;
  remaining: number;
  dispose: boolean;
  disposedOff: number | null;
}

interface Product {
  id: string;
  sku: string;
  def: ProductDef;
  supplierIdx: number;
  qtyA: number;
  qtyB: number;
  minStock: number;
  batches: Batch[];
}

function buildData(passwordHash: string) {
  const day0 = at(-120, 9);

  // ── Users, roles, permissions ────────────────────────────────────────────
  const userDefs = [
    { username: "admin", full_name: "Ana Reyes", role: "Admin", code: "EMP-001", ip: "192.168.1.10" },
    { username: "cashier1", full_name: "Jose Dela Cruz", role: "Cashier", code: "EMP-002", ip: "192.168.1.11" },
    { username: "cashier2", full_name: "Liza Mendoza", role: "Cashier", code: "EMP-003", ip: "192.168.1.12" },
    { username: "cashier3", full_name: "Carlo Bautista", role: "Cashier", code: "EMP-004", ip: "192.168.1.13" },
    { username: "frontdesk1", full_name: "Grace Villanueva", role: "FrontDesk", code: "EMP-005", ip: "192.168.1.20" },
  ] as const;
  const users = userDefs.map((u) => ({ ...u, id: randomUUID() }));
  const admin = users[0]!;
  const cashiers = users.filter((u) => u.role === "Cashier");
  for (const u of users) {
    T.users.push({
      id: u.id, username: u.username, password_hash: passwordHash, full_name: u.full_name,
      contact_number: phone(), employee_code: u.code,
      role: u.role, is_active: true, created_at: day0, last_login: null, updated_at: day0,
    });
  }

  const roleDefs = [
    { name: "Admin", description: "Full access to every module, including user management and backups" },
    { name: "Cashier", description: "Point-of-sale operations and read-only inventory lookup" },
    { name: "FrontDesk", description: "Inventory receiving, procurement requests and wholesale order handling" },
  ];
  const roleId = new Map<string, string>();
  for (const r of roleDefs) {
    const id = randomUUID();
    roleId.set(r.name, id);
    T.roles.push({ id, role_name: r.name, description: r.description, created_at: day0 });
  }
  const MODULES = ["Sales", "Inventory", "Procurement", "Reports", "Wholesale", "Administration"];
  const PERM_TYPES = ["View", "Create", "Edit", "Delete", "Approve"];
  const permId = new Map<string, string>();
  for (const m of MODULES) {
    for (const p of PERM_TYPES) {
      const id = randomUUID();
      permId.set(`${m}:${p}`, id);
      T.permissions.push({ id, module_name: m, permission_type: p, created_at: day0 });
    }
  }
  const allow: Record<string, (m: string, p: string) => boolean> = {
    Admin: () => true,
    Cashier: (m, p) => (m === "Sales" && (p === "View" || p === "Create")) || (m === "Inventory" && p === "View"),
    FrontDesk: (m, p) =>
      (m === "Sales" && p === "View") ||
      (m === "Inventory" && ["View", "Create", "Edit"].includes(p)) ||
      (m === "Procurement" && (p === "View" || p === "Create")) ||
      (m === "Wholesale" && ["View", "Create", "Edit"].includes(p)),
  };
  for (const r of roleDefs) {
    for (const m of MODULES)
      for (const p of PERM_TYPES)
        if (allow[r.name]!(m, p))
          T.role_permissions.push({ id: randomUUID(), role_id: roleId.get(r.name), permission_id: permId.get(`${m}:${p}`), granted_at: day0 });
  }
  for (const u of users)
    T.user_roles.push({ id: randomUUID(), user_id: u.id, role_id: roleId.get(u.role), assigned_at: day0 });

  const lastLogin = new Map<string, Date>();
  const addLog = (
    userId: string | null, action: string, module: string, description: string, when: Date,
    status: "Success" | "Failed" | "Warning" = "Success", ip: string | null = null,
  ) => T.system_logs.push({ id: randomUUID(), user_id: userId, action_type: action, module, description, status, device_ip: ip, timestamp: when });

  // ── Products ─────────────────────────────────────────────────────────────
  // Stock sizing is derived from expected 60-day demand so the numbers stay believable.
  const AVG_TX_PER_DAY = (TX_PER_DAY[0] + TX_PER_DAY[1]) / 2;
  const AVG_LINES_PER_TX = 2.2;
  const sumPop = sum(PRODUCT_DEFS.map((d) => d.pop));
  const totalLines = AVG_TX_PER_DAY * AVG_LINES_PER_TX * HISTORY_DAYS * 0.9;
  const AVG_QTY_HIGH = 4.85; // must match qtyFor() below
  const AVG_QTY_LOW = 2.4;

  const products: Product[] = PRODUCT_DEFS.map((def, i) => ({
    id: randomUUID(), sku: `MED-${String(i + 1).padStart(4, "0")}`,
    def, supplierIdx: CATEGORY_SUPPLIER[def.cat] ?? 0, qtyA: 0, qtyB: 0, minStock: 0, batches: [],
  }));

  // ── Wholesale clients & contracts (built first: contract items feed the stock sizing) ──
  const eligible = products.filter((p) => !p.def.low && !p.def.dd && p.def.expA === undefined);
  const clients = CLIENT_DEFS.map((c, i) => {
    const id = randomUUID();
    const contractId = randomUUID();
    T.wholesale_clients.push({
      id, client_name: c.name, contact_person: c.person, contact_number: phone(),
      email: `orders@${c.name.toLowerCase().replace(/[^a-z]+/g, "")}.example`, address: c.address, created_at: day0, updated_at: day0,
    });
    T.client_contracts.push({
      id: contractId, client_id: id, effective_date: dateStr(c.eff), expiry_date: dateStr(c.exp),
      payment_terms: c.terms, status: c.status, created_at: at(c.eff, 9), updated_at: at(c.eff, 9),
    });
    const items = shuffle(eligible).slice(0, 10).map((p) => ({ prod: p, price: r2(Math.max(p.def.cost * 1.08, p.def.price * 0.88)) }));
    for (const it of items)
      T.client_contract_items.push({ id: randomUUID(), contract_id: contractId, product_id: it.prod.id, agreed_unit_price: it.price });
    return { idx: i, id, contractId, terms: c.terms, items, name: c.name };
  });

  // Size opening stock (batch A), restock (batch B) and minimum level from expected demand:
  // retail (60 days) + a wholesale allowance for every contract the product is on.
  const contractCount = new Map<string, number>();
  for (const c of clients) for (const it of c.items) contractCount.set(it.prod.id, (contractCount.get(it.prod.id) ?? 0) + 1);
  for (const p of products) {
    const retail = ((totalLines * p.def.pop) / sumPop) * (p.def.pop >= 4 ? AVG_QTY_HIGH : AVG_QTY_LOW);
    const demand = retail + (contractCount.get(p.id) ?? 0) * 60;
    p.qtyA = p.def.qtyA ?? (p.def.low ? round10(retail * 0.45) : round10(Math.max(60, demand * (0.55 + rand() * 0.2))));
    p.qtyB = p.def.low ? 0 : round10(Math.max(40, demand * (0.6 + rand() * 0.4)));
    p.minStock = p.def.min ?? Math.max(20, round10(demand * 0.2));
  }
  const allBatches: Batch[] = [];
  let lotSeq = 0;
  const newBatch = (p: Product, qty: number, receivedOff: number, expOff: number, receivedAt: Date, dispose: boolean): Batch => {
    const b: Batch = {
      id: randomUUID(), productId: p.id, batchNumber: `LOT-${String(TODAY.y).slice(2)}${pad(++lotSeq, 4)}`,
      expOff, expiration: dateStr(expOff), receivedOff, receivedAt, remaining: qty, dispose, disposedOff: null,
    };
    p.batches.push(b);
    allBatches.push(b);
    return b;
  };

  const movement = (
    productId: string, batchId: string | null, type: string, quantity: number, when: Date,
    referenceId: string | null, notes: string,
  ) => T.stock_movements.push({ id: randomUUID(), product_id: productId, batch_id: batchId, movement_type: type, quantity, movement_date: when, reference_id: referenceId, notes });

  // ── Suppliers & procurement ──────────────────────────────────────────────
  const suppliers = SUPPLIER_DEFS.map((s) => ({ ...s, id: randomUUID() }));
  for (const s of suppliers)
    T.suppliers.push({
      id: s.id, supplier_name: s.name, contact_person: s.person, contact_number: phone(),
      email: `sales@${s.domain}`, address: s.address, payment_terms: s.terms, created_at: day0, updated_at: day0,
    });

  interface POLine { prod: Product; qty: number; expOff: number; dispose: boolean }
  const line = (p: Product, qty: number, which: "A" | "B"): POLine => ({
    prod: p, qty,
    expOff: which === "A" ? (p.def.expA ?? randInt(240, 600)) : randInt(420, 900),
    dispose: which === "A" && !!p.def.dispose,
  });
  interface PODelivery { off: number; status: "Received" | "Inspected" | "Partial"; fraction?: number; payParts: number[] }
  let poSeq = 0;
  let invSeq = 0;

  function buildPO(o: { supplierIdx: number; orderOff: number; status: string; lines: POLine[]; delivery?: PODelivery }) {
    if (o.lines.length === 0) return;
    const sup = suppliers[o.supplierIdx]!;
    const poId = randomUUID();
    const poNumber = `PO-${ymd(o.orderOff)}-${pad(++poSeq, 3)}`;
    const orderedAt = past(o.orderOff, 9, 30);
    T.purchase_orders.push({
      id: poId, supplier_id: sup.id, po_number: poNumber, order_date: orderedAt, status: o.status,
      total_order_amount: r2(sum(o.lines.map((l) => l.qty * l.prod.def.cost))),
      created_at: orderedAt, updated_at: o.delivery ? past(o.delivery.off, 10) : orderedAt,
    });
    for (const l of o.lines)
      T.po_items.push({
        id: randomUUID(), po_id: poId, product_id: l.prod.id, quantity_ordered: l.qty, unit_cost: l.prod.def.cost,
        line_total: r2(l.qty * l.prod.def.cost), created_at: orderedAt,
      });
    addLog(admin.id, "CREATE", "Procurement", `Created purchase order ${poNumber} (${sup.name})`, orderedAt, "Success", admin.ip);

    const d = o.delivery;
    if (!d) return;
    const deliveryId = randomUUID();
    const deliveredAt = past(d.off, 10, 0);
    T.supplier_deliveries.push({ id: deliveryId, po_id: poId, delivery_date: deliveredAt, delivery_status: d.status, created_at: deliveredAt });
    let invoiceTotal = 0;
    for (const l of o.lines) {
      const qty = d.status === "Partial" ? Math.max(10, Math.floor((l.qty * (d.fraction ?? 0.7)) / 10) * 10) : l.qty;
      const b = newBatch(l.prod, qty, d.off, l.expOff, deliveredAt, l.dispose);
      T.delivery_items.push({
        id: randomUUID(), delivery_id: deliveryId, product_id: l.prod.id, batch_number: b.batchNumber,
        expiration_date: b.expiration, quantity_delivered: qty, created_at: deliveredAt,
      });
      movement(l.prod.id, b.id, "StockIn", qty, deliveredAt, deliveryId, `Received via ${poNumber}`);
      invoiceTotal += qty * l.prod.def.cost;
    }
    addLog(admin.id, "RECEIVE", "Inventory", `Received delivery for ${poNumber} (${d.status})`, deliveredAt, "Success", admin.ip);

    // Invoice → accounts payable → payments
    const terms = termsDays(sup.terms);
    const invoiceId = randomUUID();
    const apId = randomUUID();
    const amount = r2(invoiceTotal);
    const parts = d.payParts;
    const fullSum = sum(parts);
    let paid = 0;
    let lastPayOff: number | null = null;
    parts.forEach((frac, i) => {
      const payOff = d.off + Math.max(0, terms - 3) + i * 7;
      if (payOff > 0) return; // not paid yet
      let amt = r2(amount * frac);
      if (i === parts.length - 1 && fullSum >= 0.999) amt = r2(amount - paid);
      if (amt <= 0) return;
      paid = r2(paid + amt);
      lastPayOff = payOff;
      const when = past(payOff, 14, 0);
      T.supplier_payments.push({
        id: randomUUID(), ap_id: apId, payment_date: when, amount_paid: amt,
        notes: pick(["Bank transfer", "Check payment", "Online banking", "Cash payment"]), created_at: when,
      });
    });
    const balance = r2(amount - paid);
    T.supplier_invoices.push({
      id: invoiceId, po_id: poId, supplier_id: sup.id, invoice_number: `INV-${sup.code}-${pad(++invSeq, 4)}`,
      due_date: dateStr(d.off + terms), invoice_amount: amount, is_paid: balance <= 0, created_at: deliveredAt,
    });
    T.accounts_payable.push({
      id: apId, supplier_id: sup.id, invoice_id: invoiceId, total_owed: amount, total_paid: paid, balance,
      last_payment_date: lastPayOff === null ? null : dateStr(lastPayOff), created_at: deliveredAt, updated_at: deliveredAt,
    });
  }

  suppliers.forEach((_, s) => {
    const mine = products.filter((p) => p.supplierIdx === s);
    // Opening stock
    buildPO({
      supplierIdx: s, orderOff: -90, status: "Fulfilled",
      lines: mine.map((p) => line(p, p.qtyA, "A")),
      delivery: { off: -85, status: s % 2 ? "Inspected" : "Received", payParts: s % 2 ? [1] : [0.5, 0.5] },
    });
    // Restock (skips the deliberately under-stocked products)
    const PAY_B: number[][] = [[0.4], [1], [], [1], []]; // partly paid / paid / unpaid / paid (COD) / overdue
    buildPO({
      supplierIdx: s, orderOff: -40, status: s === 2 ? "Submitted" : "Fulfilled",
      lines: mine.filter((p) => p.qtyB > 0).map((p) => line(p, p.qtyB, "B")),
      delivery: { off: -35, status: s === 2 ? "Partial" : "Received", fraction: 0.7, payParts: PAY_B[s] ?? [] },
    });
  });
  // Open / historic POs with no delivery
  const lowProds = products.filter((p) => p.def.low);
  const byS = (s: number) => products.filter((p) => p.supplierIdx === s && !p.def.low);
  buildPO({ supplierIdx: 2, orderOff: -5, status: "Submitted", lines: lowProds.filter((p) => p.supplierIdx === 2).map((p) => line(p, 300, "B")) });
  buildPO({ supplierIdx: 3, orderOff: -1, status: "Approved", lines: lowProds.filter((p) => p.supplierIdx === 3).map((p) => line(p, 300, "B")) });
  buildPO({ supplierIdx: 1, orderOff: -2, status: "Pending", lines: byS(1).filter((p) => !p.def.dd).slice(0, 4).map((p) => line(p, 100, "B")) });
  buildPO({ supplierIdx: 4, orderOff: 0, status: "Draft", lines: byS(4).slice(0, 3).map((p) => line(p, 60, "B")) });
  buildPO({ supplierIdx: 0, orderOff: -20, status: "Cancelled", lines: byS(0).slice(0, 3).map((p) => line(p, 100, "B")) });

  // ── Customers ────────────────────────────────────────────────────────────
  const customers: { id: string; discountType: string }[] = [];
  const usedNames = new Set<string>();
  let scSeq = 0;
  let pwdSeq = 0;
  while (customers.length < 30) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const discountType = weighted(["Regular", "Senior Citizen", "PWD"], [60, 27, 13]);
    const idNumber = discountType === "Senior Citizen" ? `SC-${pad(++scSeq, 6)}` : discountType === "PWD" ? `PWD-${pad(++pwdSeq, 6)}` : null;
    const id = randomUUID();
    customers.push({ id, discountType });
    T.customers.push({
      id, customer_name: name, discount_type: discountType, id_number: idNumber, contact_number: phone(),
      created_at: at(-randInt(30, 110), 10), updated_at: at(-randInt(0, 29), 10),
    });
  }

  // ── Stock allocation (FEFO) ──────────────────────────────────────────────
  function allocate(p: Product, qty: number, when: Date, whenOff: number, consume: boolean) {
    const avail = p.batches
      .filter((b) => b.remaining > 0 && b.disposedOff === null && b.receivedAt.getTime() <= when.getTime() && b.expOff > whenOff)
      .sort((a, b) => a.expOff - b.expOff);
    const out: { batch: Batch; qty: number }[] = [];
    let need = qty;
    for (const b of avail) {
      if (need <= 0) break;
      const take = Math.min(b.remaining, need);
      out.push({ batch: b, qty: take });
      need -= take;
    }
    if (consume) for (const a of out) a.batch.remaining -= a.qty;
    return out;
  }
  const sellable = (p: Product, off: number) =>
    sum(p.batches.filter((b) => b.receivedOff <= off && b.expOff > off && b.disposedOff === null).map((b) => b.remaining));

  // ── Wholesale deliveries (processed inside the daily loop so stock stays consistent) ──
  const DELIVERY_OFFS = [-55, -50, -46, -41, -37, -33, -28, -24, -19, -14, -9, -5];
  const wholesalePlans = DELIVERY_OFFS.map((deliveryOff, i) => ({ i, deliveryOff, clientIdx: i % clients.length, lead: randInt(2, 4) }));
  let drSeq = 0;
  const RECEIVERS = ["R. Dizon", "M. Alvarez", "J. Lopez", "C. Bernardo", "S. Padilla"];

  function recordAR(orderId: string, clientId: string, terms: string, total: number, deliveryOff: number, patternIdx: number) {
    const arId = randomUUID();
    const t = termsDays(terms);
    const patterns: number[][] = [[1], [0.5], [], [0.5, 0.5]];
    const parts = patterns[patternIdx % 4]!;
    const fullSum = sum(parts);
    let paid = 0;
    parts.forEach((frac, i) => {
      const payOff = deliveryOff + Math.max(3, t - 2) + i * 10;
      if (payOff > 0) return;
      let amt = r2(total * frac);
      if (i === parts.length - 1 && fullSum >= 0.999) amt = r2(total - paid);
      if (amt <= 0) return;
      paid = r2(paid + amt);
      const when = past(payOff, 11, 0);
      T.ar_payments.push({
        id: randomUUID(), ar_id: arId, payment_date: when, amount_paid: amt,
        notes: pick(["Bank transfer", "Check payment", "Cash on pickup", "GCash"]), created_at: when,
      });
    });
    T.accounts_receivable.push({
      id: arId, client_id: clientId, order_id: orderId, total_owed: total, total_paid: paid, balance: r2(total - paid),
      due_date: dateStr(deliveryOff + t), created_at: past(deliveryOff, 14), updated_at: past(deliveryOff, 14),
    });
  }

  function processWholesaleDelivery(plan: (typeof wholesalePlans)[number]) {
    const client = clients[plan.clientIdx]!;
    const when = past(plan.deliveryOff, 14, 0);
    const lines: { prod: Product; price: number; allocs: { batch: Batch; qty: number }[]; qty: number }[] = [];
    for (const it of shuffle(client.items).slice(0, randInt(3, 5))) {
      const allocs = allocate(it.prod, round10(randInt(20, 80)), when, plan.deliveryOff, true);
      const qty = sum(allocs.map((a) => a.qty));
      if (qty > 0) lines.push({ prod: it.prod, price: it.price, allocs, qty });
    }
    if (lines.length === 0) return;
    const orderId = randomUUID();
    const receiptId = randomUUID();
    const orderedAt = past(plan.deliveryOff - plan.lead, 10, 0);
    const total = r2(sum(lines.map((l) => l.qty * l.price)));
    T.wholesale_orders.push({
      id: orderId, client_id: client.id, contract_id: client.contractId, order_date: orderedAt, status: "Delivered",
      total_order_amount: total, created_at: orderedAt, updated_at: when,
    });
    for (const l of lines)
      T.wholesale_order_items.push({ id: randomUUID(), order_id: orderId, product_id: l.prod.id, quantity: l.qty, unit_price: l.price, line_total: r2(l.qty * l.price) });

    if (plan.i % 5 === 2)
      T.delivery_schedules.push({
        id: randomUUID(), order_id: orderId, scheduled_date: dateStr(plan.deliveryOff - 1), status: "Failed",
        notes: "Recipient unavailable — rescheduled", created_at: orderedAt,
      });
    T.delivery_schedules.push({ id: randomUUID(), order_id: orderId, scheduled_date: dateStr(plan.deliveryOff), status: "Completed", notes: null, created_at: orderedAt });

    const receiptNo = `DR-${ymd(plan.deliveryOff)}-${pad(++drSeq, 3)}`;
    T.delivery_receipts.push({ id: receiptId, order_id: orderId, delivery_date: when, receipt_number: receiptNo, received_by: pick(RECEIVERS), created_at: when });
    for (const l of lines)
      for (const a of l.allocs) {
        T.delivery_receipt_items.push({
          id: randomUUID(), receipt_id: receiptId, product_id: l.prod.id, batch_number: a.batch.batchNumber,
          expiration_date: a.batch.expiration, quantity_delivered: a.qty,
        });
        movement(l.prod.id, a.batch.id, "StockOut", -a.qty, when, receiptId, `Wholesale delivery ${receiptNo} → ${client.name}`);
      }
    addLog(admin.id, "DELIVER", "Wholesale", `Delivered ${receiptNo} to ${client.name}`, when, "Success", admin.ip);
    recordAR(orderId, client.id, client.terms, total, plan.deliveryOff, plan.i);
  }

  // ── Retail simulation (day by day, oldest → newest) ──────────────────────
  interface TxSummary { off: number; gross: number; discount: number; vat: number; net: number; cogs: number; discountType: string }
  const txSummaries: TxSummary[] = [];
  const cashByDayCashier = new Map<string, number>();
  const activeCashiers = new Map<number, Set<string>>();
  const receiptSeq = new Map<number, number>();
  const openLowAlerts = new Map<string, Row>();
  const popWeights = products.map((p) => p.def.pop);
  const qtyFor = (p: Product) =>
    p.def.pop >= 4 ? weighted([2, 3, 4, 5, 6, 10], [15, 20, 20, 15, 15, 15]) : weighted([1, 2, 3, 4, 5], [30, 30, 20, 10, 10]);
  const VOID_REASONS = ["Wrong item scanned", "Customer changed mind", "Incorrect quantity", "Payment issue", "Price dispute"];

  for (let off = -HISTORY_DAYS; off <= 0; off++) {
    // Write-off of expired stock that was flagged for disposal
    for (const p of products)
      for (const b of p.batches)
        if (b.dispose && b.disposedOff === null && b.expOff + 2 <= off && b.receivedOff <= off) {
          b.disposedOff = off;
          if (b.remaining > 0) {
            const when = past(off, 9, 0);
            movement(p.id, b.id, "Disposal", -b.remaining, when, null, "Expired stock written off");
            addLog(admin.id, "DISPOSE", "Inventory", `Disposed ${b.remaining} × ${p.def.name} (batch ${b.batchNumber}, expired)`, when, "Success", admin.ip);
            b.remaining = 0;
          }
        }

    for (const plan of wholesalePlans) if (plan.deliveryOff === off) processWholesaleDelivery(plan);

    const times = Array.from({ length: randInt(TX_PER_DAY[0], TX_PER_DAY[1]) }, () => at(off, randInt(8, 20), randInt(0, 59)))
      .filter((t) => t.getTime() <= NOW.getTime())
      .sort((a, b) => a.getTime() - b.getTime());

    for (const when of times) {
      const cashier = pick(cashiers);
      const cust = chance(0.35) ? pick(customers) : null;
      const discountType = cust?.discountType ?? "Regular";
      const isSeniorPwd = discountType === "Senior Citizen" || discountType === "PWD";
      const r = rand();
      const status = r < 0.02 ? "Voided" : r < 0.035 ? "Cancelled" : off === 0 && r > 0.94 ? "Pending" : "Completed";
      const consumes = status === "Completed" || status === "Voided";
      const txId = randomUUID();

      const picks = new Set<number>();
      const nLines = weighted([1, 2, 3, 4, 5], [35, 30, 20, 10, 5]);
      for (let k = 0; k < nLines; k++) picks.add(weightedIndex(popWeights));

      const items: Row[] = [];
      const soldAllocs: { p: Product; batch: Batch; qty: number }[] = [];
      let gross = 0;
      let cogs = 0;
      for (const idx of picks) {
        const p = products[idx]!;
        const allocs = allocate(p, qtyFor(p), when, off, consumes);
        if (allocs.length === 0) continue;
        if (consumes) {
          for (const a of allocs) {
            const subtotal = r2(a.qty * p.def.price);
            items.push({ id: randomUUID(), transaction_id: txId, product_id: p.id, batch_id: a.batch.id, quantity: a.qty, unit_price_at_sale: p.def.price, subtotal, created_at: when });
            soldAllocs.push({ p, batch: a.batch, qty: a.qty });
            gross += subtotal;
            cogs += a.qty * p.def.cost;
          }
        } else {
          const qty = sum(allocs.map((a) => a.qty));
          const subtotal = r2(qty * p.def.price);
          items.push({ id: randomUUID(), transaction_id: txId, product_id: p.id, batch_id: null, quantity: qty, unit_price_at_sale: p.def.price, subtotal, created_at: when });
          gross += subtotal;
        }
      }
      if (items.length === 0) continue;
      gross = r2(gross);

      // Totals. Prices are VAT-inclusive. Senior/PWD: VAT-exempt + 20% off the VAT-exclusive price.
      // Invariant: net_amount = gross_amount - total_discount.
      let vatExempt = 0;
      let scDiscount = 0;
      let vat = r2((gross * VAT_RATE) / (1 + VAT_RATE));
      if (isSeniorPwd) {
        vatExempt = r2(gross - gross / (1 + VAT_RATE));
        scDiscount = r2((gross - vatExempt) * SENIOR_PWD_DISCOUNT);
        vat = 0;
      }
      const totalDiscount = r2(vatExempt + scDiscount);
      const net = r2(gross - totalDiscount);

      const method = weighted(["Cash", "GCash", "Maya", "Card"], [60, 22, 8, 10]);
      let tendered = 0;
      let change = 0;
      if (consumes) {
        if (method === "Cash") {
          const bill = [20, 50, 100, 200, 500, 1000].find((b) => b >= net);
          tendered = chance(0.4) || !bill ? Math.ceil(net / 10) * 10 : bill;
          if (tendered < net) tendered = Math.ceil(net / 1000) * 1000;
          change = r2(tendered - net);
        } else {
          tendered = net;
        }
      }
      const voidReason = status === "Voided" ? pick(VOID_REASONS) : null;

      T.transactions.push({
        id: txId, cashier_id: cashier.id, customer_id: cust?.id ?? null, transaction_date: when, status,
        gross_amount: gross, total_discount: totalDiscount, vat_amount: vat, net_amount: net,
        amount_tendered: tendered, change_amount: change, payment_method: method, void_reason: voidReason,
        created_at: when, updated_at: when,
      });
      T.transaction_items.push(...items);
      if (isSeniorPwd) {
        T.discounts.push({ id: randomUUID(), transaction_id: txId, discount_type: "VAT Exemption", discount_rate: VAT_RATE * 100, discount_amount: vatExempt, created_at: when });
        T.discounts.push({ id: randomUUID(), transaction_id: txId, discount_type: discountType, discount_rate: SENIOR_PWD_DISCOUNT * 100, discount_amount: scDiscount, created_at: when });
      }

      let receiptNo: string | null = null;
      if (consumes) {
        const n = (receiptSeq.get(off) ?? 0) + 1;
        receiptSeq.set(off, n);
        receiptNo = `OR-${ymd(off)}-${pad(n, 4)}`;
        T.receipts.push({ id: randomUUID(), transaction_id: txId, receipt_number: receiptNo, issued_at: when });
        for (const s of soldAllocs) movement(s.p.id, s.batch.id, "Sale", -s.qty, when, txId, `POS sale ${receiptNo}`);
      }
      if (status === "Voided") {
        const voidAt = new Date(when.getTime() + 10 * 60_000);
        for (const s of soldAllocs) {
          s.batch.remaining += s.qty; // stock goes back on the shelf
          movement(s.p.id, s.batch.id, "Return", s.qty, voidAt, txId, `Voided ${receiptNo}: ${voidReason}`);
        }
        addLog(admin.id, "VOID", "Sales", `Voided ${receiptNo}: ${voidReason}`, voidAt, "Success", admin.ip);
      }
      if (status === "Completed") {
        txSummaries.push({ off, gross, discount: totalDiscount, vat, net, cogs: r2(cogs), discountType });
        if (method === "Cash") {
          const key = `${off}|${cashier.id}`;
          cashByDayCashier.set(key, r2((cashByDayCashier.get(key) ?? 0) + net));
        }
      }
      if (!activeCashiers.has(off)) activeCashiers.set(off, new Set());
      activeCashiers.get(off)!.add(cashier.id);
    }

    // Low-stock alert history: open when sellable stock dips under the minimum, resolve when restocked
    for (const p of products) {
      const s = sellable(p, off);
      const open = openLowAlerts.get(p.id);
      if (s < p.minStock) {
        const severity = s === 0 ? "Critical" : s < p.minStock * 0.5 ? "High" : "Medium";
        if (!open) {
          const row: Row = { id: randomUUID(), product_id: p.id, batch_id: null, alert_type: "LowStock", severity, triggered_at: past(off, 20, 0), is_resolved: false, resolved_at: null };
          openLowAlerts.set(p.id, row);
          T.inventory_alerts.push(row);
        } else if (severity === "Critical" || (severity === "High" && open.severity === "Medium")) {
          open.severity = severity;
        }
      } else if (open) {
        open.is_resolved = true;
        open.resolved_at = past(off, 20, 0);
        openLowAlerts.delete(p.id);
      }
    }
  }

  // ── Wholesale orders that are still open / cancelled (no stock impact yet) ──
  const openOrders = [
    { c: 0, status: "Pending", orderOff: -1, sched: { off: 5, status: "Scheduled", note: null as string | null } },
    { c: 1, status: "Confirmed", orderOff: -2, sched: { off: 3, status: "Scheduled", note: null } },
    { c: 2, status: "Processing", orderOff: -3, sched: { off: 0, status: "InTransit", note: "Out for delivery" } },
    { c: 3, status: "Cancelled", orderOff: -12, sched: { off: -8, status: "Cancelled", note: "Cancelled by client" } },
  ];
  for (const o of openOrders) {
    const client = clients[o.c]!;
    const id = randomUUID();
    const orderedAt = past(o.orderOff, 10, 0);
    const lines = shuffle(client.items).slice(0, randInt(3, 4)).map((it) => ({ ...it, qty: round10(randInt(20, 80)) }));
    T.wholesale_orders.push({
      id, client_id: client.id, contract_id: client.contractId, order_date: orderedAt, status: o.status,
      total_order_amount: r2(sum(lines.map((l) => l.qty * l.price))), created_at: orderedAt, updated_at: orderedAt,
    });
    for (const l of lines)
      T.wholesale_order_items.push({ id: randomUUID(), order_id: id, product_id: l.prod.id, quantity: l.qty, unit_price: l.price, line_total: r2(l.qty * l.price) });
    T.delivery_schedules.push({ id: randomUUID(), order_id: id, scheduled_date: dateStr(o.sched.off), status: o.sched.status, notes: o.sched.note, created_at: orderedAt });
  }

  // ── Inventory alerts from the final state (expiry) ───────────────────────
  for (const p of products)
    for (const b of p.batches) {
      if (b.disposedOff !== null) {
        // was written off → resolved expiry alert (only if there was something left to dispose)
        if (T.stock_movements.some((m) => m.batch_id === b.id && m.movement_type === "Disposal"))
          T.inventory_alerts.push({ id: randomUUID(), product_id: p.id, batch_id: b.id, alert_type: "Expired", severity: "Critical", triggered_at: past(b.expOff + 1, 6, 0), is_resolved: true, resolved_at: past(b.disposedOff, 9, 0) });
        continue;
      }
      if (b.remaining <= 0) continue;
      if (b.expOff <= 0) {
        T.inventory_alerts.push({ id: randomUUID(), product_id: p.id, batch_id: b.id, alert_type: "Expired", severity: "Critical", triggered_at: past(b.expOff + 1, 6, 0), is_resolved: false, resolved_at: null });
      } else if (b.expOff <= 90) {
        const tier = b.expOff <= 30 ? 30 : b.expOff <= 60 ? 60 : 90;
        const severity = tier === 30 ? "High" : tier === 60 ? "Medium" : "Low";
        T.inventory_alerts.push({ id: randomUUID(), product_id: p.id, batch_id: b.id, alert_type: "NearExpiry", severity, triggered_at: past(Math.min(0, b.expOff - tier), 6, 0), is_resolved: false, resolved_at: null });
      }
    }

  // ── Product + batch rows (after the simulation, so stock is final) ───────
  for (const p of products)
    T.products.push({
      id: p.id, sku: p.sku, product_name: p.def.name, generic_name: p.def.generic, category: p.def.cat, is_dangerous_drug: !!p.def.dd,
      selling_price: p.def.price, cost_price: p.def.cost, minimum_stock_level: p.minStock,
      current_stock: sum(p.batches.map((b) => b.remaining)), created_at: day0, updated_at: NOW,
    });
  for (const b of allBatches)
    T.batch_info.push({
      id: b.id, product_id: b.productId, batch_number: b.batchNumber, expiration_date: b.expiration,
      quantity_remaining: b.remaining, created_at: b.receivedAt, updated_at: NOW,
    });

  // ── Cash reconciliation (one row per cashier per closed day) ─────────────
  for (const [key, reported] of [...cashByDayCashier.entries()].sort()) {
    const [offStr, cashierId] = key.split("|") as [string, string];
    const off = Number(offStr);
    if (off === 0) continue; // today's drawer isn't closed yet
    const disc = chance(0.75) ? 0 : r2(randInt(-120, 90));
    const flagged = Math.abs(disc) >= 50;
    T.cash_reconciliations.push({
      id: randomUUID(), reconciliation_date: dateStr(off), cashier_id: cashierId, cash_on_hand: r2(reported + disc),
      total_reported_sales: reported, discrepancy_amount: disc, has_flagged_inconsistency: flagged,
      notes: flagged ? (disc < 0 ? "Drawer short — recount done, escalated to admin" : "Drawer over — recount done") : null,
      reconciled_at: at(off, 21, 30),
    });
  }

  // ── Logins / backups ─────────────────────────────────────────────────────
  const setLogin = (uid: string, d: Date) => {
    if (!lastLogin.has(uid) || lastLogin.get(uid)! < d) lastLogin.set(uid, d);
  };
  const ipOf = new Map<string, string>(users.map((u) => [u.id, u.ip]));
  for (let off = -HISTORY_DAYS; off <= 0; off++) {
    const who = new Set<string>(activeCashiers.get(off) ?? []);
    if (chance(0.4)) who.add(admin.id);
    if (chance(0.5)) who.add(users[4]!.id);
    for (const uid of who) {
      const t = past(off, 7, randInt(30, 59));
      if (chance(0.05))
        addLog(uid, "LOGIN", "Authentication", "Failed login attempt (wrong password)", new Date(t.getTime() - 60_000), "Failed", ipOf.get(uid) ?? null);
      addLog(uid, "LOGIN", "Authentication", "User logged in", t, "Success", ipOf.get(uid) ?? null);
      setLogin(uid, t);
    }
  }
  addLog(null, "LOGIN", "Authentication", "5 failed login attempts for username 'root' from unknown device", past(-9, 3, 12), "Warning", "203.0.113.45");
  for (const row of T.users) row.last_login = lastLogin.get(row.id as string) ?? null;

  for (let off = -56; off <= 0; off += 7) {
    const when = at(off, 2, 0);
    if (when.getTime() > NOW.getTime()) continue;
    const failed = off === -28;
    T.backup_records.push({
      id: randomUUID(), initiated_by_user_id: admin.id, backup_date: when,
      file_path: `/backups/pharmacy_${dateStr(off)}.sql.gz`, status: failed ? "Failed" : "Completed",
    });
    addLog(admin.id, "BACKUP", "Administration", failed ? "Scheduled backup failed (disk quota exceeded)" : "Scheduled backup completed", when, failed ? "Failed" : "Success", admin.ip);
  }

  // ── User activity feed (what the "User Activities" screen shows) ─────────
  // Derived from the audit log + flagged cash reconciliations. Failed logins are "Suspicious",
  // voids and drawer discrepancies are "Flagged", everything else is "Normal".
  const ACTIVITY_LABEL: Record<string, string> = {
    LOGIN: "Login", VOID: "Voided transaction", CREATE: "Created purchase order",
    RECEIVE: "Received supplier delivery", DELIVER: "Delivered wholesale order", DISPOSE: "Disposed expired stock",
  };
  for (const l of T.system_logs) {
    const label = ACTIVITY_LABEL[l.action_type as string];
    if (!label) continue; // e.g. BACKUP is a system job, not a user activity
    const flag = l.action_type === "VOID" ? "Flagged" : l.action_type === "LOGIN" && l.status !== "Success" ? "Suspicious" : "Normal";
    T.user_activities.push({
      id: randomUUID(), user_id: l.user_id, activity: l.status === "Success" ? label : `${label} (${(l.status as string).toLowerCase()})`,
      module: l.module, description: l.description, flag, timestamp: l.timestamp,
    });
  }
  for (const c of T.cash_reconciliations)
    if (c.has_flagged_inconsistency)
      T.user_activities.push({
        id: randomUUID(), user_id: c.cashier_id, activity: "Cash drawer discrepancy", module: "Cash Reconciliation",
        description: `Drawer ${(c.discrepancy_amount as number) < 0 ? "short" : "over"} by ₱${Math.abs(c.discrepancy_amount as number).toFixed(2)} on ${c.reconciliation_date}`,
        flag: "Flagged", timestamp: c.reconciled_at,
      });

  // ── Dashboards ───────────────────────────────────────────────────────────
  for (const u of users) {
    const widgets =
      u.role === "Admin" ? ["sales_today", "low_stock", "near_expiry", "accounts_payable", "accounts_receivable", "top_products"]
        : u.role === "Cashier" ? ["sales_today", "recent_transactions"]
          : ["low_stock", "pending_deliveries", "open_purchase_orders"];
    T.dashboards.push({ id: randomUUID(), user_id: u.id, config: { theme: "light", widgets }, updated_at: NOW });
  }

  // ── Reports (summaries computed from the generated data) ─────────────────
  const window = (days: number) => txSummaries.filter((t) => t.off > -days);
  const salesSummary = (rows: TxSummary[]) => ({
    transactions: rows.length, gross_sales: r2(sum(rows.map((t) => t.gross))), total_discounts: r2(sum(rows.map((t) => t.discount))),
    vat_collected: r2(sum(rows.map((t) => t.vat))), net_sales: r2(sum(rows.map((t) => t.net))),
  });
  const d30 = window(30);
  const cogs30 = r2(sum(d30.map((t) => t.cogs)));
  const net30 = r2(sum(d30.map((t) => t.net)));
  const stockRows = T.products as { current_stock: number; minimum_stock_level: number }[];
  const report = (type: string, from: number, to: number, data: unknown) =>
    T.reports.push({ id: randomUUID(), report_type: type, generated_at: past(to, 18, 0), date_from: dateStr(from), date_to: dateStr(to), generated_by_user_id: admin.id, summary_data: data, created_at: past(to, 18, 0) });
  report("Sales", -6, 0, salesSummary(window(7)));
  report("Sales", -29, 0, salesSummary(d30));
  report("Discount", -29, 0, {
    senior_citizen: r2(sum(d30.filter((t) => t.discountType === "Senior Citizen").map((t) => t.discount))),
    pwd: r2(sum(d30.filter((t) => t.discountType === "PWD").map((t) => t.discount))),
    total: r2(sum(d30.map((t) => t.discount))),
  });
  report("Income", -29, 0, { net_sales: net30, cost_of_goods_sold: cogs30, gross_profit: r2(net30 - cogs30) });
  report("FinancialSummary", -29, 0, {
    net_sales: net30, cost_of_goods_sold: cogs30, gross_profit: r2(net30 - cogs30),
    accounts_payable_outstanding: r2(sum(T.accounts_payable.map((r) => r.balance as number))),
    accounts_receivable_outstanding: r2(sum(T.accounts_receivable.map((r) => r.balance as number))),
  });
  report("Inventory", 0, 0, {
    total_products: stockRows.length, total_units: sum(stockRows.map((r) => r.current_stock)),
    products_below_minimum: stockRows.filter((r) => r.current_stock < r.minimum_stock_level).length,
    expired_batches_in_stock: T.inventory_alerts.filter((a) => a.alert_type === "Expired" && !a.is_resolved).length,
    near_expiry_batches: T.inventory_alerts.filter((a) => a.alert_type === "NearExpiry").length,
  });

  return { users };
}

// ─────────────────────────────────────────────────────────────────────────────
// Insert
// ─────────────────────────────────────────────────────────────────────────────
async function insertMany(tx: postgres.TransactionSql, table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!).length;
  const chunk = Math.max(1, Math.min(500, Math.floor(60_000 / cols)));
  for (let i = 0; i < rows.length; i += chunk)
    await tx`insert into ${tx(table)} ${tx(rows.slice(i, i + chunk) as never)}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (process.env.NODE_ENV === "production" && !ALLOW_PROD)
    throw new Error("Refusing to seed with NODE_ENV=production (pass --allow-production if you really mean it)");

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    max: 1,
    ssl: isLocal ? false : "require",
    prepare: !/:6543\b/.test(url), // Supabase transaction pooler doesn't support prepared statements
    onnotice: () => { },
    transform: { undefined: null },
  });

  try {
    const existing = await sql<{ n: number }[]>`select count(*)::int as n from users`;
    const n = existing[0]?.n ?? 0;
    if (n > 0 && !RESET) {
      console.log(`Database already has data (${n} users). Nothing done — re-run with --reset to wipe and reseed.`);
      return;
    }

    console.log(`Generating data (rng seed ${RNG_SEED})…`);
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    const { users } = buildData(passwordHash);

    console.log(RESET ? "Truncating tables and inserting…" : "Inserting…");
    await sql.begin(async (tx) => {
      if (RESET) await tx.unsafe(`truncate table ${TABLE_ORDER.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
      for (const t of TABLE_ORDER) await insertMany(tx, t, T[t]);
    });

    console.log("\nRows inserted:");
    for (const t of TABLE_ORDER) console.log(`  ${t.padEnd(24)} ${T[t].length}`);
    console.log(`\nSeeded users (password for all: ${SEED_PASSWORD}):`);
    for (const u of users) console.log(`  ${u.username.padEnd(12)} ${u.role}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});