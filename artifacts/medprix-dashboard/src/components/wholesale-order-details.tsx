import { ChevronDown } from "lucide-react";
import { DeliveryReceiptView } from "./delivery-receipt-view";
import { WholesaleDeliveryPanel } from "./wholesale-delivery-panel";
import { LoadingState } from "@/components/custom-ui/loading-state";
import { useEffect, useState } from "react";
import { WholesaleDialog } from "./wholesale-dialog";
import {
  wholesaleGet,
  getCachedWholesale,
  wholesalePeso,
  type WholesaleOrder,
  type WholesaleOrderDetail,
  type DeliveryReceipt,
} from "@/lib/wholesale-api";
import { safeError } from "@/lib/feedback";

export function WholesaleOrderDetails({
  order,
  role,
  busy,
  error,
  retry,
  close,
  mutate,
  embedded = false,
  initialDetail,
  viewReceipt,
}: {
  order: WholesaleOrder;
  role: string;
  busy: boolean;
  error: string;
  retry?: () => void;
  close: () => void;
  mutate: (path: string, method: string, body: unknown) => void;
  embedded?: boolean;
  initialDetail?: WholesaleOrderDetail;
  viewReceipt?: (receipt: DeliveryReceipt) => void;
}) {
  const [showReceipt, setShowReceipt] = useState(false);
  const [detail, setDetail] = useState<WholesaleOrderDetail | null>(
    () => initialDetail ?? getCachedWholesale<WholesaleOrderDetail>("/orders/" + order.id),
  );
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [action, setAction] = useState<"confirm" | "cancel" | null>(null);
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
  const preview = order.lines.reduce((sum, line) => {
    const override = current.find(
      (item) => item.id === selected[line.productId],
    );
    return sum + Number(override?.price ?? line.unitPrice) * line.quantity;
  }, 0);
  if (showReceipt && detail?.receipt) {
    return (
      <DeliveryReceiptView
        receipt={detail.receipt.snapshot}
        close={() => setShowReceipt(false)}
      />
    );
  }
  const content = (
    <>
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
          <dl className="wholesale-review-summary">
            <div>
              <dt>Status</dt>
              <dd>
                <span className="pill neutral">
                  {draft ? "Draft" : order.status}
                </span>
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
              <strong>{detail.snapshot?.clientName ?? order.clientName}</strong>
            </p>
            {detail.snapshot && (
              <p className="muted">{detail.snapshot.address}</p>
            )}
          </section>
          <section className="wholesale-review-items">
            <h3>Order items</h3>
            <div className="table-scroll">
              <table className="data-table">
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
                  {displayLines.map((line) => {
                    const approvals = current.filter(
                      (item) =>
                        item.productId === line.productId && item.approvedBy,
                    );
                    const price =
                      current.find(
                        (item) => item.id === selected[line.productId],
                      )?.price ?? line.unitPrice;
                    return (
                      <tr key={line.productId}>
                        <td data-label="Product">
                          <strong>{line.name}</strong>
                          {line.override && (
                            <p className="field-hint">
                              Original: {wholesalePeso(line.originalPrice)} ·
                              Approved override: {line.override.reason}
                            </p>
                          )}
                        </td>
                        <td data-label="Quantity">{line.quantity}</td>
                        <td data-label="Unit price">{wholesalePeso(price)}</td>
                        <td data-label="Line total">
                          {wholesalePeso(
                            (Number(price) * line.quantity).toFixed(2),
                          )}
                        </td>
                        {draft && (
                          <td data-label="Price approval">
                            <select
                              aria-label={"Price approval for " + line.name}
                              disabled={busy}
                              value={selected[line.productId] ?? ""}
                              onChange={(event) =>
                                setSelected((value) => ({
                                  ...value,
                                  [line.productId]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Saved wholesale price</option>
                              {approvals.map((approval) => (
                                <option key={approval.id} value={approval.id}>
                                  {wholesalePeso(approval.price)} ·{" "}
                                  {approval.approvedByName}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {detail.snapshot && (
              <p className="wholesale-review-vat">
                VAT included: {wholesalePeso(detail.snapshot.vat)}
              </p>
            )}
          </section>
          {draft && (
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
                      <div className="field">
                        <label htmlFor={"wholesale-override-product"}>
                          Product *
                        </label>
                        <select
                          id={"wholesale-override-product"}
                          required
                          name="productId"
                        >
                          {order.lines.map((line) => (
                            <option value={line.productId} key={line.productId}>
                              {line.name}
                            </option>
                          ))}
                        </select>
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
                      <div className="field">
                        <label htmlFor={"wholesale-override-reason"}>
                          Request reason *
                        </label>
                        <input
                          id={"wholesale-override-reason"}
                          required
                          name="reason"
                          maxLength={500}
                        />
                      </div>
                      <button className="button soft" type="submit">
                        Request approval
                      </button>
                    </fieldset>
                  </form>
                </section>
                {current.map((request) => (
                  <section className="modal-section" key={request.id}>
                    <p>
                      {
                        order.lines.find(
                          (line) => line.productId === request.productId,
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
                          const form = new FormData(event.currentTarget);
                          mutate(
                            "/overrides/" + request.id + "/approve",
                            "POST",
                            { reason: form.get("reason") },
                          );
                        }}
                      >
                        <fieldset className="wholesale-fields" disabled={busy}>
                          <div className="field">
                            <label
                              htmlFor={
                                "wholesale-approval-reason-" + request.id
                              }
                            >
                              Approval reason *
                            </label>
                            <input
                              id={"wholesale-approval-reason-" + request.id}
                              name="reason"
                              maxLength={500}
                              required
                            />
                          </div>
                          <button className="button soft" type="submit">
                            Approve override
                          </button>
                        </fieldset>
                      </form>
                    ) : (
                      <p>Awaiting Admin approval.</p>
                    )}
                  </section>
                ))}
              </div>
            </details>
          )}
          {detail.reservations.length > 0 && (
            <section className="modal-section">
              <h3>Batch reservations</h3>
              <div className="table-scroll">
                <table className="data-table">
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
                    {detail.reservations.map((reservation) => (
                      <tr key={reservation.id}>
                        <td data-label="Product">{reservation.product}</td>
                        <td data-label="Batch">{reservation.batchNumber}</td>
                        <td data-label="Expiry">{reservation.expiry}</td>
                        <td data-label="Quantity">{reservation.quantity}</td>
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
            </section>
          )}
          {!draft && (
            <WholesaleDeliveryPanel
              order={order}
              detail={detail}
              busy={busy}
              mutate={mutate}
              viewReceipt={() => {
                if (viewReceipt && detail.receipt)
                  viewReceipt(detail.receipt.snapshot);
                else setShowReceipt(true);
              }}
            />
          )}
          {active && !action && (
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
          )}
          {action === "confirm" && (
            <section className="modal-section">
              <p>
                Confirm this order for {wholesalePeso(preview.toFixed(2))} and
                reserve all{" "}
                {order.lines.reduce((sum, line) => sum + line.quantity, 0)}{" "}
                units. Prices and client details will be saved. Physical stock
                stays unchanged.
              </p>
              <div className="wholesale-actions">
                <button
                  disabled={busy}
                  className="button soft"
                  onClick={() => setAction(null)}
                >
                  Back
                </button>
                <button
                  disabled={busy}
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
            </section>
          )}
          {action === "cancel" && (
            <form
              className="modal-section"
              onSubmit={(event) => {
                event.preventDefault();
                mutate("/orders/" + order.id + "/cancel", "POST", {
                  revision: order.revision,
                  reason: new FormData(event.currentTarget).get("reason"),
                });
              }}
            >
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
                <div className="wholesale-actions">
                  <button
                    type="button"
                    className="button soft"
                    onClick={() => setAction(null)}
                  >
                    Back
                  </button>
                  <button className="button dark" type="submit">
                    Confirm cancellation
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="inline-error">
          {error}
        </div>
      )}
      {retry && (
        <button className="button dark" onClick={retry}>
          Retry saved request
        </button>
      )}
    </>
  );
  return embedded ? (
    content
  ) : (
    <WholesaleDialog
      title="Wholesale order"
      busy={busy}
      close={close}
      review
      description={order.orderNumber + " \u00b7 " + order.clientName}
    >
      {content}
    </WholesaleDialog>
  );
}
