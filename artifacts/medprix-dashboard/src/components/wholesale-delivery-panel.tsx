import { useState } from "react";
import { pharmacyDate } from "@workspace/api-zod";
import type { WholesaleOrder, WholesaleOrderDetail } from "@/lib/wholesale-api";
import { wholesalePeso } from "@/lib/wholesale-api";

export function WholesaleDeliveryPanel({
  order,
  detail,
  busy,
  mutate,
  viewReceipt,
}: {
  viewReceipt: () => void;
  order: WholesaleOrder;
  detail: WholesaleOrderDetail;
  busy: boolean;
  mutate: (path: string, method: string, body: unknown) => void;
}) {
  const [action, setAction] = useState("");
  const active = detail.attempts.find((item) =>
    ["Scheduled", "InTransit"].includes(item.status),
  );
  const path = "/orders/" + order.id;
  const eligible = ["Confirmed", "Processing"].includes(order.status);
  return (
    <section className="modal-section wholesale-details">
      <h3>Delivery</h3>
      {detail.attempts.length === 0 && (
        <p className="field-hint">No delivery attempts scheduled.</p>
      )}
      {detail.attempts.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Scheduled date</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {detail.attempts.map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td>
                    <span className="pill neutral">
                      {item.status === "InTransit" ? "In transit" : item.status}
                    </span>
                  </td>
                  <td>{item.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail.receipt && (
        <>
          <p>
            Delivered in full. The receivable was created for{" "}
            {wholesalePeso(detail.receipt.snapshot.total)}.
          </p>
          <button className="button soft" disabled={busy} onClick={viewReceipt}>
            View delivery receipt
          </button>
        </>
      )}
      {eligible && !active && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            mutate(path + "/schedule", "POST", {
              revision: order.revision,
              date: form.get("date"),
              notes: form.get("notes"),
            });
          }}
        >
          <fieldset className="wholesale-fields" disabled={busy}>
            <div className="field">
              <label htmlFor="wholesale-delivery-date">Scheduled date *</label>
              <input
                id="wholesale-delivery-date"
                name="date"
                type="date"
                min={pharmacyDate()}
                required
                defaultValue={pharmacyDate()}
              />
            </div>
            <div className="field">
              <label htmlFor="wholesale-delivery-notes">Delivery notes</label>
              <textarea
                id="wholesale-delivery-notes"
                name="notes"
                maxLength={500}
              />
            </div>
            <button className="button dark w-fit" type="submit">
              Schedule delivery
            </button>
          </fieldset>
        </form>
      )}
      {eligible && active && !action && (
        <div className="wholesale-actions">
          {active.status === "Scheduled" ? (
            <>
              <button
                className="button soft"
                disabled={busy}
                onClick={() => setAction("cancel")}
              >
                Cancel delivery attempt
              </button>
              <button
                className="button dark"
                disabled={busy}
                onClick={() => setAction("dispatch")}
              >
                Review dispatch
              </button>
            </>
          ) : (
            <>
              <button
                className="button soft"
                disabled={busy}
                onClick={() => setAction("fail")}
              >
                Record failed delivery
              </button>
              <button
                className="button dark"
                disabled={busy}
                onClick={() => setAction("deliver")}
              >
                Review full delivery
              </button>
            </>
          )}
        </div>
      )}
      {eligible && active && action && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (action === "deliver") {
              mutate(path + "/deliver", "POST", {
                revision: order.revision,
                scheduleId: active.id,
                receivedBy: form.get("receivedBy"),
                dueDate: form.get("dueDate"),
              });
            } else {
              mutate(path + "/delivery-status", "POST", {
                revision: order.revision,
                scheduleId: active.id,
                status:
                  action === "dispatch"
                    ? "InTransit"
                    : action === "fail"
                      ? "Failed"
                      : "Cancelled",
                ...(action === "dispatch"
                  ? {}
                  : {
                      reason: form.get("reason"),
                      returned: form.get("returned") === "on",
                    }),
              });
            }
          }}
        >
          <fieldset className="wholesale-fields" disabled={busy}>
            {action === "deliver" ? (
              <>
                <p>
                  Confirm receipt of all{" "}
                  {order.lines.reduce((sum, line) => sum + line.quantity, 0)}{" "}
                  units for {wholesalePeso(order.total)}. This records the sale,
                  deducts physical stock and creates the full receivable. This
                  delivery cannot be edited or cancelled.
                </p>
                <div className="field">
                  <label htmlFor="wholesale-delivery-recipient">
                    Received by *
                  </label>
                  <input
                    id="wholesale-delivery-recipient"
                    name="receivedBy"
                    maxLength={255}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="wholesale-delivery-due">
                    Payment due date *
                  </label>
                  <input
                    id="wholesale-delivery-due"
                    name="dueDate"
                    type="date"
                    min={pharmacyDate()}
                    required
                  />
                </div>
                <label className="wholesale-check">
                  <input type="checkbox" required /> I confirm the entire order
                  was received.
                </label>
              </>
            ) : action === "dispatch" ? (
              <p>
                Mark this order in transit. All goods stay reserved until full
                delivery is confirmed or a failed attempt returns to custody.
              </p>
            ) : (
              <>
                <p>
                  {action === "fail"
                    ? "Reservations remain protected. Confirm all goods returned before closing this attempt."
                    : "Cancel this scheduled attempt. The order and its reservations remain active."}
                </p>
                <div className="field">
                  <label htmlFor="wholesale-delivery-reason">Reason *</label>
                  <input
                    id="wholesale-delivery-reason"
                    name="reason"
                    required
                    maxLength={500}
                  />
                </div>
                {action === "fail" && (
                  <label className="wholesale-check">
                    <input name="returned" type="checkbox" required /> All
                    dispatched goods returned to custody.
                  </label>
                )}
              </>
            )}
            <div className="wholesale-actions">
              <button
                className="button soft"
                type="button"
                onClick={() => setAction("")}
              >
                Back
              </button>
              <button className="button dark" type="submit">
                {action === "deliver"
                  ? "Confirm full delivery"
                  : action === "dispatch"
                    ? "Confirm dispatch"
                    : action === "fail"
                      ? "Confirm failed delivery"
                      : "Confirm attempt cancellation"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
