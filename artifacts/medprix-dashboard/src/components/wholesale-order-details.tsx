import { SelectField } from "@/components/custom-ui/select-field";
import { ChevronDown } from "lucide-react";
import { DeliveryReceiptView } from "./delivery-receipt-view";
import { WholesaleDeliveryPanel } from "./wholesale-delivery-panel";
import { LoadingState } from "@/components/custom-ui/loading-state";
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
  ModalTableValue,
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
  return (
    <SelectField
      aria-label={"Price approval for " + name}
      disabled={busy}
      value={value}
      onChange={(event) => change(event.target.value)}
    >
      <option value="">Saved wholesale price</option>
      {approvals.map((approval) => (
        <option key={approval.id} value={approval.id}>
          {wholesalePeso(approval.price)} · {approval.reason} ·{" "}
          {approval.approvedByName}
        </option>
      ))}
    </SelectField>
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
  const [detail, setDetail] = useState<WholesaleOrderDetail | null>(
    () =>
      initialDetail ??
      getCachedWholesale<WholesaleOrderDetail>("/orders/" + order.id),
  );
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
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
          variant: action === "confirm" ? "table" : "form",
          back:
            initialAction === "confirm" && action === "confirm"
              ? undefined
              : () => setAction(null),
        }
      : null,
  );
  async function load() {
    setLoadError("");
    try {
      setDetail(
        await wholesaleGet<WholesaleOrderDetail>("/orders/" + order.id),
      );
    } catch (failure) {
      setLoadError(safeError(failure));
    }
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
      {loadError && (
        <div role="alert" className="inline-error">
          {loadError}
          <button className="button soft" onClick={() => void load()}>
            Retry loading
          </button>
        </div>
      )}
      {!detail && !loadError && <LoadingState label="Loading order details…" />}
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
                      ? "Net-30 · 4 weekly installments"
                      : order.paymentPlan === "Net60"
                        ? "Net-60 · 8 weekly installments"
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
              <section className="wholesale-review-items">
                <h3>Order items</h3>
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
                      className="data-table wholesale-task-table"
                      data-modal-table={
                        tablePreview ? (draft ? "draft" : "items") : undefined
                      }
                    >
                      {tablePreview && (
                        <colgroup>
                          <col className="modal-table-order-product-column" />
                          <col />
                          <col />
                          <col />
                          {draft && (
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
                          {draft && <th>Price approval</th>}
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
                              {draft && (
                                <td data-label="Price approval">
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
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor={"wholesale-override-reason"}>
                          Request reason *
                        </label>
                        <input
                          id={"wholesale-override-reason"}
                          type="text"
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
