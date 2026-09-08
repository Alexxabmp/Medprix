import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowUpRight,
  Eye,
  FileText,
  Receipt,
  Search,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import {
  initialSystemLogsData,
  initialTransactionsData,
  initialUserActivitiesData,
} from "@/lib/data";
import type {
  SystemLog,
  ToastFn,
  UserActivity,
  UserTransaction,
} from "@/lib/types";

export default function SystemAdminPage({ onToast }: { onToast: ToastFn }) {
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
    if (!selectedTrx && !selectedLog) {
      return undefined;
    }
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [selectedTrx, selectedLog]);

  // Fetch from API backend if available
  useEffect(() => {
    fetch('http://localhost:5000/api/admin/transactions')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setTransactions(data); })
      .catch(() => { });

    fetch('http://localhost:5000/api/admin/system-logs')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setSystemLogs(data); })
      .catch(() => { });

    fetch('http://localhost:5000/api/admin/user-activities')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setUserActivities(data); })
      .catch(() => { });
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
