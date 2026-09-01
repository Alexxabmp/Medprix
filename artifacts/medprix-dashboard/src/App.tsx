import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
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

// Reports removed from nav Ã¢ ' now embedded in Dashboard
const navGroups = [
  {
    label: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["admin", "cashier"],
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
        roles: ["admin", "frontdesk"],
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
        label: "System admin",
        icon: Settings2,
        roles: ["admin"],
      },
      {
        href: "/user-management",
        label: "User management",
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

const products = [
  {
    id: "p1",
    name: "Paracetamol 500mg",
    sku: "MED-0421",
    category: "Pain relief",
    stock: 120,
    reorder: 40,
    price: "₱5.00",
    status: "Available",
  },
  {
    id: "p2",
    name: "Amoxicillin 500mg",
    sku: "MED-0184",
    category: "Antibiotics",
    stock: 8,
    reorder: 30,
    price: "₱12.00",
    status: "Low stock",
  },
  {
    id: "p3",
    name: "Vitamin C 1000mg",
    sku: "VIT-0223",
    category: "Vitamins",
    stock: 0,
    reorder: 25,
    price: "₱8.00",
    status: "Out of stock",
  },
  {
    id: "p4",
    name: "Cough relief syrup",
    sku: "MED-0552",
    category: "Respiratory",
    stock: 63,
    reorder: 20,
    price: "₱145.00",
    status: "Available",
  },
  {
    id: "p5",
    name: "Cetirizine 10mg",
    sku: "MED-0350",
    category: "Allergy",
    stock: 36,
    reorder: 18,
    price: "₱7.50",
    status: "Available",
  },
  {
    id: "p6",
    name: "Skin cream 30g",
    sku: "DER-0108",
    category: "Dermatology",
    stock: 12,
    reorder: 15,
    price: "₱220.00",
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
            <Route path="/inventory">
              <InventoryPage onToast={onToast} />
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
      cashier: "Nadia Reyes",
      status: "Completed",
    },
    {
      id: "CS-9400",
      time: "09:48 AM",
      items: 1,
      total: 145.0,
      method: "GCash",
      cashier: "Nadia Reyes",
      status: "Completed",
    },
    {
      id: "CS-9399",
      time: "09:12 AM",
      items: 5,
      total: 520.0,
      method: "Card",
      cashier: "Nadia Reyes",
      status: "Completed",
    },
    {
      id: "CS-9398",
      time: "08:35 AM",
      items: 2,
      total: 85.0,
      method: "Cash",
      cashier: "Nadia Reyes",
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
      cashier: "Nadia Reyes",
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

      {/* KPI Section */}
      <section className="kpi-grid">
        <Kpi
          label="Today's Shift Sales"
          value={`₱${(
            18450 + receipts.slice(4).reduce((a, b) => a + b.total, 0)
          ).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          change={`${receipts.length} receipts completed`}
          icon={Receipt}
          testId="card-kpi-shift-sales"
        />
        <Kpi
          label="Cash in Drawer"
          value="₱8,500.00"
          change="₱3,500 float + ₱5,000 sales"
          icon={CircleDollarSign}
          testId="card-kpi-drawer"
        />
        <Kpi
          label="Transactions Handled"
          value={`${receipts.length} Total`}
          change="Avg ₱439.28 / order"
          icon={ShoppingCart}
          testId="card-kpi-transactions"
        />
        <Kpi
          label="Till Status"
          value="Balanced"
          change="Last verified 10:00 AM"
          icon={ShieldCheck}
          testId="card-kpi-till"
        />
      </section>

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
              style={{ height: 42, fontSize: 14, fontWeight: 600 }}>
              <Receipt size={16} /> Complete & Print Receipt (₱
              {total.toFixed(2)})
            </button>
          </form>
        </section>

        {/* Right Column: Recent Sales & Shift Reconciliation */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Shift Transactions Card */}
          <section className="surface-card table-card" style={{ padding: 18 }}>
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div>
                <h2 className="card-title">Shift Receipts Log</h2>
                <p className="card-subtitle">
                  Transactions recorded during current shift
                </p>
              </div>
              <div className="search-wrap" style={{ width: 160 }}>
                <Search size={14} />
                <input
                  type="search"
                  placeholder="Receipt #..."
                  value={searchReceipt}
                  onChange={(e) => setSearchReceipt(e.target.value)}
                  style={{ height: 30, fontSize: 11 }}
                />
              </div>
            </div>

            <div
              className="table-scroll"
              style={{ minHeight: 450, maxHeight: 450 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Time</th>
                    <th>Method</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.id}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>
                          {r.items} items
                        </div>
                      </td>
                      <td className="muted">{r.time}</td>
                      <td>
                        <span
                          className={`pill ${r.method === "Cash" ? "success" : "neutral"}`}
                          style={{ fontSize: 10, padding: "2px 8px" }}>
                          {r.method}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        ₱{r.total.toFixed(2)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          style={{ width: 26, height: 26 }}
                          title="View Receipt Details"
                          onClick={() => setSelectedReceipt(r)}>
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* Modal: View Receipt Details */}
      {selectedReceipt && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedReceipt(null)}>
          <div
            className="modal dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400 }}>
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
                <span>Transaction Status</span>
                <span className="pill success">{selectedReceipt.status}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Payment Method</span>
                <strong>{selectedReceipt.method}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Total Items</span>
                <span>{selectedReceipt.items} units</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 16,
                  fontWeight: 700,
                  marginTop: 6,
                }}>
                <span>Total Paid</span>
                <span>₱{selectedReceipt.total.toFixed(2)}</span>
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
        </div>
      )}

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

// Ã¢' Ã¢' Ã¢'  Other pages (unchanged) Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢' Ã¢'

function InventoryPage({ onToast }: { onToast: ToastFn }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All status");
  const filtered = products.filter(
    (product) =>
      (filter === "All status" || product.status === filter) &&
      `${product.name} ${product.sku} ${product.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div>
      <PageHeading
        title="Inventory"
        description="A quiet, current view of every product on your shelves."
        action={
          <button
            className="button dark"
            data-testid="button-inventory-count"
            onClick={() => onToast("Inventory count session started")}>
            <ClipboardList size={14} /> Start count
          </button>
        }
      />
      <div className="summary-strip">
        <Summary
          label="Total products"
          value="850"
          caption="Across 12 categories"
        />
        <Summary
          label="Low stock"
          value="95"
          caption="Needs attention"
          tone="warning"
        />
        <Summary
          label="Inventory value"
          value="₱825,450"
          caption="+6.2% this month"
        />
      </div>
      <section className="surface-card table-card">
        <div className="table-tools">
          <div className="search-wrap">
            <Search size={15} />
            <input
              data-testid="input-inventory-search"
              type="search"
              placeholder="Search products, SKU, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select"
            data-testid="select-inventory-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}>
            <option>All status</option>
            <option>Available</option>
            <option>Low stock</option>
            <option>Out of stock</option>
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>In stock</th>
                <th>Reorder point</th>
                <th>Unit price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id} data-testid={`row-product-${product.id}`}>
                  <td>
                    <div className="product-cell">
                      <span className="product-symbol">
                        <Package size={15} />
                      </span>
                      <div>
                        <strong>{product.name}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>
                          {product.sku}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="muted">{product.category}</td>
                  <td>
                    <strong>{product.stock}</strong>{" "}
                    <span className="muted">units</span>
                  </td>
                  <td className="muted">{product.reorder}</td>
                  <td>{product.price}</td>
                  <td>
                    <span
                      className={`status-dot ${product.status === "Available" ? "green" : product.status === "Low stock" ? "amber" : "red"}`}
                    />
                    {product.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty-state">
              <Package size={25} />
              <div>No products match that search.</div>
            </div>
          )}
        </div>
      </section>
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
          <button
            className="button soft"
            data-testid="button-supplier-filter"
            onClick={() => onToast("Showing all supplier statuses")}>
            <ChevronDown size={14} /> All statuses
          </button>
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
              {suppliers.map((supplier) => (
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
  const statuses = ["All orders", "Pending approval", "In transit", "Received"];
  const filtered = orders.filter(
    (order) => status === "All orders" || order.status === status,
  );
  const advance = (id: string) => {
    setOrders(
      orders.map((order) =>
        order.id === id
          ? {
              ...order,
              status:
                order.status === "Pending approval"
                  ? "In transit"
                  : order.status === "In transit"
                    ? "Received"
                    : "Received",
            }
          : order,
      ),
    );
    onToast("Purchase order status updated");
  };
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
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
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
                    <span
                      className={`pill ${order.status === "Received" ? "success" : order.status === "Pending approval" ? "warning" : "neutral"}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="button soft"
                      data-testid={`button-advance-${order.id}`}
                      onClick={() => advance(order.id)}
                      disabled={order.status === "Received"}>
                      {order.status === "Pending approval"
                        ? "Approve"
                        : order.status === "In transit"
                          ? "Mark received"
                          : "Received"}
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

function WholesalePage({ onToast }: { onToast: ToastFn }) {
  const [orders, setOrders] = useState([
    {
      id: "WS-1608",
      customer: "St. Luke\u2019s Clinic",
      items: 38,
      value: "₱18,450",
      status: "Ready to dispatch",
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
  const process = (id: string) => {
    setOrders(
      orders.map((order) =>
        order.id === id
          ? {
              ...order,
              status:
                order.status === "Processing"
                  ? "Ready to dispatch"
                  : "Completed",
            }
          : order,
      ),
    );
    onToast("Wholesale order updated");
  };
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
          <button
            className="button soft"
            data-testid="button-wholesale-export"
            onClick={() => onToast("Wholesale order list exported")}>
            <ArrowDownToLine size={14} /> Export
          </button>
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
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
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
                    <span
                      className={`pill ${order.status === "Completed" ? "success" : "warning"}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="button soft"
                      data-testid={`button-process-${order.id}`}
                      onClick={() => process(order.id)}
                      disabled={order.status === "Completed"}>
                      {order.status === "Processing"
                        ? "Prepare"
                        : order.status === "Ready to dispatch"
                          ? "Complete"
                          : "Completed"}
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

function SystemAdminPage({ onToast }: { onToast: ToastFn }) {
  const [toggles, setToggles] = useState({
    alerts: true,
    lowStock: true,
    autoReorder: false,
    twoFactor: true,
    audit: true,
  });
  const flip = (key: keyof typeof toggles) =>
    setToggles((current) => ({ ...current, [key]: !current[key] }));
  return (
    <div>
      <PageHeading
        title="System admin"
        description="Set the operating rhythm and guardrails for your workspace."
        action={
          <button
            className="button dark"
            data-testid="button-save-settings"
            onClick={() => onToast("System preferences saved")}>
            <Check size={14} /> Save changes
          </button>
        }
      />
      <div className="dashboard-lower">
        <section className="surface-card list-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Workspace preferences</h2>
              <p className="card-subtitle">
                How Medprix keeps your team informed
              </p>
            </div>
            <Settings2 size={17} />
          </div>
          <ToggleRow
            label="Daily operations digest"
            detail="Send a morning snapshot to administrators"
            value={toggles.alerts}
            onClick={() => flip("alerts")}
            testId="toggle-digest"
          />
          <ToggleRow
            label="Low stock alerts"
            detail="Notify inventory leads when stock falls below reorder point"
            value={toggles.lowStock}
            onClick={() => flip("lowStock")}
            testId="toggle-low-stock"
          />
          <ToggleRow
            label="Automatic reorder drafts"
            detail="Create suggested POs for critical stock"
            value={toggles.autoReorder}
            onClick={() => flip("autoReorder")}
            testId="toggle-auto-reorder"
          />
        </section>
        <section className="surface-card list-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Security &amp; audit</h2>
              <p className="card-subtitle">
                Keep access accountable and easy to review
              </p>
            </div>
            <ShieldCheck size={17} />
          </div>
          <ToggleRow
            label="Two-step verification"
            detail="Require a second factor for administrators"
            value={toggles.twoFactor}
            onClick={() => flip("twoFactor")}
            testId="toggle-two-factor"
          />
          <ToggleRow
            label="Audit trail"
            detail="Record edits to products, users, and cash"
            value={toggles.audit}
            onClick={() => flip("audit")}
            testId="toggle-audit"
          />
          <div className="list-row" style={{ marginTop: 8 }}>
            <div className="row-icon">
              <Clock3 size={15} />
            </div>
            <div className="row-main">
              <strong>Last security review</strong>
              <span>August 12, 2026 · No issues found</span>
            </div>
            <span className="pill success">Healthy</span>
          </div>
        </section>
      </div>
      <section className="surface-card list-card" style={{ marginTop: 13 }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Connected tools</h2>
            <p className="card-subtitle">
              Services available to your workspace
            </p>
          </div>
        </div>
        {[
          ["Cash register", "Medprix POS · Connected", Check],
          ["Supplier catalog", "PharmaLink · Synced 18 min ago", RefreshCw],
          ["Backup archive", "Daily backup · Last run 04:00 AM", Archive],
        ].map(([name, detail, Icon]) => (
          <div className="list-row" key={name as string}>
            <div className="row-icon">
              <Icon size={15} />
            </div>
            <div className="row-main">
              <strong>{name as string}</strong>
              <span>{detail as string}</span>
            </div>
            <span className="pill success">Connected</span>
          </div>
        ))}
      </section>
    </div>
  );
}
function ToggleRow({
  label,
  detail,
  value,
  onClick,
  testId,
}: {
  label: string;
  detail: string;
  value: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <div className="toggle-row">
      <div className="row-main">
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <button
        className={`toggle ${value ? "on" : ""}`}
        data-testid={testId}
        aria-pressed={value}
        onClick={onClick}>
        <span />
      </button>
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
        title="User management"
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
