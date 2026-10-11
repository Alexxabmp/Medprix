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
  Mail,
  MapPin,
  Phone,
  Plus,
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
  type AccountsPayableRecord,
  type SupplierRecord,
} from "@/lib/supplier-store";
import type { ToastFn } from "@/lib/types";

type Supplier = SupplierRecord;

type Payable = {
  id: string;
  invoiceId: string;
  totalOwed: string;
  totalPaid: string;
  balance: string;
};

type PaymentTarget = {
  id: string;
  balance: string;
  supplier?: string;
  invoiceNumber?: string;
};

type SupplierHistory = {
  summary: {
    totalOrders: number;
    totalOrdered: string;
    totalPaid: string;
    openBalance: string;
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

const peso = (value: string | number) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
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
      totalPaid: String(summary.totalPaid || "0.00"),
      openBalance: String(summary.openBalance || "0.00"),
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
  const [activeSection, setActiveSection] = useState<"directory" | "payables">(
    "directory",
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(
    () => getCachedSuppliers() || [],
  );
  const [isLoading, setIsLoading] = useState(
    () => getCachedSuppliers() === null,
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
    () => getCachedPayables() === null,
  );
  const [payablesError, setPayablesError] = useState("");
  const [payableFilter, setPayableFilter] = useState("All");
  const [paymentPayable, setPaymentPayable] = useState<PaymentTarget | null>(
    null,
  );
  const [paymentForm, setPaymentForm] = useState({
    amountPaid: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const canManagePayables =
    currentRole === "Admin" || currentRole === "FrontDesk";

  const fetchSuppliers = useCallback(async () => {
    const hasCachedData = getCachedSuppliers() !== null;
    try {
      if (!hasCachedData) setIsLoading(true);
      setError("");
      setSuppliers(await fetchSupplierRecords());
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not reach the server.";
      if (!hasCachedData) {
        setError(message);
        onToast(message);
      }
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
      if (!hasCachedData) setPayablesLoading(true);
      setPayablesError("");
      const data = await fetchAccountsPayable();
      setAccountsPayable(data.accountsPayable);
      setPayableSummary(data.summary);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load accounts payable.";
      if (!hasCachedData) setPayablesError(message);
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
    setHistory(emptyHistory);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/suppliers/${supplier.id}/history`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Failed to load supplier history.");
      setHistory(normalizeHistory(data));
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to load supplier history.";
      setHistoryError(message);
      onToast(message);
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Failed to add supplier.");
      setIsAddOpen(false);
      await fetchSuppliers();
      onToast("Supplier added successfully.");
    } catch (requestError) {
      setSupplierFormError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to add supplier.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentPayable) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/supplier-payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apId: paymentPayable.id,
          ...paymentForm,
          amountPaid: Number(paymentForm.amountPaid),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Failed to record payment.");
      setPaymentPayable(null);
      setPaymentForm({
        amountPaid: "",
        paymentDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      await loadPayables();
      if (selectedSupplier) await loadHistory(selectedSupplier);
      onToast("Supplier payment recorded.");
    } catch (requestError) {
      onToast(
        requestError instanceof Error
          ? requestError.message
          : "Failed to record payment.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = useMemo(
    () =>
      suppliers.filter(
        (supplier) => filter === "All statuses" || supplier.status === filter,
      ),
    [filter, suppliers],
  );
  const filteredPayables = useMemo(
    () =>
      accountsPayable.filter((payable) => {
        if (Number(payable.totalOwed) <= 0) return false;
        if (payableFilter === "All") return true;
        return payable.status === payableFilter;
      }),
    [accountsPayable, payableFilter],
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
              className="button dark"
              data-testid="button-add-supplier"
              onClick={openAddSupplier}
            >
              <Plus size={14} /> Add supplier
            </button>
          ) : undefined
        }
      />
      <div
        className="modal-tabs supplier-page-tabs"
        role="tablist"
        aria-label="Supplier management sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "directory"}
          className={`modal-tab ${activeSection === "directory" ? "active" : ""}`}
          onClick={() => setActiveSection("directory")}
        >
          Supplier directory
        </button>
        {canManagePayables && (
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === "payables"}
            className={`button modal-tab ${activeSection === "payables" ? "active" : ""}`}
            onClick={() => setActiveSection("payables")}
          >
            Accounts payable
          </button>
        )}
      </div>

      {activeSection === "directory" ? (
        <>
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
          <section className="surface-card table-card supplier-directory">
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
                onChange={(event) => setFilter(event.target.value)}
              >
                <option>All statuses</option>
                <option>Active</option>
              </select>
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        Loading suppliers...
                      </td>
                    </tr>
                  ) : error ? (
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
                      <td colSpan={6} className="muted">
                        No suppliers found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((supplier) => (
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
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`View ${supplier.name}`}
                            data-testid={`button-view-supplier-${supplier.code}`}
                            onClick={() => openHistory(supplier)}
                          >
                            <ArrowUpRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
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
          <section className="surface-card table-card supplier-directory">
            <div className="table-tools">
              <div>
                <h2 className="card-title">Accounts payable</h2>
                <p className="card-subtitle">
                  Supplier invoices, balances, and payment status
                </p>
              </div>
              <select
                className="select"
                aria-label="Filter accounts payable"
                value={payableFilter}
                onChange={(event) => setPayableFilter(event.target.value)}
              >
                <option>All</option>
                <option>Open</option>
                <option>Overdue</option>
                <option>Paid</option>
              </select>
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
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payablesLoading ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        Loading accounts payable...
                      </td>
                    </tr>
                  ) : payablesError ? (
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
                      <td colSpan={8} className="muted">
                        No supplier invoices match this status.
                      </td>
                    </tr>
                  ) : (
                    filteredPayables.map((payable) => (
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
                        <td>
                          {Number(payable.balance) > 0 ? (
                            <button
                              className="button soft"
                              type="button"
                              onClick={() => {
                                setPaymentPayable({
                                  id: payable.id,
                                  balance: payable.balance,
                                  supplier: payable.supplier,
                                  invoiceNumber: payable.invoiceNumber,
                                });
                                setPaymentForm({
                                  amountPaid: payable.balance,
                                  paymentDate: new Date()
                                    .toISOString()
                                    .slice(0, 10),
                                  notes: "",
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
                    ))
                  )}
                </tbody>
              </table>
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
                <p className="form-error" role="alert">
                  {supplierFormError}
                </p>
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
                  className="button dark"
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
            <div className="modal supplier-history-modal">
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
                <div className="supplier-history-state">
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
                      <table>
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
                              <td colSpan={4} className="muted">
                                No purchase orders recorded.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {historyTab === "financial" && (
                    <div className="supplier-financial-grid">
                      <section>
                        <h4>Invoices and payables</h4>
                        <div className="table-scroll supplier-history-table">
                          <table>
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
                                      <td>{peso(payable?.balance || 0)}</td>
                                      <td>
                                        {!payable ? (
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
                                                balance: payable.balance,
                                                supplier: selectedSupplier.name,
                                                invoiceNumber:
                                                  invoice.invoiceNumber,
                                              });
                                              setPaymentForm({
                                                ...paymentForm,
                                                amountPaid: payable.balance,
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
                                  <td colSpan={4} className="muted">
                                    No invoices recorded.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
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
                            <p className="muted">No payments recorded.</p>
                          )}
                        </div>
                      </section>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {paymentPayable &&
        createPortal(
          <div className="modal-backdrop supplier-payment-backdrop">
            <form className="modal dialog" onSubmit={submitPayment}>
              <div className="modal-header">
                <div>
                  <h2>Record supplier payment</h2>
                  <p className="modal-sub">
                    {paymentPayable.supplier &&
                      `${paymentPayable.supplier}${paymentPayable.invoiceNumber ? ` · ${paymentPayable.invoiceNumber}` : ""} · `}
                    Outstanding balance: {peso(paymentPayable.balance)}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setPaymentPayable(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="payment-amount">Amount paid *</label>
                  <input
                    id="payment-amount"
                    required
                    type="number"
                    min="0.01"
                    max={paymentPayable.balance}
                    step="0.01"
                    value={paymentForm.amountPaid}
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        amountPaid: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="payment-date">Payment date *</label>
                  <input
                    id="payment-date"
                    required
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        paymentDate: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="field full-width">
                  <label htmlFor="payment-notes">Notes</label>
                  <input
                    id="payment-notes"
                    maxLength={500}
                    value={paymentForm.notes}
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        notes: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="button soft"
                  type="button"
                  onClick={() => setPaymentPayable(null)}
                >
                  Cancel
                </button>
                <button
                  className="button dark"
                  type="submit"
                  disabled={isSaving}
                >
                  <Check size={13} />{" "}
                  {isSaving ? "Saving..." : "Record payment"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
