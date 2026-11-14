import { AppTooltip } from "@/components/ui/tooltip";
import { ModalDataTable } from "./modal-data-table";
import { ModalTableFooter } from "./modal-table-layout";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { LoadingState } from "./custom-ui/loading-state";
import { WholesaleDialog } from "./wholesale-dialog";
import { WholesaleRequestFeedback } from "./wholesale-request-feedback";
import { useWholesaleRequest } from "@/lib/use-wholesale-request";
import { safeError } from "@/lib/feedback";
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
  onClose,
}: {
  search: string;
  role: string;
  status?: WholesaleAccountFilter;
  onChanged?: () => void;
  initialDetail?: WholesaleReceivableDetail;
  detailsOnly?: boolean;
  onClose?: () => void;
}) {
  const [page, setPage] = useState(1);
  const initialCacheKey = "/accounts-receivable?search=" + encodeURIComponent(search) + "&page=1&status=" + status;
  const [data, setData] = useState<WholesaleReceivablePage | null>(() => getCachedWholesale<WholesaleReceivablePage>(initialCacheKey));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDetail?.id ?? null,
  );
  const [detail, setDetail] = useState<WholesaleReceivableDetail | null>(
    initialDetail ?? null,
  );
  const [opening, setOpening] = useState(false);
  const [mode, setMode] = useState("view");
  const [method, setMethod] = useState("Cash");
  const [validation, setValidation] = useState("");
  const [subPage, setSubPage] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const RECEIVABLE_PAGE_SIZE = 15;
  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / RECEIVABLE_PAGE_SIZE));
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
  async function load() {
    if (detailsOnly) return;
    const result = await wholesaleGet<WholesaleReceivablePage>(
      "/accounts-receivable?search=" +
        encodeURIComponent(search) +
        "&page=" +
        page +
        "&status=" +
        status,
    );
    setData(result);
  }
  async function loadDetail(id: string) {
    setDetail(
      await wholesaleGet<WholesaleReceivableDetail>(
        "/accounts-receivable/" + id,
      ),
    );
  }
  const request = useWholesaleRequest("collections", async () => {
    await load();
    if (selectedId) await loadDetail(selectedId);
    setMode("view");
    onChanged?.();
  });
  useEffect(() => {
    setPage(1);
    setSubPage(1);
  }, [search, status]);
  useEffect(() => {
    if (detailsOnly) return;
    let active = true;
    const reqPath = "/accounts-receivable?search=" + encodeURIComponent(search) + "&page=" + page + "&status=" + status;
    const cached = getCachedWholesale<WholesaleReceivablePage>(reqPath);
    if (cached) {
      setData(cached);
    }
    setLoading(false);
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
          if (active) setData(value);
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
  }, [search, page, status, detailsOnly]);
  useEffect(() => {
    if (request.locked) return;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await load();
        if (selectedId && mode === "view") await loadDetail(selectedId);
        setLoadError("");
      } catch (failure) {
        setLoadError(safeError(failure));
      }
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [search, page, status, selectedId, mode, request.locked]);
  async function open(id: string) {
    setOpening(true);
    setLoadError("");
    setValidation("");
    setMode("view");
    request.clearError();
    try {
      await loadDetail(id);
      setSelectedId(id);
    } catch (failure) {
      if (selectedId) setValidation(safeError(failure));
      else setLoadError(safeError(failure));
    } finally {
      setOpening(false);
    }
  }
  return (
    <>
      {!detailsOnly && (
        <>
          {!selectedId && <WholesaleRequestFeedback {...request} />}
          {opening && !selectedId && (
            <LoadingState label="Opening account..." />
          )}
          {loadError && (
            <div role="alert" className="inline-error">
              {loadError}
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Order / client</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Due date</th>
                <th>Status</th>
                <th className="table-action-head">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !loadError &&
                paginatedItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.orderNumber}</strong>
                      <div className="muted">{item.clientName}</div>
                    </td>
                    <td>{wholesalePeso(item.total)}</td>
                    <td>{wholesalePeso(item.paid)}</td>
                    <td>
                      <strong>{wholesalePeso(item.balance)}</strong>
                    </td>
                    <td>{item.dueDate}</td>
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
                    </td>
                    <td className="table-action-cell">
                      <div className="table-actions">
                        <AppTooltip content={"View account"}><button
                          className="button soft table-action-btn"
                          disabled={request.locked || opening}
                          aria-label="View account"

                          onClick={() => void open(item.id)}
                        >
                          <Eye size={13} />
                        </button></AppTooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <LoadingState label="Loading receivables…" />
                  </td>
                </tr>
              ) : (
                !loadError &&
                !items.length && (
                  <tr>
                    <TableEmptyState colSpan={7}>
                      {search
                        ? "No matching receivables."
                        : "No delivered receivables found."}
                    </TableEmptyState>
                  </tr>
                )
              )}
            </tbody>
          </table>
          <div className="wholesale-pagination">
            <span className="muted">
              Page {safeSubPage} of {totalPages} ({items.length} accounts)
            </span>
            <button
              type="button"
              className="button soft"
              disabled={loading || safeSubPage <= 1}
              onClick={() => setSubPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="button soft"
              disabled={loading || safeSubPage >= totalPages}
              onClick={() => setSubPage((value) => Math.min(totalPages, value + 1))}
            >
              Next
            </button>
          </div>
        </>
      )}
      {selectedId && (
        <WholesaleDialog
          title="Accounts receivable"
          description={
            detail
              ? detail.orderNumber + " · " + detail.clientName
              : "Loading account"
          }
          busy={request.locked || opening}
          close={() => {
            setSelectedId(null);
            onClose?.();
          }}
          className="wholesale-account-dialog"
        >
          {validation && (
            <div role="alert" className="inline-error">
              {validation}
            </div>
          )}
          {detail && (
            <div className="wholesale-details" ref={contentRef}>
              <dl className="wholesale-review-summary">
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
              </dl>
              <p className="field-hint">
                Payment due {detail.dueDate} · Delivered{" "}
                {wholesaleDateTime(detail.deliveredAt)}
              </p>
              {detail.reviewRequired && (
                <div className="inline-error" role="alert">
                  This account has unresolved historical payments or balances.
                  New collections are blocked until reviewed.
                </div>
              )}
              {mode === "view" ? (
                <>
                  <section className="modal-section">
                    <h3>Payment history</h3>
                    <div className="table-scroll">
                      <ModalDataTable className="data-table">
                        <thead>
                          <tr>
                            <th>Collected</th>
                            <th>Amount / method</th>
                            <th>Collector / reference</th>
                            <th>Status</th>
                            {role === "Admin" && <th>Action</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.payments.map((payment) => (
                            <tr key={payment.id}>
                              <td data-label="Collected">
                                {wholesaleDateTime(payment.collectedAt)}
                              </td>
                              <td data-label="Amount / method">
                                {wholesalePeso(payment.amount)}
                                <div className="muted">
                                  {payment.method ??
                                    "Unclassified historical payment"}
                                </div>
                              </td>
                              <td data-label="Collector / reference">
                                {payment.collectorName ?? "Unknown collector"}
                                {payment.reference && (
                                  <div className="muted">
                                    {payment.reference}
                                  </div>
                                )}
                                {payment.notes && (
                                  <div className="muted">{payment.notes}</div>
                                )}
                              </td>
                              <td data-label="Status">
                                {payment.reversalId ? (
                                  <>
                                    <span className="pill neutral">
                                      Reversed
                                    </span>
                                    <div className="muted">
                                      {payment.reversalReason}
                                    </div>
                                    {payment.reversedAt && (
                                      <div className="muted">
                                        {wholesaleDateTime(payment.reversedAt)}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="pill success">Recorded</span>
                                )}
                              </td>
                              {role === "Admin" && (
                                <td data-label="Action">
                                  {payment.method &&
                                    !payment.reversalId &&
                                    !detail.reviewRequired && (
                                      <button
                                        className="button soft"
                                        disabled={request.locked}
                                        onClick={() => {
                                          setMode(payment.id);
                                          request.clearError();
                                        }}
                                      >
                                        Reverse payment
                                      </button>
                                    )}
                                </td>
                              )}
                            </tr>
                          ))}
                          {!detail.payments.length && (
                            <tr>
                              <TableEmptyState colSpan={role === "Admin" ? 5 : 4}>
                                No payments recorded.
                              </TableEmptyState>
                            </tr>
                          )}
                        </tbody>
                      </ModalDataTable>
                    </div>
                  </section>
                  <ModalTableFooter>
                  <div className="wholesale-actions">
                    <button
                      className="button primary-action"
                      disabled={
                        request.locked ||
                        opening ||
                        detail.reviewRequired ||
                        Number(detail.balance) <= 0
                      }
                      onClick={() => {
                        setMethod("Cash");
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
                  className="modal-section"
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
                  <h3>Record client payment</h3>
                  <fieldset
                    className="wholesale-fields"
                    disabled={request.locked}
                  >
                    <div className="field">
                      <label htmlFor="wholesale-payment-amount">
                        Amount (₱) *
                      </label>
                      <input
                        id="wholesale-payment-amount"
                        name="amount"
                        type="number"
                        min="0.01"
                        max={detail.balance}
                        step="0.01"
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="wholesale-payment-method">
                        Payment method *
                      </label>
                      <select
                        id="wholesale-payment-method"
                        value={method}
                        onChange={(event) => setMethod(event.target.value)}
                      >
                        {detail.methods.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </div>
                    {method !== "Cash" && (
                      <div className="field">
                        <label htmlFor="wholesale-payment-reference">
                          Payment reference *
                        </label>
                        <input
                          id="wholesale-payment-reference"
                          name="reference"
                          maxLength={255}
                          required
                        />
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor="wholesale-payment-time">
                        Collected at (Manila) *
                      </label>
                      <input
                        id="wholesale-payment-time"
                        name="collectedAt"
                        type="datetime-local"
                        step="0.001"
                        defaultValue={wholesaleManilaInput()}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="wholesale-payment-notes">Notes</label>
                      <textarea
                        id="wholesale-payment-notes"
                        name="notes"
                        maxLength={500}
                      />
                    </div>
                    <div className="wholesale-actions">
                      <button
                        className="button soft"
                        type="button"
                        onClick={() => setMode("view")}
                      >
                        Back
                      </button>
                      <button className="button primary-action" type="submit">
                        Save payment
                      </button>
                    </div>
                  </fieldset>
                </form>
              ) : (
                <form
                  key="reversal"
                  className="modal-section"
                  onSubmit={(event) => {
                    event.preventDefault();
                    request.mutate("/payments/" + mode + "/reverse", {
                      reason: new FormData(event.currentTarget).get("reason"),
                    });
                  }}
                >
                  <h3>Reverse incorrect payment</h3>
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
                    <div className="wholesale-actions">
                      <button
                        className="button soft"
                        type="button"
                        onClick={() => setMode("view")}
                      >
                        Back
                      </button>
                      <button className="button primary-action" type="submit">
                        Confirm payment reversal
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}
            </div>
          )}
          <WholesaleRequestFeedback {...request} />
        </WholesaleDialog>
      )}
    </>
  );
}
