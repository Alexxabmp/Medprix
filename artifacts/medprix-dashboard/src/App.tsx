import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

type ToastFn = (message: string) => void;
type ReportType = 'sales' | 'inventory' | 'financial' | 'valuation' | 'movement' | 'cash';
type UserRecord = {
  id: number;
  initials: string;
  name: string;
  email: string;
  role: string;
  status: 'Active' | 'Invited' | 'Suspended';
  lastActive: string;
  permissions: string[];
};

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/reports', label: 'Reports', icon: FileBarChart },
      { href: '/inventory', label: 'Inventory', icon: Boxes },
      { href: '/supplier', label: 'Supplier', icon: Building2 },
      { href: '/procurement', label: 'Procurement', icon: ShoppingCart },
      { href: '/wholesale', label: 'Wholesale', icon: Receipt },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/system-ad', label: 'System admin', icon: Settings2 },
      { href: '/user-management', label: 'User management', icon: Users },
    ],
  },
];

const initialUsers: UserRecord[] = [
  { id: 1, initials: 'AM', name: 'Avery Morgan', email: 'avery@medprix.ph', role: 'Administrator', status: 'Active', lastActive: 'Just now', permissions: ['All access'] },
  { id: 2, initials: 'LS', name: 'Lena Santos', email: 'lena@medprix.ph', role: 'Pharmacist', status: 'Active', lastActive: '8 min ago', permissions: ['Inventory', 'Sales', 'Procurement'] },
  { id: 3, initials: 'JC', name: 'Jonas Cruz', email: 'jonas@medprix.ph', role: 'Inventory lead', status: 'Active', lastActive: '42 min ago', permissions: ['Inventory', 'Supplier'] },
  { id: 4, initials: 'NR', name: 'Nadia Reyes', email: 'nadia@medprix.ph', role: 'Cashier', status: 'Invited', lastActive: 'Pending invite', permissions: ['Sales'] },
];

const products = [
  { id: 'p1', name: 'Paracetamol 500mg', sku: 'MED-0421', category: 'Pain relief', stock: 120, reorder: 40, price: '₱5.00', status: 'Available' },
  { id: 'p2', name: 'Amoxicillin 500mg', sku: 'MED-0184', category: 'Antibiotics', stock: 8, reorder: 30, price: '₱12.00', status: 'Low stock' },
  { id: 'p3', name: 'Vitamin C 1000mg', sku: 'VIT-0223', category: 'Vitamins', stock: 0, reorder: 25, price: '₱8.00', status: 'Out of stock' },
  { id: 'p4', name: 'Cough relief syrup', sku: 'MED-0552', category: 'Respiratory', stock: 63, reorder: 20, price: '₱145.00', status: 'Available' },
  { id: 'p5', name: 'Cetirizine 10mg', sku: 'MED-0350', category: 'Allergy', stock: 36, reorder: 18, price: '₱7.50', status: 'Available' },
  { id: 'p6', name: 'Skin cream 30g', sku: 'DER-0108', category: 'Dermatology', stock: 12, reorder: 15, price: '₱220.00', status: 'Low stock' },
];

const suppliers = [
  { name: 'Southstar Distribution', code: 'SSD-104', contact: 'Mia Villanueva', orders: 18, value: '₱482,500', status: 'Preferred' },
  { name: 'Mercury Health Partners', code: 'MHP-221', contact: 'Paolo Garcia', orders: 12, value: '₱218,450', status: 'Preferred' },
  { name: 'Wellness Direct PH', code: 'WDP-308', contact: 'Anika Lim', orders: 7, value: '₱94,800', status: 'Review' },
  { name: 'CuraMed Trading', code: 'CMT-419', contact: 'Noah Tan', orders: 4, value: '₱45,320', status: 'On hold' },
];

const purchaseOrders = [
  { id: 'PO-24018', supplier: 'Southstar Distribution', date: 'Aug 18, 2026', items: 14, value: '₱38,420', status: 'In transit' },
  { id: 'PO-24017', supplier: 'Mercury Health Partners', date: 'Aug 17, 2026', items: 9, value: '₱21,850', status: 'Received' },
  { id: 'PO-24016', supplier: 'Wellness Direct PH', date: 'Aug 16, 2026', items: 22, value: '₱45,600', status: 'Pending approval' },
  { id: 'PO-24015', supplier: 'Southstar Distribution', date: 'Aug 15, 2026', items: 11, value: '₱16,740', status: 'Received' },
];

const movementFast = [{ name: 'Paracetamol 500mg', units: 250 }, { name: 'Vitamin C 1000mg', units: 180 }, { name: 'Cough relief syrup', units: 145 }];
const movementSlow = [{ name: 'Antacid chewables', units: 12 }, { name: 'Vitamin B Complex', units: 8 }, { name: 'Skin cream 30g', units: 5 }];

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppContent />
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AppContent() {
  const [location, setLocation] = useLocation();
  const [session, setSession] = useState(() => localStorage.getItem('medprix-session') === 'active');
  const [dark, setDark] = useState(() => localStorage.getItem('medprix-theme') === 'dark');
  const [toast, setToast] = useState('');
  const [users, setUsers] = useState<UserRecord[]>(initialUsers);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('medprix-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (location === '/') setLocation('/dashboard');
  }, [location, setLocation]);

  const notify: ToastFn = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  if (location === '/login') {
    return <LoginPage onLogin={() => { localStorage.setItem('medprix-session', 'active'); setSession(true); setLocation('/dashboard'); }} />;
  }

  return (
    <>
      <ErrorBoundary resetKey={location}>
        <AppShell dark={dark} setDark={setDark} onToast={notify} onLogout={() => { localStorage.removeItem('medprix-session'); setSession(false); setLocation('/login'); }} users={users} setUsers={setUsers} />
      </ErrorBoundary>
      {toast && <div className="toast" data-testid="status-toast"><Check size={15} />{toast}</div>}
    </>
  );
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) { setError('Enter your username and password to continue.'); return; }
    onLogin();
  };
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="brand-mark"><Pill size={16} strokeWidth={2.4} /></span><span>Medprix</span></div>
        <div className="eyebrow">Pharmacy operations workspace</div>
        <h1>Hello, Admin!</h1>
        <p>Sign in to keep your pharmacy moving with a clear view of sales, stock, and people.</p>
        <div className="field" style={{ marginBottom: 13 }}>
          <label htmlFor="login-username">Username</label>
          <input id="login-username" data-testid="input-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin@medprix.ph" autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input id="login-password" data-testid="input-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" />
        </div>
        {error && <p style={{ color: '#b34f45', margin: '10px 0 0', fontSize: 11 }} data-testid="status-login-error">{error}</p>}
        <button className="button dark full" data-testid="button-sign-in" type="submit" style={{ marginTop: 22 }}>Sign in <ArrowUpRight size={14} /></button>
        <div className="login-footer">Protected workspace · Medprix Pharmacy Group</div>
      </form>
    </main>
  );
}

function AppShell({ dark, setDark, onToast, onLogout, users, setUsers }: { dark: boolean; setDark: (value: boolean) => void; onToast: ToastFn; onLogout: () => void; users: UserRecord[]; setUsers: (users: UserRecord[]) => void }) {
  const [location] = useLocation();
  const pageName = location === '/dashboard' ? 'Dashboard' : navGroups.flatMap((group) => group.items).find((item) => item.href === location)?.label ?? 'Reports';
  return (
    <div className="app-shell">
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left"><Link href="/dashboard" className="brand" data-testid="link-medprix-home"><span className="brand-mark"><Pill size={16} strokeWidth={2.4} /></span><span>Medprix</span></Link></div>
          <nav className="top-nav" aria-label="Primary navigation" data-testid="nav-primary">
            {navGroups.flatMap((group) => group.items).map(({ href, label }) => <Link key={href} href={href} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`} className={`top-nav-item ${location === href ? 'active' : ''}`}>{label}</Link>)}
          </nav>
          <div className="top-actions">
            <button className="icon-button" data-testid="button-theme-toggle" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="avatar" data-testid="avatar-admin" aria-label="Sign out" title="Sign out" onClick={onLogout}>AM</button>
          </div>
        </header>
        <main className="content">
          <Switch>
            <Route path="/"><DashboardPage onToast={onToast} /></Route>
            <Route path="/dashboard"><DashboardPage onToast={onToast} /></Route>
            <Route path="/reports"><ReportsPage onToast={onToast} /></Route>
            <Route path="/inventory"><InventoryPage onToast={onToast} /></Route>
            <Route path="/supplier"><SupplierPage onToast={onToast} /></Route>
            <Route path="/procurement"><ProcurementPage onToast={onToast} /></Route>
            <Route path="/wholesale"><WholesalePage onToast={onToast} /></Route>
            <Route path="/system-ad"><SystemAdminPage onToast={onToast} /></Route>
            <Route path="/user-management"><UserManagementPage users={users} setUsers={setUsers} onToast={onToast} /></Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function DashboardPage({ onToast }: { onToast: ToastFn }) {
  const hours = ['12AM', '1AM', '2AM', '3AM', '4AM', '5AM', '6AM', '7AM', '8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM'];
  const values = [42, 36, 61, 84, 39, 96, 63, 35, 42, 64, 52, 83, 37, 45, 58, 0, 43, 43, 32];
  return <div>
    <PageHeading title="Hello, Admin!" description="Here’s the shape of your pharmacy today." action={<label className="date-control" data-testid="control-date"><CalendarDays size={14} /><span>Select date</span><input type="date" aria-label="Select date" defaultValue="2026-08-18" /></label>} />
    <section className="kpi-grid">
      <Kpi label="Sales" value="₱15,327" change="+12.8%" icon={CircleDollarSign} />
      <Kpi label="Tickets" value="3,500" change="+8.4%" icon={Receipt} />
      <Kpi label="Orders" value="1,556" change="+4.1%" icon={ShoppingCart} />
      <Kpi label="Visits" value="12.5K" change="+6.7%" icon={Activity} />
    </section>
    <section className="surface-card chart-card">
      <div className="card-header"><div><h2 className="card-title">Ticket sales</h2><p className="card-subtitle">Hourly transaction volume · today</p></div><div className="chart-legend"><span className="legend-dot" /> Tickets <ArrowUpRight size={13} /></div></div>
      <div className="bar-chart">{values.map((value, index) => <div className="bar-wrap" key={hours[index]}><div className={`bar ${value === 96 ? 'peak' : ''}`} style={{ height: `${Math.max(value * .82, 2)}%` }}><span className="bar-value">{value}</span></div><span className="bar-label">{hours[index]}</span></div>)}</div>
    </section>
    <div className="dashboard-lower">
      <section className="surface-card list-card"><div className="card-header"><div><h2 className="card-title">Today’s events</h2><p className="card-subtitle">Activity across your pharmacy</p></div><button className="icon-button" data-testid="button-events-more" onClick={() => onToast('All events are up to date')}><MoreHorizontal size={16} /></button></div>
        {[['Purchase order received', 'Southstar Distribution · 14 items', 'Received', 'success', Package], ['Inventory count scheduled', 'Aisle B · 2:30 PM', 'Pending', 'warning', ClipboardList], ['Cash drawer reconciliation', 'Morning shift · register 02', 'Review', 'danger', CircleDollarSign], ['New staff invitation', 'Nadia Reyes · Cashier', 'Sent', 'neutral', UserRound]].map(([title, detail, status, tone, Icon], index) => <div className="list-row" key={title as string}><div className="row-icon"><Icon size={15} /></div><div className="row-main"><strong>{title as string}</strong><span>{detail as string}</span></div><span className={`pill ${tone as string}`}>{status as string}</span><span className="row-side">{index + 1}h ago</span></div>)}
      </section>
      <section className="surface-card list-card"><div className="card-header"><div><h2 className="card-title">Latest sales</h2><p className="card-subtitle">Most recent completed tickets</p></div><button className="button soft" data-testid="button-view-sales" onClick={() => onToast('Sales ledger opened')}>View all</button></div>
        {[['TX-8924', 'Lena Santos', '₱1,245.00'], ['TX-8923', 'Jonas Cruz', '₱860.50'], ['TX-8922', 'Nadia Reyes', '₱2,130.00'], ['TX-8921', 'Walk-in customer', '₱425.00'], ['TX-8920', 'Lena Santos', '₱730.25']].map(([id, person, amount], index) => <div className="list-row" key={id}><div className="row-icon" style={{ background: index % 2 ? 'hsl(var(--mint))' : 'hsl(var(--accent-soft))' }}><Receipt size={14} /></div><div className="row-main"><strong>{id}</strong><span>{person}</span></div><strong className="row-side" style={{ color: 'hsl(var(--foreground))' }}>{amount}</strong></div>)}
      </section>
    </div>
  </div>;
}

function Kpi({ label, value, change, icon: Icon }: { label: string; value: string; change: string; icon: LucideIcon }) {
  return <div className="surface-card kpi-card" data-testid={`metric-${label.toLowerCase()}`}><div className="kpi-top"><span>{label}</span><span className="kpi-icon"><Icon size={15} /></span></div><div className="kpi-value">{value}<span className="kpi-change">{change}</span></div></div>;
}

const reportCards: { type: ReportType; title: string; description: string; action: string; icon: LucideIcon }[] = [
  { type: 'sales', title: 'Daily sales', description: 'View today’s sales performance and payment mix.', action: 'View report', icon: BarChart3 },
  { type: 'inventory', title: 'Inventory', description: 'View current stock levels and replenishment needs.', action: 'View report', icon: Package },
  { type: 'financial', title: 'Financial summary', description: 'Understand the month’s financial performance.', action: 'View report', icon: CircleDollarSign },
  { type: 'valuation', title: 'Stock valuation', description: 'See the current value held in your inventory.', action: 'View valuation', icon: Boxes },
  { type: 'movement', title: 'Product movement', description: 'Compare fast and slow-moving products.', action: 'View list', icon: RefreshCw },
  { type: 'cash', title: 'Cash mismatch', description: 'Review cash versus recorded sales discrepancies.', action: 'View alerts', icon: FileBarChart },
];

function ReportsPage({ onToast }: { onToast: ToastFn }) {
  const [report, setReport] = useState<ReportType | null>(null);
  return <div><PageHeading title="Reports" description="View and generate pharmacy reports" /><div className="reports-grid">{reportCards.map(({ type, title, description, action, icon: Icon }) => <button className="surface-card report-card" key={type} data-testid={`card-report-${type}`} onClick={() => setReport(type)}><span className="report-icon"><Icon size={19} /></span><h3>{title}</h3><p>{description}</p><span className="button dark">{action}<ArrowUpRight size={13} /></span></button>)}</div>{report && <ReportModal type={report} onClose={() => setReport(null)} onToast={onToast} />}</div>;
}

function exportReport(type: ReportType, onToast: ToastFn) {
  const content = `Medprix ${type} report\nGenerated August 18, 2026\n\nThis local report contains the latest pharmacy operations snapshot.`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  link.download = `medprix-${type}-report.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
  onToast('Report exported successfully');
}

function ReportModal({ type, onClose, onToast }: { type: ReportType; onClose: () => void; onToast: ToastFn }) {
  const [movementTab, setMovementTab] = useState<'fast' | 'slow'>('fast');
  const [cashDetails, setCashDetails] = useState(false);
  useEffect(() => { const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [onClose]);
  const titles: Record<ReportType, string> = { sales: 'Daily sales report', inventory: 'Inventory report', financial: 'Financial summary', valuation: 'Stock valuation', movement: 'Product movement', cash: cashDetails ? 'Cash mismatch details' : 'Cash mismatch alerts' };
  return <div className="modal-backdrop" data-testid="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" data-testid={`modal-report-${type}`}><div className="modal-header"><div><h2>{titles[type]}</h2><p className="modal-sub">{type === 'financial' ? 'Period: August 2026' : `August 18, 2026 · Medprix Central`}</p></div><button className="modal-close" data-testid="button-close-modal" onClick={onClose}><X size={16} /></button></div>
    {type === 'sales' && <><div className="report-metrics"><ReportMetric label="Total sales" value="₱45,250" /><ReportMetric label="Transactions" value="128" /><ReportMetric label="Products sold" value="356" /></div><ModalSection title="Payment method"><ModalRow label="Cash" value="₱25,000" /><ModalRow label="Card" value="₱12,500" /><ModalRow label="E-wallet" value="₱7,750" /></ModalSection></>}
    {type === 'inventory' && <><div className="report-metrics"><ReportMetric label="Total products" value="850" /><ReportMetric label="In stock" value="720" /><ReportMetric label="Low stock" value="95" /></div><ModalSection title="Stock watchlist"><ModalTable headers={['Product', 'Stock', 'Status']} rows={products.slice(0, 3).map((product) => [product.name, String(product.stock), product.status])} /></ModalSection></>}
    {type === 'financial' && <><div className="report-metrics"><ReportMetric label="Total sales" value="₱450,000" /><ReportMetric label="Expenses" value="₱85,000" /><ReportMetric label="Net profit" value="₱365,000" /></div><ModalSection title="Summary"><ModalRow label="Gross margin" value="81.1%" /><ModalRow label="Operating expenses" value="₱85,000" /><ModalRow label="Net profit margin" value="81.1%" /></ModalSection></>}
    {type === 'valuation' && <><div className="report-metrics"><ReportMetric label="Current stock value" value="₱825,450" /><ReportMetric label="Units held" value="4,280" /><ReportMetric label="SKUs tracked" value="850" /></div><ModalSection title="Value by product"><ModalTable headers={['Product', 'Qty', 'Value']} rows={[['Paracetamol', '120', '₱600'], ['Amoxicillin', '80', '₱960'], ['Vitamin C', '50', '₱400']]} /></ModalSection></>}
    {type === 'movement' && <><div className="modal-tabs"><button className={`modal-tab ${movementTab === 'fast' ? 'active' : ''}`} data-testid="tab-fast-moving" onClick={() => setMovementTab('fast')}>Fast moving</button><button className={`modal-tab ${movementTab === 'slow' ? 'active' : ''}`} data-testid="tab-slow-moving" onClick={() => setMovementTab('slow')}>Slow moving</button></div><ModalTable headers={['Product', 'Units sold']} rows={(movementTab === 'fast' ? movementFast : movementSlow).map((item) => [item.name, String(item.units)])} /></>}
     {type === 'cash' && !cashDetails && <><div className="report-metrics"><ReportMetric label="Open alerts" value="2" /><ReportMetric label="Short" value="₱500" /><ReportMetric label="Over" value="₱1,000" /></div><ModalSection title="2 inconsistencies detected"><ModalTable headers={['Date', 'Expected', 'Recorded', 'Difference']} rows={[['Aug 18', '₱25,450', '₱24,950', '-₱500'], ['Aug 17', '₱31,200', '₱32,200', '+₱1,000']]} /></ModalSection><div className="modal-actions"><button className="button dark" data-testid="button-view-cash-details" onClick={() => setCashDetails(true)}>View details <ArrowUpRight size={13} /></button></div></>}
    {type === 'cash' && cashDetails && <><ModalSection title="Shift reconciliation"><ModalRow label="Date" value="August 18, 2026" /><ModalRow label="Shift" value="Morning" /><ModalRow label="Recorded sales" value="₱25,450" /><ModalRow label="Expected cash" value="₱25,450" /><ModalRow label="Actual cash" value="₱24,950" /><ModalRow label="Difference" value="-₱500" /></ModalSection><div style={{ marginTop: 16, padding: 13, borderRadius: 12, background: '#30272b', color: '#ffb5ad', fontSize: 12 }}>Cash is ₱500 short. Review the register transactions before closing the shift.</div><div className="modal-actions"><button className="button dark" data-testid="button-view-transactions" onClick={() => onToast('Showing register transactions for the morning shift')}>View transactions <ArrowUpRight size={13} /></button></div></>}
    {type !== 'cash' && <div className="modal-actions"><button className="button dark" data-testid="button-export-report" onClick={() => exportReport(type, onToast)}><Download size={14} /> Export report</button></div>}
  </section></div>;
}

function ReportMetric({ label, value }: { label: string; value: string }) { return <div className="report-metric"><span>{label}</span><strong>{value}</strong></div>; }
function ModalSection({ title, children }: { title: string; children: ReactNode }) { return <div className="modal-section"><h4>{title}</h4>{children}</div>; }
function ModalRow({ label, value }: { label: string; value: string }) { return <div className="modal-row"><span>{label}</span><strong>{value}</strong></div>; }
function ModalTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cellIndex === row.length - 1 && (cell.includes('stock') || cell.includes('Available')) ? <span className="pill success">{cell}</span> : cell}</td>)}</tr>)}</tbody></table>; }

function InventoryPage({ onToast }: { onToast: ToastFn }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All status');
  const filtered = products.filter((product) => (filter === 'All status' || product.status === filter) && `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase()));
  return <div><PageHeading title="Inventory" description="A quiet, current view of every product on your shelves." action={<button className="button dark" data-testid="button-inventory-count" onClick={() => onToast('Inventory count session started')}><ClipboardList size={14} /> Start count</button>} /><div className="summary-strip"><Summary label="Total products" value="850" caption="Across 12 categories" /><Summary label="Low stock" value="95" caption="Needs attention" tone="warning" /><Summary label="Inventory value" value="₱825,450" caption="+6.2% this month" /></div><section className="surface-card table-card"><div className="table-tools"><div className="search-wrap"><Search size={15} /><input data-testid="input-inventory-search" type="search" placeholder="Search products, SKU, category..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="select" data-testid="select-inventory-filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option>All status</option><option>Available</option><option>Low stock</option><option>Out of stock</option></select></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>Category</th><th>In stock</th><th>Reorder point</th><th>Unit price</th><th>Status</th></tr></thead><tbody>{filtered.map((product) => <tr key={product.id} data-testid={`row-product-${product.id}`}><td><div className="product-cell"><span className="product-symbol"><Package size={15} /></span><div><strong>{product.name}</strong><div className="muted" style={{ fontSize: 10 }}>{product.sku}</div></div></div></td><td className="muted">{product.category}</td><td><strong>{product.stock}</strong> <span className="muted">units</span></td><td className="muted">{product.reorder}</td><td>{product.price}</td><td><span className={`status-dot ${product.status === 'Available' ? 'green' : product.status === 'Low stock' ? 'amber' : 'red'}`} />{product.status}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state"><Package size={25} /><div>No products match that search.</div></div>}</div></section></div>;
}
function Summary({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: string }) { return <div className="surface-card summary-box"><span>{label}</span><strong>{value}</strong><small style={tone === 'warning' ? { color: '#ad7f16' } : undefined}>{caption}</small></div>; }

function SupplierPage({ onToast }: { onToast: ToastFn }) {
  return <div><PageHeading title="Supplier" description="Know who keeps your shelves ready, and how they are performing." action={<button className="button dark" data-testid="button-add-supplier" onClick={() => onToast('Supplier onboarding form is ready') }><Plus size={14} /> Add supplier</button>} /><div className="summary-strip"><Summary label="Active suppliers" value="18" caption="4 preferred partners" /><Summary label="Open purchase value" value="₱102,610" caption="Across 3 orders" /><Summary label="On-time delivery" value="94.6%" caption="+2.1% this quarter" /></div><section className="surface-card table-card"><div className="table-tools"><div><h2 className="card-title">Supplier directory</h2><p className="card-subtitle">Commercial partners and current standing</p></div><button className="button soft" data-testid="button-supplier-filter" onClick={() => onToast('Showing all supplier statuses')}><ChevronDown size={14} /> All statuses</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Supplier</th><th>Primary contact</th><th>Orders YTD</th><th>Order value</th><th>Status</th><th /></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.code}><td><div className="product-cell"><span className="product-symbol" style={{ background: 'hsl(var(--mint))' }}><Building2 size={15} /></span><div><strong>{supplier.name}</strong><div className="muted" style={{ fontSize: 10 }}>{supplier.code}</div></div></div></td><td>{supplier.contact}</td><td>{supplier.orders}</td><td><strong>{supplier.value}</strong></td><td><span className={`pill ${supplier.status === 'Preferred' ? 'success' : supplier.status === 'Review' ? 'warning' : 'danger'}`}>{supplier.status}</span></td><td><button className="icon-button" data-testid={`button-view-supplier-${supplier.code}`} onClick={() => onToast(`${supplier.name} profile opened`)}><ArrowUpRight size={14} /></button></td></tr>)}</tbody></table></div></section></div>;
}

function ProcurementPage({ onToast }: { onToast: ToastFn }) {
  const [status, setStatus] = useState('All orders');
  const [orders, setOrders] = useState(purchaseOrders);
  const statuses = ['All orders', 'Pending approval', 'In transit', 'Received'];
  const filtered = orders.filter((order) => status === 'All orders' || order.status === status);
  const advance = (id: string) => { setOrders(orders.map((order) => order.id === id ? { ...order, status: order.status === 'Pending approval' ? 'In transit' : order.status === 'In transit' ? 'Received' : 'Received' } : order)); onToast('Purchase order status updated'); };
  return <div><PageHeading title="Procurement" description="Keep purchasing predictable from request to receiving." action={<button className="button dark" data-testid="button-create-po" onClick={() => onToast('New purchase order draft created')}><Plus size={14} /> New purchase order</button>} /><div className="summary-strip"><Summary label="Open orders" value="3" caption="₱102,610 committed" /><Summary label="Awaiting approval" value="1" caption="Needs your review" tone="warning" /><Summary label="Received this month" value="24" caption="+5 vs last month" /></div><section className="surface-card table-card"><div className="table-tools"><div><h2 className="card-title">Purchase orders</h2><p className="card-subtitle">Latest orders and delivery status</p></div><select className="select" data-testid="select-procurement-status" value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Supplier</th><th>Placed</th><th>Items</th><th>Value</th><th>Status</th><th /></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.supplier}</td><td className="muted">{order.date}</td><td>{order.items}</td><td><strong>{order.value}</strong></td><td><span className={`pill ${order.status === 'Received' ? 'success' : order.status === 'Pending approval' ? 'warning' : 'neutral'}`}>{order.status}</span></td><td><button className="button soft" data-testid={`button-advance-${order.id}`} onClick={() => advance(order.id)} disabled={order.status === 'Received'}>{order.status === 'Pending approval' ? 'Approve' : order.status === 'In transit' ? 'Mark received' : 'Received'}</button></td></tr>)}</tbody></table></div></section></div>;
}

function WholesalePage({ onToast }: { onToast: ToastFn }) {
  const [orders, setOrders] = useState([{ id: 'WS-1608', customer: 'St. Luke’s Clinic', items: 38, value: '₱18,450', status: 'Ready to dispatch' }, { id: 'WS-1607', customer: 'Greenfield Care Home', items: 24, value: '₱9,820', status: 'Processing' }, { id: 'WS-1606', customer: 'Mabini Medical Center', items: 62, value: '₱42,150', status: 'Completed' }, { id: 'WS-1605', customer: 'Brightwell Pharmacy', items: 17, value: '₱7,250', status: 'Completed' }]);
  const process = (id: string) => { setOrders(orders.map((order) => order.id === id ? { ...order, status: order.status === 'Processing' ? 'Ready to dispatch' : 'Completed' } : order)); onToast('Wholesale order updated'); };
  return <div><PageHeading title="Wholesale" description="A focused view of partner orders and fulfillment." action={<button className="button dark" data-testid="button-new-wholesale" onClick={() => onToast('Wholesale order draft opened')}><Plus size={14} /> New wholesale order</button>} /><div className="summary-strip"><Summary label="Wholesale sales" value="₱77,670" caption="+14.2% this month" /><Summary label="Open orders" value="2" caption="Ready for fulfillment" /><Summary label="Partner accounts" value="36" caption="4 new this month" /></div><section className="surface-card table-card"><div className="table-tools"><div><h2 className="card-title">Partner orders</h2><p className="card-subtitle">Wholesale fulfillment queue</p></div><button className="button soft" data-testid="button-wholesale-export" onClick={() => onToast('Wholesale order list exported')}><ArrowDownToLine size={14} /> Export</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Partner</th><th>Items</th><th>Value</th><th>Status</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customer}</td><td>{order.items}</td><td><strong>{order.value}</strong></td><td><span className={`pill ${order.status === 'Completed' ? 'success' : 'warning'}`}>{order.status}</span></td><td><button className="button soft" data-testid={`button-process-${order.id}`} onClick={() => process(order.id)} disabled={order.status === 'Completed'}>{order.status === 'Processing' ? 'Prepare' : order.status === 'Ready to dispatch' ? 'Complete' : 'Completed'}</button></td></tr>)}</tbody></table></div></section></div>;
}

function SystemAdminPage({ onToast }: { onToast: ToastFn }) {
  const [toggles, setToggles] = useState({ alerts: true, lowStock: true, autoReorder: false, twoFactor: true, audit: true });
  const flip = (key: keyof typeof toggles) => setToggles((current) => ({ ...current, [key]: !current[key] }));
  return <div><PageHeading title="System admin" description="Set the operating rhythm and guardrails for your workspace." action={<button className="button dark" data-testid="button-save-settings" onClick={() => onToast('System preferences saved')}><Check size={14} /> Save changes</button>} /><div className="dashboard-lower"><section className="surface-card list-card"><div className="card-header"><div><h2 className="card-title">Workspace preferences</h2><p className="card-subtitle">How Medprix keeps your team informed</p></div><Settings2 size={17} /></div><ToggleRow label="Daily operations digest" detail="Send a morning snapshot to administrators" value={toggles.alerts} onClick={() => flip('alerts')} testId="toggle-digest" /><ToggleRow label="Low stock alerts" detail="Notify inventory leads when stock falls below reorder point" value={toggles.lowStock} onClick={() => flip('lowStock')} testId="toggle-low-stock" /><ToggleRow label="Automatic reorder drafts" detail="Create suggested POs for critical stock" value={toggles.autoReorder} onClick={() => flip('autoReorder')} testId="toggle-auto-reorder" /></section><section className="surface-card list-card"><div className="card-header"><div><h2 className="card-title">Security & audit</h2><p className="card-subtitle">Keep access accountable and easy to review</p></div><ShieldCheck size={17} /></div><ToggleRow label="Two-step verification" detail="Require a second factor for administrators" value={toggles.twoFactor} onClick={() => flip('twoFactor')} testId="toggle-two-factor" /><ToggleRow label="Audit trail" detail="Record edits to products, users, and cash" value={toggles.audit} onClick={() => flip('audit')} testId="toggle-audit" /><div className="list-row" style={{ marginTop: 8 }}><div className="row-icon"><Clock3 size={15} /></div><div className="row-main"><strong>Last security review</strong><span>August 12, 2026 · No issues found</span></div><span className="pill success">Healthy</span></div></section></div><section className="surface-card list-card" style={{ marginTop: 13 }}><div className="card-header"><div><h2 className="card-title">Connected tools</h2><p className="card-subtitle">Services available to your workspace</p></div></div>{[['Cash register', 'Medprix POS · Connected', Check], ['Supplier catalog', 'PharmaLink · Synced 18 min ago', RefreshCw], ['Backup archive', 'Daily backup · Last run 04:00 AM', Archive]].map(([name, detail, Icon]) => <div className="list-row" key={name as string}><div className="row-icon"><Icon size={15} /></div><div className="row-main"><strong>{name as string}</strong><span>{detail as string}</span></div><span className="pill success">Connected</span></div>)}</section></div>;
}
function ToggleRow({ label, detail, value, onClick, testId }: { label: string; detail: string; value: boolean; onClick: () => void; testId: string }) { return <div className="toggle-row"><div className="row-main"><strong>{label}</strong><span>{detail}</span></div><button className={`toggle ${value ? 'on' : ''}`} data-testid={testId} aria-pressed={value} onClick={onClick}><span /></button></div>; }

function UserManagementPage({ users, setUsers, onToast }: { users: UserRecord[]; setUsers: (users: UserRecord[]) => void; onToast: ToastFn }) {
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<'create' | 'edit' | 'reset' | null>(null);
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [draft, setDraft] = useState({ name: '', email: '', role: 'Pharmacist', permissions: ['Inventory', 'Sales'] });
  const [password, setPassword] = useState('');
  const openCreate = () => { setSelected(null); setDraft({ name: '', email: '', role: 'Pharmacist', permissions: ['Inventory', 'Sales'] }); setDialog('create'); };
  const openEdit = (user: UserRecord) => { setSelected(user); setDraft({ name: user.name, email: user.email, role: user.role, permissions: [...user.permissions] }); setDialog('edit'); };
  const submitUser = (event: FormEvent) => { event.preventDefault(); if (!draft.name.trim() || !draft.email.trim()) return; if (dialog === 'create') { const initials = draft.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); setUsers([...users, { id: Date.now(), initials, name: draft.name, email: draft.email, role: draft.role, status: 'Invited', lastActive: 'Pending invite', permissions: draft.permissions }]); onToast('Invitation sent and account created'); } else if (selected) { setUsers(users.map((user) => user.id === selected.id ? { ...user, ...draft, initials: draft.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() } : user)); onToast('User profile updated'); } setDialog(null); };
  const togglePermission = (permission: string) => setDraft((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] }));
  const remove = (user: UserRecord) => { if (window.confirm(`Remove ${user.name} from Medprix?`)) { setUsers(users.filter((item) => item.id !== user.id)); onToast('User account removed'); } };
  const reset = (event: FormEvent) => { event.preventDefault(); setDialog(null); setPassword(''); onToast(`Temporary password created for ${selected?.name}`); };
  const shown = users.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.toLowerCase()));
  return <div><PageHeading title="User management" description="Give the right people the right access, without the guesswork." action={<button className="button dark" data-testid="button-create-account" onClick={openCreate}><Plus size={14} /> Create account</button>} /><div className="summary-strip"><Summary label="Team members" value={String(users.length)} caption="Across your workspace" /><Summary label="Active accounts" value={String(users.filter((user) => user.status === 'Active').length)} caption="Access is current" /><Summary label="Pending invites" value={String(users.filter((user) => user.status === 'Invited').length)} caption="Awaiting acceptance" tone="warning" /></div><section className="surface-card table-card"><div className="table-tools"><div className="search-wrap"><Search size={15} /><input data-testid="input-user-search" type="search" placeholder="Search name, email, or role..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><span className="muted" style={{ fontSize: 11 }}>{shown.length} accounts</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Permissions</th><th>Status</th><th>Last active</th><th /></tr></thead><tbody>{shown.map((user) => <tr key={user.id} data-testid={`row-user-${user.id}`}><td><div className="product-cell"><span className="avatar" style={{ width: 32, height: 32, border: 0, boxShadow: 'none', background: user.id % 2 ? 'hsl(var(--accent))' : 'hsl(var(--mint))' }}>{user.initials}</span><div><strong>{user.name}</strong><div className="muted" style={{ fontSize: 10 }}>{user.email}</div></div></div></td><td><select className="select" style={{ height: 30, padding: '0 8px' }} data-testid={`select-role-${user.id}`} value={user.role} onChange={(e) => { setUsers(users.map((item) => item.id === user.id ? { ...item, role: e.target.value } : item)); onToast('Role updated'); }}><option>Administrator</option><option>Pharmacist</option><option>Inventory lead</option><option>Cashier</option></select></td><td><span className="muted">{user.permissions.join(' · ')}</span></td><td><span className={`pill ${user.status === 'Active' ? 'success' : user.status === 'Invited' ? 'warning' : 'danger'}`}>{user.status}</span></td><td className="muted">{user.lastActive}</td><td><div style={{ display: 'flex', gap: 5 }}><button className="icon-button" data-testid={`button-edit-user-${user.id}`} aria-label={`Edit ${user.name}`} onClick={() => openEdit(user)}><Pencil size={13} /></button><button className="icon-button" data-testid={`button-reset-user-${user.id}`} aria-label={`Reset password for ${user.name}`} onClick={() => { setSelected(user); setDialog('reset'); }}><KeyRound size={13} /></button><button className="icon-button" data-testid={`button-delete-user-${user.id}`} aria-label={`Delete ${user.name}`} onClick={() => remove(user)}><Trash2 size={13} /></button></div></td></tr>)}</tbody></table>{shown.length === 0 && <div className="empty-state"><Users size={25} /><div>No user accounts match your search.</div></div>}</div></section>{dialog === 'create' || dialog === 'edit' ? <UserDialog title={dialog === 'create' ? 'Create account' : 'Edit profile'} draft={draft} setDraft={setDraft} onClose={() => setDialog(null)} onSubmit={submitUser} togglePermission={togglePermission} /> : null}{dialog === 'reset' && <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setDialog(null)}><form className="modal dialog" onSubmit={reset}><div className="modal-header"><div><h2>Reset password</h2><p className="modal-sub">Create a temporary password for {selected?.name}.</p></div><button type="button" className="modal-close" data-testid="button-close-reset" onClick={() => setDialog(null)}><X size={16} /></button></div><div className="field"><label htmlFor="temporary-password">Temporary password</label><input id="temporary-password" data-testid="input-temporary-password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required /></div><div className="modal-actions"><button type="button" className="button soft" onClick={() => setDialog(null)}>Cancel</button><button className="button dark" data-testid="button-confirm-reset" type="submit">Reset password <KeyRound size={13} /></button></div></form></div>}</div>;
}

function UserDialog({ title, draft, setDraft, onClose, onSubmit, togglePermission }: { title: string; draft: { name: string; email: string; role: string; permissions: string[] }; setDraft: (draft: { name: string; email: string; role: string; permissions: string[] }) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; togglePermission: (permission: string) => void }) {
  const permissionOptions = ['Inventory', 'Sales', 'Procurement', 'Supplier', 'Reports', 'User management'];
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><form className="modal dialog" onSubmit={onSubmit}><div className="modal-header"><div><h2>{title}</h2><p className="modal-sub">Account details and workspace access.</p></div><button type="button" className="modal-close" data-testid="button-close-user-dialog" onClick={onClose}><X size={16} /></button></div><div className="form-grid"><div className="field"><label htmlFor="user-name">Full name</label><input id="user-name" data-testid="input-user-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Full name" required /></div><div className="field"><label htmlFor="user-email">Work email</label><input id="user-email" data-testid="input-user-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="name@medprix.ph" required /></div><div className="field full-width"><label htmlFor="user-role">Role</label><select id="user-role" data-testid="select-user-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value, permissions: e.target.value === 'Administrator' ? ['All access'] : draft.permissions })}><option>Administrator</option><option>Pharmacist</option><option>Inventory lead</option><option>Cashier</option></select></div></div><div className="modal-section"><h4>Permissions</h4><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{permissionOptions.map((permission) => <button type="button" key={permission} className={`modal-tab ${draft.permissions.includes(permission) || draft.permissions.includes('All access') ? 'active' : ''}`} data-testid={`button-permission-${permission.toLowerCase().replaceAll(' ', '-')}`} onClick={() => togglePermission(permission)}>{draft.permissions.includes(permission) || draft.permissions.includes('All access') ? <Check size={12} /> : null}{permission}</button>)}</div></div><div className="modal-actions"><button type="button" className="button soft" onClick={onClose}>Cancel</button><button className="button dark" data-testid="button-save-user" type="submit"><Check size={13} /> Save account</button></div></form></div>;
}

export default App;