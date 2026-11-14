import { AppTooltip } from "@/components/ui/tooltip";
import { ModalTableDialog, ModalDataTable } from "@/components/modal-data-table";
import { EmptyState, TableEmptyState } from "@/components/custom-ui/empty-state";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { SupplierPaymentDialog } from "@/components/supplier-payment-dialog";
import { safeError, readResponse } from "@/lib/feedback";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Building2,
  Check,
  CircleDollarSign,
  ClipboardList,
  Eye,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { PageHeading } from "@/components/custom-ui/page-heading";
import { Summary } from "@/components/custom-ui/summary-card";
import {
  fetchAccountsPayable,
  fetchSupplierRecords,
  getCachedPayables,
  getCachedSuppliers,
  getCachedSupplierHistory,
  setCachedSupplierHistory,
  type AccountsPayableRecord,
  type SupplierRecord,
} from "@/lib/supplier-store";
import type { ToastFn } from "@/lib/types";

type Supplier = SupplierRecord;

type Payable = {
  id: string;
  invoiceId: string;
  totalOwed: string | null;
  totalPaid: string | null;
  balance: string | null;
  needsReview?: boolean;
};

type PaymentTarget = {
  id: string;
  balance: string | null;
  invoiceId: string;
  supplier?: string;
  invoiceNumber?: string;
};

type SupplierHistory = {
  summary: {
    totalOrders: number;
    totalOrdered: string;
    totalPaid: string | null;
    openBalance: string | null;
    needsReview?: boolean;
  };
  orders: Array<{
    id: string;
    poNumber: string;
    orderDate: string;
    status: string;
    totalOrderAmount: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    dueDate: string;
    invoiceAmount: string;
    isPaid: boolean;
    needsReview?: boolean;
  }>;
  payables: Payable[];
  payments: Array<{
    id: string;
    apId: string;
    paymentDate: string;
    amountPaid: string;
    notes?: string | null;
  }>;
};

type SupplierDraft = {
  supplierName: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  address: string;
  paymentTerms: string;
};

const emptySupplier: SupplierDraft = {
  supplierName: "",
  contactPerson: "",
  contactNumber: "",
  email: "",
  address: "",
  paymentTerms: "",
};

const emptyHistory: SupplierHistory = {
  summary: {
    totalOrders: 0,
    totalOrdered: "0.00",
    totalPaid: "0.00",
    openBalance: "0.00",
  },
  orders: [],
  invoices: [],
  payables: [],
  payments: [],
};

const peso = (value: string | number | null) =>
  value === null ? 'Needs review' : `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeHistory(value: unknown): SupplierHistory {
  if (!value || typeof value !== "object") return emptyHistory;
  const data = value as Partial<SupplierHistory>;
  const summary =
    data.summary && typeof data.summary === "object"
      ? data.summary
      : emptyHistory.summary;
  return {
    summary: {
      totalOrders: Number(summary.totalOrders || 0),
      totalOrdered: String(summary.totalOrdered || "0.00"),
      totalPaid: summary.totalPaid == null ? null : String(summary.totalPaid),
      openBalance: summary.openBalance == null ? null : String(summary.openBalance),
      needsReview: Boolean(summary.needsReview),
    },
    orders: arrayValue(data.orders),
    invoices: arrayValue(data.invoices),
    payables: arrayValue(data.payables),
    payments: arrayValue(data.payments),
  };
}

function cleanPhone(value: string) {
  let cleaned = value.replace(/[^\d+]/g, "");
  if (cleaned.includes("+")) {
    cleaned = `${cleaned.startsWith("+") ? "+" : ""}${cleaned.replace(/\+/g, "")}`;
  }
  return cleaned.slice(0, 13);
}

function validateSupplier(draft: SupplierDraft) {
  const name = draft.supplierName.trim();
  if (name.length < 2 || name.length > 120)
    return "Supplier name must be 2 to 120 characters.";
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s&.,'()/-]*$/u.test(name))
    return "Supplier name contains unsupported characters.";
  if (draft.contactPerson.trim().length > 120)
    return "Contact person must be 120 characters or fewer.";
  if (draft.contactNumber && !/^(?:\+639|09)\d{9}$/.test(draft.contactNumber))
    return "Phone number must use +639XXXXXXXXX or 09XXXXXXXXX format.";
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
    return "Enter a valid email address.";
  if (draft.address.trim().length > 500)
    return "Address must be 500 characters or fewer.";
  if (draft.paymentTerms.trim().length > 100)
    return "Payment terms must be 100 characters or fewer.";
  return "";
}

export default function SupplierPage({
  onToast,
  currentRole,
}: {
  onToast: ToastFn;
  currentRole: string;
}) {
  const [filter, setFilter] = useState("All statuses");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [directoryPage, setDirectoryPage] = useState(1);
  const [payableSearch, setPayableSearch] = useState("");
  const [payablePage, setPayablePage] = useState(1);
  const [activeSection, setActiveSection] = useState<"directory" | "payables">(
    "directory",
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(
    () => getCachedSuppliers() || [],
  );
  const [isLoading, setIsLoading] = useState(
    () => false,
  );
  const [error, setError] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [supplierForm, setSupplierForm] = useState(emptySupplier);
  const [supplierFormError, setSupplierFormError] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null,
  );
  const [history, setHistory] = useState<SupplierHistory>(emptyHistory);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyTab, setHistoryTab] = useState<
    "overview" | "orders" | "financial"
  >("overview");
  const [accountsPayable, setAccountsPayable] = useState<
    AccountsPayableRecord[]
  >(() => getCachedPayables()?.accountsPayable || []);
  const [payableSummary, setPayableSummary] = useState(
    () =>
      getCachedPayables()?.summary || {
        totalOpen: "0.00",
        overdue: "0.00",
        dueThisWeek: "0.00",
      },
  );
  const [payablesLoading, setPayablesLoading] = useState(
    () => false,
  );
  const [payablesError, setPayablesError] = useState("");
  const [payableFilter, setPayableFilter] = useState("All");
  const [paymentPayable, setPaymentPayable] = useState<PaymentTarget | null>(
    null,
  );
  const canManagePayables =
    currentRole === "Admin" || currentRole === "FrontDesk";

  useDialogAccessibility(isAddOpen, '.supplier-form-modal', () => setIsAddOpen(false), isSaving);
  useDialogAccessibility(!!selectedSupplier, '.supplier-history-modal', () => setSelectedSupplier(null));
  const fetchSuppliers = useCallback(async () => {
    const hasCachedData = getCachedSuppliers() !== null;
    try {
      if (false && !hasCachedData) setIsLoading(true);
      setError("");
      setSuppliers(await fetchSupplierRecords());
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not reach the server.";
      setError(safeError(message));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSuppliers();
  }, [fetchSuppliers]);

  const loadPayables = useCallback(async () => {
    const hasCachedData = getCachedPayables() !== null;
    try {
      if (false && !hasCachedData) setPayablesLoading(true);
      setPayablesError("");
      const data = await fetchAccountsPayable();
      setAccountsPayable(data.accountsPayable);
      setPayableSummary(data.summary);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load accounts payable.";
      setPayablesError(safeError(message));
    } finally {
      setPayablesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManagePayables) void loadPayables();
  }, [canManagePayables, loadPayables]);

  useEffect(() => {
    if (!isAddOpen && !selectedSupplier && !paymentPayable) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAddOpen, selectedSupplier, paymentPayable]);

  const loadHistory = async (supplier: Supplier) => {
    const cached = getCachedSupplierHistory<SupplierHistory>(supplier.id);
    if (cached) {
      setHistory(cached);
      setHistoryLoading(false);
    } else {
      setHistory(emptyHistory);
      setHistoryLoading(true);
    }
    setHistoryError("");
    try {
      const response = await fetch(`/api/suppliers/${supplier.id}/history`, {
        credentials: "include",
      });
      const data = await readResponse(response, "Could not load or save supplier data. Please try again.");
      if (!response.ok)
        throw new Error(data.error || "Failed to load supplier history.");
      if (![data.orders, data.invoices, data.payables, data.payments].every(Array.isArray) || !data.summary) throw new Error("Invalid supplier history response. Please refresh.");
      const normalized = normalizeHistory(data);
      setHistory(normalized);
      setCachedSupplierHistory(supplier.id, normalized);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load supplier history.";
      setHistoryError(safeError(message));
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setHistoryTab("overview");
    void loadHistory(supplier);
  };

  const closeHistory = () => {
    setPaymentPayable(null);
    setSelectedSupplier(null);
    setHistory(emptyHistory);
    setHistoryError("");
    setHistoryTab("overview");
  };

  const openAddSupplier = () => {
    setSupplierForm(emptySupplier);
    setSupplierFormError("");
    setIsAddOpen(true);
  };

  const submitSupplier = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateSupplier(supplierForm);
    if (validationError) {
      setSupplierFormError(validationError);
      return;
    }

    setSupplierFormError("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/suppliers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...supplierForm,
          supplierName: supplierForm.supplierName.trim(),
          contactPerson: supplierForm.contactPerson.trim(),
          email: supplierForm.email.trim(),
          address: supplierForm.address.trim(),
          paymentTerms: supplierForm.paymentTerms.trim(),
        }),
      });
      const data = await readResponse(response, "Could not load or save supplier data. Please try again.");
      if (!response.ok)
        throw new Error(data.error || "Failed to add supplier.");
      if (!data.success || !data.supplier?.id) throw new Error("Supplier save could not be confirmed. Check the supplier directory before retrying.");
      setIsAddOpen(false);
      await fetchSuppliers();
      onToast("Supplier added successfully.");
    } catch (requestError) {
      setSupplierFormError(safeError(requestError, "Failed to add supplier."));
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = useMemo(
    () =>
      suppliers.filter((supplier) => {
        const matchesStatus = filter === "All statuses" || supplier.status === filter;
        const q = supplierSearch.trim().toLowerCase();
        const matchesQuery =
          !q ||
          supplier.name.toLowerCase().includes(q) ||
          supplier.code.toLowerCase().includes(q) ||
          supplier.contact.toLowerCase().includes(q);
        return matchesStatus && matchesQuery;
      }),
    [filter, supplierSearch, suppliers],
  );
  const filteredPayables = useMemo(
    () =>
      accountsPayable.filter((payable) => {
        if (Number(payable.totalOwed) <= 0) return false;
        const matchesStatus =
          payableFilter === "All" || payableFilter === "All statuses" || payable.status === payableFilter;
        const q = payableSearch.trim().toLowerCase();
        const matchesQuery =
          !q ||
          payable.supplier.toLowerCase().includes(q) ||
          payable.invoiceNumber.toLowerCase().includes(q) ||
          payable.status.toLowerCase().includes(q);
        return matchesStatus && matchesQuery;
      }),
    [accountsPayable, payableFilter, payableSearch],
  );
  const SUPPLIER_PAGE_SIZE = 15;
  const totalDirectoryPages = Math.max(1, Math.ceil(filtered.length / SUPPLIER_PAGE_SIZE));
  const safeDirectoryPage = Math.min(directoryPage, totalDirectoryPages);
  const paginatedSuppliers = useMemo(
    () =>
      filtered.slice(
        (safeDirectoryPage - 1) * SUPPLIER_PAGE_SIZE,
        safeDirectoryPage * SUPPLIER_PAGE_SIZE,
      ),
    [filtered, safeDirectoryPage],
  );

  const totalPayablePages = Math.max(1, Math.ceil(filteredPayables.length / SUPPLIER_PAGE_SIZE));
  const safePayablePage = Math.min(payablePage, totalPayablePages);
  const paginatedPayables = useMemo(
    () =>
      filteredPayables.slice(
        (safePayablePage - 1) * SUPPLIER_PAGE_SIZE,
        safePayablePage * SUPPLIER_PAGE_SIZE,
      ),
    [filteredPayables, safePayablePage],
  );

  const activeSuppliers = suppliers.filter(
    (supplier) => supplier.status === "Active",
  ).length;
  const openPurchaseValue = suppliers.reduce(
    (total, supplier) => total + Number(supplier.orderValue),
    0,
  );

  return (
    <div>
      <PageHeading
        title="Supplier"
        description="Know who keeps your shelves ready, and how they are performing."
        action={
          currentRole === "Admin" && activeSection === "directory" ? (
            <button
              className="button primary-action"
              data-testid="button-add-supplier"
              onClick={openAddSupplier}
            >
              <Plus size={14} /> Add supplier
            </button>
          ) : undefined
        }
      />
      {error && <div className="inline-error" role="alert"><span>{error} Previously loaded supplier data may be out of date.</span><button className="button soft" onClick={() => void fetchSuppliers()}>Retry</button></div>}
      {payablesError && <div className="inline-error" role="alert"><span>{payablesError} Previously loaded balances may be out of date.</span><button className="button soft" onClick={() => void loadPayables()}>Retry</button></div>}

      {activeSection === "directory" ? (
        <div className="summary-strip">
          <Summary
            label="Active suppliers"
            value={isLoading ? "—" : String(activeSuppliers)}
            caption="Current supplier accounts"
          />
          <Summary
            label="Purchase value"
            value={isLoading ? "—" : peso(openPurchaseValue)}
            caption="Across recorded orders"
          />
          <Summary
            label="Supplier records"
            value={isLoading ? "—" : String(suppliers.length)}
            caption="Available vendor profiles"
          />
        </div>
      ) : (
        <div className="summary-strip">
          <Summary
            label="Open balance"
            value={payablesLoading ? "—" : peso(payableSummary.totalOpen)}
            caption="Outstanding supplier invoices"
          />
          <Summary
            label="Overdue"
            value={payablesLoading ? "—" : peso(payableSummary.overdue)}
            caption="Past their payment due date"
          />
          <Summary
            label="Due within 7 days"
            value={payablesLoading ? "—" : peso(payableSummary.dueThisWeek)}
            caption="Upcoming supplier obligations"
          />
        </div>
      )}

      <div
        className="page-tabs"
        role="tablist"
        aria-label="Supplier management sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "directory"}
          className={`button ${activeSection === "directory" ? "dark" : "soft"}`}
          onClick={() => setActiveSection("directory")}
        >
          Supplier directory
        </button>
        {canManagePayables && (
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "payables"}
            className={`button ${activeSection === "payables" ? "dark" : "soft"}`}
            onClick={() => setActiveSection("payables")}
          >
            Accounts payable
          </button>
        )}
      </div>

      {activeSection === "directory" ? (
        <>
          <section className="surface-card table-card supplier-directory">
            <div className="table-tools">
              <div className="search-wrap">
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Search supplier, code, or contact..."
                  value={supplierSearch}
                  onChange={(event) => {
                    setSupplierSearch(event.target.value);
                    setDirectoryPage(1);
                  }}
                  data-testid="input-supplier-search"
                />
              </div>
              <div className="table-tools-right">
                <select
                  className="select"
                  data-testid="select-supplier-filter"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setDirectoryPage(1);
                  }}
                >
                  <option>All statuses</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Primary contact</th>
                    <th>Orders</th>
                    <th>Order value</th>
                    <th>Status</th>
                    <th className="table-action-head">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        Loading suppliers...
                      </td>
                    </tr>
                  ) : error && suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="supplier-empty">
                          <span>{error}</span>
                          <button
                            className="button soft"
                            onClick={() => void fetchSuppliers()}
                          >
                            Retry
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <TableEmptyState colSpan={6} icon={Building2}>
                        No suppliers found.
                      </TableEmptyState>
                    </tr>
                  ) : (
                    paginatedSuppliers.map((supplier) => (
                      <tr key={supplier.id}>
                        <td>
                          <div className="product-cell">
                            <span className="product-symbol">
                              <Building2 size={15} />
                            </span>
                            <div>
                              <strong>{supplier.name}</strong>
                              <div className="muted supplier-code">
                                {supplier.code}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{supplier.contact}</td>
                        <td>{supplier.orders}</td>
                        <td>
                          <strong>{peso(supplier.orderValue)}</strong>
                        </td>
                        <td>
                          <span className="pill success">
                            {supplier.status}
                          </span>
                        </td>
                        <td className="table-action-cell">
                          <div className="table-actions">
                            <AppTooltip content={`View ${supplier.name}`}><button
                              type="button"
                              className="button soft table-action-btn"
                              aria-label={`View ${supplier.name}`}

                              data-testid={`button-view-supplier-${supplier.code}`}
                              onClick={() => openHistory(supplier)}
                            >
                              <Eye size={13} />
                            </button></AppTooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="wholesale-pagination">
              <span className="muted">
                Page {safeDirectoryPage} of {totalDirectoryPages}
              </span>
              <button
                type="button"
                className="button soft"
                disabled={safeDirectoryPage <= 1}
                onClick={() => setDirectoryPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="button soft"
                disabled={safeDirectoryPage >= totalDirectoryPages}
                onClick={() => setDirectoryPage((p) => Math.min(totalDirectoryPages, p + 1))}
              >
                Next
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          {payableSummary.needsReview && <div className="inline-error" role="alert">Some invoice or payment records disagree. Balances marked “Needs review” are unavailable until those records are reviewed.</div>}
          <section className="surface-card table-card supplier-directory">
            <div className="table-tools">
              <div className="search-wrap">
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Search supplier or invoice..."
                  value={payableSearch}
                  onChange={(event) => {
                    setPayableSearch(event.target.value);
                    setPayablePage(1);
                  }}
                  data-testid="input-payable-search"
                />
              </div>
              <div className="table-tools-right">
                <select
                  className="select"
                  aria-label="Filter accounts payable"
                  value={payableFilter}
                  onChange={(event) => {
                    setPayableFilter(event.target.value);
                    setPayablePage(1);
                  }}
                >
                  <option value="All">All statuses</option>
                  <option value="Open">Open</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Paid">Paid</option>
                  <option value="Needs Review">Needs Review</option>
                </select>
              </div>
            </div>
            <div className="table-scroll stable-data-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Invoice</th>
                    <th>Due date</th>
                    <th>Total owed</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th className="table-action-head">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payablesLoading ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        Loading accounts payable...
                      </td>
                    </tr>
                  ) : payablesError && accountsPayable.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="supplier-empty">
                          <span>{payablesError}</span>
                          <button
                            className="button soft"
                            type="button"
                            onClick={() => void loadPayables()}
                          >
                            Retry
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : filteredPayables.length === 0 ? (
                    <tr>
                      <TableEmptyState colSpan={8} icon={Building2}>
                        No supplier invoices match this status.
                      </TableEmptyState>
                    </tr>
                  ) : (
                    paginatedPayables.map((payable) => (
                      <tr key={payable.id}>
                        <td>
                          <div className="product-cell">
                            <span className="product-symbol">
                              <Building2 size={15} />
                            </span>
                            <strong>{payable.supplier}</strong>
                          </div>
                        </td>
                        <td>{payable.invoiceNumber}</td>
                        <td>
                          {payable.dueDate
                            ? new Date(payable.dueDate).toLocaleDateString()
                            : "Not set"}
                        </td>
                        <td>{peso(payable.totalOwed)}</td>
                        <td>{peso(payable.totalPaid)}</td>
                        <td>
                          <strong>{peso(payable.balance)}</strong>
                        </td>
                        <td>
                          <span
                            className={`pill ${
                              payable.status === "Paid"
                                ? "success"
                                : payable.status === "Overdue"
                                  ? "danger"
                                  : "neutral"
                            }`}
                          >
                            {payable.status}
                          </span>
                        </td>
                        <td className="table-action-cell">
                          <div className="table-actions">
                            {payable.needsReview ? <span className="muted">Review required</span> : Number(payable.balance) > 0 ? (
                              <button
                                className="button soft table-action-btn"
                                type="button"
                                onClick={() => {
                                  setPaymentPayable({
                                    id: payable.id,
                                    invoiceId: payable.invoiceId,
                                    balance: payable.balance,
                                    supplier: payable.supplier,
                                    invoiceNumber: payable.invoiceNumber,
                                  });
                                }}
                              >
                                Record payment
                              </button>
                            ) : (
                              <span className="muted">Settled</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="wholesale-pagination">
              <span className="muted">
                Page {safePayablePage} of {totalPayablePages}
              </span>
              <button
                type="button"
                className="button soft"
                disabled={safePayablePage <= 1}
                onClick={() => setPayablePage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="button soft"
                disabled={safePayablePage >= totalPayablePages}
                onClick={() => setPayablePage((p) => Math.min(totalPayablePages, p + 1))}
              >
                Next
              </button>
            </div>
          </section>
        </>
      )}

      {isAddOpen &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(event) =>
              event.currentTarget === event.target && setIsAddOpen(false)
            }
          >
            <form
              className="modal dialog supplier-form-modal"
              onSubmit={submitSupplier}
              noValidate
            >
              <div className="modal-header">
                <div>
                  <h2>Add supplier</h2>
                  <p className="modal-sub">
                    Vendor details and purchasing terms.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  aria-label="Close supplier form"
                  onClick={() => setIsAddOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field full-width">
                  <label htmlFor="supplier-name">Supplier name *</label>
                  <input
                    id="supplier-name"
                    data-testid="input-supplier-name"
                    autoFocus
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Registered vendor name"
                    value={supplierForm.supplierName}
                    onChange={(event) =>
                      setSupplierForm({
                        ...supplierForm,
                        supplierName: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="supplier-contact">Contact person</label>
                  <input
                    id="supplier-contact"
                    data-testid="input-supplier-contact"
                    maxLength={120}
                    placeholder="Full name"
                    value={supplierForm.contactPerson}
                    onChange={(event) =>
                      setSupplierForm({
                        ...supplierForm,
                        contactPerson: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="supplier-phone">Phone number</label>
                  <input
                    id="supplier-phone"
                    data-testid="input-supplier-phone"
                    type="tel"
                    inputMode="tel"
                    maxLength={13}
                    placeholder="+639XXXXXXXXX"
                    value={supplierForm.contactNumber}
                    onChange={(event) =>
                      setSupplierForm({
                        ...supplierForm,
                        contactNumber: cleanPhone(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="supplier-email">Email address</label>
                  <input
                    id="supplier-email"
                    data-testid="input-supplier-email"
                    type="email"
                    maxLength={255}
                    placeholder="orders@supplier.com"
                    value={supplierForm.email}
                    onChange={(event) =>
                      setSupplierForm({
                        ...supplierForm,
                        email: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="supplier-terms">Payment terms</label>
                  <input
                    id="supplier-terms"
                    data-testid="input-supplier-terms"
                    maxLength={100}
                    placeholder="e.g. Net 30"
                    value={supplierForm.paymentTerms}
                    onChange={(event) =>
                      setSupplierForm({
                        ...supplierForm,
                        paymentTerms: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field full-width">
                  <label htmlFor="supplier-address">Business address</label>
                  <textarea
                    id="supplier-address"
                    data-testid="input-supplier-address"
                    maxLength={500}
                    rows={3}
                    placeholder="Street, city, province"
                    value={supplierForm.address}
                    onChange={(event) =>
                      setSupplierForm({
                        ...supplierForm,
                        address: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              {supplierFormError && (
                <div className="inline-error" role="alert">
                  {supplierFormError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="button soft"
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="button primary-action"
                  data-testid="button-save-supplier"
                  type="submit"
                  disabled={isSaving}
                >
                  <Check size={13} /> {isSaving ? "Saving..." : "Add supplier"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {selectedSupplier &&
        createPortal(
          <div
            className="modal-backdrop"
            onMouseDown={(event) =>
              event.currentTarget === event.target && closeHistory()
            }
          >
            <ModalTableDialog className="modal supplier-history-modal" close={closeHistory}>
              <div className="modal-header">
                <div className="supplier-profile-title">
                  <span className="product-symbol">
                    <Building2 size={17} />
                  </span>
                  <div>
                    <h2>{selectedSupplier.name}</h2>
                    <p className="modal-sub">
                      Supplier profile and transaction history
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  aria-label="Close supplier history"
                  onClick={closeHistory}
                >
                  <X size={16} />
                </button>
              </div>
              <div
                className="modal-tabs"
                role="tablist"
                aria-label="Supplier history sections"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={historyTab === "overview"}
                  className={`modal-tab ${historyTab === "overview" ? "active" : ""}`}
                  onClick={() => setHistoryTab("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={historyTab === "orders"}
                  className={`modal-tab ${historyTab === "orders" ? "active" : ""}`}
                  onClick={() => setHistoryTab("orders")}
                >
                  Purchase orders
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={historyTab === "financial"}
                  className={`modal-tab ${historyTab === "financial" ? "active" : ""}`}
                  onClick={() => setHistoryTab("financial")}
                >
                  Invoices & payments
                </button>
              </div>
              {historyLoading ? (
                <div className="supplier-history-state">
                  Loading supplier history...
                </div>
              ) : historyError ? (
                <div className="inline-error" role="alert">
                  <span>{historyError}</span>
                  <button
                    className="button soft"
                    type="button"
                    onClick={() => void loadHistory(selectedSupplier)}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <div className="supplier-history-metrics">
                    <div>
                      <ClipboardList size={15} />
                      <span>Orders</span>
                      <strong>{history.summary.totalOrders}</strong>
                    </div>
                    <div>
                      <CircleDollarSign size={15} />
                      <span>Total paid</span>
                      <strong>{peso(history.summary.totalPaid)}</strong>
                    </div>
                    <div
                      className={
                        Number(history.summary.openBalance) > 0
                          ? "attention"
                          : ""
                      }
                    >
                      <CircleDollarSign size={15} />
                      <span>Open balance</span>
                      <strong>{peso(history.summary.openBalance)}</strong>
                    </div>
                  </div>
                  {historyTab === "overview" && (
                    <div className="supplier-profile-grid">
                      <div>
                        <UserRound size={15} />
                        <span>Contact person</span>
                        <strong>
                          {selectedSupplier.contactPerson || "Not provided"}
                        </strong>
                      </div>
                      <div>
                        <Phone size={15} />
                        <span>Phone</span>
                        <strong>
                          {selectedSupplier.contactNumber || "Not provided"}
                        </strong>
                      </div>
                      <div>
                        <Mail size={15} />
                        <span>Email</span>
                        <strong>
                          {selectedSupplier.email || "Not provided"}
                        </strong>
                      </div>
                      <div>
                        <ClipboardList size={15} />
                        <span>Payment terms</span>
                        <strong>
                          {selectedSupplier.paymentTerms || "Not provided"}
                        </strong>
                      </div>
                      <div className="wide">
                        <MapPin size={15} />
                        <span>Business address</span>
                        <strong>
                          {selectedSupplier.address || "Not provided"}
                        </strong>
                      </div>
                    </div>
                  )}
                  {historyTab === "orders" && (
                    <div className="table-auto supplier-history-table">
                      <ModalDataTable>
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.orders.length ? (
                            history.orders.map((order) => (
                              <tr key={order.id}>
                                <td>
                                  <strong>{order.poNumber}</strong>
                                </td>
                                <td>
                                  {new Date(
                                    order.orderDate,
                                  ).toLocaleDateString()}
                                </td>
                                <td>
                                  <span className="pill neutral">
                                    {order.status}
                                  </span>
                                </td>
                                <td>{peso(order.totalOrderAmount)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <TableEmptyState colSpan={4} icon={Building2}>
                                No purchase orders recorded.
                              </TableEmptyState>
                            </tr>
                          )}
                        </tbody>
                      </ModalDataTable>
                    </div>
                  )}
                  {historyTab === "financial" && (
                    <div className="supplier-financial-grid">
                      <section>
                        <h4>Invoices and payables</h4>
                        <div className="table-scroll supplier-history-table">
                          <ModalDataTable>
                            <thead>
                              <tr>
                                <th>Invoice</th>
                                <th>Due</th>
                                <th>Balance</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {history.invoices.length ? (
                                history.invoices.map((invoice) => {
                                  const payable = history.payables.find(
                                    (item) => item.invoiceId === invoice.id,
                                  );
                                  return (
                                    <tr key={invoice.id}>
                                      <td>
                                        <strong>{invoice.invoiceNumber}</strong>
                                        <span className="muted supplier-invoice-amount">
                                          {peso(invoice.invoiceAmount)}
                                        </span>
                                      </td>
                                      <td>{invoice.dueDate}</td>
                                      <td>{peso(invoice.needsReview || payable?.needsReview ? null : payable?.balance ?? null)}</td>
                                      <td>
                                        {invoice.needsReview || payable?.needsReview ? <span className="muted">Review required</span> : !payable ? (
                                          <span className="muted">
                                            Not payable
                                          </span>
                                        ) : Number(payable.balance) > 0 ? (
                                          <button
                                            className="button soft"
                                            type="button"
                                            onClick={() => {
                                              setPaymentPayable({
                                                id: payable.id,
                                  invoiceId: invoice.id,
                                                balance: payable.balance,
                                                supplier: selectedSupplier.name,
                                                invoiceNumber:
                                                  invoice.invoiceNumber,
                                              });
                                            }}
                                          >
                                            Record payment
                                          </button>
                                        ) : (
                                          <span className="muted">Settled</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <TableEmptyState colSpan={4} icon={Building2}>
                                    No invoices recorded.
                                  </TableEmptyState>
                                </tr>
                              )}
                            </tbody>
                          </ModalDataTable>
                        </div>
                      </section>
                      <section>
                        <h4>Payment history</h4>
                        <div className="supplier-payment-list">
                          {history.payments.length ? (
                            history.payments.map((payment) => (
                              <div key={payment.id}>
                                <span>
                                  {new Date(
                                    payment.paymentDate,
                                  ).toLocaleDateString()}
                                  <small>
                                    {payment.notes || "Supplier payment"}
                                  </small>
                                </span>
                                <strong>{peso(payment.amountPaid)}</strong>
                              </div>
                            ))
                          ) : (
                            <EmptyState icon={CircleDollarSign}>
                              No payments recorded.
                            </EmptyState>
                          )}
                        </div>
                      </section>
                    </div>
                  )}
                </>
              )}
            </ModalTableDialog>
          </div>,
          document.body,
        )}

      {paymentPayable && <SupplierPaymentDialog invoiceId={paymentPayable.invoiceId} onClose={() => setPaymentPayable(null)} onToast={onToast}
        onSaved={async () => { await loadPayables(); if (selectedSupplier) await loadHistory(selectedSupplier); }} />}
    </div>
  );
}
