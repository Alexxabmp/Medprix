import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileBarChart,
  FileText,
  KeyRound,
  Layers,
  LayoutDashboard,
  Moon,
  MoreHorizontal,
  Package,
  Pill,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  UserCog,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import {
  Link,
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
} from "wouter";

const queryClient = new QueryClient();

type ToastFn = (message: string) => void;
type ReportType =
  "sales" | "inventory" | "financial" | "valuation" | "movement" | "cash";
type UserRecord = {
  id: number;
  initials: string;
  name: string;
  username: string;
  role: string;
  status: "Active" | "Inactive";
  lastActive: string;
  phone: string;
};

// Reports removed from nav — now embedded in Dashboard
const navGroups = [
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["admin"],
      },
      {
        href: "/pos",
        label: "POS Register",
        icon: ShoppingCart,
        roles: ["cashier"],
      },
      {
        href: "/review",
        label: "Review",
        icon: ClipboardList,
        roles: ["cashier", "admin"],
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
        roles: ["admin", "frontdesk", "cashier"],
      },
      {
        href: "/supplier",
        label: "Supplier",
        icon: Building2,
        roles: ["admin", "frontdesk"],
      },
      {
        href: "/procurement",
        label: "Procurement",
        icon: ShoppingCart,
        roles: ["admin", "frontdesk"],
      },
      {
        href: "/wholesale",
        label: "Wholesale",
        icon: Receipt,
        roles: ["admin", "frontdesk"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/system-ad",
        label: "System Administration",
        icon: Settings2,
        roles: ["admin"],
      },
      {
        href: "/user-management",
        label: "User Management",
        icon: Users,
        roles: ["admin"],
      },
    ],
  },
];

// Cashier scope is a placeholder for now — refine later per your team's plan.
function getAllowedHrefs(role: string) {
  return navGroups
    .flatMap((g) => g.items)
    .filter((item) => item.roles.includes(role))
    .map((item) => item.href);
}
function getDefaultRoute(role: string) {
  return getAllowedHrefs(role)[0] ?? "/login";
}

export interface ProductBatch {
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  mfgDate?: string;
  dateReceived?: string;
  supplier?: string;
}

export interface ProductItem {
  id: string;
  name: string;
  genericName: string;
  sku: string;
  category: string;
  price: string;
  reorder: number;
  batches: ProductBatch[];
  stock?: number;
  status?: string;
}

const products: ProductItem[] = [
  {
    id: "p1",
    name: "Paracetamol 500mg",
    genericName: "Acetaminophen",
    sku: "MED-0421",
    category: "Pain relief",
    reorder: 40,
    price: "₱5.00",
    batches: [
      {
        batchNumber: "B2026-01",
        quantity: 70,
        expiryDate: "2027-08-15",
        mfgDate: "2025-08-01",
        dateReceived: "2025-08-20",
        supplier: "Southstar Distribution",
      },
      {
        batchNumber: "B2026-02",
        quantity: 50,
        expiryDate: "2027-11-20",
        mfgDate: "2025-11-01",
        dateReceived: "2025-11-25",
        supplier: "Southstar Distribution",
      },
    ],
    stock: 120,
    status: "Available",
  },
  {
    id: "p2",
    name: "Amoxicillin 500mg",
    genericName: "Amoxicillin Trihydrate",
    sku: "MED-0184",
    category: "Antibiotics",
    reorder: 30,
    price: "₱12.00",
    batches: [
      {
        batchNumber: "AMX-801",
        quantity: 8,
        expiryDate: "2027-04-10",
        mfgDate: "2025-04-01",
        dateReceived: "2025-04-15",
        supplier: "Mercury Health Partners",
      },
    ],
    stock: 8,
    status: "Low stock",
  },
  {
    id: "p3",
    name: "Vitamin C 1000mg",
    genericName: "Ascorbic Acid + Zinc",
    sku: "VIT-0223",
    category: "Vitamins",
    reorder: 25,
    price: "₱8.00",
    batches: [
      {
        batchNumber: "VIT-102",
        quantity: 0,
        expiryDate: "2027-01-15",
        mfgDate: "2025-01-01",
        dateReceived: "2025-01-20",
        supplier: "Wellness Direct PH",
      },
    ],
    stock: 0,
    status: "Out of stock",
  },
  {
    id: "p4",
    name: "Cough relief syrup",
    genericName: "Dextromethorphan HBr",
    sku: "MED-0552",
    category: "Respiratory",
    reorder: 20,
    price: "₱145.00",
    batches: [
      {
        batchNumber: "CRS-404",
        quantity: 63,
        expiryDate: "2027-06-30",
        mfgDate: "2025-06-01",
        dateReceived: "2025-06-15",
        supplier: "Southstar Distribution",
      },
    ],
    stock: 63,
    status: "Available",
  },
  {
    id: "p5",
    name: "Cetirizine 10mg",
    genericName: "Cetirizine Dihydrochloride",
    sku: "MED-0350",
    category: "Allergy",
    reorder: 18,
    price: "₱7.50",
    batches: [
      {
        batchNumber: "CTZ-201",
        quantity: 36,
        expiryDate: "2026-10-15",
        mfgDate: "2024-10-01",
        dateReceived: "2024-10-20",
        supplier: "Mercury Health Partners",
      },
    ],
    stock: 36,
    status: "Available",
  },
  {
    id: "p6",
    name: "Skin cream 30g",
    genericName: "Hydrocortisone 1%",
    sku: "DER-0108",
    category: "Dermatology",
    reorder: 15,
    price: "₱220.00",
    batches: [
      {
        batchNumber: "SKN-099",
        quantity: 12,
        expiryDate: "2026-08-01",
        mfgDate: "2024-08-01",
        dateReceived: "2024-08-15",
        supplier: "Wellness Direct PH",
      },
    ],
    stock: 12,
    status: "Low stock",
  },
];

const suppliers = [
  {
    name: "Southstar Distribution",
    code: "SSD-104",
    contact: "Mia Villanueva",
    orders: 18,
    value: "₱482,500",
    status: "Preferred",
  },
  {
    name: "Mercury Health Partners",
    code: "MHP-221",
    contact: "Paolo Garcia",
    orders: 12,
    value: "₱218,450",
    status: "Preferred",
  },
  {
    name: "Wellness Direct PH",
    code: "WDP-308",
    contact: "Anika Lim",
    orders: 7,
    value: "₱94,800",
    status: "Review",
  },
  {
    name: "CuraMed Trading",
    code: "CMT-419",
    contact: "Noah Tan",
    orders: 4,
    value: "₱45,320",
    status: "On hold",
  },
];

const purchaseOrders = [
  {
    id: "PO-24018",
    supplier: "Southstar Distribution",
    date: "Aug 18, 2026",
    items: 14,
    value: "₱38,420",
    status: "In transit",
  },
  {
    id: "PO-24017",
    supplier: "Mercury Health Partners",
    date: "Aug 17, 2026",
    items: 9,
    value: "₱21,850",
    status: "Received",
  },
  {
    id: "PO-24016",
    supplier: "Wellness Direct PH",
    date: "Aug 16, 2026",
    items: 22,
    value: "₱45,600",
    status: "Pending approval",
  },
  {
    id: "PO-24015",
    supplier: "Southstar Distribution",
    date: "Aug 15, 2026",
    items: 11,
    value: "₱16,740",
    status: "Received",
  },
];

const movementFast = [
  { name: "Paracetamol 500mg", units: 250 },
  { name: "Vitamin C 1000mg", units: 180 },
  { name: "Cough relief syrup", units: 145 },
];
const movementSlow = [
  { name: "Antacid chewables", units: 12 },
  { name: "Vitamin B Complex", units: 8 },
  { name: "Skin cream 30g", units: 5 },
];

const cashMismatches = [
  {
    date: "Aug 18",
    shift: "Morning",
    expected: "₱25,450",
    recorded: "₱24,950",
    difference: "-₱500",
    type: "short",
  },
  {
    date: "Aug 17",
    shift: "Evening",
    expected: "₱31,200",
    recorded: "₱32,200",
    difference: "+₱1,000",
    type: "over",
  },
];

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppContent />
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AppContent() {
  const [location, setLocation] = useLocation();
  const [session, setSession] = useState(
    () => localStorage.getItem("medprix-session") === "active",
  );
  const [role, setRole] = useState(
    () => localStorage.getItem("medprix-role") || "",
  );
  const [dark, setDark] = useState(
    () => localStorage.getItem("medprix-theme") === "dark",
  );
  const [toast, setToast] = useState("");
  const [users, setUsers] = useState<UserRecord[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("medprix-theme", dark ? "dark" : "light");
  }, [dark]);

  const fetchUsers = () => {
    fetch("http://localhost:5000/api/users", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const mapped: UserRecord[] = data.map((user) => {
          const name = user.fullName || user.username;
          const initials = name
            .split(" ")
            .map((p: string) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return {
            id: user.id,
            initials,
            name,
            username: user.username,
            role:
              user.role === "admin"
                ? "Administrator"
                : user.role === "frontdesk"
                  ? "Front Desk"
                  : "Cashier",
            status: "Active",
            lastActive: user.lastLogin
              ? new Date(user.lastLogin).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Never",
            phone: user.contactNumber || "",
          };
        });
        setUsers(mapped);
      })
      .catch(() => {
        // Backend offline— users list stays empty
      });
  };

  useEffect(() => {
    if (!session) return;
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session) return;

    fetch("http://localhost:5000/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        localStorage.setItem("medprix-role", data.role);
        localStorage.setItem("medprix-username", data.username);
        setRole(data.role);
      })
      .catch(() => {
        localStorage.removeItem("medprix-session");
        localStorage.removeItem("medprix-role");
        localStorage.removeItem("medprix-username");
        localStorage.removeItem("medprix-fullname");
        setSession(false);
        setRole("");
        setLocation("/login");
      });
  }, [session, setLocation]);

  useEffect(() => {
    if (!session && location !== "/login") {
      setLocation("/login");
      return;
    }
    if (location === "/") {
      setLocation(session ? getDefaultRoute(role) : "/login");
      return;
    }
    if (
      session &&
      location !== "/login" &&
      !getAllowedHrefs(role).includes(location)
    ) {
      setLocation(getDefaultRoute(role));
    }
  }, [location, session, role, setLocation]);
  const notify: ToastFn = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  if (location === "/login") {
    return (
      <LoginPage
        onLogin={() => {
          const loggedInRole = localStorage.getItem("medprix-role") || "";
          localStorage.setItem("medprix-session", "active");
          setRole(loggedInRole);
          setSession(true);
          setLocation(getDefaultRoute(loggedInRole));
        }}
      />
    );
  }

  return (
    <>
      <ErrorBoundary resetKey={location}>
        <AppShell
          dark={dark}
          setDark={setDark}
          onToast={notify}
          role={role}
          onLogout={() => {
            fetch("http://localhost:5000/api/logout", {
              method: "POST",
              credentials: "include",
            }).catch(() => {});
            localStorage.removeItem("medprix-session");
            localStorage.removeItem("medprix-role");
            localStorage.removeItem("medprix-username");
            localStorage.removeItem("medprix-fullname");
            setSession(false);
            setRole("");
            setLocation("/login");
          }}
          users={users}
          setUsers={setUsers}
          refreshUsers={fetchUsers}
        />
      </ErrorBoundary>
      {toast && (
        <div className="toast" data-testid="status-toast">
          <Check size={15} />
          {toast}
        </div>
      )}
    </>
  );
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Enter your username and password to continue.");
      return;
    }
    try {
      const response = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Invalid username or password.");
        return;
      }
      const data = await response.json();
      localStorage.setItem("medprix-role", data.role);
      localStorage.setItem("medprix-username", data.username ?? username);
      localStorage.setItem("medprix-fullname", data.fullName ?? username);
      onLogin();
    } catch {
      setError("Could not reach the server. Is the backend running?");
    }
  };
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">
            <Pill size={16} strokeWidth={2.4} />
          </span>
          <span>Medprix</span>
        </div>
        <div className="eyebrow">Pharmacy operations workspace</div>
        <h1>Hello, User!</h1>
        <p>
          Sign in to keep your pharmacy moving with a clear view of sales,
          stock, and people.
        </p>
        <div className="field" style={{ marginBottom: 13 }}>
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            data-testid="input-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            data-testid="input-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </div>
        {error && (
          <p
            style={{ color: "#b34f45", margin: "10px 0 0", fontSize: 11 }}
            data-testid="status-login-error">
            {error}
          </p>
        )}
        <button
          className="button dark full"
          data-testid="button-sign-in"
          type="submit"
          style={{ marginTop: 22 }}>
          Sign in <ArrowUpRight size={14} />
        </button>
        <div className="login-footer">
          Protected workspace · Medprix Pharmacy Group
        </div>
      </form>
    </main>
  );
}

function AppShell({
  dark,
  setDark,
  onToast,
  onLogout,
  role,
  users,
  setUsers,
  refreshUsers,
}: {
  dark: boolean;
  setDark: (value: boolean) => void;
  onToast: ToastFn;
  onLogout: () => void;
  role: string;
  users: UserRecord[];
  setUsers: (users: UserRecord[]) => void;
  refreshUsers: () => void;
}) {
  const [location] = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const pageName =
    location === "/dashboard"
      ? "Dashboard"
      : (navGroups
          .flatMap((group) => group.items)
          .find((item) => item.href === location)?.label ?? "Dashboard");

  const storedFullName = localStorage.getItem("medprix-fullname");
  const storedUsername = localStorage.getItem("medprix-username");
  const displayName = storedFullName || storedUsername || "User";
  const displayInitials = displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const displayTitle =
    role === "admin"
      ? "Administrator"
      : role === "frontdesk"
        ? "Front Desk"
        : "Cashier";
  const currentUser = {
    initials: displayInitials,
    name: displayName,
    title: displayTitle,
  };

  return (
    <div className="app-shell">
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            <Link
              href="/dashboard"
              className="brand"
              data-testid="link-medprix-home">
              <span className="brand-mark">
                <Pill size={16} strokeWidth={2.4} />
              </span>
              <span>Medprix</span>
            </Link>
          </div>
          <nav
            className="top-nav"
            aria-label="Primary navigation"
            data-testid="nav-primary">
            {navGroups
              .flatMap((group) => group.items)
              .filter((item) => item.roles.includes(role))
              .map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  data-testid={`link-${label.toLowerCase().replaceAll(" ", "-")}`}
                  className={`top-nav-item ${location === href ? "active" : ""}`}>
                  {label}
                </Link>
              ))}
          </nav>
          <div className="top-actions">
            <button
              className="icon-button"
              data-testid="button-theme-toggle"
              aria-label="Toggle dark mode"
              onClick={() => setDark(!dark)}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="user-menu-wrap">
              <button
                className="avatar"
                data-testid="avatar-admin"
                aria-label="User menu"
                onClick={() => setShowUserMenu((v) => !v)}>
                {currentUser.initials}
              </button>
              {showUserMenu && (
                <>
                  <div
                    className="user-menu-backdrop"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="user-menu" data-testid="user-menu">
                    <div className="user-menu-info">
                      <span
                        className="avatar"
                        style={{
                          width: 36,
                          height: 36,
                          border: 0,
                          boxShadow: "none",
                          fontSize: 13,
                        }}>
                        {currentUser.initials}
                      </span>
                      <div>
                        <strong>{currentUser.name}</strong>
                        <span>{currentUser.title}</span>
                      </div>
                    </div>
                    <div className="user-menu-divider" />
                    <button
                      className="user-menu-item danger"
                      data-testid="button-logout"
                      onClick={() => {
                        setShowUserMenu(false);
                        onLogout();
                      }}>
                      <X size={14} /> Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          <Switch>
            <Route path="/">
              {role === "cashier" ? (
                <CashierDashboardPage onToast={onToast} />
              ) : (
                <DashboardPage onToast={onToast} />
              )}
            </Route>
            <Route path="/dashboard">
              {role === "cashier" ? (
                <CashierDashboardPage onToast={onToast} />
              ) : (
                <DashboardPage onToast={onToast} />
              )}
            </Route>
            <Route path="/pos">
              <CashierDashboardPage onToast={onToast} />
            </Route>
            <Route path="/review">
              <CashierReviewPage onToast={onToast} />
            </Route>
            <Route path="/inventory">
              <InventoryPage onToast={onToast} currentRole={role} />
            </Route>
            <Route path="/supplier">
              <SupplierPage onToast={onToast} />
            </Route>
            <Route path="/procurement">
              <ProcurementPage onToast={onToast} />
            </Route>
            <Route path="/wholesale">
              <WholesalePage onToast={onToast} />
            </Route>
            <Route path="/system-ad">
              <SystemAdminPage onToast={onToast} />
            </Route>
            <Route path="/user-management">
              <UserManagementPage
                users={users}
                setUsers={setUsers}
                onToast={onToast}
              />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

const reportCards: {
  type: ReportType;
  title: string;
  description: string;
  action: string;
  icon: LucideIcon;
}[] = [
  {
    type: "sales",
    title: "Daily sales",
    description: "View today's sales performance and payment mix.",
    action: "View report",
    icon: BarChart3,
  },
  {
    type: "inventory",
    title: "Inventory",
    description: "View current stock levels and replenishment needs.",
    action: "View report",
    icon: Package,
  },
  {
    type: "financial",
    title: "Financial summary",
    description: "Understand the month's financial performance.",
    action: "View report",
    icon: CircleDollarSign,
  },
  {
    type: "valuation",
    title: "Stock valuation",
    description: "See the current value held in your inventory.",
    action: "View valuation",
    icon: Boxes,
  },
  {
    type: "movement",
    title: "Product movement",
    description: "Compare fast and slow-moving products.",
    action: "View list",
    icon: RefreshCw,
  },
  {
    type: "cash",
    title: "Cash mismatch",
    description: "Review cash versus recorded sales discrepancies.",
    action: "View alerts",
    icon: FileBarChart,
  },
];

// Ã¢' Ã¢' Ã¢'  Dashboard (now contains all reports) Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢'

function DashboardPage({ onToast }: { onToast: ToastFn }) {
  const [report, setReport] = useState<ReportType | null>(null);
  const [cashDetailRow, setCashDetailRow] = useState<number | null>(null);

  return (
    <div>
      <PageHeading
        title="Hello, Admin!"
        description="Here's the shape of your pharmacy today."
        action={
          <label className="date-control" data-testid="control-date">
            <CalendarDays size={14} />
            <span>Select date</span>
            <input
              type="date"
              aria-label="Select date"
              defaultValue="2026-08-18"
            />
          </label>
        }
      />

      {/* Ã¢' Ã¢'  4 KPI boxes Ã¢ â€™ report summaries, click to open report Ã¢' Ã¢'  */}
      <section className="kpi-grid">
        <Kpi
          label="Daily sales"
          value="₱45,250"
          change="128 transactions"
          icon={BarChart3}
          onClick={() => setReport("sales")}
          testId="card-report-sales"
        />
        <Kpi
          label="Inventory"
          value="850 products"
          change="95 low stock"
          icon={Package}
          onClick={() => setReport("inventory")}
          testId="card-report-inventory"
        />
        <Kpi
          label="Financial"
          value="₱450,000"
          change="₱365K net profit"
          icon={CircleDollarSign}
          onClick={() => setReport("financial")}
          testId="card-report-financial"
        />
        <Kpi
          label="Stock value"
          value="₱825,450"
          change="4,280 units held"
          icon={Boxes}
          onClick={() => setReport("valuation")}
          testId="card-report-valuation"
        />
      </section>

      {/* Ã¢' Ã¢'  Bar chart box Ã¢ â€™ product movement Ã¢' Ã¢'  */}
      <section
        className="surface-card chart-card"
        style={{ cursor: "pointer" }}
        onClick={() => setReport("movement")}
        data-testid="card-report-movement">
        <div className="card-header">
          <div>
            <h2 className="card-title">Product movement</h2>
            <p className="card-subtitle">Units sold · August 2026</p>
          </div>
          <div className="chart-legend">
            <span className="legend-dot" /> Units sold{" "}
            <ArrowUpRight size={13} />
          </div>
        </div>
        <div className="bar-chart">
          {movementFast.concat(movementSlow).map((item, i) => (
            <div className="bar-wrap" key={item.name}>
              <div
                className={`bar ${i === 0 ? "peak" : ""}`}
                style={{ height: `${Math.max((item.units / 250) * 82, 4)}%` }}>
                <span className="bar-value">{item.units}</span>
              </div>
              <span className="bar-label">{item.name.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Ã¢' Ã¢'  Two list cards Ã¢ â€™ cash mismatch + fast movers Ã¢' Ã¢'  */}
      <div className="dashboard-lower">
        {/* Left: cash mismatch */}
        <section className="surface-card list-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Cash mismatch</h2>
              <p className="card-subtitle">2 inconsistencies detected</p>
            </div>
            <button
              className="button soft"
              data-testid="card-report-cash"
              onClick={() => setReport("cash")}>
              View alerts
            </button>
          </div>
          {cashMismatches.map((row, index) => (
            <div className="list-row" key={row.date + row.shift}>
              <div className="row-icon">
                <FileBarChart size={15} />
              </div>
              <div className="row-main">
                <strong>
                  {row.date} · {row.shift} shift
                </strong>
                <span>
                  Expected {row.expected} · Recorded {row.recorded}
                </span>
              </div>
              <span
                className={`pill ${row.type === "short" ? "danger" : "success"}`}>
                {row.difference}
              </span>
              <button
                className="button soft"
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  height: "auto",
                  flexShrink: 0,
                }}
                data-testid={`button-view-cash-details-${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCashDetailRow(index);
                  setReport("cash");
                }}>
                View details <ArrowUpRight size={11} />
              </button>
            </div>
          ))}
        </section>

        {/* Right: Product movement line graph */}
        <section
          className="surface-card list-card"
          data-testid="card-movement-graph">
          <div className="card-header">
            <div>
              <h2 className="card-title">Movement comparison</h2>
              <p className="card-subtitle">Fast vs. slow moving products</p>
            </div>
            <button
              className="button soft"
              data-testid="button-view-movement"
              onClick={() => setReport("movement")}>
              View all
            </button>
          </div>
          <MovementLineGraph />
        </section>
      </div>

      {report && (
        <ReportModal
          type={report}
          initialCashDetailRow={cashDetailRow}
          onClose={() => {
            setReport(null);
            setCashDetailRow(null);
          }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function CashierDashboardPage({ onToast }: { onToast: ToastFn }) {
  const [selectedProductId, setSelectedProductId] = useState(products[0].id);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<
    { id: string; name: string; sku: string; price: number; qty: number }[]
  >([
    {
      id: "p1",
      name: "Paracetamol 500mg",
      sku: "MED-0421",
      price: 5.0,
      qty: 10,
    },
    {
      id: "p4",
      name: "Cough relief syrup",
      sku: "MED-0552",
      price: 145.0,
      qty: 1,
    },
  ]);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "GCash" | "Card">(
    "Cash",
  );
  const [discountType, setDiscountType] = useState<"None" | "Senior" | "PWD">(
    "None",
  );
  const [cashTendered, setCashTendered] = useState<string>("200");
  const [searchReceipt, setSearchReceipt] = useState("");
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

  const [receipts, setReceipts] = useState([
    {
      id: "CS-9401",
      time: "10:14 AM",
      items: 3,
      total: 195.0,
      method: "Cash",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9400",
      time: "09:48 AM",
      items: 1,
      total: 145.0,
      method: "GCash",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9399",
      time: "09:12 AM",
      items: 5,
      total: 520.0,
      method: "Card",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9398",
      time: "08:35 AM",
      items: 2,
      total: 85.0,
      method: "Cash",
      cashier: "Maria Santos",
      status: "Completed",
    },
  ]);

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const isDiscountEligible = discountType !== "None";
  const discountRate = isDiscountEligible ? 0.2 : 0;
  const discountAmount = subtotal * discountRate;
  const vat = isDiscountEligible ? 0 : subtotal * 0.12;
  const total = subtotal - discountAmount + vat;
  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue =
    paymentMethod === "Cash" ? Math.max(0, tenderedNum - total) : 0;

  const handleAddToCart = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;
    const numericPrice =
      parseFloat(prod.price.replace("₱", "").replace(",", "")) || 0;

    const existingIndex = cart.findIndex((item) => item.id === prod.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].qty += qty;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          price: numericPrice,
          qty,
        },
      ]);
    }
    onToast(`Added ${prod.name} (x${qty}) to cart`);
    setQty(1);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as typeof cart,
    );
  };

  const handleCheckout = (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      onToast("Cannot checkout an empty cart");
      return;
    }
    if (paymentMethod === "Cash" && tenderedNum < total) {
      onToast("Cash tendered is less than total amount due");
      return;
    }

    const nextNumber = 9402 + receipts.length - 4;
    const newId = `CS-${nextNumber}`;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const newReceipt = {
      id: newId,
      time: timeStr,
      items: cart.reduce((a, b) => a + b.qty, 0),
      total: total,
      method: paymentMethod,
      discount: discountType,
      cashier: "Maria Santos",
      status: "Completed",
    };

    setReceipts([newReceipt, ...receipts]);
    setCart([]);
    setCashTendered("");
    onToast(
      `Sale completed! Receipt ${newId} printed.${isDiscountEligible ? ` ${discountType} discount applied.` : ""} Change: ₱${changeDue.toFixed(2)}`,
    );
  };

  const filteredReceipts = receipts.filter(
    (r) =>
      r.id.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      r.method.toLowerCase().includes(searchReceipt.toLowerCase()),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeading
        title="Cashier Terminal & Register"
        description="Shift 1 (08:00 AM – 04:00 PM) · Active Terminal #01"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              className="pill success"
              style={{ padding: "6px 12px", fontSize: 12 }}>
              <ShieldCheck size={13} style={{ marginRight: 4 }} /> Register
              Active
            </span>
            <label className="date-control" data-testid="control-cashier-date">
              <CalendarDays size={14} />
              <span>Shift Date</span>
              <input
                type="date"
                aria-label="Select date"
                defaultValue="2026-08-31"
              />
            </label>
          </div>
        }
      />


      {/* Main 2-Column POS Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 18,
          alignItems: "start",
        }}>
        {/* Left Column: Register Terminal Checkout */}
        <section className="surface-card" style={{ padding: 20 }}>
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div>
              <h2
                className="card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShoppingCart size={17} /> Counter Sale Checkout
              </h2>
              <p className="card-subtitle">
                Scan or select products to process transaction
              </p>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                className="button soft"
                style={{ fontSize: 12 }}
                onClick={() => setCart([])}>
                Clear Cart
              </button>
            )}
          </div>

          {/* Product Selection Form */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              marginBottom: 16,
            }}>
            <select
              className="select"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              style={{ width: "100%", height: 38 }}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — {p.price} [Stock: {p.stock}]
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              max="99"
              value={qty}
              onChange={(e) =>
                setQty(Math.max(1, parseInt(e.target.value) || 1))
              }
              style={{
                width: 60,
                height: 38,
                borderRadius: 10,
                border: "1px solid hsl(var(--border))",
                textAlign: "center",
                background: "hsl(var(--surface))",
                color: "hsl(var(--foreground))",
              }}
            />
            <button
              type="button"
              className="button dark"
              style={{ height: 38, padding: "0 14px" }}
              onClick={handleAddToCart}>
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Cart Items Table */}
          <div
            className="table-scroll"
            style={{
              maxHeight: 240,
              minHeight: 140,
              marginBottom: 16,
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
            }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: "center",
                        padding: "30px 0",
                        color: "hsl(var(--muted))",
                      }}>
                      Cart is empty. Select products above to start checkout.
                    </td>
                  </tr>
                ) : (
                  cart.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>
                          {item.sku}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}>
                          <button
                            type="button"
                            className="icon-button"
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              fontSize: 12,
                            }}
                            onClick={() => handleUpdateCartQty(item.id, -1)}>
                            -
                          </button>
                          <span style={{ minWidth: 18, fontWeight: 600 }}>
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            className="icon-button"
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              fontSize: 12,
                            }}
                            onClick={() => handleUpdateCartQty(item.id, 1)}>
                            +
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        ₱{item.price.toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        ₱{(item.price * item.qty).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="icon-button"
                          style={{
                            width: 24,
                            height: 24,
                            border: 0,
                            color: "hsl(var(--danger))",
                          }}
                          onClick={() => handleRemoveFromCart(item.id)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Payment & Checkout Summary */}
          <form
            onSubmit={handleCheckout}
            style={{
              background: "hsl(var(--surface-soft))",
              padding: 14,
              borderRadius: 14,
              border: "1px solid hsl(var(--border))",
            }}>
            <div
              style={{
                display: "grid",
                gap: 8,
                marginBottom: 14,
                fontSize: 13,
              }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "hsl(var(--muted))",
                }}>
                <span>Subtotal</span>
                <span>₱{subtotal.toFixed(2)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "hsl(var(--muted))",
                }}>
                <span>VAT (12% included)</span>
                <span>₱{vat.toFixed(2)}</span>
              </div>
              {isDiscountEligible && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#34C759",
                    fontWeight: 700,
                  }}>
                  <span>{discountType} Discount (20%)</span>
                  <span>-₱{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 17,
                  fontWeight: 700,
                  paddingTop: 6,
                  borderTop: "1px solid hsl(var(--border))",
                }}>
                <span>Total Amount</span>
                <span>₱{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Customer Discount Tabs */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "hsl(var(--muted))",
                  display: "block",
                  marginBottom: 6,
                }}>
                Customer Discount
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["None", "Senior", "PWD"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`button ${discountType === type ? "dark" : "soft"}`}
                    style={{ flex: 1, height: 34, fontSize: 12 }}
                    onClick={() => setDiscountType(type)}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method Tabs */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "hsl(var(--muted))",
                  display: "block",
                  marginBottom: 6,
                }}>
                Payment Method
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["Cash", "GCash", "Card"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`button ${paymentMethod === method ? "dark" : "soft"}`}
                    style={{ flex: 1, height: 34, fontSize: 12 }}
                    onClick={() => setPaymentMethod(method)}>
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Tendered & Change Due */}
            {paymentMethod === "Cash" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 14,
                }}>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "hsl(var(--muted))",
                      display: "block",
                      marginBottom: 4,
                    }}>
                    Cash Tendered
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    style={{
                      width: "100%",
                      height: 36,
                      borderRadius: 10,
                      padding: "0 10px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--surface))",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "hsl(var(--muted))",
                      display: "block",
                      marginBottom: 4,
                    }}>
                    Change Due
                  </label>
                  <div
                    style={{
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 10px",
                      fontWeight: 700,
                      color: changeDue >= 0 ? "#34C759" : "hsl(var(--danger))",
                      background: "hsl(var(--surface))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                    }}>
                    ₱{changeDue.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="button dark full"
              disabled={cart.length === 0}
              style={{ height: 44, fontSize: 14, fontWeight: 600 }}>
              <Receipt size={16} /> Complete &amp; Print Receipt (₱
              {total.toFixed(2)})
            </button>
          </form>
        </section>
      </div>

      {/* Modal: End of Shift Z-Read Confirmation */}
      {showShiftModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowShiftModal(false)}>
          <div
            className="modal dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div>
                <h2>End of Shift Z-Read Report</h2>
                <p className="modal-sub">
                  Confirm shift cash drawer count and generate Z-Report.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowShiftModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: "10px 0",
                fontSize: 13,
              }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                }}>
                <span>Opening Float</span>
                <span>₱3,500.00</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                }}>
                <span>Recorded Cash Sales</span>
                <span>₱5,000.00</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "hsl(var(--surface-soft))",
                  borderRadius: 8,
                  fontWeight: 700,
                }}>
                <span>Expected Drawer Total</span>
                <span>₱8,500.00</span>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="button soft"
                onClick={() => setShowShiftModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="button dark"
                onClick={() => {
                  onToast("Shift closed successfully. Z-Read report printed.");
                  setShowShiftModal(false);
                }}>
                <Check size={14} /> Confirm & Print Z-Read
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MovementLineGraph() {
  const paddingLeft = 35;
  const paddingRight = 15;
  const paddingTop = 25;
  const paddingBottom = 30;
  const chartWidth = 350;
  const chartHeight = 170;

  const width = chartWidth - paddingLeft - paddingRight;
  const height = chartHeight - paddingTop - paddingBottom;

  const maxVal = Math.max(
    ...movementFast.map((d) => d.units),
    ...movementSlow.map((d) => d.units),
    10,
  );
  const yMax = maxVal * 1.15;

  const getX = (index: number) => paddingLeft + (index / 2) * width;
  const getY = (val: number) => paddingTop + height - (val / yMax) * height;

  const fastPoints = movementFast.map((d, i) => ({
    x: getX(i),
    y: getY(d.units),
    label: d.units,
    name: d.name,
  }));
  const slowPoints = movementSlow.map((d, i) => ({
    x: getX(i),
    y: getY(d.units),
    label: d.units,
    name: d.name,
  }));

  const fastPath = `M ${fastPoints[0].x} ${fastPoints[0].y} L ${fastPoints[1].x} ${fastPoints[1].y} L ${fastPoints[2].x} ${fastPoints[2].y}`;
  const slowPath = `M ${slowPoints[0].x} ${slowPoints[0].y} L ${slowPoints[1].x} ${slowPoints[1].y} L ${slowPoints[2].x} ${slowPoints[2].y}`;

  return (
    <div style={{ padding: "5px 0 0" }}>
      <div
        style={{
          display: "flex",
          gap: 15,
          fontSize: 10,
          color: "hsl(var(--muted))",
          marginBottom: 15,
          justifyContent: "center",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 3,
              background: "hsl(var(--foreground))",
            }}
          />
          <span style={{ fontWeight: 500 }}>Fast Movers</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 3,
              borderTop: "2.5px dashed hsl(var(--muted))",
            }}
          />
          <span style={{ fontWeight: 500 }}>Slow Movers</span>
        </div>
      </div>
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ overflow: "visible" }}>
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const val = Math.round(yMax * ratio);
          const y = paddingTop + height - ratio * height;
          return (
            <g key={ratio} style={{ opacity: 0.15 }}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="hsl(var(--foreground))"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={paddingLeft - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9px"
                fill="hsl(var(--foreground))">
                {val}
              </text>
            </g>
          );
        })}

        {/* Lines */}
        <path
          d={fastPath}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={slowPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Fast points & labels */}
        {fastPoints.map((p, i) => (
          <g key={`fast-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={4.5}
              fill="hsl(var(--surface))"
              stroke="hsl(var(--foreground))"
              strokeWidth={2.5}
            />
            <text
              x={p.x}
              y={p.y - 10}
              textAnchor="middle"
              fontSize="9px"
              fontWeight="600"
              fill="hsl(var(--foreground))">
              {p.label}
            </text>
            {/* Show short label above Y-axis or next to X-axis */}
          </g>
        ))}

        {/* Slow points & labels */}
        {slowPoints.map((p, i) => (
          <g key={`slow-${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill="hsl(var(--surface))"
              stroke="hsl(var(--muted))"
              strokeWidth={1.5}
            />
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="9px"
              fontWeight="500"
              fill="hsl(var(--muted))">
              {p.label}
            </text>
          </g>
        ))}

        {/* X Axis Labels */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <text
              x={getX(i)}
              y={paddingTop + height + 15}
              textAnchor="middle"
              fontSize="9px"
              fill="hsl(var(--foreground))"
              fontWeight="600">
              {`Rank ${i + 1}`}
            </text>
            <text
              x={getX(i)}
              y={paddingTop + height + 26}
              textAnchor="middle"
              fontSize="8.5px"
              fill="hsl(var(--muted))"
              style={{ maxWidth: 80 }}>
              {movementFast[i].name.split(" ")[0]} /{" "}
              {movementSlow[i].name.split(" ")[0]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Kpi({
  label,
  value,
  change,
  icon: Icon,
  onClick,
  testId,
}: {
  label: string;
  value: string;
  change: string;
  icon: LucideIcon;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <div
      className="surface-card kpi-card"
      data-testid={testId ?? `metric-${label.toLowerCase()}`}
      onClick={onClick}
      style={
        onClick
          ? { cursor: "pointer", transition: "transform .2s, box-shadow .2s" }
          : undefined
      }
      onMouseEnter={
        onClick
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform =
                "translateY(-3px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "var(--shadow-lift)";
            }
          : undefined
      }
      onMouseLeave={
        onClick
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "";
            }
          : undefined
      }>
      <div className="kpi-top">
        <span>{label}</span>
        <span className="kpi-icon">
          <Icon size={15} />
        </span>
      </div>
      <div className="kpi-value">
        {value}
        <span className="kpi-change">{change}</span>
      </div>
    </div>
  );
}

// Ã¢' Ã¢' Ã¢'  Report helpers Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢'

function exportReport(type: ReportType, onToast: ToastFn) {
  const content = `Medprix ${type} report\nGenerated August 18, 2026\n\nThis local report contains the latest pharmacy operations snapshot.`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  link.download = `medprix-${type}-report.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
  onToast("Report exported successfully");
}

function ReportModal({
  type,
  initialCashDetailRow = null,
  onClose,
  onToast,
}: {
  type: ReportType;
  initialCashDetailRow?: number | null;
  onClose: () => void;
  onToast: ToastFn;
}) {
  const [movementTab, setMovementTab] = useState<"fast" | "slow">("fast");
  const [cashDetailRow, setCashDetailRow] = useState<number | null>(
    initialCashDetailRow,
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const titles: Record<ReportType, string> = {
    sales: "Daily sales report",
    inventory: "Inventory report",
    financial: "Financial summary",
    valuation: "Stock valuation",
    movement: "Product movement",
    cash:
      cashDetailRow !== null
        ? `Cash mismatch \u2013 ${cashMismatches[cashDetailRow].date} ${cashMismatches[cashDetailRow].shift} shift`
        : "Cash mismatch alerts",
  };

  return createPortal(
    <div
      className="modal-backdrop"
      data-testid="modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        data-testid={`modal-report-${type}`}>
        <div className="modal-header">
          <div>
            <h2>{titles[type]}</h2>
            <p className="modal-sub">
              {cashDetailRow !== null
                ? `Shift reconciliation · ${cashMismatches[cashDetailRow].date} · Medprix Central`
                : type === "financial"
                  ? "Period: August 2026"
                  : "August 18, 2026 · Medprix Central"}
            </p>
          </div>
          {cashDetailRow !== null ? (
            <button
              className="button soft"
              style={{ marginRight: 8 }}
              onClick={() => setCashDetailRow(null)}>
              ← Back
            </button>
          ) : null}
          <button
            className="modal-close"
            data-testid="button-close-modal"
            onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Sales */}
        {type === "sales" && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Total sales" value="₱45,250" />
              <ReportMetric label="Transactions" value="128" />
              <ReportMetric label="Products sold" value="356" />
            </div>
            <ModalSection title="Payment method">
              <ModalRow label="Cash" value="₱25,000" />
              <ModalRow label="Card" value="₱12,500" />
              <ModalRow label="E-wallet" value="₱7,750" />
            </ModalSection>
          </>
        )}

        {/* Inventory */}
        {type === "inventory" && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Total products" value="850" />
              <ReportMetric label="In stock" value="720" />
              <ReportMetric label="Low stock" value="95" />
            </div>
            <ModalSection title="Stock watchlist">
              <ModalTable
                headers={["Product", "Stock", "Status"]}
                rows={products
                  .slice(0, 3)
                  .map((p) => [p.name, String(p.stock), p.status])}
              />
            </ModalSection>
          </>
        )}

        {/* Financial */}
        {type === "financial" && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Total sales" value="₱450,000" />
              <ReportMetric label="Expenses" value="₱85,000" />
              <ReportMetric label="Net profit" value="₱365,000" />
            </div>
            <ModalSection title="Summary">
              <ModalRow label="Gross margin" value="81.1%" />
              <ModalRow label="Operating expenses" value="₱85,000" />
              <ModalRow label="Net profit margin" value="81.1%" />
            </ModalSection>
          </>
        )}

        {/* Valuation */}
        {type === "valuation" && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Current stock value" value="₱825,450" />
              <ReportMetric label="Units held" value="4,280" />
              <ReportMetric label="SKUs tracked" value="850" />
            </div>
            <ModalSection title="Value by product">
              <ModalTable
                headers={["Product", "Qty", "Value"]}
                rows={[
                  ["Paracetamol", "120", "₱600"],
                  ["Amoxicillin", "80", "₱960"],
                  ["Vitamin C", "50", "₱400"],
                ]}
              />
            </ModalSection>
          </>
        )}

        {/* Movement */}
        {type === "movement" && (
          <>
            <div className="modal-tabs">
              <button
                className={`modal-tab ${movementTab === "fast" ? "active" : ""}`}
                data-testid="tab-fast-moving"
                onClick={() => setMovementTab("fast")}>
                Fast moving
              </button>
              <button
                className={`modal-tab ${movementTab === "slow" ? "active" : ""}`}
                data-testid="tab-slow-moving"
                onClick={() => setMovementTab("slow")}>
                Slow moving
              </button>
            </div>
            <ModalTable
              headers={["Product", "Units sold"]}
              rows={(movementTab === "fast" ? movementFast : movementSlow).map(
                (item) => [item.name, String(item.units)],
              )}
            />
          </>
        )}

        {/* Cash mismatch Ã¢ ' list view */}
        {type === "cash" && cashDetailRow === null && (
          <>
            <div className="report-metrics">
              <ReportMetric label="Open alerts" value="2" />
              <ReportMetric label="Short" value="₱500" />
              <ReportMetric label="Over" value="₱1,000" />
            </div>
            <ModalSection
              title={`${cashMismatches.length} inconsistencies detected`}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Expected</th>
                    <th>Recorded</th>
                    <th>Difference</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cashMismatches.map((row, index) => (
                    <tr key={row.date + row.shift}>
                      <td>{row.date}</td>
                      <td>{row.shift}</td>
                      <td>{row.expected}</td>
                      <td>{row.recorded}</td>
                      <td
                        style={{
                          color: row.type === "short" ? "#ff8a7a" : "#7ed2a0",
                          fontWeight: 600,
                        }}>
                        {row.difference}
                      </td>
                      <td>
                        <button
                          className="button soft"
                          style={{
                            fontSize: 11,
                            padding: "4px 10px",
                            height: "auto",
                          }}
                          data-testid={`button-view-cash-details-${index}`}
                          onClick={() => setCashDetailRow(index)}>
                          View details <ArrowUpRight size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ModalSection>
          </>
        )}

        {/* Cash mismatch Ã¢ ' detail view for a specific row */}
        {type === "cash" &&
          cashDetailRow !== null &&
          (() => {
            const row = cashMismatches[cashDetailRow];
            return (
              <>
                <ModalSection title="Shift reconciliation">
                  <ModalRow
                    label="Date"
                    value={`August ${row.date.split(" ")[1]}, 2026`}
                  />
                  <ModalRow label="Shift" value={row.shift} />
                  <ModalRow label="Recorded sales" value={row.expected} />
                  <ModalRow label="Expected cash" value={row.expected} />
                  <ModalRow label="Actual cash" value={row.recorded} />
                  <ModalRow label="Difference" value={row.difference} />
                </ModalSection>
                <div
                  style={{
                    marginTop: 16,
                    padding: 13,
                    borderRadius: 12,
                    background: row.type === "short" ? "#30272b" : "#23302a",
                    color: row.type === "short" ? "#ffb5ad" : "#7ed2a0",
                    fontSize: 12,
                  }}>
                  {row.type === "short"
                    ? `Cash is ${row.difference.replace("-", "")} short. Review the register transactions before closing the shift.`
                    : `Cash is ${row.difference} over. Verify receipts and confirm no duplicate entries.`}
                </div>
                <div className="modal-actions">
                  <button
                    className="button dark"
                    data-testid="button-view-transactions"
                    onClick={() =>
                      onToast(
                        `Showing register transactions for the ${row.shift.toLowerCase()} shift`,
                      )
                    }>
                    View transactions <ArrowUpRight size={13} />
                  </button>
                </div>
              </>
            );
          })()}

        {type !== "cash" && (
          <div className="modal-actions">
            <button
              className="button dark"
              data-testid="button-export-report"
              onClick={() => exportReport(type, onToast)}>
              <Download size={14} /> Export report
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function ModalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="modal-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}
function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="modal-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function ModalTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row[0]}-${index}`}>
            {row.map((cell, cellIndex) => (
              <td key={`${cell}-${cellIndex}`}>
                {cellIndex === row.length - 1 &&
                (cell.includes("stock") || cell.includes("Available")) ? (
                  <span className="pill success">{cell}</span>
                ) : (
                  cell
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CashierReviewPage({ onToast }: { onToast: ToastFn }) {
  const [activeModal, setActiveModal] = useState<"sales" | "drawer" | "transactions" | "till" | null>(null);

  // Modal body scroll lock
  useEffect(() => {
    if (activeModal) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [activeModal]);

  const [searchReceipt, setSearchReceipt] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<{
    id: string;
    time: string;
    items: number;
    itemsSummary: string;
    total: string;
    method: string;
    cashier: string;
    status: string;
  } | null>(null);

  const shiftReceipts = [
    {
      id: "CS-9401",
      time: "10:14 AM",
      items: 3,
      itemsSummary: "Paracetamol 500mg (2), Vitamin C 1000mg (1)",
      total: "₱195.00",
      method: "Cash",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9400",
      time: "09:48 AM",
      items: 1,
      itemsSummary: "Cough relief syrup 120ml (1)",
      total: "₱145.00",
      method: "GCash",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9399",
      time: "09:12 AM",
      items: 5,
      itemsSummary: "Amoxicillin 500mg Box (1), Cetirizine 10mg (4)",
      total: "₱520.00",
      method: "Card",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "CS-9398",
      time: "08:35 AM",
      items: 3,
      itemsSummary: "Mefenamic Acid 500mg (2), Antacid Chewable (1)",
      total: "₱85.00",
      method: "Cash",
      cashier: "Maria Santos",
      status: "Completed",
    },
    {
      id: "TRX-0005",
      time: "11:20 AM",
      items: 15,
      itemsSummary: "Sterile Normal Saline (5), Surgical Gloves Box (10)",
      total: "₱18,450.00",
      method: "Cash",
      cashier: "Maria Santos",
      status: "Completed",
    },
  ];

  const filteredShiftReceipts = shiftReceipts.filter(
    (r) =>
      r.id.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      r.method.toLowerCase().includes(searchReceipt.toLowerCase()) ||
      r.itemsSummary.toLowerCase().includes(searchReceipt.toLowerCase()),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeading
        title="Shift review & register operations"
        description="Select any of the 4 register features to view shift sales, drawer balance, handled transactions, or till status."
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="pill success" style={{ padding: "6px 12px", fontSize: 12 }}>
              <ShieldCheck size={13} style={{ marginRight: 4 }} /> Terminal #01 · Active
            </span>
            <label className="date-control" data-testid="control-cashier-date">
              <CalendarDays size={14} />
              <span>September 1, 2026</span>
            </label>
          </div>
        }
      />

      {/* 4 Feature Boxes Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        {/* 1. Today's Shift Sales */}
        <div
          className="surface-card"
          style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
          onClick={() => setActiveModal("sales")}
          data-testid="card-feature-shift-sales"
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "hsl(var(--surface-soft))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--foreground))" }}>
                <Receipt size={18} />
              </div>
              <span className="pill neutral" style={{ fontSize: 10 }}>Feature 1</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Today's Shift Sales</h3>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              View total sales made during your active shift, receipt counts, and revenue breakdown by payment method.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>₱19,395.00</div>
              <span className="muted" style={{ fontSize: 11 }}>5 receipts completed</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
              Open feature <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        {/* 2. Cash in Drawer */}
        <div
          className="surface-card"
          style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
          onClick={() => setActiveModal("drawer")}
          data-testid="card-feature-cash-drawer"
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "hsl(var(--surface-soft))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--foreground))" }}>
                <CircleDollarSign size={18} />
              </div>
              <span className="pill neutral" style={{ fontSize: 10 }}>Feature 2</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Cash in Drawer</h3>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Monitor physical cash float, incoming cash transactions, mid-day safe drops, and expected cash in the register.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>₱11,780.00</div>
              <span className="muted" style={{ fontSize: 11 }}>Float: ₱5,000 · Cash sales: ₱8,780</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
              Open feature <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        {/* 3. Shift Receipts Log */}
        <div
          className="surface-card"
          style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
          onClick={() => setActiveModal("transactions")}
          data-testid="card-feature-shift-receipts-log"
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "hsl(var(--surface-soft))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--foreground))" }}>
                <Receipt size={18} />
              </div>
              <span className="pill neutral" style={{ fontSize: 10 }}>Feature 3</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Shift Receipts Log</h3>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Transactions recorded during current shift. Search receipt numbers, inspect itemized sales, and audit cashier receipts.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>5 Receipts Logged</div>
              <span className="muted" style={{ fontSize: 11 }}>Total ₱19,395.00 recorded</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
              Open feature <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        {/* 4. Till Status */}
        <div
          className="surface-card"
          style={{ padding: 22, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid hsl(var(--border))", borderRadius: 16 }}
          onClick={() => setActiveModal("till")}
          data-testid="card-feature-till-status"
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "hsl(var(--surface-soft))", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--foreground))" }}>
                <ShieldCheck size={18} />
              </div>
              <span className="pill neutral" style={{ fontSize: 10 }}>Feature 4</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Till Status</h3>
            <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              Check live cash till balance status (Balanced, Over, Short), discrepancy checks, and supervisor verification logs.
            </p>
          </div>

          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="pill success" style={{ fontSize: 11 }}>Balanced</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>₱0.00 variance</span>
              </div>
              <span className="muted" style={{ fontSize: 11 }}>Verified 2:00 PM today</span>
            </div>
            <button className="button dark" style={{ padding: "6px 14px", fontSize: 11 }}>
              Open feature <ArrowUpRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. TODAY'S SHIFT SALES MODAL */}
      {/* ========================================================================= */}
      {activeModal === "sales" && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
        >
          <div className="modal" style={{ width: "min(680px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Today's Shift Sales</h2>
                <p className="modal-sub">Sales performance summary for Maria Santos (Shift #1)</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveModal(null)}
                data-testid="button-close-sales-modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Shift Overview Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Total shift sales</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>₱19,395.00</strong>
                <span style={{ color: "#34C759", fontSize: 10, fontWeight: 600 }}>Across all payment modes</span>
              </div>
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Transactions</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>5 Orders</strong>
                <span className="muted" style={{ fontSize: 10 }}>Completed shifts</span>
              </div>
              <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "14px 16px" }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Average basket</span>
                <strong style={{ display: "block", fontSize: 20, marginTop: 4, color: "hsl(var(--foreground))", letterSpacing: "-.04em" }}>₱3,879.00</strong>
                <span className="muted" style={{ fontSize: 10 }}>Per customer</span>
              </div>
            </div>

            {/* Sales Breakdown by Payment Method */}
            <div style={{ marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Payment Method Breakdown
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Cash</span>
                    <span className="pill success" style={{ fontSize: 9 }}>3 sales</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>₱18,730.00</strong>
                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>96.5% of total</div>
                </div>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>GCash</span>
                    <span className="pill neutral" style={{ fontSize: 9 }}>1 sale</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>₱145.00</strong>
                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>0.7% of total</div>
                </div>
                <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, padding: "12px 14px", background: "hsl(var(--surface))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Card</span>
                    <span className="pill neutral" style={{ fontSize: 9 }}>1 sale</span>
                  </div>
                  <strong style={{ fontSize: 16 }}>₱520.00</strong>
                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>2.8% of total</div>
                </div>
              </div>
            </div>

            {/* Completed Transactions Table */}
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Completed Shift Transactions
              </h4>
              <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt ID</th>
                      <th>Time</th>
                      <th>Items</th>
                      <th>Payment</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftTransactions.map((trx) => (
                      <tr key={trx.id}>
                        <td><strong>{trx.id}</strong></td>
                        <td className="muted">{trx.time}</td>
                        <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trx.itemsSummary}</td>
                        <td><span className="pill neutral">{trx.method}</span></td>
                        <td style={{ textAlign: "right" }}><strong>{trx.total}</strong></td>
                        <td><span className="pill success">{trx.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 2. CASH IN DRAWER MODAL */}
      {/* ========================================================================= */}
      {activeModal === "drawer" && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
        >
          <div className="modal" style={{ width: "min(640px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Cash in Drawer</h2>
                <p className="modal-sub">Cash drawer audit and denominations count · Terminal #01</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveModal(null)}
                data-testid="button-close-drawer-modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Expected Cash Card */}
            <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", padding: "16px 18px", borderRadius: 14, marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Drawer Reconciliation Breakdown
              </h4>
              <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Opening cash / float (08:00 AM):</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>₱5,000.00</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Cash received from transactions:</span>
                  <strong style={{ color: "#34C759" }}>+₱8,780.00</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Mid-day cash drop (Transferred to main safe):</span>
                  <strong style={{ color: "#FF3B30" }}>-₱2,000.00</strong>
                </div>
                <div style={{ height: 1, background: "hsl(var(--border))", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                  <strong style={{ color: "hsl(var(--foreground))" }}>Current Expected Cash:</strong>
                  <strong style={{ color: "hsl(var(--foreground))" }}>₱11,780.00</strong>
                </div>
              </div>
            </div>

            {/* Physical Cash Denominations Table */}
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Drawer Count Reference (Denominations)
              </h4>
              <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Denomination</th>
                      <th style={{ textAlign: "center" }}>Count</th>
                      <th style={{ textAlign: "right" }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>₱1,000 Bill</td><td style={{ textAlign: "center" }}>8</td><td style={{ textAlign: "right" }}>₱8,000.00</td></tr>
                    <tr><td>₱500 Bill</td><td style={{ textAlign: "center" }}>5</td><td style={{ textAlign: "right" }}>₱2,500.00</td></tr>
                    <tr><td>₱100 Bill</td><td style={{ textAlign: "center" }}>10</td><td style={{ textAlign: "right" }}>₱1,000.00</td></tr>
                    <tr><td>₱50 Bill</td><td style={{ textAlign: "center" }}>4</td><td style={{ textAlign: "right" }}>₱200.00</td></tr>
                    <tr><td>₱20 Bill</td><td style={{ textAlign: "center" }}>3</td><td style={{ textAlign: "right" }}>₱60.00</td></tr>
                    <tr><td>Coins &amp; Loose Change</td><td style={{ textAlign: "center" }}>-</td><td style={{ textAlign: "right" }}>₱20.00</td></tr>
                    <tr style={{ background: "hsl(var(--surface-soft))" }}>
                      <td><strong>Total Physical Count</strong></td>
                      <td style={{ textAlign: "center" }}><strong>30 units</strong></td>
                      <td style={{ textAlign: "right" }}><strong>₱11,780.00</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 3. SHIFT RECEIPTS LOG MODAL (REPLACING TRANSACTIONS HANDLED) */}
      {/* ========================================================================= */}
      {activeModal === "transactions" && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
        >
          <div className="modal" style={{ width: "min(760px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Shift Receipts Log</h2>
                <p className="modal-sub">Receipts and transactions recorded during current shift (Maria Santos · Terminal #01)</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveModal(null)}
                data-testid="button-close-trx-handled-modal"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div className="search-wrap" style={{ width: 240 }}>
                <Search size={14} />
                <input
                  type="search"
                  placeholder="Search receipt #, method..."
                  value={searchReceipt}
                  onChange={(e) => setSearchReceipt(e.target.value)}
                  style={{ height: 32, fontSize: 11 }}
                />
              </div>
              <span className="muted" style={{ fontSize: 11 }}>
                Showing {filteredShiftReceipts.length} recorded receipt(s)
              </span>
            </div>

            <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto", maxHeight: 380 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Time</th>
                    <th>Items</th>
                    <th>Method</th>
                    <th style={{ textAlign: "right" }}>Total Amount</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredShiftReceipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.id}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>{r.items} items</div>
                      </td>
                      <td className="muted">{r.time}</td>
                      <td style={{ fontSize: 11 }}>{r.itemsSummary}</td>
                      <td>
                        <span className={`pill ${r.method === "Cash" ? "success" : "neutral"}`} style={{ fontSize: 10, padding: "2px 8px" }}>
                          {r.method}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{r.total}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          style={{ width: 26, height: 26 }}
                          title="View Receipt Details"
                          onClick={() => setSelectedReceipt(r)}
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredShiftReceipts.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: 24 }} className="muted">
                        No shift receipts match that search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 4. TILL STATUS MODAL */}
      {/* ========================================================================= */}
      {activeModal === "till" && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setActiveModal(null)}
        >
          <div className="modal" style={{ width: "min(620px, 100%)" }}>
            <div className="modal-header">
              <div>
                <h2>Till Status &amp; Cash Reconciliation</h2>
                <p className="modal-sub">Register Terminal #01 cash audit and status</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveModal(null)}
                data-testid="button-close-till-modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Current Till Status Card */}
            <div style={{ background: "hsl(var(--surface-soft))", border: "1px solid hsl(var(--border))", padding: "16px 18px", borderRadius: 14, marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Till Status Summary
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, fontSize: 12 }}>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Till Status:</span>
                  <span className="pill success" style={{ fontSize: 11 }}>Balanced</span>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Discrepancy (Over / Short):</span>
                  <strong style={{ color: "#34C759" }}>₱0.00 (Balanced)</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Expected Cash:</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>₱11,780.00</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Physical Count:</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>₱11,780.00</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Last Verification Time:</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>September 1, 2026 – 2:00 PM</strong>
                </div>
                <div>
                  <span className="muted" style={{ display: "block", fontSize: 11, marginBottom: 2 }}>Verified by Supervisor:</span>
                  <strong style={{ color: "hsl(var(--foreground))" }}>Juan Dela Cruz (Admin)</strong>
                </div>
              </div>
            </div>

            {/* Verification History Log */}
            <div>
              <h4 style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "hsl(var(--muted))", fontWeight: 700 }}>
                Till Reconciliation History (Today)
              </h4>
              <div className="table-scroll" style={{ border: "1px solid hsl(var(--border))", borderRadius: 12, overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Expected</th>
                      <th>Counted</th>
                      <th>Variance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>08:00 AM (Opening)</td>
                      <td>₱5,000.00</td>
                      <td>₱5,000.00</td>
                      <td>₱0.00</td>
                      <td><span className="pill success">Balanced</span></td>
                    </tr>
                    <tr>
                      <td>12:00 PM (Midday Check)</td>
                      <td>₱8,280.00</td>
                      <td>₱8,280.00</td>
                      <td>₱0.00</td>
                      <td><span className="pill success">Balanced</span></td>
                    </tr>
                    <tr>
                      <td>02:00 PM (Afternoon Audit)</td>
                      <td>₱11,780.00</td>
                      <td>₱11,780.00</td>
                      <td>₱0.00</td>
                      <td><span className="pill success">Balanced</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Nested Receipt Details Modal */}
      {selectedReceipt &&
        createPortal(
          <div
            className="modal-backdrop"
            onClick={() => setSelectedReceipt(null)}
            style={{ zIndex: 1100 }}>
            <div
              className="modal dialog"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <div>
                  <h2>Receipt Details ({selectedReceipt.id})</h2>
                  <p className="modal-sub">
                    Processed at {selectedReceipt.time} by{" "}
                    {selectedReceipt.cashier}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelectedReceipt(null)}>
                  <X size={16} />
                </button>
              </div>
              <div
                style={{
                  padding: "14px 0",
                  display: "grid",
                  gap: 8,
                  fontSize: 13,
                  borderTop: "1px solid hsl(var(--border))",
                  borderBottom: "1px solid hsl(var(--border))",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Transaction Status</span>
                  <span className="pill success">{selectedReceipt.status}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Payment Method</span>
                  <strong>{selectedReceipt.method}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">Items Summary</span>
                  <span
                    style={{
                      fontSize: 11,
                      textAlign: "right",
                      maxWidth: 220,
                    }}>
                    {selectedReceipt.itemsSummary}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 16,
                    fontWeight: 700,
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: "1px solid hsl(var(--border))",
                  }}>
                  <span>Total Paid</span>
                  <span>{selectedReceipt.total}</span>
                </div>
              </div>
              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="button soft"
                  onClick={() => setSelectedReceipt(null)}>
                  Close
                </button>
                <button
                  type="button"
                  className="button dark"
                  onClick={() => {
                    onToast(`Re-printing receipt ${selectedReceipt.id}...`);
                    setSelectedReceipt(null);
                  }}>
                  <Download size={13} /> Re-print Receipt
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function getBatchExpiryStatus(expiryDateStr: string, qty: number) {
  if (qty <= 0) return { status: "Depleted", tone: "neutral" };
  const expiry = new Date(expiryDateStr);
  const now = new Date("2026-09-18T00:00:00");
  if (isNaN(expiry.getTime())) return { status: "Valid", tone: "success" };
  if (expiry < now) return { status: "Expired", tone: "danger" };
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 60) return { status: "Expiring Soon", tone: "warning" };
  return { status: "Valid", tone: "success" };
}

function getProductTotalStock(product: ProductItem): number {
  return product.batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
}

function getProductStatusData(product: ProductItem) {
  const stock = getProductTotalStock(product);
  const now = new Date("2026-09-18T00:00:00");

  const expiredBatches = product.batches.filter((b) => {
    const exp = new Date(b.expiryDate);
    return !isNaN(exp.getTime()) && exp < now && Number(b.quantity) > 0;
  });

  const expiringSoonBatches = product.batches.filter((b) => {
    const exp = new Date(b.expiryDate);
    if (isNaN(exp.getTime()) || exp < now || Number(b.quantity) <= 0) return false;
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 60;
  });

  let statusLabel = "In Stock";
  let statusTone: "success" | "warning" | "danger" = "success";

  if (expiredBatches.length > 0) {
    statusLabel = "Expired";
    statusTone = "danger";
  } else if (stock === 0) {
    statusLabel = "Out of Stock";
    statusTone = "danger";
  } else if (expiringSoonBatches.length > 0) {
    statusLabel = "Expiring Soon";
    statusTone = "warning";
  } else if (stock <= product.reorder) {
    statusLabel = "Low Stock";
    statusTone = "warning";
  }

  const activeBatches = product.batches.filter((b) => Number(b.quantity) > 0);
  const sortedBatches = [...(activeBatches.length > 0 ? activeBatches : product.batches)].sort(
    (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
  );
  const primaryExpiry = sortedBatches[0]?.expiryDate || "N/A";

  return {
    stock,
    statusLabel,
    statusTone,
    isLowStock: stock <= product.reorder && stock > 0,
    isOutOfStock: stock === 0,
    isExpired: expiredBatches.length > 0,
    isExpiringSoon: expiringSoonBatches.length > 0,
    expiredBatches,
    expiringSoonBatches,
    primaryExpiry,
  };
}

function InventoryPage({
  onToast,
  currentRole,
}: {
  onToast: ToastFn;
  currentRole?: string;
}) {
  const role = (
    currentRole ||
    localStorage.getItem("medprix-role") ||
    "admin"
  ).toLowerCase();

  const isAdmin = role === "admin";
  const isFrontDesk = role === "frontdesk";
  const isCashier = role === "cashier";

  const canViewAlerts = isAdmin || isFrontDesk;
  const canAddProduct = isAdmin || isFrontDesk;
  const canEditProduct = isAdmin || isFrontDesk;
  const canAddBatch = isAdmin || isFrontDesk;
  const canAddFullBatchInfo = isAdmin;
  const canRecordStockIn = isAdmin || isCashier;
  const canRecordStockOut = isAdmin || isCashier;

  // Inventory items state
  const [items, setItems] = useState<ProductItem[]>(products);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [categoryFilter, setCategoryFilter] = useState("All categories");

  // Fetch inventory from backend
  const fetchInventory = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("http://localhost:5000/api/inventory");
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.products && Array.isArray(data.products)) {
          setItems(data.products);
          setIsBackendConnected(true);
        }
      } else {
        setIsBackendConnected(false);
      }
    } catch (err) {
      console.warn("Backend not reachable, using offline cache:", err);
      setIsBackendConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Modals state
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<ProductItem | null>(null);
  const [editProduct, setEditProduct] = useState<ProductItem | null>(null);
  const [batchProduct, setBatchProduct] = useState<ProductItem | null>(null);
  const [stockInProduct, setStockInProduct] = useState<ProductItem | null>(null);
  const [stockOutProduct, setStockOutProduct] = useState<ProductItem | null>(null);

  // Forms state
  const [newProd, setNewProd] = useState({
    name: "",
    genericName: "",
    sku: "",
    category: "Pain relief",
    price: "₱",
    reorder: "20",
    batchNumber: "B2026-01",
    quantity: "50",
    expiryDate: "2027-12-31",
    mfgDate: "2025-12-01",
    dateReceived: "2025-12-10",
    supplier: "Southstar Distribution",
  });

  const [editProdData, setEditProdData] = useState({
    name: "",
    genericName: "",
    sku: "",
    category: "Pain relief",
    price: "",
    reorder: "",
  });

  const [newBatchData, setNewBatchData] = useState({
    batchNumber: "",
    quantity: "",
    expiryDate: "",
    mfgDate: "2025-01-01",
    dateReceived: new Date().toISOString().slice(0, 10),
    supplier: "Southstar Distribution",
  });

  const [stockInData, setStockInData] = useState({
    batchNumber: "",
    quantity: "",
    date: new Date().toISOString().slice(0, 10),
    reason: "Procurement Delivery",
  });

  const [stockOutData, setStockOutData] = useState({
    batchNumber: "",
    quantity: "",
    date: new Date().toISOString().slice(0, 10),
    reason: "Dispensed / Sales",
  });

  // Body scroll locking and Escape key handling when any modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(
      viewProduct ||
      editProduct ||
      batchProduct ||
      stockInProduct ||
      stockOutProduct ||
      isAddProductOpen
    );

    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewProduct(null);
        setEditProduct(null);
        setBatchProduct(null);
        setStockInProduct(null);
        setStockOutProduct(null);
        setIsAddProductOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    viewProduct,
    editProduct,
    batchProduct,
    stockInProduct,
    stockOutProduct,
    isAddProductOpen,
  ]);

  // Derived low-stock & expired items for alerts
  const lowStockItems = items.filter((p) => {
    const info = getProductStatusData(p);
    return info.isLowStock || info.isOutOfStock;
  });

  const expiredItems = items.filter((p) => {
    const info = getProductStatusData(p);
    return info.isExpired;
  });

  const expiringSoonItems = items.filter((p) => {
    const info = getProductStatusData(p);
    return info.isExpiringSoon && !info.isExpired;
  });

  // Filtered products list
  const filtered = items.filter((product) => {
    const info = getProductStatusData(product);
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      product.name.toLowerCase().includes(q) ||
      product.genericName.toLowerCase().includes(q) ||
      product.sku.toLowerCase().includes(q) ||
      product.category.toLowerCase().includes(q) ||
      product.batches.some((b) => b.batchNumber.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === "All statuses" ||
      (statusFilter === "In Stock" && info.statusLabel === "In Stock") ||
      (statusFilter === "Low Stock" && (info.isLowStock || info.statusLabel === "Low Stock")) ||
      (statusFilter === "Out of Stock" && info.isOutOfStock) ||
      (statusFilter === "Expiring Soon" && info.isExpiringSoon) ||
      (statusFilter === "Expired" && info.isExpired);

    const matchesCategory =
      categoryFilter === "All categories" || product.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Categories list
  const categories = [
    "All categories",
    "Pain relief",
    "Antibiotics",
    "Vitamins",
    "Respiratory",
    "Allergy",
    "Dermatology",
    "Gastrointestinal",
    "Cardiovascular",
  ];

  // Summary counts
  const totalStockCount = items.reduce(
    (sum, p) => sum + getProductTotalStock(p),
    0,
  );

  // Handlers
  const handleOpenAddProduct = () => {
    setNewProd({
      name: "",
      genericName: "",
      sku: `MED-${Math.floor(1000 + Math.random() * 9000)}`,
      category: "Pain relief",
      price: "₱10.00",
      reorder: "20",
      batchNumber: `B${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`,
      quantity: "50",
      expiryDate: "2027-12-31",
      mfgDate: "2025-12-01",
      dateReceived: new Date().toISOString().slice(0, 10),
      supplier: "Southstar Distribution",
    });
    setIsAddProductOpen(true);
  };

  const handleSaveNewProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProd.name.trim() || !newProd.sku.trim()) {
      onToast("Product name and code (SKU) are required");
      return;
    }

    const priceFormatted = newProd.price.startsWith("₱")
      ? newProd.price
      : `₱${parseFloat(newProd.price.replace(/[^\d.]/g, "") || "0").toFixed(2)}`;

    const parsedQty = parseInt(newProd.quantity, 10) || 0;
    const parsedReorder = parseInt(newProd.reorder, 10) || 10;

    const payload = {
      name: newProd.name.trim(),
      genericName: newProd.genericName.trim() || newProd.name.trim(),
      sku: newProd.sku.trim().toUpperCase(),
      category: newProd.category,
      price: priceFormatted,
      reorder: parsedReorder,
      batchNumber: newProd.batchNumber.trim().toUpperCase() || "B001",
      quantity: parsedQty,
      expiryDate: newProd.expiryDate || "2027-12-31",
      mfgDate: newProd.mfgDate,
      dateReceived: newProd.dateReceived,
      supplier: newProd.supplier,
    };

    try {
      const res = await fetch("http://localhost:5000/api/inventory/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchInventory();
        setIsAddProductOpen(false);
        onToast(`Added product "${payload.name}" with initial batch`);
        return;
      }
    } catch (err) {
      console.warn("Backend save failed, falling back to local state:", err);
    }

    // Fallback local update
    const newProductItem: ProductItem = {
      id: `p${items.length + 1}-${Date.now()}`,
      name: payload.name,
      genericName: payload.genericName,
      sku: payload.sku,
      category: payload.category,
      price: payload.price,
      reorder: payload.reorder,
      batches: [
        {
          batchNumber: payload.batchNumber,
          quantity: payload.quantity,
          expiryDate: payload.expiryDate,
          mfgDate: payload.mfgDate,
          dateReceived: payload.dateReceived,
          supplier: payload.supplier,
        },
      ],
    };

    setItems([newProductItem, ...items]);
    setIsAddProductOpen(false);
    onToast(`Added product "${newProductItem.name}" with initial batch`);
  };

  const handleOpenEditProduct = (product: ProductItem) => {
    setEditProdData({
      name: product.name,
      genericName: product.genericName || "",
      sku: product.sku,
      category: product.category,
      price: product.price,
      reorder: String(product.reorder),
    });
    setEditProduct(product);
  };

  const handleSaveEditProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editProduct) return;

    const priceFormatted = editProdData.price.startsWith("₱")
      ? editProdData.price
      : `₱${parseFloat(editProdData.price.replace(/[^\d.]/g, "") || "0").toFixed(2)}`;

    const payload = {
      name: editProdData.name.trim(),
      genericName: editProdData.genericName.trim(),
      sku: editProdData.sku.trim().toUpperCase(),
      category: editProdData.category,
      price: priceFormatted,
      reorder: parseInt(editProdData.reorder, 10) || 10,
    };

    try {
      const res = await fetch(`http://localhost:5000/api/inventory/products/${editProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchInventory();
        setEditProduct(null);
        onToast(`Updated product details for "${editProdData.name}"`);
        return;
      }
    } catch (err) {
      console.warn("Backend edit failed, falling back to local state:", err);
    }

    const updated = items.map((p) =>
      p.id === editProduct.id
        ? {
            ...p,
            name: payload.name,
            genericName: payload.genericName,
            sku: payload.sku,
            category: payload.category,
            price: payload.price,
            reorder: payload.reorder,
          }
        : p,
    );

    setItems(updated);
    setEditProduct(null);
    onToast(`Updated product details for "${editProdData.name}"`);
  };

  const handleOpenAddBatch = (product: ProductItem) => {
    setNewBatchData({
      batchNumber: `B${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`,
      quantity: "50",
      expiryDate: "2028-06-30",
      mfgDate: "2026-01-01",
      dateReceived: new Date().toISOString().slice(0, 10),
      supplier: "Southstar Distribution",
    });
    setBatchProduct(product);
  };

  const handleSaveAddBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!batchProduct || !newBatchData.batchNumber.trim()) {
      onToast("Batch number is required");
      return;
    }

    const parsedQty = parseInt(newBatchData.quantity, 10) || 0;
    const newBatch: ProductBatch = {
      batchNumber: newBatchData.batchNumber.trim().toUpperCase(),
      quantity: parsedQty,
      expiryDate: newBatchData.expiryDate || "2028-06-30",
      mfgDate: newBatchData.mfgDate,
      dateReceived: newBatchData.dateReceived,
      supplier: newBatchData.supplier,
    };

    try {
      const res = await fetch(`http://localhost:5000/api/inventory/products/${batchProduct.id}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBatch),
      });
      if (res.ok) {
        await fetchInventory();
        setBatchProduct(null);
        onToast(
          `Added batch ${newBatch.batchNumber} (${parsedQty} units) to ${batchProduct.name}`,
        );
        return;
      }
    } catch (err) {
      console.warn("Backend batch addition failed, falling back to local state:", err);
    }

    const updated = items.map((p) =>
      p.id === batchProduct.id
        ? {
            ...p,
            batches: [...p.batches, newBatch],
          }
        : p,
    );

    setItems(updated);
    setBatchProduct(null);
    onToast(
      `Added batch ${newBatch.batchNumber} (${parsedQty} units) to ${batchProduct.name}`,
    );
  };

  const handleOpenStockIn = (product: ProductItem) => {
    setStockInData({
      batchNumber: product.batches[0]?.batchNumber || "B001",
      quantity: "20",
      date: new Date().toISOString().slice(0, 10),
      reason: "Procurement Delivery",
    });
    setStockInProduct(product);
  };

  const handleSaveStockIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!stockInProduct) return;
    const qty = parseInt(stockInData.quantity, 10);
    if (!qty || qty <= 0) {
      onToast("Please enter a valid positive quantity");
      return;
    }

    try {
      const res = await fetch(`http://localhost:5000/api/inventory/products/${stockInProduct.id}/stock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchNumber: stockInData.batchNumber,
          quantity: qty,
          reason: stockInData.reason,
          date: stockInData.date,
        }),
      });
      if (res.ok) {
        await fetchInventory();
        setStockInProduct(null);
        onToast(
          `Stock In recorded: +${qty} units added to ${stockInProduct.name} (${stockInData.reason})`,
        );
        return;
      }
    } catch (err) {
      console.warn("Backend stock in failed, falling back to local state:", err);
    }

    const updated = items.map((p) => {
      if (p.id !== stockInProduct.id) return p;
      const targetBatchIndex = p.batches.findIndex(
        (b) => b.batchNumber === stockInData.batchNumber,
      );

      let newBatches = [...p.batches];
      if (targetBatchIndex > -1) {
        newBatches[targetBatchIndex] = {
          ...newBatches[targetBatchIndex],
          quantity: newBatches[targetBatchIndex].quantity + qty,
        };
      } else {
        newBatches.push({
          batchNumber: stockInData.batchNumber.trim().toUpperCase() || "B-NEW",
          quantity: qty,
          expiryDate: "2028-12-31",
          dateReceived: stockInData.date,
        });
      }
      return { ...p, batches: newBatches };
    });

    setItems(updated);
    setStockInProduct(null);
    onToast(
      `Stock In recorded: +${qty} units added to ${stockInProduct.name} (${stockInData.reason})`,
    );
  };

  const handleOpenStockOut = (product: ProductItem) => {
    const firstAvailable =
      product.batches.find((b) => b.quantity > 0)?.batchNumber ||
      product.batches[0]?.batchNumber ||
      "";
    setStockOutData({
      batchNumber: firstAvailable,
      quantity: "5",
      date: new Date().toISOString().slice(0, 10),
      reason: "Dispensed / OTC",
    });
    setStockOutProduct(product);
  };

  const handleSaveStockOut = async (e: FormEvent) => {
    e.preventDefault();
    if (!stockOutProduct) return;
    const qty = parseInt(stockOutData.quantity, 10);
    if (!qty || qty <= 0) {
      onToast("Please enter a valid positive quantity");
      return;
    }

    const targetBatch = stockOutProduct.batches.find(
      (b) => b.batchNumber === stockOutData.batchNumber,
    );

    if (!targetBatch || targetBatch.quantity < qty) {
      onToast(
        `Insufficient batch stock. Available in ${stockOutData.batchNumber}: ${targetBatch?.quantity || 0} units`,
      );
      return;
    }

    try {
      const res = await fetch(`http://localhost:5000/api/inventory/products/${stockOutProduct.id}/stock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchNumber: stockOutData.batchNumber,
          quantity: qty,
          reason: stockOutData.reason,
        }),
      });
      if (res.ok) {
        await fetchInventory();
        setStockOutProduct(null);
        onToast(
          `Stock Out recorded: -${qty} units removed from ${stockOutProduct.name} (${stockOutData.reason})`,
        );
        return;
      }
    } catch (err) {
      console.warn("Backend stock out failed, falling back to local state:", err);
    }

    const updated = items.map((p) => {
      if (p.id !== stockOutProduct.id) return p;
      const newBatches = p.batches.map((b) =>
        b.batchNumber === stockOutData.batchNumber
          ? { ...b, quantity: Math.max(0, b.quantity - qty) }
          : b,
      );
      return { ...p, batches: newBatches };
    });

    setItems(updated);
    setStockOutProduct(null);
    onToast(
      `Stock Out recorded: -${qty} units removed from ${stockOutProduct.name} (${stockOutData.reason})`,
    );
  };

  return (
    <div>
      <PageHeading
        title="Inventory"
        description="Real-time stock levels, multi-batch tracking, expiry alerts, and stock movements."
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="button soft"
              style={{ fontSize: 11, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={fetchInventory}
              title="Sync inventory with backend database"
              data-testid="button-sync-inventory"
            >
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
              <span>{isBackendConnected ? "Backend Online" : "Sync Inventory"}</span>
            </button>
            {canAddProduct && (
              <button
                className="button dark"
                data-testid="button-add-product"
                onClick={handleOpenAddProduct}>
                <Plus size={14} /> Add product
              </button>
            )}
          </div>
        }
      />

      {/* ========================================================================= */}
      {/* ALERTS SECTION (ADMIN & FRONT DESK ONLY) */}
      {/* ========================================================================= */}
      {canViewAlerts && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}>
          {/* Low Stock Alert */}
          {lowStockItems.length > 0 && (
            <div
              className="surface-card"
              style={{
                padding: "14px 18px",
                background: "hsl(var(--surface))",
              }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#b45309",
                    fontSize: 13,
                  }}>
                  <AlertTriangle size={16} />
                  <span>LOW STOCK ALERT ({lowStockItems.length})</span>
                </div>
                <button
                  type="button"
                  className="button soft"
                  style={{ padding: "3px 8px", fontSize: 10 }}
                  onClick={() => setStatusFilter("Low Stock")}>
                  Filter Low Stock
                </button>
              </div>
              <p
                style={{
                  fontSize: 12,
                  margin: "0 0 8px 0",
                  color: "hsl(var(--muted))",
                }}>
                The following products have reached or fallen below their reorder level:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lowStockItems.slice(0, 3).map((p) => {
                  const stock = getProductTotalStock(p);
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        background: "hsl(var(--surface-soft))",
                        padding: "6px 10px",
                        borderRadius: 6,
                      }}>
                      <div>
                        <strong>{p.name}</strong>{" "}
                        <span className="muted" style={{ fontSize: 10 }}>
                          ({p.sku})
                        </span>
                      </div>
                      <div>
                        <span
                          style={{
                            color: stock === 0 ? "#ef4444" : "#b45309",
                            fontWeight: 700,
                          }}>
                          {stock} units left
                        </span>
                        <span
                          className="muted"
                          style={{ fontSize: 10, marginLeft: 6 }}>
                          (Reorder: {p.reorder})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expired / Expiring Products Alert */}
          {(expiredItems.length > 0 || expiringSoonItems.length > 0) && (
            <div
              className="surface-card"
              style={{
                padding: "14px 18px",
                background: "hsl(var(--surface))",
              }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#dc2626",
                    fontSize: 13,
                  }}>
                  <AlertCircle size={16} />
                  <span>
                    EXPIRED &amp; EXPIRING PRODUCTS (
                    {expiredItems.length + expiringSoonItems.length})
                  </span>
                </div>
                <button
                  type="button"
                  className="button soft"
                  style={{ padding: "3px 8px", fontSize: 10 }}
                  onClick={() => setStatusFilter("Expired")}>
                  Filter Expired
                </button>
              </div>
              <p
                style={{
                  fontSize: 12,
                  margin: "0 0 8px 0",
                  color: "hsl(var(--muted))",
                }}>
                Products requiring immediate quarantine or near-term attention:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {expiredItems.map((p) => {
                  const info = getProductStatusData(p);
                  return info.expiredBatches.map((b) => (
                    <div
                      key={`${p.id}-${b.batchNumber}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        background: "hsl(var(--surface-soft))",
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                      }}>
                      <div>
                        <strong>{p.name}</strong>{" "}
                        <span
                          className="pill danger"
                          style={{ fontSize: 9, padding: "1px 6px", marginLeft: 4 }}>
                          EXPIRED
                        </span>
                        <div className="muted" style={{ fontSize: 10 }}>
                          Batch: {b.batchNumber} • {b.quantity} units
                        </div>
                      </div>
                      <div
                        style={{
                          color: "#dc2626",
                          fontWeight: 600,
                          fontSize: 11,
                        }}>
                        Expired: {b.expiryDate}
                      </div>
                    </div>
                  ));
                })}
                {expiringSoonItems.map((p) => {
                  const info = getProductStatusData(p);
                  return info.expiringSoonBatches.map((b) => (
                    <div
                      key={`${p.id}-${b.batchNumber}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        background: "hsl(var(--surface-soft))",
                        padding: "6px 10px",
                        borderRadius: 6,
                      }}>
                      <div>
                        <strong>{p.name}</strong>{" "}
                        <span
                          className="pill warning"
                          style={{ fontSize: 9, padding: "1px 6px", marginLeft: 4 }}>
                          EXPIRING SOON
                        </span>
                        <div className="muted" style={{ fontSize: 10 }}>
                          Batch: {b.batchNumber} • {b.quantity} units
                        </div>
                      </div>
                      <div
                        style={{
                          color: "#b45309",
                          fontWeight: 600,
                          fontSize: 11,
                        }}>
                        Expires: {b.expiryDate}
                      </div>
                    </div>
                  ));
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUMMARY STRIP */}
      {/* ========================================================================= */}
      <div className="summary-strip">
        <Summary
          label="Total products"
          value={String(items.length)}
          caption={`${totalStockCount} units across shelves`}
        />
        <Summary
          label="Low stock"
          value={String(lowStockItems.length)}
          caption={
            lowStockItems.length > 0 ? "Requires reordering" : "All optimal"
          }
          tone={lowStockItems.length > 0 ? "warning" : undefined}
        />
        <Summary
          label="Expired / Expiring"
          value={String(expiredItems.length + expiringSoonItems.length)}
          caption={
            expiredItems.length > 0
              ? `${expiredItems.length} expired batch(es)`
              : "No expired stock"
          }
          tone={expiredItems.length > 0 ? "warning" : undefined}
        />
      </div>

      {/* ========================================================================= */}
      {/* INVENTORY TABLE & TOOLS */}
      {/* ========================================================================= */}
      <section className="surface-card table-card">
        <div className="table-tools">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              flex: 1,
            }}>
            <div className="search-wrap" style={{ minWidth: 260 }}>
              <Search size={15} />
              <input
                data-testid="input-inventory-search"
                type="search"
                placeholder="Search product name, generic, SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="select"
              data-testid="select-inventory-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <select
            className="select"
            data-testid="select-inventory-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}>
            <option>All statuses</option>
            <option>In Stock</option>
            <option>Low Stock</option>
            <option>Out of Stock</option>
            <option>Expiring Soon</option>
            <option>Expired</option>
          </select>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Product Code</th>
                <th>Category</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Current Stock</th>
                <th>Batch Number</th>
                <th>Expiry Date</th>
                <th>Stock Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const info = getProductStatusData(product);

                return (
                  <tr key={product.id} data-testid={`row-product-${product.id}`}>
                    <td>
                      <div className="product-cell">
                        <span className="product-symbol">
                          <Package size={15} />
                        </span>
                        <div>
                          <strong>{product.name}</strong>
                          <div className="muted" style={{ fontSize: 10 }}>
                            {product.genericName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 11,
                          fontWeight: 600,
                        }}>
                        {product.sku}
                      </span>
                    </td>
                    <td className="muted">{product.category}</td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{product.price}</strong>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong
                        style={{
                          color:
                            info.stock === 0
                              ? "#ef4444"
                              : info.isLowStock
                                ? "#b45309"
                                : undefined,
                        }}>
                        {info.stock}
                      </strong>{" "}
                      <span className="muted">units</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 11 }}>
                        {product.batches.length === 1 ? (
                          <span>
                            {product.batches[0].batchNumber} (
                            {product.batches[0].quantity}u)
                          </span>
                        ) : (
                          <span
                            title={product.batches
                              .map((b) => `${b.batchNumber}: ${b.quantity}u`)
                              .join(", ")}>
                            {product.batches[0]?.batchNumber} +
                            {product.batches.length - 1} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 11 }}>
                        <span
                          style={{
                            color: info.isExpired
                              ? "#dc2626"
                              : info.isExpiringSoon
                                ? "#b45309"
                                : undefined,
                            fontWeight:
                              info.isExpired || info.isExpiringSoon
                                ? 600
                                : 400,
                          }}>
                          {info.primaryExpiry}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`pill ${info.statusTone}`}
                        style={{ fontSize: 10, padding: "2px 8px" }}>
                        {info.statusLabel}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          justifyContent: "flex-end",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}>
                        {/* View Details - ALL 3 ROLES */}
                        <button
                          type="button"
                          className="button soft"
                          style={{ padding: "4px 8px", fontSize: 11 }}
                          onClick={() => setViewProduct(product)}
                          title="View product & batches"
                          data-testid={`button-view-${product.id}`}>
                          <Eye size={12} /> View
                        </button>

                        {/* Edit Product - ADMIN & FRONT DESK */}
                        {canEditProduct && (
                          <button
                            type="button"
                            className="button soft"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => handleOpenEditProduct(product)}
                            title="Edit product information"
                            data-testid={`button-edit-${product.id}`}>
                            <Pencil size={12} /> Edit
                          </button>
                        )}

                        {/* Add Batch / Add Expiry Date - ADMIN & FRONT DESK */}
                        {canAddBatch && (
                          <button
                            type="button"
                            className="button soft"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => handleOpenAddBatch(product)}
                            title={
                              canAddFullBatchInfo
                                ? "Add product batch information"
                                : "Add batch expiry date"
                            }
                            data-testid={`button-batch-${product.id}`}>
                            <Plus size={12} />{" "}
                            {canAddFullBatchInfo ? "Batch" : "Expiry"}
                          </button>
                        )}

                        {/* Stock In - ADMIN & CASHIER */}
                        {canRecordStockIn && (
                          <button
                            type="button"
                            className="button soft"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => handleOpenStockIn(product)}
                            title="Record Stock In"
                            data-testid={`button-stock-in-${product.id}`}>
                            <ArrowDownLeft size={12} /> In
                          </button>
                        )}

                        {/* Stock Out - ADMIN & CASHIER */}
                        {canRecordStockOut && (
                          <button
                            type="button"
                            className="button soft"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => handleOpenStockOut(product)}
                            title="Record Stock Out"
                            disabled={info.stock <= 0}
                            data-testid={`button-stock-out-${product.id}`}>
                            <ArrowUpRight size={12} /> Out
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="empty-state">
              <Package size={25} />
              <div>No products match that search or filter.</div>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 1. VIEW PRODUCT DETAILS MODAL (ALL ROLES) */}
      {/* ========================================================================= */}
      {viewProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setViewProduct(null)}
            data-testid="modal-view-product">
            <div
              className="modal"
              style={{ width: "min(640px, 100%)" }}>
              <div className="modal-header">
                <div>
                  <h2>{viewProduct.name}</h2>
                  <p className="modal-sub">
                    Generic: {viewProduct.genericName} • Code: {viewProduct.sku}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setViewProduct(null)}>
                  <X size={16} />
                </button>
              </div>

              {/* Product Info Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 10,
                  marginBottom: 16,
                }}>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
                    Category
                  </div>
                  <strong style={{ fontSize: 13 }}>{viewProduct.category}</strong>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
                    Unit Price
                  </div>
                  <strong style={{ fontSize: 13 }}>{viewProduct.price}</strong>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
                    Reorder Level
                  </div>
                  <strong style={{ fontSize: 13 }}>
                    {viewProduct.reorder} units
                  </strong>
                </div>
                <div
                  style={{
                    background: "hsl(var(--surface-soft))",
                    border: "1px solid hsl(var(--border))",
                    padding: "10px 14px",
                    borderRadius: 11,
                  }}>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
                    Total Stock
                  </div>
                  <strong style={{ fontSize: 13 }}>
                    {getProductTotalStock(viewProduct)} units
                  </strong>
                </div>
              </div>

              {/* Batches Table */}
              <div className="modal-section">
                <h4>Recorded Batches &amp; Expiry Dates ({viewProduct.batches.length})</h4>
                <div
                  style={{
                    overflowX: "auto",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 11,
                  }}>
                  <table className="data-table" style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th>Batch #</th>
                        <th style={{ textAlign: "right" }}>Quantity</th>
                        <th>Expiry Date</th>
                        <th>Status</th>
                        <th>Mfg Date</th>
                        <th>Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewProduct.batches.map((b) => {
                        const expInfo = getBatchExpiryStatus(
                          b.expiryDate,
                          b.quantity,
                        );
                        return (
                          <tr key={b.batchNumber}>
                            <td>
                              <strong>{b.batchNumber}</strong>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <strong>{b.quantity}</strong> units
                            </td>
                            <td>{b.expiryDate}</td>
                            <td>
                              <span
                                className={`pill ${expInfo.tone}`}
                                style={{ fontSize: 9, padding: "1px 6px" }}>
                                {expInfo.status}
                              </span>
                            </td>
                            <td className="muted">{b.mfgDate || "—"}</td>
                            <td className="muted">{b.supplier || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button dark"
                  onClick={() => setViewProduct(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 2. ADD PRODUCT MODAL (ADMIN & FRONT DESK) */}
      {/* ========================================================================= */}
      {isAddProductOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setIsAddProductOpen(false)}
            data-testid="modal-add-product">
            <div
              className="modal"
              style={{ width: "min(580px, 100%)" }}>
              <div className="modal-header">
                <div>
                  <h2>Add New Product</h2>
                  <p className="modal-sub">Product details and initial batch registration</p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsAddProductOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveNewProduct}>
                <div className="form-grid">
                  <div className="field">
                    <label>Product Name *</label>
                    <input
                      required
                      placeholder="e.g. Paracetamol 500mg"
                      value={newProd.name}
                      onChange={(e) =>
                        setNewProd({ ...newProd, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Generic Name *</label>
                    <input
                      required
                      placeholder="e.g. Acetaminophen"
                      value={newProd.genericName}
                      onChange={(e) =>
                        setNewProd({ ...newProd, genericName: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Product Code (SKU) *</label>
                    <input
                      required
                      placeholder="e.g. MED-0421"
                      value={newProd.sku}
                      onChange={(e) =>
                        setNewProd({ ...newProd, sku: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Category</label>
                    <select
                      value={newProd.category}
                      onChange={(e) =>
                        setNewProd({ ...newProd, category: e.target.value })
                      }>
                      {categories
                        .filter((c) => c !== "All categories")
                        .map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Unit Price *</label>
                    <input
                      required
                      placeholder="₱10.00"
                      value={newProd.price}
                      onChange={(e) =>
                        setNewProd({ ...newProd, price: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Reorder Level *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newProd.reorder}
                      onChange={(e) =>
                        setNewProd({ ...newProd, reorder: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* Initial Batch Information */}
                <div className="modal-section">
                  <h4>Initial Batch Information</h4>
                  <div className="form-grid">
                    <div className="field">
                      <label>Batch Number *</label>
                      <input
                        required
                        placeholder="e.g. B2026-01"
                        value={newProd.batchNumber}
                        onChange={(e) =>
                          setNewProd({
                            ...newProd,
                            batchNumber: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={newProd.quantity}
                        onChange={(e) =>
                          setNewProd({ ...newProd, quantity: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Expiry Date *</label>
                      <input
                        type="date"
                        required
                        value={newProd.expiryDate}
                        onChange={(e) =>
                          setNewProd({ ...newProd, expiryDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Date Received</label>
                      <input
                        type="date"
                        value={newProd.dateReceived}
                        onChange={(e) =>
                          setNewProd({
                            ...newProd,
                            dateReceived: e.target.value,
                          })
                        }
                      />
                    </div>
                    {isAdmin && (
                      <div className="field full-width">
                        <label>Supplier</label>
                        <select
                          value={newProd.supplier}
                          onChange={(e) =>
                            setNewProd({ ...newProd, supplier: e.target.value })
                          }>
                          {suppliers.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="button soft"
                    onClick={() => setIsAddProductOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="button dark">
                    Save Product
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 3. EDIT PRODUCT MODAL (ADMIN & FRONT DESK) */}
      {/* ========================================================================= */}
      {editProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setEditProduct(null)}
            data-testid="modal-edit-product">
            <div className="modal dialog" style={{ maxWidth: 500 }}>
              <div className="modal-header">
                <div>
                  <h2>Update Product Information</h2>
                  <p className="modal-sub">
                    Edit product details and reorder thresholds
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setEditProduct(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveEditProduct}>
                <div className="form-grid">
                  <div className="field full-width">
                    <label>Product Name *</label>
                    <input
                      required
                      value={editProdData.name}
                      onChange={(e) =>
                        setEditProdData({ ...editProdData, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="field full-width">
                    <label>Generic Name</label>
                    <input
                      value={editProdData.genericName}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          genericName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Product Code (SKU) *</label>
                    <input
                      required
                      value={editProdData.sku}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          sku: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Category</label>
                    <select
                      value={editProdData.category}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          category: e.target.value,
                        })
                      }>
                      {categories
                        .filter((c) => c !== "All categories")
                        .map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Price (₱) *</label>
                    <input
                      required
                      value={editProdData.price}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          price: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Reorder Level *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={editProdData.reorder}
                      onChange={(e) =>
                        setEditProdData({
                          ...editProdData,
                          reorder: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="button soft"
                    onClick={() => setEditProduct(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="button dark">
                    Update Details
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 4. ADD BATCH / BATCH EXPIRY DATE MODAL (ADMIN & FRONT DESK) */}
      {/* ========================================================================= */}
      {batchProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setBatchProduct(null)}
            data-testid="modal-add-batch">
            <div className="modal dialog" style={{ maxWidth: 500 }}>
              <div className="modal-header">
                <div>
                  <h2>
                    {isAdmin
                      ? "Add Product Batch Information"
                      : "Add Batch Expiry Date"}
                  </h2>
                  <p className="modal-sub">
                    For {batchProduct.name} ({batchProduct.sku})
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setBatchProduct(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveAddBatch}>
                <div className="form-grid">
                  <div className="field">
                    <label>Batch Number *</label>
                    <input
                      required
                      placeholder="e.g. B2026-03"
                      value={newBatchData.batchNumber}
                      onChange={(e) =>
                        setNewBatchData({
                          ...newBatchData,
                          batchNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newBatchData.quantity}
                      onChange={(e) =>
                        setNewBatchData({
                          ...newBatchData,
                          quantity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className={canAddFullBatchInfo ? "field" : "field full-width"}>
                    <label>Expiry Date *</label>
                    <input
                      type="date"
                      required
                      value={newBatchData.expiryDate}
                      onChange={(e) =>
                        setNewBatchData({
                          ...newBatchData,
                          expiryDate: e.target.value,
                        })
                      }
                    />
                  </div>
                  {canAddFullBatchInfo && (
                    <>
                      <div className="field">
                        <label>Date Received</label>
                        <input
                          type="date"
                          value={newBatchData.dateReceived}
                          onChange={(e) =>
                            setNewBatchData({
                              ...newBatchData,
                              dateReceived: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Manufacturing Date</label>
                        <input
                          type="date"
                          value={newBatchData.mfgDate}
                          onChange={(e) =>
                            setNewBatchData({
                              ...newBatchData,
                              mfgDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="field full-width">
                        <label>Supplier</label>
                        <select
                          value={newBatchData.supplier}
                          onChange={(e) =>
                            setNewBatchData({
                              ...newBatchData,
                              supplier: e.target.value,
                            })
                          }>
                          {suppliers.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="button soft"
                    onClick={() => setBatchProduct(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="button dark">
                    Record Batch
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 5. RECORD STOCK IN MODAL (ADMIN & CASHIER) */}
      {/* ========================================================================= */}
      {stockInProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setStockInProduct(null)}
            data-testid="modal-stock-in">
            <div className="modal dialog" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <div>
                  <h2>Record Stock In</h2>
                  <p className="modal-sub">
                    Add inventory to {stockInProduct.name} ({stockInProduct.sku})
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setStockInProduct(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveStockIn}>
                <div className="form-grid">
                  <div className="field full-width">
                    <label>Target Batch *</label>
                    <select
                      value={stockInData.batchNumber}
                      onChange={(e) =>
                        setStockInData({
                          ...stockInData,
                          batchNumber: e.target.value,
                        })
                      }>
                      {stockInProduct.batches.map((b) => (
                        <option key={b.batchNumber} value={b.batchNumber}>
                          {b.batchNumber} (Current: {b.quantity} units, Exp:{" "}
                          {b.expiryDate})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Quantity to Add *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={stockInData.quantity}
                      onChange={(e) =>
                        setStockInData({
                          ...stockInData,
                          quantity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Date *</label>
                    <input
                      type="date"
                      required
                      value={stockInData.date}
                      onChange={(e) =>
                        setStockInData({ ...stockInData, date: e.target.value })
                      }
                    />
                  </div>

                  <div className="field full-width">
                    <label>Reason / Reference *</label>
                    <input
                      required
                      placeholder="e.g. Procurement Delivery, Restock, Return"
                      value={stockInData.reason}
                      onChange={(e) =>
                        setStockInData({ ...stockInData, reason: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="button soft"
                    onClick={() => setStockInProduct(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="button dark">
                    <ArrowDownLeft size={14} /> Confirm Stock In
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ========================================================================= */}
      {/* 6. RECORD STOCK OUT MODAL (ADMIN & CASHIER) */}
      {/* ========================================================================= */}
      {stockOutProduct &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(e) => e.currentTarget === e.target && setStockOutProduct(null)}
            data-testid="modal-stock-out">
            <div className="modal dialog" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <div>
                  <h2>Record Stock Out</h2>
                  <p className="modal-sub">
                    Deduct inventory from {stockOutProduct.name} (
                    {stockOutProduct.sku})
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setStockOutProduct(null)}>
                  <X size={15} />
                </button>
              </div>

              <form onSubmit={handleSaveStockOut}>
                <div className="form-grid">
                  <div className="field full-width">
                    <label>Source Batch *</label>
                    <select
                      value={stockOutData.batchNumber}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
                          batchNumber: e.target.value,
                        })
                      }>
                      {stockOutProduct.batches.map((b) => (
                        <option key={b.batchNumber} value={b.batchNumber}>
                          {b.batchNumber} (Available: {b.quantity} units, Exp:{" "}
                          {b.expiryDate})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Quantity to Deduct *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={stockOutData.quantity}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
                          quantity: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Date *</label>
                    <input
                      type="date"
                      required
                      value={stockOutData.date}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
                          date: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field full-width">
                    <label>Reason *</label>
                    <select
                      value={stockOutData.reason}
                      onChange={(e) =>
                        setStockOutData({
                          ...stockOutData,
                          reason: e.target.value,
                        })
                      }>
                      <option value="Dispensed / Sales">Dispensed / Sales</option>
                      <option value="Damaged / Broken">Damaged / Broken</option>
                      <option value="Expired Product Disposal">
                        Expired Product Disposal
                      </option>
                      <option value="Inventory Audit Adjustment">
                        Inventory Audit Adjustment
                      </option>
                      <option value="Internal Use / Clinic Transfer">
                        Internal Use / Clinic Transfer
                      </option>
                    </select>
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="button soft"
                    onClick={() => setStockOutProduct(null)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button dark"
                    style={{ background: "#dc2626", borderColor: "#dc2626" }}>
                    <ArrowUpRight size={14} /> Confirm Stock Out
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
function Summary({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: string;
}) {
  return (
    <div className="surface-card summary-box">
      <span>{label}</span>
      <strong>{value}</strong>
      <small style={tone === "warning" ? { color: "#ad7f16" } : undefined}>
        {caption}
      </small>
    </div>
  );
}

function SupplierPage({ onToast }: { onToast: ToastFn }) {
  const [filter, setFilter] = useState("All statuses");
  const filtered = suppliers.filter(
    (supplier) => filter === "All statuses" || supplier.status === filter,
  );

  return (
    <div>
      <PageHeading
        title="Supplier"
        description="Know who keeps your shelves ready, and how they are performing."
        action={
          <button
            className="button dark"
            data-testid="button-add-supplier"
            onClick={() => onToast("Supplier onboarding form is ready")}>
            <Plus size={14} /> Add supplier
          </button>
        }
      />
      <div className="summary-strip">
        <Summary
          label="Active suppliers"
          value="18"
          caption="4 preferred partners"
        />
        <Summary
          label="Open purchase value"
          value="₱102,610"
          caption="Across 3 orders"
        />
        <Summary
          label="On-time delivery"
          value="94.6%"
          caption="+2.1% this quarter"
        />
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div>
            <h2 className="card-title">Supplier directory</h2>
            <p className="card-subtitle">
              Commercial partners and current standing
            </p>
          </div>
          <select
            className="select"
            data-testid="select-supplier-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}>
            <option>All statuses</option>
            <option>Preferred</option>
            <option>Active</option>
            <option>Review</option>
            <option>On hold</option>
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Primary contact</th>
                <th>Orders YTD</th>
                <th>Order value</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((supplier) => (
                <tr key={supplier.code}>
                  <td>
                    <div className="product-cell">
                      <span className="product-symbol">
                        <Building2 size={15} />
                      </span>
                      <div>
                        <strong>{supplier.name}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>
                          {supplier.code}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{supplier.contact}</td>
                  <td>{supplier.orders}</td>
                  <td>
                    <strong>{supplier.value}</strong>
                  </td>
                  <td>
                    <span
                      className={`pill ${supplier.status === "Preferred" ? "success" : supplier.status === "Review" ? "warning" : "danger"}`}>
                      {supplier.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      data-testid={`button-view-supplier-${supplier.code}`}
                      onClick={() =>
                        onToast(`${supplier.name} profile opened`)
                      }>
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ProcurementPage({ onToast }: { onToast: ToastFn }) {
  const [status, setStatus] = useState("All orders");
  const [orders, setOrders] = useState(purchaseOrders);
  const statuses = [
    "All orders",
    "Pending approval",
    "Approved",
    "In transit",
    "Received",
  ];
  const filtered = orders.filter(
    (order) => status === "All orders" || order.status === status,
  );

  return (
    <div>
      <PageHeading
        title="Procurement"
        description="Keep purchasing predictable from request to receiving."
        action={
          <button
            className="button dark"
            data-testid="button-create-po"
            onClick={() => onToast("New purchase order draft created")}>
            <Plus size={14} /> New purchase order
          </button>
        }
      />
      <div className="summary-strip">
        <Summary label="Open orders" value="3" caption="₱102,610 committed" />
        <Summary
          label="Awaiting approval"
          value="1"
          caption="Needs your review"
          tone="warning"
        />
        <Summary
          label="Received this month"
          value="24"
          caption="+5 vs last month"
        />
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div>
            <h2 className="card-title">Purchase orders</h2>
            <p className="card-subtitle">Latest orders and delivery status</p>
          </div>
          <select
            className="select"
            data-testid="select-procurement-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Supplier</th>
                <th>Placed</th>
                <th>Items</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const isReceived = order.status === "Received";
                const isPending = order.status === "Pending approval";
                const isInTransit = order.status === "In transit";

                return (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.id}</strong>
                    </td>
                    <td>{order.supplier}</td>
                    <td className="muted">{order.date}</td>
                    <td>{order.items}</td>
                    <td>
                      <strong>{order.value}</strong>
                    </td>
                    <td>
                      <select
                        className="select"
                        data-testid={`select-status-${order.id}`}
                        style={{
                          height: 30,
                          padding: "0 28px 0 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 99,
                          border: "1px solid hsl(var(--border))",
                          background: isReceived
                            ? "hsl(var(--mint))"
                            : isPending
                              ? "hsl(var(--peach))"
                              : isInTransit
                                ? "hsl(var(--yellow))"
                                : "hsl(var(--surface-soft))",
                          color: isReceived
                            ? "#1B7A40"
                            : isPending
                              ? "#B02020"
                              : isInTransit
                                ? "#8B4500"
                                : "hsl(var(--foreground))",
                          cursor: "pointer",
                          outline: "none",
                        }}
                        value={order.status}
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          setOrders(
                            orders.map((o) =>
                              o.id === order.id
                                ? { ...o, status: newStatus }
                                : o,
                            ),
                          );
                          onToast(`PO ${order.id} status changed to ${newStatus}`);
                        }}>
                        <option value="Pending approval">Pending approval</option>
                        <option value="Approved">Approved</option>
                        <option value="In transit">In transit</option>
                        <option value="Received">Received</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function WholesalePage({ onToast }: { onToast: ToastFn }) {
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [orders, setOrders] = useState([
    {
      id: "WS-1608",
      customer: "St. Luke\u2019s Clinic",
      items: 38,
      value: "₱18,450",
      status: "In transit",
    },
    {
      id: "WS-1607",
      customer: "Greenfield Care Home",
      items: 24,
      value: "₱9,820",
      status: "Processing",
    },
    {
      id: "WS-1606",
      customer: "Mabini Medical Center",
      items: 62,
      value: "₱42,150",
      status: "Completed",
    },
    {
      id: "WS-1605",
      customer: "Brightwell Pharmacy",
      items: 17,
      value: "₱7,250",
      status: "Completed",
    },
  ]);

  const filtered = orders.filter(
    (order) =>
      statusFilter === "All statuses" || order.status === statusFilter,
  );

  return (
    <div>
      <PageHeading
        title="Wholesale"
        description="A focused view of partner orders and fulfillment."
        action={
          <button
            className="button dark"
            data-testid="button-new-wholesale"
            onClick={() => onToast("Wholesale order draft opened")}>
            <Plus size={14} /> New wholesale order
          </button>
        }
      />
      <div className="summary-strip">
        <Summary
          label="Wholesale sales"
          value="₱77,670"
          caption="+14.2% this month"
        />
        <Summary
          label="Open orders"
          value="2"
          caption="Ready for fulfillment"
        />
        <Summary
          label="Partner accounts"
          value="36"
          caption="4 new this month"
        />
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div>
            <h2 className="card-title">Partner orders</h2>
            <p className="card-subtitle">Wholesale fulfillment queue</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              className="select"
              data-testid="select-wholesale-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}>
              <option>All statuses</option>
              <option>Processing</option>
              <option>In transit</option>
              <option>Completed</option>
            </select>
            <button
              className="button soft"
              data-testid="button-wholesale-export"
              onClick={() => onToast("Wholesale order list exported")}>
              <ArrowDownToLine size={14} /> Export
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Partner</th>
                <th>Items</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const isCompleted = order.status === "Completed";
                const isProcessing = order.status === "Processing";

                return (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.id}</strong>
                    </td>
                    <td>{order.customer}</td>
                    <td>{order.items}</td>
                    <td>
                      <strong>{order.value}</strong>
                    </td>
                    <td>
                      <select
                        className="select"
                        data-testid={`select-status-${order.id}`}
                        style={{
                          height: 30,
                          padding: "0 28px 0 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 99,
                          border: "1px solid hsl(var(--border))",
                          background: isCompleted
                            ? "hsl(var(--mint))"
                            : isProcessing
                              ? "hsl(var(--yellow))"
                              : "hsl(var(--accent-soft))",
                          color: isCompleted
                            ? "#1B7A40"
                            : isProcessing
                              ? "#8B4500"
                              : "hsl(var(--accent))",
                          cursor: "pointer",
                          outline: "none",
                        }}
                        value={order.status}
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          setOrders(
                            orders.map((o) =>
                              o.id === order.id
                                ? { ...o, status: newStatus }
                                : o,
                            ),
                          );
                          onToast(
                            `Order ${order.id} status changed to ${newStatus}`,
                          );
                        }}>
                        <option value="Processing">Processing</option>
                        <option value="In transit">In transit</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type TransactionItem = {
  product: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

type UserTransaction = {
  id: number;
  transactionNumber: string;
  dateTime: string;
  user: string;
  businessType: 'Retail' | 'Wholesale';
  customer: string;
  total: string;
  subtotal: string;
  discount: string;
  vat: string;
  amountReceived: string;
  change: string;
  payment: string;
  status: 'Completed' | 'Voided' | 'Refunded' | 'Pending';
  items: TransactionItem[];
};

type SystemLog = {
  id: number;
  dateTime: string;
  user: string;
  role: string;
  action: string;
  module: string;
  description: string;
  status: 'Success' | 'Failed';
  deviceIp: string;
};

type UserActivity = {
  id: number;
  dateTime: string;
  user: string;
  role: string;
  activity: string;
  module: string;
  description: string;
  flag: 'Normal' | 'Suspicious' | 'Flagged';
};

const initialTransactionsData: UserTransaction[] = [
  {
    id: 1,
    transactionNumber: 'TRX-0001',
    dateTime: 'Sept. 1, 2026 – 9:00 AM',
    user: 'Maria Santos',
    businessType: 'Retail',
    customer: 'Walk-in Customer',
    total: '₱450.00',
    subtotal: '₱401.79',
    discount: '₱0.00',
    vat: '₱48.21',
    amountReceived: '₱500.00',
    change: '₱50.00',
    payment: 'Cash',
    status: 'Completed',
    items: [
      { product: 'Paracetamol 500mg', quantity: 2, unitPrice: '₱10.00', subtotal: '₱20.00' },
      { product: 'Vitamin C 1000mg', quantity: 1, unitPrice: '₱150.00', subtotal: '₱150.00' },
      { product: 'Cough Relief Syrup', quantity: 1, unitPrice: '₱280.00', subtotal: '₱280.00' },
    ],
  },
  {
    id: 2,
    transactionNumber: 'TRX-0002',
    dateTime: 'Sept. 1, 2026 – 9:15 AM',
    user: 'John Cruz',
    businessType: 'Wholesale',
    customer: 'ABC Pharmacy',
    total: '₱5,250.00',
    subtotal: '₱4,687.50',
    discount: '₱250.00',
    vat: '₱562.50',
    amountReceived: '₱5,250.00',
    change: '₱0.00',
    payment: 'GCash',
    status: 'Completed',
    items: [
      { product: 'Amoxicillin 500mg (Box of 100s)', quantity: 5, unitPrice: '₱650.00', subtotal: '₱3,250.00' },
      { product: 'Cetirizine 10mg (Box of 100s)', quantity: 4, unitPrice: '₱500.00', subtotal: '₱2,000.00' },
    ],
  },
  {
    id: 3,
    transactionNumber: 'TRX-0003',
    dateTime: 'Sept. 1, 2026 – 9:30 AM',
    user: 'Maria Santos',
    businessType: 'Retail',
    customer: 'Walk-in Customer',
    total: '₱320.00',
    subtotal: '₱285.71',
    discount: '₱0.00',
    vat: '₱34.29',
    amountReceived: '₱320.00',
    change: '₱0.00',
    payment: 'Cash',
    status: 'Voided',
    items: [
      { product: 'Mefenamic Acid 500mg', quantity: 4, unitPrice: '₱30.00', subtotal: '₱120.00' },
      { product: 'Antacid Chewables Bottle', quantity: 1, unitPrice: '₱200.00', subtotal: '₱200.00' },
    ],
  },
  {
    id: 4,
    transactionNumber: 'TRX-0004',
    dateTime: 'Sept. 1, 2026 – 10:05 AM',
    user: 'Maria Santos',
    businessType: 'Retail',
    customer: 'Walk-in Customer',
    total: '₱1,280.00',
    subtotal: '₱1,142.86',
    discount: '₱50.00',
    vat: '₱137.14',
    amountReceived: '₱1,500.00',
    change: '₱220.00',
    payment: 'Cash',
    status: 'Completed',
    items: [
      { product: 'Multivitamins + Minerals (30s)', quantity: 2, unitPrice: '₱450.00', subtotal: '₱900.00' },
      { product: 'Digital Thermometer', quantity: 1, unitPrice: '₱380.00', subtotal: '₱380.00' },
    ],
  },
  {
    id: 5,
    transactionNumber: 'TRX-0005',
    dateTime: 'Sept. 1, 2026 – 11:20 AM',
    user: 'John Cruz',
    businessType: 'Wholesale',
    customer: 'St. Jude Medical Clinic',
    total: '₱18,450.00',
    subtotal: '₱16,473.21',
    discount: '₱1,000.00',
    vat: '₱1,976.79',
    amountReceived: '₱18,450.00',
    change: '₱0.00',
    payment: '30-Day Terms',
    status: 'Completed',
    items: [
      { product: 'Sterile Normal Saline 500ml Box (24s)', quantity: 5, unitPrice: '₱1,800.00', subtotal: '₱9,000.00' },
      { product: 'Surgical Gloves Medium (100s)', quantity: 10, unitPrice: '₱350.00', subtotal: '₱3,500.00' },
      { product: 'Disposable Syringes 5ml (100s)', quantity: 7, unitPrice: '₱850.00', subtotal: '₱5,950.00' },
    ],
  },
];

const initialSystemLogsData: SystemLog[] = [
  {
    id: 1,
    dateTime: 'September 1, 2026, 8:45 PM',
    user: 'Juan Dela Cruz',
    role: 'Admin',
    action: 'Added Product',
    module: 'Inventory Management',
    description: 'Added Paracetamol 500mg to inventory',
    status: 'Success',
    deviceIp: 'Desktop – 192.168.1.45',
  },
  {
    id: 2,
    dateTime: 'September 1, 2026, 8:50 AM',
    user: 'Maria Santos',
    role: 'Cashier',
    action: 'Login',
    module: 'Authentication',
    description: 'User logged in to Retail POS Terminal 1',
    status: 'Success',
    deviceIp: 'POS Terminal 1 – 192.168.1.21',
  },
  {
    id: 3,
    dateTime: 'September 1, 2026, 9:15 AM',
    user: 'John Cruz',
    role: 'Front Desk',
    action: 'Sales transactions',
    module: 'Wholesale Management',
    description: 'Processed Wholesale Purchase Order TRX-0002 for ABC Pharmacy (₱5,250.00)',
    status: 'Success',
    deviceIp: 'Front Desk PC – 192.168.1.15',
  },
  {
    id: 4,
    dateTime: 'September 1, 2026, 9:30 AM',
    user: 'Maria Santos',
    role: 'Cashier',
    action: 'Voided/cancelled transactions',
    module: 'Sales POS',
    description: 'Voided retail receipt TRX-0003 upon customer cancellation request (₱320.00)',
    status: 'Success',
    deviceIp: 'POS Terminal 1 – 192.168.1.21',
  },
  {
    id: 5,
    dateTime: 'September 1, 2026, 10:15 AM',
    user: 'Juan Dela Cruz',
    role: 'Admin',
    action: 'Failed login attempts',
    module: 'Authentication',
    description: 'Invalid credentials entered for account "admin" (Attempt 1 of 3)',
    status: 'Failed',
    deviceIp: 'Remote Desktop – 192.168.1.105',
  },
  {
    id: 6,
    dateTime: 'September 1, 2026, 11:00 AM',
    user: 'Juan Dela Cruz',
    role: 'Admin',
    action: 'Stock adjustments',
    module: 'Inventory Management',
    description: 'Manual stock recount adjustment for Amoxicillin 500mg: adjusted from 12 to 8 units',
    status: 'Success',
    deviceIp: 'Admin Tablet – 192.168.1.45',
  },
  {
    id: 7,
    dateTime: 'September 1, 2026, 12:00 PM',
    user: 'Juan Dela Cruz',
    role: 'Admin',
    action: 'Backup and restore activities',
    module: 'System Settings',
    description: 'Automated database backup archive completed and verified (backup_20260901_1200.sql)',
    status: 'Success',
    deviceIp: 'Server – 127.0.0.1',
  },
];

const initialUserActivitiesData: UserActivity[] = [
  {
    id: 1,
    dateTime: 'Sept. 1, 2026 – 8:30 AM',
    user: 'Juan Dela Cruz',
    role: 'Admin',
    activity: 'Login',
    module: '🔐 Authentication',
    description: 'User logged into system dashboard with full administrator privileges',
    flag: 'Normal',
  },
  {
    id: 2,
    dateTime: 'Sept. 1, 2026 – 8:45 AM',
    user: 'Juan Dela Cruz',
    role: 'Admin',
    activity: 'Product added',
    module: '📦 Inventory Activity',
    description: 'Added Paracetamol 500mg to inventory (120 units)',
    flag: 'Normal',
  },
  {
    id: 3,
    dateTime: 'Sept. 1, 2026 – 8:50 AM',
    user: 'Maria Santos',
    role: 'Cashier',
    activity: 'Login',
    module: '🔐 Authentication',
    description: 'Authenticated on POS Terminal 1',
    flag: 'Normal',
  },
  {
    id: 4,
    dateTime: 'Sept. 1, 2026 – 9:00 AM',
    user: 'Maria Santos',
    role: 'Cashier',
    activity: 'Transaction completed',
    module: '💰 Sales & Wholesale Activity',
    description: 'Processed retail cash receipt TRX-0001 (₱450.00)',
    flag: 'Normal',
  },
  {
    id: 5,
    dateTime: 'Sept. 1, 2026 – 9:15 AM',
    user: 'John Cruz',
    role: 'Front Desk',
    activity: 'Transaction completed',
    module: '💰 Sales & Wholesale Activity',
    description: 'Processed wholesale order TRX-0002 for ABC Pharmacy (₱5,250.00)',
    flag: 'Normal',
  },
  {
    id: 6,
    dateTime: 'Sept. 1, 2026 – 9:30 AM',
    user: 'Maria Santos',
    role: 'Cashier',
    activity: 'Transaction voided',
    module: '💰 Sales & Wholesale Activity',
    description: 'Voided retail receipt TRX-0003 after item calculation',
    flag: 'Suspicious',
  },
  {
    id: 7,
    dateTime: 'Sept. 1, 2026 – 10:15 AM',
    user: 'Maria Santos',
    role: 'Cashier',
    activity: 'Shift review opened',
    module: '💰 Sales & Wholesale Activity',
    description: 'Opened Shift Sales and Cash Drawer reconciliation review on POS Terminal 1',
    flag: 'Normal',
  },
  {
    id: 8,
    dateTime: 'Sept. 1, 2026 – 10:30 AM',
    user: 'John Cruz',
    role: 'Front Desk',
    activity: 'Order dispatched',
    module: '💰 Sales & Wholesale Activity',
    description: 'Processed wholesale shipment for Greenfield Care Home',
    flag: 'Normal',
  },
  {
    id: 9,
    dateTime: 'Sept. 1, 2026 – 11:00 AM',
    user: 'Juan Dela Cruz',
    role: 'Admin',
    activity: 'Stock adjusted',
    module: '📦 Inventory Activity',
    description: 'Manual stock recount adjustment for Amoxicillin 500mg (-4 units)',
    flag: 'Normal',
  },
  {
    id: 10,
    dateTime: 'Sept. 1, 2026 – 12:00 PM',
    user: 'Juan Dela Cruz',
    role: 'Admin',
    activity: 'Backup performed',
    module: '⚙️ System Activity',
    description: 'Automated midday database backup completed successfully',
    flag: 'Normal',
  },
];

function SystemAdminPage({ onToast }: { onToast: ToastFn }) {
  const [activeTab, setActiveTab] = useState<'transactions' | 'systemLogs' | 'userActivity'>('transactions');

  // Transactions state
  const [transactions, setTransactions] = useState<UserTransaction[]>(initialTransactionsData);
  const [trxFilterType, setTrxFilterType] = useState<'All' | 'Retail' | 'Wholesale'>('All');
  const [trxFilterStatus, setTrxFilterStatus] = useState<string>('All');
  const [trxSearch, setTrxSearch] = useState('');
  const [selectedTrx, setSelectedTrx] = useState<UserTransaction | null>(null);

  // System Logs state
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>(initialSystemLogsData);
  const [logSearch, setLogSearch] = useState('');
  const [logFilterStatus, setLogFilterStatus] = useState<string>('All');
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  // User Activity state
  const [userActivities, setUserActivities] = useState<UserActivity[]>(initialUserActivitiesData);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityModuleFilter, setActivityModuleFilter] = useState<string>('All');

  // Modal body scroll lock
  useEffect(() => {
    if (selectedTrx || selectedLog) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [selectedTrx, selectedLog]);

  // Fetch from API backend if available
  useEffect(() => {
    fetch('http://localhost:5000/api/admin/transactions')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setTransactions(data); })
      .catch(() => {});

    fetch('http://localhost:5000/api/admin/system-logs')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setSystemLogs(data); })
      .catch(() => {});

    fetch('http://localhost:5000/api/admin/user-activities')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setUserActivities(data); })
      .catch(() => {});
  }, []);

  // Filtered transactions
  const filteredTransactions = transactions.filter((trx) => {
    const matchesType = trxFilterType === 'All' || trx.businessType === trxFilterType;
    const matchesStatus = trxFilterStatus === 'All' || trx.status === trxFilterStatus;
    const q = trxSearch.toLowerCase();
    const matchesSearch = !q ||
      trx.transactionNumber.toLowerCase().includes(q) ||
      trx.user.toLowerCase().includes(q) ||
      trx.customer.toLowerCase().includes(q) ||
      trx.payment.toLowerCase().includes(q);
    return matchesType && matchesStatus && matchesSearch;
  });

  // Filtered logs
  const filteredLogs = systemLogs.filter((log) => {
    const matchesStatus = logFilterStatus === 'All' || log.status === logFilterStatus;
    const q = logSearch.toLowerCase();
    const matchesSearch = !q ||
      log.user.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.module.toLowerCase().includes(q) ||
      log.description.toLowerCase().includes(q) ||
      log.deviceIp.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  // Filtered activities
  const filteredActivities = userActivities.filter((act) => {
    const matchesModule = activityModuleFilter === 'All' || act.module.includes(activityModuleFilter.replace(/[^\w\s]/g, '').trim()) || act.module === activityModuleFilter;
    const q = activitySearch.toLowerCase();
    const matchesSearch = !q ||
      act.user.toLowerCase().includes(q) ||
      act.activity.toLowerCase().includes(q) ||
      act.module.toLowerCase().includes(q) ||
      act.description.toLowerCase().includes(q);
    return matchesModule && matchesSearch;
  });

  return (
    <div>
      <PageHeading
        title="System Administration"
        description="Monitor user sales transactions, audit system logs, and track user activities."
      />

      {/* Feature selection tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`button ${activeTab === 'transactions' ? 'dark' : 'soft'}`}
          onClick={() => setActiveTab('transactions')}
          data-testid="tab-user-transactions"
        >
          <Receipt size={14} /> View user transactions
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'systemLogs' ? 'dark' : 'soft'}`}
          onClick={() => setActiveTab('systemLogs')}
          data-testid="tab-system-logs"
        >
          <FileText size={14} /> View system logs
        </button>
        <button
          type="button"
          className={`button ${activeTab === 'userActivity' ? 'dark' : 'soft'}`}
          onClick={() => setActiveTab('userActivity')}
          data-testid="tab-user-activity"
        >
          <Activity size={14} /> View user activity
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. USER TRANSACTIONS FEATURE */}
      {/* ========================================================================= */}
      {activeTab === 'transactions' && (
        <div>
          <div className="summary-strip">
            <Summary
              label="Total transactions"
              value={String(transactions.length)}
              caption="Recorded across channels"
            />
            <Summary
              label="Wholesale (Front desk)"
              value={String(transactions.filter((t) => t.businessType === 'Wholesale').length)}
              caption="Bulk clinic & pharmacy orders"
            />
            <Summary
              label="Retail (Cashier)"
              value={String(transactions.filter((t) => t.businessType === 'Retail').length)}
              caption="Walk-in POS transactions"
            />
          </div>

          <section className="surface-card table-card">
            <div className="table-tools">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div className="search-wrap" style={{ minWidth: 260 }}>
                  <Search size={15} />
                  <input
                    type="search"
                    placeholder="Search TRX #, customer, user..."
                    value={trxSearch}
                    onChange={(e) => setTrxSearch(e.target.value)}
                    data-testid="input-trx-search"
                  />
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  {(['All', 'Retail', 'Wholesale'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`button ${trxFilterType === type ? 'dark' : 'soft'}`}
                      style={{ padding: '6px 12px', fontSize: 11 }}
                      onClick={() => setTrxFilterType(type)}
                      data-testid={`filter-trx-type-${type.toLowerCase()}`}
                    >
                      {type === 'All' ? 'All channels' : type === 'Retail' ? 'Retail (Cashier)' : 'Wholesale (Front desk)'}
                    </button>
                  ))}
                </div>
              </div>

              <select
                className="select"
                value={trxFilterStatus}
                onChange={(e) => setTrxFilterStatus(e.target.value)}
                data-testid="select-trx-status"
              >
                <option value="All">All statuses</option>
                <option value="Completed">Completed</option>
                <option value="Voided">Voided</option>
                <option value="Refunded">Refunded</option>
                <option value="Pending">Pending</option>
              </select>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Date &amp; Time</th>
                    <th>User</th>
                    <th>Business Type</th>
                    <th>Customer</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((trx) => (
                    <tr key={trx.id} data-testid={`row-trx-${trx.id}`}>
                      <td><strong>{trx.transactionNumber}</strong></td>
                      <td className="muted">{trx.dateTime}</td>
                      <td>{trx.user}</td>
                      <td>
                        <span className={`pill ${trx.businessType === 'Wholesale' ? 'warning' : 'neutral'}`}>
                          {trx.businessType}
                        </span>
                      </td>
                      <td>{trx.customer}</td>
                      <td style={{ textAlign: 'right' }}><strong>{trx.total}</strong></td>
                      <td className="muted">{trx.payment}</td>
                      <td>
                        <span className={`pill ${trx.status === 'Completed' ? 'success' : trx.status === 'Voided' ? 'danger' : 'neutral'}`}>
                          {trx.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button soft"
                          style={{ padding: '5px 12px', fontSize: 11 }}
                          onClick={() => setSelectedTrx(trx)}
                          data-testid={`button-view-trx-${trx.id}`}
                        >
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredTransactions.length === 0 && (
                <div className="empty-state">
                  <Receipt size={28} />
                  <div>No user transactions found matching criteria.</div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SYSTEM LOGS FEATURE */}
      {/* ========================================================================= */}
      {activeTab === 'systemLogs' && (
        <div>
          <div className="summary-strip">
            <Summary
              label="Total audit logs"
              value={String(systemLogs.length)}
              caption="System & security events"
            />
            <Summary
              label="Successful events"
              value={String(systemLogs.filter((l) => l.status === 'Success').length)}
              caption="Executed normally"
            />
            <Summary
              label="Failed / Alerts"
              value={String(systemLogs.filter((l) => l.status === 'Failed').length)}
              caption="Requires attention"
              tone={systemLogs.filter((l) => l.status === 'Failed').length > 0 ? 'warning' : 'neutral'}
            />
          </div>

          <section className="surface-card table-card">
            <div className="table-tools">
              <div className="search-wrap" style={{ minWidth: 320 }}>
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Search user, action, module, or IP..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  data-testid="input-log-search"
                />
              </div>

              <select
                className="select"
                value={logFilterStatus}
                onChange={(e) => setLogFilterStatus(e.target.value)}
                data-testid="select-log-status"
              >
                <option value="All">All statuses</option>
                <option value="Success">Success</option>
                <option value="Failed">Failed</option>
              </select>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id} data-testid={`row-log-${log.id}`}>
                      <td className="muted">{log.dateTime}</td>
                      <td><strong>{log.user}</strong> <span className="muted" style={{ fontSize: 10 }}>({log.role})</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{log.action}</span>
                          <span className={`pill ${log.status === 'Success' ? 'success' : 'danger'}`} style={{ fontSize: 9 }}>
                            {log.status}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button soft"
                          style={{ padding: '5px 12px', fontSize: 11 }}
                          onClick={() => setSelectedLog(log)}
                          data-testid={`button-see-details-${log.id}`}
                        >
                          See details <ArrowUpRight size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredLogs.length === 0 && (
                <div className="empty-state">
                  <FileText size={28} />
                  <div>No system audit logs found.</div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. USER ACTIVITY FEATURE */}
      {/* ========================================================================= */}
      {activeTab === 'userActivity' && (
        <div>
          <div className="summary-strip">
            <Summary
              label="Tracked activities"
              value={String(userActivities.length)}
              caption="Recorded across workspace"
            />
            <Summary
              label="Normal operations"
              value={String(userActivities.filter((a) => a.flag === 'Normal').length)}
              caption="Standard user usage"
            />
            <Summary
              label="Suspicious / Flagged"
              value={String(userActivities.filter((a) => a.flag !== 'Normal').length)}
              caption="Detected security alerts"
              tone={userActivities.filter((a) => a.flag !== 'Normal').length > 0 ? 'warning' : 'neutral'}
            />
          </div>

          <section className="surface-card table-card">
            <div className="table-tools">
              <div className="search-wrap" style={{ minWidth: 280 }}>
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Search user, activity, or description..."
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  data-testid="input-activity-search"
                />
              </div>

              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {[
                  'All',
                  '🔐 Authentication',
                  '👤 Account Activity',
                  '📦 Inventory Activity',
                  '💰 Sales & Wholesale Activity',
                  '⚙️ System Activity',
                ].map((mod) => (
                  <button
                    key={mod}
                    type="button"
                    className={`button ${activityModuleFilter === mod ? 'dark' : 'soft'}`}
                    style={{ padding: '6px 10px', fontSize: 10, whiteSpace: 'nowrap' }}
                    onClick={() => setActivityModuleFilter(mod)}
                    data-testid={`filter-mod-${mod.slice(0, 5)}`}
                  >
                    {mod === 'All' ? 'All modules' : mod}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Activity</th>
                    <th>Module</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((act) => (
                    <tr key={act.id} data-testid={`row-activity-${act.id}`}>
                      <td className="muted">{act.dateTime}</td>
                      <td><strong>{act.user}</strong></td>
                      <td><span className="pill neutral">{act.role}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{act.activity}</span>
                          {act.flag !== 'Normal' && (
                            <span className={`pill ${act.flag === 'Flagged' ? 'danger' : 'warning'}`} style={{ fontSize: 9 }}>
                              {act.flag}
                            </span>
                          )}
                        </div>
                      </td>
                      <td><span className="muted" style={{ fontSize: 11 }}>{act.module}</span></td>
                      <td style={{ maxWidth: 360, whiteSpace: 'normal', fontSize: 11 }}>{act.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredActivities.length === 0 && (
                <div className="empty-state">
                  <Activity size={28} />
                  <div>No user activities match the filter.</div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TRANSACTION DETAILS MODAL */}
      {/* ========================================================================= */}
      {selectedTrx && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setSelectedTrx(null)}
        >
          <div className="modal" style={{ width: 'min(680px, 100%)' }}>
            <div className="modal-header">
              <div>
                <h2>Transaction details</h2>
                <p className="modal-sub">Receipt &amp; payment summary for {selectedTrx.transactionNumber}</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedTrx(null)}
                data-testid="button-close-trx-modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Transaction Information */}
            <div style={{ background: 'hsl(var(--surface-soft))', border: '1px solid hsl(var(--border))', padding: '16px 18px', borderRadius: 14, marginBottom: 18 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'hsl(var(--muted))', fontWeight: 700 }}>
                Transaction Information
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 12 }}>
                <div><span className="muted" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Transaction ID:</span> <strong style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.transactionNumber}</strong></div>
                <div><span className="muted" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Date &amp; time:</span> <strong style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.dateTime}</strong></div>
                <div><span className="muted" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Processed by:</span> <strong style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.user}</strong></div>
                <div>
                  <span className="muted" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Business type:</span>{' '}
                  <span className={`pill ${selectedTrx.businessType === 'Wholesale' ? 'warning' : 'neutral'}`} style={{ fontSize: 9 }}>
                    {selectedTrx.businessType}
                  </span>
                </div>
                <div style={{ gridColumn: '1 / -1' }}><span className="muted" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Customer:</span> <strong style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.customer}</strong></div>
              </div>
            </div>

            {/* Items Purchased Table */}
            <div style={{ marginBottom: 18 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'hsl(var(--muted))', fontWeight: 700 }}>
                Items Purchased
              </h4>
              <div className="table-scroll" style={{ border: '1px solid hsl(var(--border))', borderRadius: 12, overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: 'center' }}>Quantity</th>
                      <th style={{ textAlign: 'right' }}>Unit Price</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTrx.items.map((item, idx) => (
                      <tr key={idx}>
                        <td><strong>{item.product}</strong></td>
                        <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }} className="muted">{item.unitPrice}</td>
                        <td style={{ textAlign: 'right' }}><strong>{item.subtotal}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Summary */}
            <div style={{ background: 'hsl(var(--surface-soft))', border: '1px solid hsl(var(--border))', padding: '16px 18px', borderRadius: 14 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'hsl(var(--muted))', fontWeight: 700 }}>
                Payment Summary
              </h4>
              <div style={{ display: 'grid', gap: 7, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Subtotal:</span>
                  <span style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.subtotal}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Discount:</span>
                  <span style={{ color: '#FF3B30' }}>-{selectedTrx.discount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">VAT (12%):</span>
                  <span style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.vat}</span>
                </div>
                <div style={{ height: 1, background: 'hsl(var(--border))', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <strong>Total Amount:</strong>
                  <strong style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.total}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Amount Received:</span>
                  <span style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.amountReceived}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Change:</span>
                  <span style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.change}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Payment Method:</span>
                  <strong style={{ color: 'hsl(var(--foreground))' }}>{selectedTrx.payment}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* SYSTEM LOG DETAILS MODAL */}
      {/* ========================================================================= */}
      {selectedLog && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.currentTarget === event.target && setSelectedLog(null)}
        >
          <div className="modal" style={{ width: 'min(620px, 100%)' }}>
            <div className="modal-header">
              <div>
                <h2>System log details</h2>
                <p className="modal-sub">Security and audit log inspection</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedLog(null)}
                data-testid="button-close-log-modal"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 14, overflowX: 'auto', background: 'hsl(var(--surface))' }}>
              <table className="data-table" style={{ width: '100%', minWidth: 480 }}>
                <tbody>
                  <tr>
                    <td style={{ width: 140, fontWeight: 600, background: 'hsl(var(--surface-soft))', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>Date &amp; Time</td>
                    <td style={{ color: 'hsl(var(--foreground))' }}>{selectedLog.dateTime}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, background: 'hsl(var(--surface-soft))', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>User</td>
                    <td><strong style={{ color: 'hsl(var(--foreground))' }}>{selectedLog.user}</strong></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, background: 'hsl(var(--surface-soft))', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>Role</td>
                    <td><span className="pill neutral">{selectedLog.role}</span></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, background: 'hsl(var(--surface-soft))', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>Action</td>
                    <td><strong style={{ color: 'hsl(var(--foreground))' }}>{selectedLog.action}</strong></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, background: 'hsl(var(--surface-soft))', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>Module/Feature</td>
                    <td style={{ color: 'hsl(var(--foreground))' }}>{selectedLog.module}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, background: 'hsl(var(--surface-soft))', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>Description</td>
                    <td>
                      <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', padding: '4px 0', maxWidth: 420, color: 'hsl(var(--foreground))' }}>
                        {selectedLog.description}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, background: 'hsl(var(--surface-soft))', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>Status</td>
                    <td>
                      <span className={`pill ${selectedLog.status === 'Success' ? 'success' : 'danger'}`}>
                        {selectedLog.status}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, background: 'hsl(var(--surface-soft))', color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>Device/IP</td>
                    <td className="muted">{selectedLog.deviceIp}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function UserManagementPage({
  users,
  setUsers,
  onToast,
}: {
  users: UserRecord[];
  setUsers: (users: UserRecord[]) => void;
  onToast: ToastFn;
}) {
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<"create" | "edit" | "reset" | null>(
    null,
  );
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    username: "",
    role: "Pharmacist",
    phone: "",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dialog]);

  const openCreate = () => {
    setSelected(null);
    setDraft({ name: "", username: "", role: "Cashier", phone: "" });
    setDialog("create");
  };
  const openEdit = (user: UserRecord) => {
    setSelected(user);
    setDraft({
      name: user.name,
      username: user.username,
      role: user.role,
      phone: user.phone,
    });
    setDialog("edit");
  };
  const toggleStatus = (user: UserRecord) => {
    const next = user.status === "Active" ? "Inactive" : "Active";
    setUsers(users.map((u) => (u.id === user.id ? { ...u, status: next } : u)));
    onToast(`${user.name} is now ${next.toLowerCase()}`);
  };
  const submitUser = async (event: FormEvent, password = "") => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.username.trim()) return;

    if (dialog === "create") {
      const dbRole =
        draft.role === "Administrator"
          ? "admin"
          : draft.role === "Front Desk"
            ? "frontdesk"
            : "cashier";
      try {
        const response = await fetch("http://localhost:5000/api/users", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: draft.username,
            password,
            fullName: draft.name,
            contactNumber: draft.phone,
            role: dbRole,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          onToast(data.error ?? "Failed to create user");
          return;
        }
        const initials = draft.name
          .split(" ")
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        setUsers([
          ...users,
          {
            id: data.id || Date.now(),
            initials,
            name: draft.name,
            username: draft.username,
            role: draft.role,
            status: "Active",
            lastActive: "Just now",
            phone: draft.phone,
          },
        ]);
        onToast("Account created");
      } catch {
        onToast("Could not create user. Please check your session.");
        return;
      }
    } else if (selected) {
      const dbRole =
        draft.role === "Administrator"
          ? "admin"
          : draft.role === "Front Desk"
            ? "frontdesk"
            : "cashier";
      try {
        const response = await fetch(
          `http://localhost:5000/api/users/${selected.id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: dbRole,
              fullName: draft.name,
              contactNumber: draft.phone,
            }),
          },
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          onToast(data.error ?? "Failed to update user");
          return;
        }
      } catch {
        onToast("Could not reach the server.");
        return;
      }
      setUsers(
        users.map((user) =>
          user.id === selected.id
            ? {
                ...user,
                name: draft.name,
                username: draft.username,
                role: draft.role,
                phone: draft.phone,
                initials: draft.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase(),
              }
            : user,
        ),
      );
      onToast("User profile updated");
    }

    setDialog(null);
    return;
  };
  const remove = (user: UserRecord) => {
    if (window.confirm(`Remove ${user.name} from Medprix?`)) {
      setUsers(users.filter((item) => item.id !== user.id));
      onToast("User account removed");
    }
  };
  const reset = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetError("");
    setDialog(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    onToast(`Password successfully updated for ${selected?.name}`);
  };
  const shown = users.filter((user) =>
    `${user.name} ${user.username} ${user.role}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeading
        title="User Management"
        description="Give the right people the right access, without the guesswork."
        action={
          <button
            className="button dark"
            data-testid="button-create-account"
            onClick={openCreate}>
            <Plus size={14} /> Create account
          </button>
        }
      />
      <div className="summary-strip">
        <Summary
          label="Team members"
          value={String(users.length)}
          caption="Across your workspace"
        />
        <Summary
          label="Active accounts"
          value={String(users.filter((u) => u.status === "Active").length)}
          caption="Access is current"
        />
        <Summary
          label="Inactive accounts"
          value={String(users.filter((u) => u.status === "Inactive").length)}
          caption="No workspace access"
          tone="warning"
        />
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div className="search-wrap">
            <Search size={15} />
            <input
              data-testid="input-user-search"
              type="search"
              placeholder="Search name, email, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted" style={{ fontSize: 11 }}>
            {shown.length} accounts
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Phone number</th>
                <th>Status</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((user) => (
                <tr key={user.id} data-testid={`row-user-${user.id}`}>
                  <td>
                    <div className="product-cell">
                      <span
                        className="avatar"
                        style={{
                          width: 32,
                          height: 32,
                          border: 0,
                          boxShadow: "none",
                          background: "#17171a",
                          color: "#fff",
                        }}>
                        {user.initials}
                      </span>
                      <div>
                        <strong>{user.name}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>
                          {user.username}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ height: 30, padding: "0 8px" }}
                      data-testid={`select-role-${user.id}`}
                      value={user.role}
                      onChange={async (e) => {
                        const newRoleLabel = e.target.value;
                        const dbRole =
                          newRoleLabel === "Administrator"
                            ? "admin"
                            : newRoleLabel === "Front Desk"
                              ? "frontdesk"
                              : "cashier";
                        try {
                          const response = await fetch(
                            `http://localhost:5000/api/users/${user.id}`,
                            {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ role: dbRole }),
                            },
                          );
                          if (!response.ok) {
                            const data = await response
                              .json()
                              .catch(() => ({}));
                            onToast(data.error ?? "Failed to update role");
                            return;
                          }
                        } catch {
                          onToast("Could not reach the server.");
                          return;
                        }
                        setUsers(
                          users.map((item) =>
                            item.id === user.id
                              ? { ...item, role: newRoleLabel }
                              : item,
                          ),
                        );
                        onToast("Role updated");
                      }}>
                      <option>Administrator</option>
                      <option>Front Desk</option>
                      <option>Cashier</option>
                    </select>
                  </td>
                  <td className="muted">{user.phone || "\u2014"}</td>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        className={`pill ${user.status === "Active" ? "success" : "neutral"}`}>
                        {user.status}
                      </span>
                      <button
                        className={`toggle ${user.status === "Active" ? "on" : ""}`}
                        data-testid={`toggle-status-${user.id}`}
                        aria-pressed={user.status === "Active"}
                        onClick={() => toggleStatus(user)}
                        title={`Set ${user.status === "Active" ? "inactive" : "active"}`}>
                        <span />
                      </button>
                    </div>
                  </td>
                  <td className="muted">{user.lastActive}</td>
                  <td>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button
                        className="icon-button"
                        data-testid={`button-edit-user-${user.id}`}
                        aria-label={`Edit ${user.name}`}
                        onClick={() => openEdit(user)}>
                        <Pencil size={13} />
                      </button>
                      <button
                        className="icon-button"
                        data-testid={`button-reset-user-${user.id}`}
                        aria-label={`Reset password for ${user.name}`}
                        onClick={() => {
                          setSelected(user);
                          setPassword("");
                          setConfirmPassword("");
                          setShowPassword(false);
                          setShowConfirmPassword(false);
                          setResetError("");
                          setDialog("reset");
                        }}>
                        <KeyRound size={13} />
                      </button>
                      <button
                        className="icon-button"
                        data-testid={`button-delete-user-${user.id}`}
                        aria-label={`Delete ${user.name}`}
                        onClick={() => remove(user)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="empty-state">
              <Users size={25} />
              <div>No user accounts match your search.</div>
            </div>
          )}
        </div>
      </section>
      {(dialog === "create" || dialog === "edit") && (
        <UserDialog
          title={dialog === "create" ? "Create account" : "Edit profile"}
          isCreate={dialog === "create"}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setDialog(null)}
          onSubmit={submitUser}
        />
      )}
      {dialog === "reset" &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setDialog(null)
            }>
            <form className="modal dialog" onSubmit={reset}>
              <div className="modal-header">
                <div>
                  <h2>Reset password</h2>
                  <p className="modal-sub">
                    Set a new password for {selected?.name}.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  data-testid="button-close-reset"
                  onClick={() => setDialog(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field" style={{ position: "relative" }}>
                  <label htmlFor="reset-password">New password</label>
                  <input
                    id="reset-password"
                    data-testid="input-reset-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    style={{ paddingRight: 38 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 10,
                      bottom: 9,
                      background: "none",
                      border: 0,
                      color: "#a9a6b1",
                      cursor: "pointer",
                      padding: 2,
                    }}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="field" style={{ position: "relative" }}>
                  <label htmlFor="reset-confirm">Confirm password</label>
                  <input
                    id="reset-confirm"
                    data-testid="input-reset-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    style={{ paddingRight: 38 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 10,
                      bottom: 9,
                      background: "none",
                      border: 0,
                      color: "#a9a6b1",
                      cursor: "pointer",
                      padding: 2,
                    }}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }>
                    {showConfirmPassword ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                  </button>
                </div>
              </div>
              {resetError && (
                <p
                  style={{
                    color: "#FF453A",
                    fontSize: 11,
                    margin: "10px 0 0",
                  }}>
                  {resetError}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button soft"
                  onClick={() => setDialog(null)}>
                  Cancel
                </button>
                <button
                  className="button dark"
                  data-testid="button-confirm-reset"
                  type="submit">
                  Reset password <KeyRound size={13} />
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}

function UserDialog({
  title,
  isCreate,
  draft,
  setDraft,
  onClose,
  onSubmit,
}: {
  title: string;
  isCreate: boolean;
  draft: { name: string; username: string; role: string; phone: string };
  setDraft: (draft: {
    name: string;
    username: string;
    role: string;
    phone: string;
  }) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent, password: string) => void;
}) {
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isCreate) {
      if (password.length < 6) {
        setPwdError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPwd) {
        setPwdError("Passwords do not match.");
        return;
      }
    }
    setPwdError("");
    onSubmit(e, password);
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) =>
        event.currentTarget === event.target && onClose()
      }>
      <form className="modal dialog" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            <p className="modal-sub">Account details and workspace access.</p>
          </div>
          <button
            type="button"
            className="modal-close"
            data-testid="button-close-user-dialog"
            onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="user-name">Full name</label>
            <input
              id="user-name"
              data-testid="input-user-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Full name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="user-username">Username</label>
            <input
              id="user-username"
              data-testid="input-user-username"
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              placeholder="e.g. juan_dela_cruz"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="user-phone">Phone number</label>
            <input
              id="user-phone"
              data-testid="input-user-phone"
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="+63 9XX XXX XXXX"
            />
          </div>
          <div className="field">
            <label htmlFor="user-role">Role</label>
            <select
              id="user-role"
              data-testid="select-user-role"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
              <option>Administrator</option>
              <option>Front Desk</option>
              <option>Cashier</option>
            </select>
          </div>
          {isCreate && (
            <>
              <div className="field" style={{ position: "relative" }}>
                <label htmlFor="user-password">Password</label>
                <input
                  id="user-password"
                  data-testid="input-user-password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  style={{ paddingRight: 38 }}
                  required={isCreate}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 9,
                    background: "none",
                    border: 0,
                    color: "#a9a6b1",
                    cursor: "pointer",
                    padding: 2,
                  }}
                  aria-label={showPwd ? "Hide password" : "Show password"}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="field" style={{ position: "relative" }}>
                <label htmlFor="user-confirm">Confirm password</label>
                <input
                  id="user-confirm"
                  data-testid="input-user-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter password"
                  style={{ paddingRight: 38 }}
                  required={isCreate}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 9,
                    background: "none",
                    border: 0,
                    color: "#a9a6b1",
                    cursor: "pointer",
                    padding: 2,
                  }}
                  aria-label={showConfirm ? "Hide password" : "Show password"}>
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </>
          )}
        </div>
        {pwdError && (
          <p style={{ color: "#FF453A", fontSize: 11, margin: "10px 0 0" }}>
            {pwdError}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button soft" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button dark"
            data-testid="button-save-user"
            type="submit">
            <Check size={13} /> {isCreate ? "Create account" : "Save changes"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export default App;
