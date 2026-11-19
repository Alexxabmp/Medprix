import { useReadDialog } from "./read-dialog";
import {
  SourceProgress,
  SourceFeedback,
  SourcePlaceholder,
} from "./custom-ui/source-state";
import { SelectField } from "@/components/custom-ui/select-field";
import { ChevronDown, Info } from "lucide-react";
import { DeliveryReceiptView } from "./delivery-receipt-view";
import { WholesaleDeliveryPanel } from "./wholesale-delivery-panel";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WholesaleDialog, useWholesaleDialogView } from "./wholesale-dialog";
import {
  wholesaleGet,
  getCachedWholesale,
  wholesalePeso,
  type WholesaleOrder,
  type WholesaleOrderDetail,
  type DeliveryReceipt,
  type WholesaleOverride,
} from "@/lib/wholesale-api";
import { safeError } from "@/lib/feedback";
import { formatDisplayDate } from "@/lib/business-date";
import {
  wholesaleMoneyInputSchema,
  wholesaleCents,
  wholesaleAmount,
  WHOLESALE_MAX_CENTS,
} from "@workspace/api-zod";
import {
  ModalTableValue,
  ModalTableHint,
  useModalTableStandard,
  ModalTableFrame,
  ModalTablePager,
  ModalTableFooter,
  useModalTableRows,
} from "./modal-table-layout";

export function WholesalePriceApproval({
  name,
  approvals,
  value,
  busy,
  change,
}: {
  name: string;
  approvals: Pick<
    WholesaleOverride,
    "id" | "price" | "approvedByName" | "reason"
  >[];
  value: string;
  busy: boolean;
  change: (id: string) => void;
}) {
  if (!approvals.length) return <span className="muted">Saved price</span>;
  const optionLabel = (approval: (typeof approvals)[number], index: number) =>
    wholesalePeso(approval.price) +
    (approvals.filter((item) => item.price === approval.price).length > 1
      ? ` (${index + 1})`
      : "");
  return (
    <div className="wholesale-price-selection">
      <SelectField
        aria-label={"Price selection for " + name}
        disabled={busy}
        value={value}
        onChange={(event) => change(event.target.value)}
        style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
      >
        <option value="">Saved price</option>
        {approvals.map((approval, index) => (
          <option key={approval.id} value={approval.id}>
            {optionLabel(approval, index)}
          </option>
        ))}
      </SelectField>
      <ModalTableHint
        value={approvals
          .map(
            (approval, index) =>
              `${optionLabel(approval, index)}: ${approval.reason}. Approved by ${approval.approvedByName}.`,
          )
          .join("\n")}
      >
        <button
          type="button"
          className="button soft table-action-btn"
          aria-label={"View price approval details for " + name}
        >
          <Info size={14} aria-hidden="true" />
        </button>
      </ModalTableHint>
    </div>
  );
}

export function WholesaleOrderDetails({
  order,
  role,
  busy,
  submitting = busy,
  error,
  retry,
  close,
  mutate,
  embedded = false,
  initialDetail,
  viewReceipt,
  initialAction,
}: {
  order: WholesaleOrder;
  role: string;
  busy: boolean;
  submitting?: boolean;
  error: string;
  retry?: () => void;
  close: () => void;
  mutate: (path: string, method: string, body: unknown) => void;
  embedded?: boolean;
  initialDetail?: WholesaleOrderDetail;
  viewReceipt?: (receipt: DeliveryReceipt) => void;
  initialAction?: "confirm";
}) {
  const tablePreview = useModalTableStandard();
  const [showReceipt, setShowReceipt] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deliveryTask, setDeliveryTask] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const body = contentRef.current?.closest(".wholesale-dialog-body");
    if (body) body.scrollTop = 0;
  }, [showReceipt]);
  const [cachedDetail] = useState<WholesaleOrderDetail | null>(
    () =>
      initialDetail ??
      getCachedWholesale<WholesaleOrderDetail>("/orders/" + order.id),
  );
  const read = useReadDialog<WholesaleOrderDetail>();
  const detail = read.state?.data ?? cachedDetail;
  const loadError = read.state?.error ?? "";
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [overrideProductId, setOverrideProductId] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const overrideLine = order.lines.find(
    (line) =>
      line.productId === (overrideProductId || order.lines[0]?.productId),
  );
  const validOverridePrice = wholesaleMoneyInputSchema.safeParse(overridePrice);
  const overrideLineCents =
    overrideLine && validOverridePrice.success
      ? wholesaleCents(validOverridePrice.data) * BigInt(overrideLine.quantity)
      : null;
  const overrideTotalTooLarge =
    overrideLineCents !== null && overrideLineCents > WHOLESALE_MAX_CENTS;
  const overrideLineTotal =
    overrideLineCents !== null && !overrideTotalTooLarge
      ? wholesaleAmount(overrideLineCents)
      : null;
  const [action, setAction] = useState<"confirm" | "cancel" | null>(() =>
    order.status === "Pending" ? (initialAction ?? null) : null,
  );
  useWholesaleDialogView(
    action
      ? {
          title:
            action === "confirm"
              ? "Confirm wholesale order"
              : "Cancel wholesale order",
          variant: action === "confirm" ? "compact-table" : "form",
          back:
            initialAction === "confirm" && action === "confirm"
              ? undefined
              : () => setAction(null),
        }
      : null,
  );
  function load() {
    read.open("Order details", () =>
      wholesaleGet<WholesaleOrderDetail>("/orders/" + order.id),
    );
  }
  useEffect(() => {
    if (!initialDetail) void load();
  }, [order.id, initialDetail]);
  const draft = order.status === "Pending";
  const active =
    draft ||
    (order.status === "Confirmed" &&
      !detail?.attempts.some((item) =>
        ["Scheduled", "InTransit"].includes(item.status),
      ));
  const current =
    detail?.overrides.filter((item) => item.revision === order.revision) ?? [];
  const showPriceSelection =
    draft &&
    current.some(
      (item) =>
        item.approvedBy &&
        order.lines.some((line) => line.productId === item.productId),
    );
  const displayLines =
    detail?.snapshot?.lines ??
    order.lines.map((line) => ({
      ...line,
      originalPrice: line.unitPrice,
      override: null,
    }));
  const selectedIds = Object.values(selected).filter(Boolean);
  const itemPages = useModalTableRows(displayLines, order.id);
  const reservationPages = useModalTableRows(
    detail?.reservations ?? [],
    order.id,
  );
  const preview = order.lines.reduce((sum, line) => {
    const override = current.find(
      (item) => item.id === selected[line.productId],
    );
    return sum + Number(override?.price ?? line.unitPrice) * line.quantity;
  }, 0);
  const content = (
    <>
      {retry && (
        <div className="wholesale-notice" role="status">
          <p>
            The previous request needs confirmation. You can close this window
            and browse records. Retry the saved request before making another
            change.
          </p>
          <button className="button dark" disabled={submitting} onClick={retry}>
            Retry saved request
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="inline-error">
          {error}
        </div>
      )}
      {read.state?.pending && detail && (
        <SourceProgress label={"Refreshing order details\u2026"} />
      )}
      <SourceFeedback
        status={{
          hasData: detail !== null,
          pending: read.state?.pending ?? false,
          error: loadError,
        }}
        label="order details"
        onRetry={read.retry}
      />
      {!detail && (
        <SourcePlaceholder
          status={{
            hasData: false,
            pending: read.state?.pending ?? true,
            error: loadError,
          }}
          label="Order details"
        />
      )}
      {detail && (
        <div className="wholesale-details">
          {action !== "cancel" && !deliveryTask && (
            <>
              <dl className="wholesale-review-summary wholesale-order-summary">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className="pill neutral">
                      {draft ? "Draft" : order.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Payment plan</dt>
                  <dd>
                    {order.paymentPlan === "Net30"
                      ? "Net 30: One Payment Deadline"
                      : order.paymentPlan === "Net60"
                        ? "Net 60: Two Installments"
                        : "Select a plan before confirmation"}
                    {detail.receipt && (
                      <span className="wholesale-plan-deadline">
                        Final deadline:{" "}
                        {formatDisplayDate(
                          detail.receipt.snapshot.installmentSchedule
                            .finalDueDate,
                        )}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Quantity</dt>
                  <dd>
                    {order.lines.reduce((sum, line) => sum + line.quantity, 0)}{" "}
                    units
                  </dd>
                </div>
                <div>
                  <dt>{draft ? "Confirmation total" : "Agreed total"}</dt>
                  <dd>
                    <strong>
                      {wholesalePeso(draft ? preview.toFixed(2) : order.total)}
                    </strong>
                  </dd>
                </div>
              </dl>
              {order.contractTitle && (
                <section className="wholesale-context">
                  <strong>
                    Contract:{" "}
                    {detail.snapshot?.contract?.title ?? order.contractTitle}
                  </strong>
                  <p className="field-hint">
                    Revision{" "}
                    {detail.snapshot?.contract?.revision ??
                      order.contractRevision}
                    . Contract product prices and approved exceptions are
                    captured at confirmation.
                  </p>
                  {detail.snapshot?.termsException && (
                    <p className="field-hint">
                      Approved terms exception:{" "}
                      {detail.snapshot.termsException.approval_reason}
                    </p>
                  )}
                </section>
              )}
              <section className="wholesale-review-client">
                <h3>Client</h3>
                <p>
                  <strong>
                    {detail.snapshot?.clientName ??
                      detail.client?.name ??
                      order.clientName}
                  </strong>
                </p>
                <p className="muted">
                  {detail.snapshot?.address ??
                    detail.client?.address ??
                    "No delivery address. Update the client before confirmation."}
                </p>
              </section>
              {draft &&
                order.contractId &&
                detail.contractPaymentPlan !== order.paymentPlan && (
                  <section className="modal-section">
                    <h3>Contract payment-terms exceptions</h3>
                    <p className="field-hint">
                      If this draft uses different terms from its contract,
                      request Admin approval before confirmation.
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        mutate(`/orders/${order.id}/terms-exceptions`, "POST", {
                          revision: order.revision,
                          reason: data.get("reason"),
                        });
                      }}
                    >
                      <fieldset className="wholesale-fields" disabled={busy}>
                        <div className="field">
                          <label htmlFor="wholesale-terms-reason">
                            Exception reason *
                          </label>
                          <textarea
                            id="wholesale-terms-reason"
                            name="reason"
                            required
                            maxLength={500}
                            rows={2}
                          />
                        </div>
                        <button className="button soft w-fit">
                          Request terms approval
                        </button>
                      </fieldset>
                    </form>
                    {(detail.termsOverrides ?? [])
                      .filter((item) => item.revision === order.revision)
                      .map((item) => (
                        <section className="modal-section" key={item.id}>
                          <p>{item.reason}</p>
                          {item.approvedBy ? (
                            <p className="field-hint">
                              Approved by {item.approvedByName}:{" "}
                              {item.approvalReason}
                            </p>
                          ) : role === "Admin" ? (
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                const data = new FormData(event.currentTarget);
                                mutate(
                                  `/terms-exceptions/${item.id}/approve`,
                                  "POST",
                                  { reason: data.get("reason") },
                                );
                              }}
                            >
                              <fieldset
                                className="wholesale-fields"
                                disabled={busy}
                              >
                                <div className="field">
                                  <label htmlFor={`terms-approval-${item.id}`}>
                                    Admin approval reason *
                                  </label>
                                  <input
                                    id={`terms-approval-${item.id}`}
                                    name="reason"
                                    required
                                    maxLength={500}
                                  />
                                </div>
                                <button className="button soft w-fit">
                                  Approve exception
                                </button>
                              </fieldset>
                            </form>
                          ) : (
                            <p className="field-hint">
                              Awaiting Admin approval.
                            </p>
                          )}
                        </section>
                      ))}
                  </section>
                )}
              <section className="wholesale-review-items">
                <h3>Order items</h3>
                {showPriceSelection && (
                  <p className="field-hint">
                    Use the saved price or choose an approved override. The info
                    button shows the approval details.
                  </p>
                )}
                <ModalTableFrame>
                  <div
                    className="table-scroll"
                    role={tablePreview ? "region" : undefined}
                    aria-label={
                      tablePreview
                        ? "Order items, scroll horizontally for more columns"
                        : undefined
                    }
                    tabIndex={tablePreview ? 0 : undefined}
                  >
                    <table
                      className="data-table wholesale-order-items-table"
                      data-modal-table={
                        tablePreview
                          ? showPriceSelection
                            ? "draft"
                            : "items"
                          : undefined
                      }
                    >
                      {tablePreview && (
                        <colgroup>
                          <col className="modal-table-order-product-column" />
                          <col />
                          <col />
                          <col />
                          {showPriceSelection && (
                            <col className="modal-table-approval-column" />
                          )}
                        </colgroup>
                      )}
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Quantity</th>
                          <th>Unit price</th>
                          <th>Line total</th>
                          {showPriceSelection && <th>Price selection</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {itemPages.rows.map((line) => {
                          const approvals = current.filter(
                            (item) =>
                              item.productId === line.productId &&
                              item.approvedBy,
                          );
                          const price =
                            current.find(
                              (item) => item.id === selected[line.productId],
                            )?.price ?? line.unitPrice;
                          return (
                            <tr key={line.productId}>
                              <td data-label="Product">
                                <strong>
                                  <ModalTableValue value={line.name} />
                                </strong>
                                {line.override && (
                                  <p className="field-hint">
                                    Original:{" "}
                                    {wholesalePeso(line.originalPrice)} ·
                                    Approved override: {line.override.reason}
                                  </p>
                                )}
                              </td>
                              <td data-label="Quantity">{line.quantity}</td>
                              <td data-label="Unit price">
                                {wholesalePeso(price)}
                              </td>
                              <td data-label="Line total">
                                {wholesalePeso(
                                  (Number(price) * line.quantity).toFixed(2),
                                )}
                              </td>
                              {showPriceSelection && (
                                <td data-label="Price selection">
                                  <WholesalePriceApproval
                                    name={line.name}
                                    approvals={approvals}
                                    busy={busy}
                                    value={selected[line.productId] ?? ""}
                                    change={(id) =>
                                      setSelected((value) => ({
                                        ...value,
                                        [line.productId]: id,
                                      }))
                                    }
                                  />
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </ModalTableFrame>
                <ModalTablePager {...itemPages} label="Order items" />
                {detail.snapshot && (
                  <p className="wholesale-review-vat">
                    VAT included: {wholesalePeso(detail.snapshot.vat)}
                  </p>
                )}
              </section>
            </>
          )}
          {draft && !action && !deliveryTask && (
            <details className="wholesale-review-overrides">
              <summary>
                <span>
                  Price overrides
                  {current.length ? " (" + current.length + ")" : ""}
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="wholesale-details">
                <section className="modal-section">
                  <h3>Request a price override</h3>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      mutate("/orders/" + order.id + "/overrides", "POST", {
                        revision: order.revision,
                        productId: form.get("productId"),
                        price: form.get("price"),
                        reason: form.get("reason"),
                      });
                    }}
                  >
                    <fieldset disabled={busy} className="wholesale-fields">
                      <div className="form-grid">
                        <div className="field">
                          <label htmlFor={"wholesale-override-product"}>
                            Product *
                          </label>
                          <SelectField
                            id={"wholesale-override-product"}
                            searchable
                            required
                            name="productId"
                            value={overrideLine?.productId ?? ""}
                            onChange={(event) =>
                              setOverrideProductId(event.target.value)
                            }
                          >
                            {order.lines.map((line) => (
                              <option
                                value={line.productId}
                                key={line.productId}
                              >
                                {line.name}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                        <div className="field">
                          <label htmlFor={"wholesale-override-price"}>
                            Requested unit price (₱) *
                          </label>
                          <input
                            id={"wholesale-override-price"}
                            required
                            name="price"
                            type="number"
                            min="0"
                            max="9999999999.99"
                            step="0.01"
                            value={overridePrice}
                            onChange={(event) =>
                              setOverridePrice(event.target.value)
                            }
                            aria-describedby="wholesale-override-total"
                          />
                        </div>
                      </div>
                      <div
                        className="form-grid"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        <div className="field">
                          <span className="field-label">Order quantity</span>
                          <strong>
                            {overrideLine
                              ? `${overrideLine.quantity} units`
                              : "—"}
                          </strong>
                        </div>
                        <div className="field" id="wholesale-override-total">
                          <span className="field-label">
                            Requested line total (incl. VAT where applicable)
                          </span>
                          <strong>
                            {overrideLineTotal === null
                              ? "—"
                              : wholesalePeso(overrideLineTotal)}
                          </strong>
                          <span
                            className={
                              overrideTotalTooLarge
                                ? "field-error"
                                : "field-hint"
                            }
                          >
                            {overrideTotalTooLarge
                              ? "The requested line total exceeds the supported amount."
                              : "Order quantity × requested unit price. Subject to Admin approval."}
                          </span>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor={"wholesale-override-reason"}>
                          Request reason *
                        </label>
                        <textarea
                          id={"wholesale-override-reason"}
                          rows={3}
                          required
                          name="reason"
                          maxLength={500}
                        />
                      </div>
                      <button className="button soft w-fit" type="submit">
                        Request approval
                      </button>
                    </fieldset>
                  </form>
                </section>
                {[false, true].map(
                  (approved) =>
                    current.some(
                      (request) => Boolean(request.approvedBy) === approved,
                    ) && (
                      <section
                        className="wholesale-override-group"
                        key={String(approved)}
                      >
                        <h3>
                          {approved ? "Approved prices" : "Pending approvals"}
                        </h3>
                        {current
                          .filter(
                            (request) =>
                              Boolean(request.approvedBy) === approved,
                          )
                          .map((request) => (
                            <section className="modal-section" key={request.id}>
                              <p>
                                {
                                  order.lines.find(
                                    (line) =>
                                      line.productId === request.productId,
                                  )?.name
                                }{" "}
                                · {wholesalePeso(request.price)}
                              </p>
                              <p>{request.reason}</p>
                              {request.approvedBy ? (
                                <p>
                                  Approved by {request.approvedByName}:{" "}
                                  {request.approvalReason}
                                </p>
                              ) : role === "Admin" ? (
                                <form
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const form = new FormData(
                                      event.currentTarget,
                                    );
                                    mutate(
                                      "/overrides/" + request.id + "/approve",
                                      "POST",
                                      { reason: form.get("reason") },
                                    );
                                  }}
                                >
                                  <fieldset
                                    className="wholesale-fields"
                                    disabled={busy}
                                  >
                                    <div className="field">
                                      <label
                                        htmlFor={
                                          "wholesale-approval-reason-" +
                                          request.id
                                        }
                                      >
                                        Approval reason *
                                      </label>
                                      <input
                                        id={
                                          "wholesale-approval-reason-" +
                                          request.id
                                        }
                                        name="reason"
                                        maxLength={500}
                                        required
                                      />
                                    </div>
                                    <button
                                      className="button soft w-fit"
                                      type="submit"
                                    >
                                      Approve override
                                    </button>
                                  </fieldset>
                                </form>
                              ) : (
                                <p>Awaiting Admin approval.</p>
                              )}
                            </section>
                          ))}
                      </section>
                    ),
                )}
              </div>
            </details>
          )}
          {detail.reservations.length > 0 && !action && !deliveryTask && (
            <details className="wholesale-review-overrides">
              <summary>
                <span>Batch reservations</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="wholesale-details">
                <ModalTableFrame>
                  <div
                    className="table-scroll"
                    role={tablePreview ? "region" : undefined}
                    aria-label={
                      tablePreview
                        ? "Batch reservations, scroll horizontally for more columns"
                        : undefined
                    }
                    tabIndex={tablePreview ? 0 : undefined}
                  >
                    <table
                      className="data-table wholesale-task-table"
                      data-modal-table={
                        tablePreview ? "reservations" : undefined
                      }
                    >
                      {tablePreview && (
                        <colgroup>
                          <col className="modal-table-order-product-column" />
                          <col />
                          <col />
                          <col />
                          <col />
                        </colgroup>
                      )}
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Batch</th>
                          <th>Expiry</th>
                          <th>Quantity</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reservationPages.rows.map((reservation) => (
                          <tr key={reservation.id}>
                            <td data-label="Product">
                              <ModalTableValue value={reservation.product} />
                            </td>
                            <td data-label="Batch">
                              {reservation.batchNumber}
                            </td>
                            <td data-label="Expiry">{reservation.expiry}</td>
                            <td data-label="Quantity">
                              {reservation.quantity}
                            </td>
                            <td data-label="Status">
                              <span className="pill neutral">
                                {reservation.releasedAt
                                  ? "Released"
                                  : reservation.consumedAt
                                    ? "Delivered"
                                    : "Reserved"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ModalTableFrame>
                <ModalTablePager
                  {...reservationPages}
                  label="Batch reservations"
                />
              </div>
            </details>
          )}
          {!draft && !action && (
            <WholesaleDeliveryPanel
              order={order}
              detail={detail}
              busy={busy}
              mutate={mutate}
              showTotal={false}
              onTaskChange={setDeliveryTask}
              viewReceipt={() => {
                if (viewReceipt && detail.receipt)
                  viewReceipt(detail.receipt.snapshot);
                else setShowReceipt(true);
              }}
            />
          )}
          {active && !action && !deliveryTask && (
            <ModalTableFooter>
              <div className="wholesale-actions">
                <button
                  disabled={busy}
                  className="button soft"
                  onClick={() => setAction("cancel")}
                >
                  Cancel order
                </button>
                {draft && (
                  <button
                    disabled={busy}
                    className="button dark"
                    onClick={() => setAction("confirm")}
                  >
                    Review confirmation
                  </button>
                )}
              </div>
            </ModalTableFooter>
          )}
          {action === "confirm" && (
            <section className="modal-section">
              {!detail.client?.address && !detail.snapshot?.address && (
                <p className="inline-error">
                  Add a delivery address to the client before confirmation.
                </p>
              )}
              <section
                className="wholesale-context wholesale-confirmation-note"
                aria-label="Confirmation details"
              >
                <h3>On confirmation</h3>
                <p>
                  Availability is checked and the quantities above are reserved.
                </p>
                <p className="muted">
                  Agreed prices and client details are saved. Stock is deducted
                  after confirmed delivery.
                </p>
              </section>
              <ModalTableFooter>
                <div className="wholesale-actions">
                  <button
                    disabled={
                      busy ||
                      !(detail.snapshot?.address ?? detail.client?.address)
                    }
                    className="button dark"
                    onClick={() =>
                      mutate("/orders/" + order.id + "/confirm", "POST", {
                        revision: order.revision,
                        overrideIds: selectedIds,
                      })
                    }
                  >
                    Confirm and reserve
                  </button>
                </div>
              </ModalTableFooter>
            </section>
          )}
          {action === "cancel" && (
            <form
              id={tablePreview ? "preview-cancel-" + order.id : undefined}
              className="modal-section"
              onSubmit={(event) => {
                event.preventDefault();
                mutate("/orders/" + order.id + "/cancel", "POST", {
                  revision: order.revision,
                  reason: new FormData(event.currentTarget).get("reason"),
                });
              }}
            >
              <section className="wholesale-context">
                <span className="field-label">Order total</span>
                <strong>{wholesalePeso(order.total)}</strong>
              </section>
              <p>
                Cancel this order and release its active reservations. Physical
                stock will not change.
              </p>
              <fieldset className="wholesale-fields" disabled={busy}>
                <div className="field">
                  <label htmlFor={"wholesale-cancellation-reason"}>
                    Cancellation reason *
                  </label>
                  <input
                    id={"wholesale-cancellation-reason"}
                    required
                    name="reason"
                    maxLength={500}
                  />
                </div>
                <ModalTableFooter>
                  <div className="wholesale-actions">
                    <button
                      className="button dark"
                      type="submit"
                      form={
                        tablePreview ? "preview-cancel-" + order.id : undefined
                      }
                      disabled={busy}
                    >
                      Confirm cancellation
                    </button>
                  </div>
                </ModalTableFooter>
              </fieldset>
            </form>
          )}
        </div>
      )}
    </>
  );
  return embedded ? (
    content
  ) : (
    <WholesaleDialog
      title={
        showReceipt
          ? "Delivery receipt details"
          : action === "confirm"
            ? "Confirm wholesale order"
            : action === "cancel"
              ? "Cancel wholesale order"
              : "Wholesale order"
      }
      busy={submitting || printing}
      back={
        showReceipt
          ? () => setShowReceipt(false)
          : action && !(initialAction === "confirm" && action === "confirm")
            ? () => setAction(null)
            : undefined
      }
      close={close}
      variant={showReceipt ? "form" : action === "cancel" ? "form" : "table"}
      description={
        showReceipt && detail?.receipt
          ? detail.receipt.snapshot.receiptNumber
          : order.orderNumber
      }
    >
      <div ref={contentRef}>
        {showReceipt && detail?.receipt ? (
          <DeliveryReceiptView
            receipt={detail.receipt.snapshot}
            close={close}
            embedded
            onBusyChange={setPrinting}
          />
        ) : (
          content
        )}
      </div>
    </WholesaleDialog>
  );
}
