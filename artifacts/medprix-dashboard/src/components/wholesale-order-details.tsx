import { LoadingState } from "@/components/custom-ui/loading-state";
import { useEffect, useState } from "react";
import { WholesaleDialog } from "./wholesale-dialog";
import {
  wholesaleGet,
  wholesalePeso,
  type WholesaleOrder,
  type WholesaleOrderDetail,
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
}: {
  order: WholesaleOrder;
  role: string;
  busy: boolean;
  error: string;
  retry?: () => void;
  close: () => void;
  mutate: (path: string, method: string, body: unknown) => void;
}) {
  const [detail, setDetail] = useState<WholesaleOrderDetail | null>(null);
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
    void load();
  }, [order.id]);
  const draft = order.status === "Pending";
  const active = draft || order.status === "Confirmed";
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
  return (
    <WholesaleDialog
      title={order.orderNumber + " · " + (draft ? "Draft" : order.status)}
      busy={busy}
      close={close}
      review
      description="Review prices, approvals and stock reservations."
    >
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
          <p>
            <strong>{detail.snapshot?.clientName ?? order.clientName}</strong>
          </p>
          {detail.snapshot && <p>{detail.snapshot.address}</p>}
          <div className="wholesale-fields">
            {displayLines.map((line) => {
              const approvals = current.filter(
                (item) => item.productId === line.productId && item.approvedBy,
              );
              return (
                <div
                  className="surface-card wholesale-notice"
                  key={line.productId}
                >
                  <strong>{line.name}</strong>
                  <p>
                    {line.quantity} units × {wholesalePeso(line.unitPrice)}
                  </p>
                  {draft && (
                    <div className="field">
                      <label
                        htmlFor={"wholesale-price-approval-" + line.productId}
                      >
                        Price approval
                      </label>
                      <select
                        id={"wholesale-price-approval-" + line.productId}
                        disabled={busy}
                        value={selected[line.productId] ?? ""}
                        onChange={(event) =>
                          setSelected((value) => ({
                            ...value,
                            [line.productId]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Use saved wholesale price</option>
                        {approvals.map((approval) => (
                          <option key={approval.id} value={approval.id}>
                            {wholesalePeso(approval.price)} ·{" "}
                            {approval.approvedByName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {line.override && (
                    <p className="field-hint">
                      Original: {wholesalePeso(line.originalPrice)} · Approved
                      by {line.override.adminId} · {line.override.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p>
            <strong>
              {draft ? "Confirmation total" : "Agreed total"}:{" "}
              {wholesalePeso(draft ? preview.toFixed(2) : order.total)}
            </strong>
          </p>
          {detail.snapshot && (
            <p>Included VAT: {wholesalePeso(detail.snapshot.vat)}</p>
          )}
          {draft && (
            <>
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
                            htmlFor={"wholesale-approval-reason-" + request.id}
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
            </>
          )}
          {detail.reservations.length > 0 && (
            <section className="modal-section">
              <h3>Batch reservations</h3>
              {detail.reservations.map((reservation) => (
                <div className="wholesale-reservation" key={reservation.id}>
                  <strong>{reservation.product}</strong>
                  <span>
                    {reservation.batchNumber} · expires {reservation.expiry} ·{" "}
                    {reservation.quantity} units
                  </span>
                  <span>
                    {reservation.releasedAt
                      ? "Released"
                      : reservation.consumedAt
                        ? "Delivered"
                        : "Reserved"}
                  </span>
                </div>
              ))}
            </section>
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
    </WholesaleDialog>
  );
}
