import { LoadingState } from "@/components/custom-ui/loading-state";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Check,
  Clock3,
  Download,
  Eye,
  FileText,
  HardDrive,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import { readResponse, safeError } from "@/lib/feedback";
import {
  usePharmacyTransactions,
  fetchAuditRecords,
  getCachedSystemLogs,
  getCachedUserActivities,
} from "@/lib/pharmacy-store";
import type { SystemLog, UserActivity, UserTransaction, ToastFn } from "@/lib/types";

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Manila",
});

const normalizeModuleName = (mod: string) =>
  String(mod || "").replace(/^[^\p{L}\p{N}]+/u, "").trim() || String(mod || "");

const eventTime = (value: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTimeFormatter.format(parsed);
};

export default function SystemAdminPage({ onToast }: { onToast: ToastFn }) {
  const [activeTab, setActiveTab] = useState<"transactions" | "systemLogs" | "userActivity">(
    "transactions"
  );
  const {
    transactions: liveTransactions,
    refresh: refreshLiveTransactions,
  } = usePharmacyTransactions();

  // Transactions state
  const [transactions, setTransactions] = useState<UserTransaction[]>(() => {
    return liveTransactions;
  });
  const [trxFilterUser, setTrxFilterUser] = useState<string>("All users");
  const [trxFilterType, setTrxFilterType] = useState<"All" | "Retail" | "Wholesale">("All");
  const [trxSearch, setTrxSearch] = useState("");
  const [trxPage, setTrxPage] = useState(1);
  const [selectedTrx, setSelectedTrx] = useState<UserTransaction | null>(null);

  // System Logs state
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>(() => getCachedSystemLogs() ?? []);
  const [logSearch, setLogSearch] = useState("");
  const [logFilterUser, setLogFilterUser] = useState<string>("All users");
  const [logFilterAction, setLogFilterAction] = useState<string>("All actions");
  const [logPage, setLogPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  // User Activity state
  const [userActivities, setUserActivities] = useState<UserActivity[]>(() => getCachedUserActivities() ?? []);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityFilterUser, setActivityFilterUser] = useState<string>("All users");
  const [activityFilterAction, setActivityFilterAction] = useState<string>("All activities");
  const [activityPage, setActivityPage] = useState(1);

  const [auditError, setAuditError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Keep transactions in sync with pharmacy-store
  useEffect(() => {
    setTransactions(liveTransactions);
  }, [liveTransactions]);

  // Modal body scroll lock
  useEffect(() => {
    if (!selectedTrx && !selectedLog) return undefined;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedTrx, selectedLog]);

  const loadBackendData = async (force = false) => {
    if (force) setIsRefreshing(true);
    setAuditError("");
    void (force || liveTransactions.length === 0 ? refreshLiveTransactions() : Promise.resolve(liveTransactions));
    try {
      const audit = await fetchAuditRecords(force);
      setSystemLogs(audit.logs);
      setUserActivities(audit.activities);
    } catch (error) {
      if (force) {
        setSystemLogs([]);
        setUserActivities([]);
      }
      setAuditError(safeError(error, "Audit records are unavailable. Refresh to retry."));
    } finally {
      setIsRefreshing(false);
      setHasLoaded(true);
    }
  };

  // Fetch from API backend on mount
  useEffect(() => {
    void loadBackendData();
  }, []);

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      await readResponse(await fetch("/api/admin/backup", { method: "POST", credentials: "include" }), "Database backups are unavailable. No backup was created.");
      onToast("Backup request completed.");
    } catch (error) {
      onToast({ message: safeError(error, "Database backups are unavailable. No backup was created."), variant: "error" });
    } finally { setIsBackingUp(false); }
  };

  const trxUsers = useMemo(
    () =>
      Array.from(new Set(transactions.map((t) => t.user?.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [transactions],
  );

  const logUsers = useMemo(
    () =>
      Array.from(new Set(systemLogs.map((l) => l.user?.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [systemLogs],
  );

  const logActions = useMemo(
    () =>
      Array.from(new Set(systemLogs.map((l) => l.action?.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [systemLogs],
  );

  const activityUsers = useMemo(
    () =>
      Array.from(new Set(userActivities.map((a) => a.user?.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [userActivities],
  );

  const activityActions = useMemo(
    () =>
      Array.from(new Set(userActivities.map((a) => a.activity?.trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [userActivities],
  );

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    const q = trxSearch.trim().toLowerCase();
    return transactions.filter((trx) => {
      const matchesUser = trxFilterUser === "All users" || trx.user === trxFilterUser;
      const matchesType = trxFilterType === "All" || trx.businessType === trxFilterType;
      const matchesSearch =
        !q ||
        trx.transactionNumber.toLowerCase().includes(q) ||
        trx.user.toLowerCase().includes(q) ||
        trx.customer.toLowerCase().includes(q) ||
        trx.payment.toLowerCase().includes(q);
      return matchesUser && matchesType && matchesSearch;
    });
  }, [transactions, trxFilterUser, trxFilterType, trxSearch]);

  const TRX_PAGE_SIZE = 15;
  const totalTrxPages = Math.max(1, Math.ceil(filteredTransactions.length / TRX_PAGE_SIZE));
  const safeTrxPage = Math.min(trxPage, totalTrxPages);
  const paginatedTransactions = useMemo(
    () =>
      filteredTransactions.slice(
        (safeTrxPage - 1) * TRX_PAGE_SIZE,
        safeTrxPage * TRX_PAGE_SIZE,
      ),
    [filteredTransactions, safeTrxPage],
  );

  // Filtered logs
  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return systemLogs.filter((log) => {
      const matchesUser = logFilterUser === "All users" || log.user === logFilterUser;
      const matchesAction = logFilterAction === "All actions" || log.action === logFilterAction;
      const matchesSearch =
        !q ||
        log.user.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.module.toLowerCase().includes(q) ||
        log.description.toLowerCase().includes(q) ||
        log.deviceIp.toLowerCase().includes(q);
      return matchesUser && matchesAction && matchesSearch;
    });
  }, [systemLogs, logFilterUser, logFilterAction, logSearch]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / TRX_PAGE_SIZE));
  const safeLogPage = Math.min(logPage, totalLogPages);
  const paginatedLogs = useMemo(
    () =>
      filteredLogs.slice(
        (safeLogPage - 1) * TRX_PAGE_SIZE,
        safeLogPage * TRX_PAGE_SIZE,
      ),
    [filteredLogs, safeLogPage],
  );

  // Filtered activities
  const filteredActivities = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    return userActivities.filter((act) => {
      const cleanMod = normalizeModuleName(act.module);
      const matchesUser = activityFilterUser === "All users" || act.user === activityFilterUser;
      const matchesActivity =
        activityFilterAction === "All activities" || act.activity === activityFilterAction;
      const matchesSearch =
        !q ||
        act.user.toLowerCase().includes(q) ||
        act.activity.toLowerCase().includes(q) ||
        cleanMod.toLowerCase().includes(q) ||
        act.description.toLowerCase().includes(q);
      return matchesUser && matchesActivity && matchesSearch;
    });
  }, [userActivities, activityFilterUser, activityFilterAction, activitySearch]);

  const totalActivityPages = Math.max(1, Math.ceil(filteredActivities.length / TRX_PAGE_SIZE));
  const safeActivityPage = Math.min(activityPage, totalActivityPages);
  const paginatedActivities = useMemo(
    () =>
      filteredActivities.slice(
        (safeActivityPage - 1) * TRX_PAGE_SIZE,
        safeActivityPage * TRX_PAGE_SIZE,
      ),
    [filteredActivities, safeActivityPage],
  );

  return (
    <div>
      <PageHeading
        title="System Administration"
        description="Monitor user sales transactions, audit system logs, and track user activities."
      />

      {false && (
        <LoadingState label="Loading System Administration records…" />
      )}
      {auditError && (
        <div role="alert" className="inline-error">
          <span>{auditError}</span>
          <button
            type="button"
            className="button soft"
            disabled={isRefreshing}
            onClick={() => void loadBackendData(true)}>
            Retry
          </button>
        </div>
      )}

      {/* Summary strip on top of tab locations */}
      {hasLoaded && activeTab === "transactions" && (
        <div className="summary-strip">
          <Summary
            label="Total transactions"
            value={String(transactions.length)}
            caption="Recorded across channels"
          />
          <Summary
            label="Wholesale (Front desk)"
            value={String(transactions.filter((t) => t.businessType === "Wholesale").length)}
            caption="Bulk clinic & pharmacy orders"
          />
          <Summary
            label="Retail (Cashier)"
            value={String(transactions.filter((t) => t.businessType === "Retail").length)}
            caption="Walk-in POS transactions"
          />
        </div>
      )}
      {hasLoaded && activeTab === "systemLogs" && (
        <div className="summary-strip">
          <Summary
            label="Total audit logs"
            value={auditError ? "Unavailable" : String(systemLogs.length)}
            caption="System & security events"
          />
          <Summary
            label="Successful events"
            value={auditError ? "Unavailable" : String(systemLogs.filter((l) => l.status === "Success").length)}
            caption="Executed normally"
          />
          <Summary
            label="Failed / Alerts"
            value={auditError ? "Unavailable" : String(systemLogs.filter((l) => l.status !== "Success").length)}
            caption="Requires attention"
            tone={
              systemLogs.filter((l) => l.status === "Failed").length > 0 ? "warning" : "neutral"
            }
          />
        </div>
      )}
      {hasLoaded && activeTab === "userActivity" && (
        <div className="summary-strip">
          <Summary
            label="Tracked activities"
            value={auditError ? "Unavailable" : String(userActivities.length)}
            caption="Recorded across workspace"
          />
          <Summary
            label="Normal operations"
            value={auditError ? "Unavailable" : String(userActivities.filter((a) => a.flag === "Normal").length)}
            caption="Standard user usage"
          />
          <Summary
            label="Suspicious / Flagged"
            value={auditError ? "Unavailable" : String(userActivities.filter((a) => a.flag !== "Normal").length)}
            caption="Detected security alerts"
            tone={
              userActivities.filter((a) => a.flag !== "Normal").length > 0
                ? "warning"
                : "neutral"
            }
          />
        </div>
      )}

      {/* Feature selection tabs */}
      <div className="page-tabs">
        <button
          type="button"
          className={`button ${activeTab === "transactions" ? "dark" : "soft"}`}
          onClick={() => setActiveTab("transactions")}
          data-testid="tab-user-transactions">
          View user transactions
        </button>
        <button
          type="button"
          className={`button ${activeTab === "systemLogs" ? "dark" : "soft"}`}
          onClick={() => setActiveTab("systemLogs")}
          data-testid="tab-system-logs">
          View system logs
        </button>
        <button
          type="button"
          className={`button ${activeTab === "userActivity" ? "dark" : "soft"}`}
          onClick={() => setActiveTab("userActivity")}
          data-testid="tab-user-activity">
          View user activity
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. USER TRANSACTIONS FEATURE */}
      {/* ========================================================================= */}
      {hasLoaded && activeTab === "transactions" && (
        <div>
          <section className="surface-card table-card">
            <div className="table-tools">
              <div className="search-wrap">
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Search TRX #, customer, user..."
                  value={trxSearch}
                  onChange={(e) => {
                    setTrxSearch(e.target.value);
                    setTrxPage(1);
                  }}
                  data-testid="input-trx-search"
                />
              </div>

              <div className="table-tools-right">
                <select
                  className="select"
                  aria-label="Filter transactions by user"
                  value={trxFilterUser}
                  onChange={(e) => {
                    setTrxFilterUser(e.target.value);
                    setTrxPage(1);
                  }}
                  data-testid="select-trx-user">
                  <option value="All users">All users</option>
                  {trxUsers.map((user) => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>

                <select
                  className="select"
                  aria-label="Filter transactions by business type"
                  value={trxFilterType}
                  onChange={(e) => {
                    setTrxFilterType(e.target.value as "All" | "Retail" | "Wholesale");
                    setTrxPage(1);
                  }}
                  data-testid="select-trx-type">
                  <option value="All">All business types</option>
                  <option value="Retail">Retail (Cashier)</option>
                  <option value="Wholesale">Wholesale (Front desk)</option>
                </select>
              </div>
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
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th className="table-action-head">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.map((trx) => (
                    <tr key={trx.id} data-testid={`row-trx-${trx.id}`}>
                      <td>
                        <strong>{trx.transactionNumber}</strong>
                      </td>
                      <td className="muted">{eventTime(trx.dateTime)}</td>
                      <td>{trx.user}</td>
                      <td>
                        <span
                          className={`pill ${
                            trx.businessType === "Wholesale" ? "warning" : "neutral"
                          }`}>
                          {trx.businessType}
                        </span>
                      </td>
                      <td>{trx.customer}</td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{trx.total}</strong>
                      </td>
                      <td className="muted">{trx.payment}</td>
                      <td>
                        <span
                          className={`pill ${
                            trx.status === "Completed"
                              ? "success"
                              : trx.status === "Voided"
                              ? "danger"
                              : "neutral"
                          }`}>
                          {trx.status}
                        </span>
                      </td>
                      <td className="table-action-cell">
                        <div className="table-actions">
                          <button
                            type="button"
                            className="button soft table-action-btn"
                            aria-label="View transaction"
                            title="View transaction"
                            onClick={() => setSelectedTrx(trx)}
                            data-testid={`button-view-trx-${trx.id}`}>
                            <Eye size={13} />
                          </button>
                        </div>
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
            <div className="wholesale-pagination">
              <span className="muted">
                Page {safeTrxPage} of {totalTrxPages} ({filteredTransactions.length} transactions)
              </span>
              <button
                type="button"
                className="button soft"
                disabled={safeTrxPage <= 1}
                onClick={() => setTrxPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <button
                type="button"
                className="button soft"
                disabled={safeTrxPage >= totalTrxPages}
                onClick={() => setTrxPage((p) => Math.min(totalTrxPages, p + 1))}>
                Next
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SYSTEM LOGS FEATURE */}
      {/* ========================================================================= */}
      {hasLoaded && activeTab === "systemLogs" && (
        <div>
          <section className="surface-card table-card">
            <div className="table-tools">
              <div className="search-wrap">
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Search user, action, module, or IP..."
                  value={logSearch}
                  onChange={(e) => {
                    setLogSearch(e.target.value);
                    setLogPage(1);
                  }}
                  data-testid="input-log-search"
                />
              </div>

              <div className="table-tools-right">
                <select
                  className="select"
                  aria-label="Filter system logs by user"
                  value={logFilterUser}
                  onChange={(e) => {
                    setLogFilterUser(e.target.value);
                    setLogPage(1);
                  }}
                  data-testid="select-log-user">
                  <option value="All users">All users</option>
                  {logUsers.map((user) => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>

                <select
                  className="select"
                  aria-label="Filter system logs by action"
                  value={logFilterAction}
                  onChange={(e) => {
                    setLogFilterAction(e.target.value);
                    setLogPage(1);
                  }}
                  data-testid="select-log-action">
                  <option value="All actions">All actions</option>
                  {logActions.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>User / current role</th>
                    <th>Action</th>
                    <th>Module</th>
                    <th className="table-action-head">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} data-testid={`row-log-${log.id}`}>
                      <td className="muted">{eventTime(log.dateTime)}</td>
                      <td>
                        <strong>{log.user}</strong>{" "}
                        <span className="muted" style={{ fontSize: 12 }}>
                          ({log.role})
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span>{log.action}</span>
                          <span
                            className={`pill ${
                              log.status === "Success" ? "success" : log.status === "Warning" ? "warning" : "danger"
                            }`}
                            style={{ fontSize: 12 }}>
                            {log.status}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {log.module}
                        </span>
                      </td>
                      <td className="table-action-cell">
                        <div className="table-actions">
                          <button
                            type="button"
                            className="button soft table-action-btn"
                            aria-label="View log details"
                            title="View log details"
                            onClick={() => setSelectedLog(log)}
                            data-testid={`button-see-details-${log.id}`}>
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredLogs.length === 0 && !auditError && (
                <div className="empty-state">
                  <FileText size={28} />
                  <div>No system audit logs found.</div>
                </div>
              )}
            </div>
            <div className="wholesale-pagination">
              <span className="muted">
                Page {safeLogPage} of {totalLogPages} ({filteredLogs.length} logs)
              </span>
              <button
                type="button"
                className="button soft"
                disabled={safeLogPage <= 1}
                onClick={() => setLogPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <button
                type="button"
                className="button soft"
                disabled={safeLogPage >= totalLogPages}
                onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}>
                Next
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. USER ACTIVITY FEATURE */}
      {/* ========================================================================= */}
      {hasLoaded && activeTab === "userActivity" && (
        <div>
          <section className="surface-card table-card">
            <div className="table-tools">
              <div className="search-wrap">
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Search user, activity, or description..."
                  value={activitySearch}
                  onChange={(e) => {
                    setActivitySearch(e.target.value);
                    setActivityPage(1);
                  }}
                  data-testid="input-activity-search"
                />
              </div>

              <div className="table-tools-right">
                <select
                  className="select"
                  aria-label="Filter user activity by user"
                  value={activityFilterUser}
                  onChange={(e) => {
                    setActivityFilterUser(e.target.value);
                    setActivityPage(1);
                  }}
                  data-testid="select-activity-user">
                  <option value="All users">All users</option>
                  {activityUsers.map((user) => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>

                <select
                  className="select"
                  aria-label="Filter user activity by activity"
                  value={activityFilterAction}
                  onChange={(e) => {
                    setActivityFilterAction(e.target.value);
                    setActivityPage(1);
                  }}
                  data-testid="select-activity-action">
                  <option value="All activities">All activities</option>
                  {activityActions.map((act) => (
                    <option key={act} value={act}>
                      {act}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>User</th>
                    <th>Current role</th>
                    <th>Activity</th>
                    <th>Module</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedActivities.map((act) => (
                    <tr key={act.id} data-testid={`row-activity-${act.id}`}>
                      <td className="muted">{eventTime(act.dateTime)}</td>
                      <td>
                        <strong>{act.user}</strong>
                      </td>
                      <td>
                        <span className="pill neutral">{act.role}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{act.activity}</span>
                          {act.flag !== "Normal" && (
                            <span
                              className={`pill ${
                                act.flag === "Flagged" ? "danger" : "warning"
                              }`}
                              style={{ fontSize: 12 }}>
                              {act.flag}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {normalizeModuleName(act.module)}
                        </span>
                      </td>
                      <td style={{ maxWidth: 360, whiteSpace: "normal", fontSize: 12 }}>
                        {act.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredActivities.length === 0 && !auditError && (
                <div className="empty-state">
                  <Activity size={28} />
                  <div>No user activities match the filter.</div>
                </div>
              )}
            </div>
            <div className="wholesale-pagination">
              <span className="muted">
                Page {safeActivityPage} of {totalActivityPages} ({filteredActivities.length} activities)
              </span>
              <button
                type="button"
                className="button soft"
                disabled={safeActivityPage <= 1}
                onClick={() => setActivityPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <button
                type="button"
                className="button soft"
                disabled={safeActivityPage >= totalActivityPages}
                onClick={() => setActivityPage((p) => Math.min(totalActivityPages, p + 1))}>
                Next
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TRANSACTION DETAILS MODAL */}
      {/* ========================================================================= */}
      {selectedTrx &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(event) => event.currentTarget === event.target && setSelectedTrx(null)}>
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h2>Transaction details</h2>
                  <p className="modal-sub">
                    Receipt &amp; payment summary for {selectedTrx.transactionNumber}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelectedTrx(null)}
                  data-testid="button-close-trx-modal">
                  <X size={16} />
                </button>
              </div>

              {/* Transaction Information */}
              <div
                style={{
                  background: "hsl(var(--surface-soft))",
                  border: "1px solid hsl(var(--border))",
                  padding: "16px 18px",
                  borderRadius: 14,
                  marginBottom: 18,
                }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      color: "hsl(var(--muted))",
                      fontWeight: 700,
                    }}>
                    Transaction Information
                  </h4>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Status:</span>
                    <span title="Recorded status; changes require an audited reversal workflow">{selectedTrx.status}</span>
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 12,
                    fontSize: 12,
                  }}>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Transaction ID:
                    </span>{" "}
                    <strong style={{ color: "hsl(var(--foreground))" }}>
                      {selectedTrx.transactionNumber}
                    </strong>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Date &amp; time:
                    </span>{" "}
                    <strong style={{ color: "hsl(var(--foreground))" }}>
                      {eventTime(selectedTrx.dateTime)}
                    </strong>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Processed by:
                    </span>{" "}
                    <strong style={{ color: "hsl(var(--foreground))" }}>
                      {selectedTrx.user}
                    </strong>
                  </div>
                  <div>
                    <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Business type:
                    </span>{" "}
                    <span
                      className={`pill ${
                        selectedTrx.businessType === "Wholesale" ? "warning" : "neutral"
                      }`}
                      style={{ fontSize: 12 }}>
                      {selectedTrx.businessType}
                    </span>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                      Customer:
                    </span>{" "}
                    <strong style={{ color: "hsl(var(--foreground))" }}>
                      {selectedTrx.customer}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Items Purchased Table */}
              <div style={{ marginBottom: 18 }}>
                <h4
                  style={{
                    margin: "0 0 10px",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                    color: "hsl(var(--muted))",
                    fontWeight: 700,
                  }}>
                  Items Purchased
                </h4>
                <div
                  className="table-scroll"
                  style={{
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    overflowX: "auto",
                  }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ textAlign: "center" }}>Quantity</th>
                        <th style={{ textAlign: "right" }}>Unit Price</th>
                        <th style={{ textAlign: "right" }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTrx.items && selectedTrx.items.length > 0 ? (
                        selectedTrx.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              <strong>{item.product}</strong>
                            </td>
                            <td style={{ textAlign: "center" }}>{item.quantity}</td>
                            <td style={{ textAlign: "right" }} className="muted">
                              {item.unitPrice}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <strong>{item.subtotal}</strong>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="muted">
                            1 item ({selectedTrx.total})
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Summary */}
              <div
                style={{
                  background: "hsl(var(--surface-soft))",
                  border: "1px solid hsl(var(--border))",
                  padding: "16px 18px",
                  borderRadius: 14,
                }}>
                <h4
                  style={{
                    margin: "0 0 12px",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                    color: "hsl(var(--muted))",
                    fontWeight: 700,
                  }}>
                  Payment Summary
                </h4>
                <div style={{ display: "grid", gap: 7, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="muted">Subtotal:</span>
                    <span style={{ color: "hsl(var(--foreground))" }}>
                      {selectedTrx.subtotal || selectedTrx.total}
                    </span>
                  </div>
                  {selectedTrx.discount && selectedTrx.discount !== "₱0.00" && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Discount:</span>
                      <span style={{ color: "#FF3B30" }}>-{selectedTrx.discount}</span>
                    </div>
                  )}
                  {selectedTrx.vat && selectedTrx.vat !== "₱0.00" && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">VAT (12%):</span>
                      <span style={{ color: "hsl(var(--foreground))" }}>{selectedTrx.vat}</span>
                    </div>
                  )}
                  <div
                    style={{
                      height: 1,
                      background: "hsl(var(--border))",
                      margin: "4px 0",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 14,
                    }}>
                    <strong>Total Amount:</strong>
                    <strong style={{ color: "hsl(var(--foreground))" }}>
                      {selectedTrx.total}
                    </strong>
                  </div>
                  {selectedTrx.amountReceived && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Amount Received:</span>
                      <span style={{ color: "hsl(var(--foreground))" }}>
                        {selectedTrx.amountReceived}
                      </span>
                    </div>
                  )}
                  {selectedTrx.change && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="muted">Change:</span>
                      <span style={{ color: "hsl(var(--foreground))" }}>
                        {selectedTrx.change}
                      </span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="muted">Payment Method:</span>
                    <strong style={{ color: "hsl(var(--foreground))" }}>
                      {selectedTrx.payment}
                    </strong>
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
      {selectedLog &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(event) => event.currentTarget === event.target && setSelectedLog(null)}>
            <div className="modal">
              <div className="modal-header">
                <div>
                  <h2>System log details</h2>
                  <p className="modal-sub">Security and audit log inspection</p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelectedLog(null)}
                  data-testid="button-close-log-modal">
                  <X size={16} />
                </button>
              </div>

              <div
                style={{
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 14,
                  overflowX: "auto",
                  background: "hsl(var(--surface))",
                }}>
                <table className="data-table" style={{ width: "100%", minWidth: 480 }}>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          width: 140,
                          fontWeight: 600,
                          background: "hsl(var(--surface-soft))",
                          color: "hsl(var(--foreground))",
                          whiteSpace: "nowrap",
                        }}>
                        Date &amp; Time
                      </td>
                      <td style={{ color: "hsl(var(--foreground))" }}>{eventTime(selectedLog.dateTime)}</td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          fontWeight: 600,
                          background: "hsl(var(--surface-soft))",
                          color: "hsl(var(--foreground))",
                          whiteSpace: "nowrap",
                        }}>
                        User
                      </td>
                      <td>
                        <strong style={{ color: "hsl(var(--foreground))" }}>
                          {selectedLog.user}
                        </strong>
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          fontWeight: 600,
                          background: "hsl(var(--surface-soft))",
                          color: "hsl(var(--foreground))",
                          whiteSpace: "nowrap",
                        }}>
                        Current role
                      </td>
                      <td>
                        <span className="pill neutral">{selectedLog.role}</span>
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          fontWeight: 600,
                          background: "hsl(var(--surface-soft))",
                          color: "hsl(var(--foreground))",
                          whiteSpace: "nowrap",
                        }}>
                        Action
                      </td>
                      <td>
                        <strong style={{ color: "hsl(var(--foreground))" }}>
                          {selectedLog.action}
                        </strong>
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          fontWeight: 600,
                          background: "hsl(var(--surface-soft))",
                          color: "hsl(var(--foreground))",
                          whiteSpace: "nowrap",
                        }}>
                        Module/Feature
                      </td>
                      <td style={{ color: "hsl(var(--foreground))" }}>{selectedLog.module}</td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          fontWeight: 600,
                          background: "hsl(var(--surface-soft))",
                          color: "hsl(var(--foreground))",
                          whiteSpace: "nowrap",
                        }}>
                        Description
                      </td>
                      <td>
                        <div
                          style={{
                            overflowX: "auto",
                            whiteSpace: "nowrap",
                            padding: "4px 0",
                            maxWidth: 420,
                            color: "hsl(var(--foreground))",
                          }}>
                          {selectedLog.description}
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          fontWeight: 600,
                          background: "hsl(var(--surface-soft))",
                          color: "hsl(var(--foreground))",
                          whiteSpace: "nowrap",
                        }}>
                        Status
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            selectedLog.status === "Success" ? "success" : "danger"
                          }`}>
                          {selectedLog.status}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          fontWeight: 600,
                          background: "hsl(var(--surface-soft))",
                          color: "hsl(var(--foreground))",
                          whiteSpace: "nowrap",
                        }}>
                        Device/IP
                      </td>
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
