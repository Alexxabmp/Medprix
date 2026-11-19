import { ReadDialog, useReadDialog } from "./read-dialog";
import { SourceTableBody, SourceFeedback, SourceRefreshButton } from "./custom-ui/source-state";
import { createPortal } from "react-dom";
import { SelectField } from "@/components/custom-ui/select-field";
import { DateTimeField } from "@/components/custom-ui/date-time-field";
import { formatDisplayDate } from "@/lib/business-date";
import {
  PageTableValue,
  PageTableScroll,
  usePageTableStandard,
} from "./page-table-context";
import { useReceivablePages } from "./use-receivable-pages";
import { AppTooltip } from "@/components/ui/tooltip";
import { ModalDataTable } from "./modal-data-table";
import { ModalTableValue, ModalTableFooter } from "./modal-table-layout";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { WholesalePaymentDetails } from "./wholesale-payment-details";
import { WholesaleDialog } from "./wholesale-dialog";
import { WholesaleRequestFeedback } from "./wholesale-request-feedback";
import { useWholesaleRequest } from "@/lib/use-wholesale-request";
import { safeError } from "@/lib/feedback";
import {
  allocateWholesalePayment,
  wholesalePrincipalSchema,
} from "@workspace/api-zod";
import { WholesaleInstallmentBalances } from "./wholesale-installment-balances";
import {
  wholesaleGet,
  getCachedWholesale,
  wholesalePeso,
  wholesaleDateTime,
  wholesaleManilaInput,
  type WholesaleReceivablePage,
  type WholesaleAccountFilter,
  type WholesaleReceivableDetail,
} from "@/lib/wholesale-api";

export function WholesaleReceivables({
  search,
  role,
  status = "all",
  onChanged,
  initialDetail,
  detailsOnly = false,
  embedded = false,
  onClose,
  onBack,
  refreshTarget,
}: {
  search: string;
  role: string;
  status?: WholesaleAccountFilter;
  onChanged?: () => void;
  initialDetail?: WholesaleReceivableDetail;
  detailsOnly?: boolean;
  embedded?: boolean;
  onClose?: () => void;
  onBack?: () => void;
  refreshTarget?: HTMLElement | null;
}) {
  const standard = !!usePageTableStandard() && !detailsOnly;
  const paging = useReceivablePages(standard, search, status);
  const [page, setPage] = useState(1);
  const initialCacheKey =
    "/accounts-receivable?search=" +
    encodeURIComponent(search) +
    "&page=1&status=" +
    status;
  const [data, setData] = useState<WholesaleReceivablePage | null>(() =>
    getCachedWholesale<WholesaleReceivablePage>(initialCacheKey),
  );
  const queryPath = "/accounts-receivable?search=" + encodeURIComponent(search) + "&page=" + page + "&status=" + status;
  const [dataPath, setDataPath] = useState(initialCacheKey);
  const [loading, setLoading] = useState(() => getCachedWholesale(initialCacheKey) === null);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDetail?.id ?? null,
  );
  const [detail, setDetail] = useState<WholesaleReceivableDetail | null>(
    initialDetail ?? null,
  );
  const read = useReadDialog<WholesaleReceivableDetail>();
  const opening = read.state?.pending ?? false;
  const [mode, setMode] = useState("view");
  const [paymentDetailId, setPaymentDetailId] = useState<string | null>(null);
  const viewedPayment = detail?.payments.find(payment => payment.id === paymentDetailId);
  const [method, setMethod] = useState("Cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [validation, setValidation] = useState("");
  const [subPage, setSubPage] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const paymentAmountRef = useRef<HTMLInputElement>(null);
  const RECEIVABLE_PAGE_SIZE = 15;
  const items = data?.items ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil(items.length / RECEIVABLE_PAGE_SIZE),
  );
  const safeSubPage = Math.min(subPage, totalPages);
  const paginatedItems = items.slice(
    (safeSubPage - 1) * RECEIVABLE_PAGE_SIZE,
    safeSubPage * RECEIVABLE_PAGE_SIZE,
  );
  useLayoutEffect(() => {
    const content = contentRef.current;
    const body = content?.closest(".wholesale-dialog-body");
    if (body) body.scrollTop = 0;
  }, [mode, selectedId]);
  async function load(force = false) {
    if (standard) return paging.refresh();
    if (detailsOnly) return;
    const result = await wholesaleGet<WholesaleReceivablePage>(
      "/accounts-receivable?search=" +
        encodeURIComponent(search) +
        "&page=" +
        page +
        "&status=" +
        status,
      force,
    );
    setData(result);
    setDataPath(queryPath);
  }
  async function loadDetail(id: string) {
    setDetail(
      await wholesaleGet<WholesaleReceivableDetail>(
        "/accounts-receivable/" + id,
        true,
      ),
    );
  }
  const request = useWholesaleRequest("collections", async () => {
    await load();
    if (selectedId) await loadDetail(selectedId);
    setMode("view");
    onChanged?.();
  });
  let allocationPreview: ReturnType<typeof allocateWholesalePayment> = [];
  const enteredAmount = wholesalePrincipalSchema.safeParse(paymentAmount);
  if (detail && enteredAmount.success) {
    try {
      allocationPreview = allocateWholesalePayment(
        enteredAmount.data,
        detail.installments ?? [],
      );
    } catch {
      /* The server validates the live balance again under the account lock. */
    }
  }
  useEffect(() => {
    setPage(1);
    setSubPage(1);
  }, [search, status]);
  useEffect(() => {
    if (detailsOnly || standard) return;
    let active = true;
    const reqPath =
      "/accounts-receivable?search=" +
      encodeURIComponent(search) +
      "&page=" +
      page +
      "&status=" +
      status;
    const cached = getCachedWholesale<WholesaleReceivablePage>(reqPath);
    if (cached) {
      setData(cached);
      setDataPath(reqPath);
    }
    setLoading(!cached);
    setLoadError("");
    const timer = setTimeout(() => {
      wholesaleGet<WholesaleReceivablePage>(
        "/accounts-receivable?search=" +
          encodeURIComponent(search) +
          "&page=" +
          page +
          "&status=" +
          status,
      )
        .then((value) => {
          if (active) { setData(value); setDataPath(reqPath); }
        })
        .catch((failure) => {
          if (active) setLoadError(safeError(failure));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, page, status, detailsOnly, standard]);
  function open(id: string) {
    read.open("Accounts receivable", () => wholesaleGet<WholesaleReceivableDetail>("/accounts-receivable/" + id, true));
  }
  const listLoading = standard ? paging.loading : loading;
  const listHasData = standard ? paging.hasData : data !== null && dataPath === queryPath;
  const listPending = standard ? paging.pending : loading;
  const listError = standard ? paging.error || loadError : loadError;
  const listItems = standard ? paging.items : paginatedItems;
  const listTotal = standard ? paging.total : items.length;
  const listPage = standard ? paging.page : safeSubPage;
  const listPages = standard ? paging.pages : totalPages;
  function refreshList() {
    if (standard) {
      void paging.refresh();
      return;
    }
    setLoading(true);
    setLoadError("");
    void load(true)
      .catch(failure => setLoadError(safeError(failure)))
      .finally(() => setLoading(false));
  }
  return (
    <>
      {!detailsOnly && (
        <>
          {!selectedId && <WholesaleRequestFeedback {...request} />}
          <SourceFeedback status={{ hasData: listHasData, pending: listPending, error: listError }} label="receivables" />
          <PageTableScroll>
            <table
              data-page-table="wholesale-receivables"
              className="data-table"
            >
              <thead>
                <tr>
                  <th>Order / client</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Overdue</th>
                  <th>Next unpaid</th>
                  <th>Final deadline</th>
                  <th>Status</th>
                  <th className="table-action-head">Action</th>
                </tr>
              </thead>
              <SourceTableBody status={{ hasData: listHasData, pending: listPending, error: listError }} label="Receivables" colSpan={9}>
                {listItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.orderNumber}</strong>
                        <div className="muted">
                          <PageTableValue value={item.clientName} />
                        </div>
                        <div className="muted">
                          {item.paymentPlan === "Net60" ? "Net 60" : "Net 30"}
                        </div>
                      </td>
                      <td>{wholesalePeso(item.total)}</td>
                      <td>{wholesalePeso(item.paid)}</td>
                      <td>
                        <strong>{wholesalePeso(item.balance)}</strong>
                      </td>
                      <td>{wholesalePeso(item.overdueAmount)}</td>
                      <td>
                        {item.nextDueDate ? (
                          <>
                            {formatDisplayDate(item.nextDueDate)}
                            <div className="muted">
                              {wholesalePeso(item.nextDueAmount)}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{formatDisplayDate(item.dueDate)}</td>
                      <td>
                        <span
                          className={
                            "pill " +
                            (item.status === "Overdue"
                              ? "danger"
                              : item.status === "Paid"
                                ? "success"
                                : "neutral")
                          }
                        >
                          {item.status}
                        </span>
                        {item.finalDeadlineBreached && (
                          <div className="muted">Final deadline passed</div>
                        )}
                      </td>
                      <td className="table-action-cell">
                        <div className="table-actions">
                          <AppTooltip content={"View account"}>
                            <button
                              className="button soft table-action-btn"
                              disabled={request.locked}
                              aria-disabled={request.locked || opening}
                              aria-busy={opening}
                              aria-label="View account"
                              onClick={() => {
                                if (!opening) void open(item.id);
                              }}
                            >
                              <Eye size={13} />
                            </button>
                          </AppTooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                {!listTotal && <tr><TableEmptyState colSpan={9}>{search ? "No matching receivables." : "No delivered receivables found."}</TableEmptyState></tr>}
              </SourceTableBody>
            </table>
          </PageTableScroll>
          <div
            className="table-pagination"
            role="navigation"
            aria-label="Accounts receivable pagination"
          >
            <span className="muted">
              {standard && listLoading ? (
                "Loading accounts…"
              ) : (
                <>
                  Page {listPage} of {listPages} ({listTotal} accounts)
                </>
              )}
            </span>
            <button
              type="button"
              className="button soft"
              disabled={listLoading || listPage <= 1}
              onClick={() =>
                standard
                  ? paging.go(Math.max(1, listPage - 1))
                  : setSubPage((value) => Math.max(1, value - 1))
              }
            >
              Previous
            </button>
            <button
              type="button"
              className="button soft"
              disabled={listLoading || listPage >= listPages}
              onClick={() =>
                standard
                  ? paging.go(Math.min(listPages, listPage + 1))
                  : setSubPage((value) => Math.min(totalPages, value + 1))
              }
            >
              Next
            </button>
          </div>
        </>
      )}
      {selectedId && (
        <WholesaleDialog
          embedded={embedded}
          title={
            mode === "view"
              ? "Accounts receivable"
              : mode === "payment"
                ? "Record payment"
                : mode === "history" ? "Payment details" : "Reverse payment"
          }
          back={
            mode !== "view"
              ? () => {
                  setMode("view");
                  setValidation("");
                  request.clearError();
                }
              : onBack
          }
          description={
            detail
              ? detail.orderNumber + " · " + detail.clientName
              : "Loading account"
          }
          busy={request.busy || opening}
          close={() => {
            setSelectedId(null);
            onClose?.();
          }}
          variant={mode === "view" ? "table" : mode === "history" ? "compact-table" : "form"}
          className="wholesale-account-dialog"
        >
          {validation && (
            <div role="alert" className="inline-error">
              {validation}
            </div>
          )}
          {detail && (
            <div className="wholesale-details" ref={contentRef}>
              {mode === "view" ? (
                <>
                  <dl className="wholesale-review-summary wholesale-account-summary">
                    <div>
                      <dt>Total owed</dt>
                      <dd>{wholesalePeso(detail.total)}</dd>
                    </div>
                    <div>
                      <dt>Paid amount</dt>
                      <dd>{wholesalePeso(detail.paid)}</dd>
                    </div>
                    <div>
                      <dt>Balance</dt>
                      <dd>
                        <strong>{wholesalePeso(detail.balance)}</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>Overdue installments</dt>
                      <dd>{wholesalePeso(detail.overdueAmount)}</dd>
                    </div>
                  </dl>
                  <p className="field-hint">
                    Payment plan:{" "}
                    {detail.paymentPlan === "Net60" ? "Net 60" : "Net 30"}
                  </p>
                  {detail.nextDueDate && (
                    <p className="field-hint">
                      Next unpaid: {formatDisplayDate(detail.nextDueDate)} ·{" "}
                      {wholesalePeso(detail.nextDueAmount)}
                    </p>
                  )}
                  <p className="field-hint">
                    Final settlement deadline{" "}
                    {formatDisplayDate(detail.dueDate)} · Delivered{" "}
                    {wholesaleDateTime(detail.deliveredAt)}
                  </p>
                  {detail.finalDeadlineBreached && (
                    <p className="pill danger">
                      Final settlement deadline passed
                    </p>
                  )}
                  {detail.balance === "0.00" && (
                    <p className="pill success">Fully paid</p>
                  )}
                </>
              ) : mode === "history" ? (
                viewedPayment ? <WholesalePaymentDetails payment={viewedPayment} /> : <p className="muted">This payment is no longer available.</p>
              ) : mode === "payment" ? (
                <section
                  className="wholesale-context wholesale-payment-context"
                  aria-label="Payment context"
                >
                  <div>
                    <span className="field-label">Already paid</span>
                    <strong>{wholesalePeso(detail.paid)}</strong>
                  </div>
                  <div>
                    <span className="field-label">Outstanding balance</span>
                    <strong>{wholesalePeso(detail.balance)}</strong>
                  </div>
                </section>
              ) : (
                <section
                  className="wholesale-context"
                  aria-label="Payment to reverse"
                >
                  {detail.payments
                    .filter((payment) => payment.id === mode)
                    .map((payment) => (
                      <dl key={payment.id} className="wholesale-detail-list">
                        <div>
                          <dt>Payment amount</dt>
                          <dd>
                            <strong>{wholesalePeso(payment.amount)}</strong>
                          </dd>
                        </div>
                        <div>
                          <dt>Collected at</dt>
                          <dd>{wholesaleDateTime(payment.collectedAt)}</dd>
                        </div>
                        <div>
                          <dt>Method / reference</dt>
                          <dd>
                            {payment.method} ·{" "}
                            {payment.reference || "No reference"}
                          </dd>
                        </div>
                      </dl>
                    ))}
                </section>
              )}
              {mode === "view" ? (
                <>
                  <WholesaleInstallmentBalances
                    installments={detail.installments ?? []}
                  />
                  <section className="modal-section">
                    <h3>Payment history</h3>
                    <ModalDataTable className="data-table wholesale-payment-history">
                      <thead>
                        <tr>
                          <th>Collected</th>
                          <th>Amount</th>
                          <th>Method / reference</th>
                          <th>Collector</th>
                          <th>Status</th>
                          <th className="table-action-head">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td data-label="Collected">
                              {wholesaleDateTime(payment.collectedAt)}
                            </td>
                            <td data-label="Amount">
                              <strong>{wholesalePeso(payment.amount)}</strong>
                            </td>
                            <td data-label="Method / reference" className="wholesale-payment-reference">
                              {payment.method}
                              <div className="muted">
                                <ModalTableValue value={payment.reference || "No reference"} />
                              </div>
                            </td>
                            <td data-label="Collector">
                              <ModalTableValue value={payment.collectorName} />
                            </td>
                            <td data-label="Status">
                              <span
                                className={
                                  "pill " +
                                  (payment.reversalId ? "neutral" : "success")
                                }
                              >
                                {payment.reversalId ? "Reversed" : "Recorded"}
                              </span>
                            </td>
                            <td data-label="Action" className="table-action-cell">
                              <div className="table-actions">
                                <AppTooltip content="View payment">
                                  <button type="button" className="button soft table-action-btn"
                                    aria-label={"View payment of " + wholesalePeso(payment.amount)}
                                    disabled={request.locked}
                                    onClick={() => {
                                      setPaymentDetailId(payment.id);
                                      setMode("history");
                                      setValidation("");
                                      request.clearError();
                                    }}>
                                    <Eye size={14} aria-hidden="true" />
                                  </button>
                                </AppTooltip>
                                {role === "Admin" && !payment.reversalId && (
                                  <AppTooltip content="Reverse payment">
                                    <button type="button" className="button soft table-action-btn"
                                      aria-label={"Reverse payment of " + wholesalePeso(payment.amount)}
                                      disabled={request.locked}
                                      onClick={() => {
                                        setMode(payment.id);
                                        setValidation("");
                                        request.clearError();
                                      }}>
                                      <RotateCcw size={14} aria-hidden="true" />
                                    </button>
                                  </AppTooltip>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!detail.payments.length && (
                          <tr>
                            <TableEmptyState colSpan={6}>
                              No payments recorded.
                            </TableEmptyState>
                          </tr>
                        )}
                      </tbody>
                    </ModalDataTable>
                  </section>
                  <ModalTableFooter>
                    <div className="wholesale-actions">
                      <button
                        className="button primary-action"
                        disabled={
                          request.locked ||
                          opening ||
                          Number(detail.balance) <= 0
                        }
                        onClick={() => {
                          setMethod("Cash");
                          setPaymentAmount("");
                          setMode("payment");
                          request.clearError();
                        }}
                      >
                        Record payment
                      </button>
                    </div>
                  </ModalTableFooter>
                </>
              ) : mode === "payment" ? (
                <form
                  key="payment"
                  id="wholesale-payment-form"
                  className="wholesale-account-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setValidation("");
                    const form = new FormData(event.currentTarget);
                    const date = new Date(
                      String(form.get("collectedAt")) + "+08:00",
                    );
                    if (!Number.isFinite(date.getTime())) {
                      setValidation("Enter a valid Manila collection time.");
                      return;
                    }
                    request.mutate(
                      "/accounts-receivable/" + detail.id + "/payments",
                      {
                        amount: form.get("amount"),
                        method,
                        collectedAt: date.toISOString(),
                        ...(method !== "Cash"
                          ? { reference: form.get("reference") }
                          : {}),
                        notes: form.get("notes"),
                      },
                    );
                  }}
                >
                  <fieldset
                    className="wholesale-fields"
                    disabled={request.locked}
                  >
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="wholesale-payment-amount">
                          Amount (₱) *
                        </label>
                        <input
                          ref={paymentAmountRef}
                          autoFocus
                          id="wholesale-payment-amount"
                          name="amount"
                          value={paymentAmount}
                          onChange={(event) =>
                            setPaymentAmount(event.target.value)
                          }
                          type="number"
                          min="0.01"
                          max={detail.balance}
                          step="0.01"
                          required
                        />
                        <div className="wholesale-payment-amount-help">
                          <span className="field-hint">
                            Up to {wholesalePeso(detail.balance)}
                          </span>
                          <button
                            className="button soft"
                            type="button"
                            disabled={request.locked}
                            onClick={() => {
                              setPaymentAmount(detail.balance);
                              setValidation("");
                              paymentAmountRef.current?.focus();
                            }}
                          >
                            Pay remaining balance
                          </button>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="wholesale-payment-time">
                          Collected at (Manila) *
                        </label>
                        <DateTimeField
                          id="wholesale-payment-time"
                          name="collectedAt"
                          step="0.001"
                          defaultValue={wholesaleManilaInput()}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="wholesale-payment-method">
                          Payment method *
                        </label>
                        <SelectField
                          id="wholesale-payment-method"
                          value={method}
                          onChange={(event) => setMethod(event.target.value)}
                        >
                          {detail.methods.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </SelectField>
                      </div>
                      <div className="field">
                        <label htmlFor="wholesale-payment-reference">
                          Payment reference{method !== "Cash" ? " *" : ""}
                        </label>
                        <input
                          id="wholesale-payment-reference"
                          name="reference"
                          disabled={method === "Cash"}
                          placeholder={
                            method === "Cash"
                              ? "Not required for cash"
                              : "Transaction reference"
                          }
                          maxLength={255}
                          required={method !== "Cash"}
                        />
                      </div>
                      <div className="field full-width">
                        <label htmlFor="wholesale-payment-notes">Notes</label>
                        <textarea
                          rows={3}
                          id="wholesale-payment-notes"
                          name="notes"
                          maxLength={500}
                        />
                      </div>
                    </div>
                    {allocationPreview.length > 0 && (
                      <section className="wholesale-context" role="status">
                        <span className="field-label">Payment allocation</span>
                        <dl className="wholesale-allocation-list">
                          {allocationPreview.map((allocation) => (
                            <div key={allocation.sequenceNumber}>
                              <dt>Installment {allocation.sequenceNumber}</dt>
                              <dd>{wholesalePeso(allocation.amount)}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    )}
                    <ModalTableFooter>
                      <button
                        className="button primary-action"
                        type="submit"
                        form="wholesale-payment-form"
                        disabled={request.locked}
                      >
                        {request.busy ? "Recording…" : "Record payment"}
                      </button>
                    </ModalTableFooter>
                  </fieldset>
                </form>
              ) : mode === "history" ? null : (
                <form
                  key="reversal"
                  id="wholesale-reversal-form"
                  className="wholesale-account-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    request.mutate("/payments/" + mode + "/reverse", {
                      reason: new FormData(event.currentTarget).get("reason"),
                    });
                  }}
                >
                  <p>
                    This restores the full payment amount to the account balance
                    and retains the original entry. It does not record a refund.
                    Admin must provide a reason for the correction.
                  </p>
                  <fieldset
                    className="wholesale-fields"
                    disabled={request.locked}
                  >
                    <div className="field">
                      <label htmlFor="wholesale-reversal-reason">
                        Correction reason *
                      </label>
                      <textarea
                        id="wholesale-reversal-reason"
                        name="reason"
                        required
                        maxLength={500}
                      />
                    </div>
                    <ModalTableFooter>
                      <button
                        className="button primary-action"
                        type="submit"
                        form="wholesale-reversal-form"
                        disabled={request.locked}
                      >
                        Confirm payment reversal
                      </button>
                    </ModalTableFooter>
                  </fieldset>
                </form>
              )}
            </div>
          )}
          <WholesaleRequestFeedback {...request} />
        </WholesaleDialog>
      )}
      <ReadDialog task={read}>
        {account => <WholesaleReceivables key={account.id} search="" role={role}
          detailsOnly embedded initialDetail={account} onClose={read.close}
          onChanged={() => { void load(); onChanged?.(); }} />}
      </ReadDialog>
    </>
  );
}
