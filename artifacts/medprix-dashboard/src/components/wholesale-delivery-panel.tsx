import { useLayoutEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  pharmacyDate,
  calculateWholesaleSchedule,
  wholesaleReceiptTimeSchema,
} from "@workspace/api-zod";
import type { WholesaleOrder, WholesaleOrderDetail } from "@/lib/wholesale-api";
import {
  wholesalePeso,
  wholesaleManilaInput,
  wholesaleDateTime,
} from "@/lib/wholesale-api";
import { formatDisplayDate } from "@/lib/business-date";
import { WholesaleInstallmentScheduleView } from "./wholesale-installment-schedule";
import { useWholesaleDialogView } from "./wholesale-dialog";
import { ModalDataTable } from "./modal-data-table";
import { ModalTableFooter } from "./modal-table-layout";
import "@/styles/wholesale-workflow.css";

export function WholesaleDeliveryPanel({
  order,
  detail,
  busy,
  mutate,
  viewReceipt,
  initialAction,
  showTotal = true,
  onTaskChange,
}: {
  order: WholesaleOrder;
  detail: WholesaleOrderDetail;
  busy: boolean;
  mutate: (path: string, method: string, body: unknown) => void;
  viewReceipt: () => void;
  initialAction?: "dispatch" | "deliver" | "schedule";
  showTotal?: boolean;
  onTaskChange?: (active: boolean) => void;
}) {
  const formId = useId();
  const [action, setAction] = useState(initialAction ?? "");
  const [receiptTime, setReceiptTime] = useState(
    initialAction === "deliver" ? wholesaleManilaInput() : "",
  );
  const [validation, setValidation] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const active = detail.attempts.find((item) =>
    ["Scheduled", "InTransit"].includes(item.status),
  );
  const path = "/orders/" + order.id;
  const eligible = ["Confirmed", "Processing"].includes(order.status);
  const parsedTime = wholesaleReceiptTimeSchema.safeParse(
    (receiptTime.length === 16 ? receiptTime + ":00" : receiptTime) + "+08:00",
  );
  const schedule =
    action === "deliver" && parsedTime.success && order.paymentPlan
      ? calculateWholesaleSchedule({
          paymentPlan: order.paymentPlan,
          total: order.total,
          receivedAt: parsedTime.data,
        })
      : null;
  useLayoutEffect(() => {
    onTaskChange?.(Boolean(action));
  }, [action, onTaskChange]);
  useWholesaleDialogView(
    action
      ? {
          title:
            action === "schedule"
              ? "Schedule delivery"
              : action === "dispatch"
                ? "Dispatch delivery"
                : action === "deliver"
                  ? "Confirm client receipt"
                  : action === "fail"
                    ? "Record failed delivery"
                    : "Cancel delivery attempt",
          variant: action === "deliver" ? "compact-table" : "form",
          back: action === initialAction ? undefined : () => {
            setAction("");
            setValidation("");
          },
        }
      : null,
  );
  const submitLabel = !active
    ? "Schedule delivery"
    : action === "deliver"
      ? "Confirm receipt"
      : action === "dispatch"
        ? "Confirm dispatch"
        : action === "fail"
          ? "Record failed delivery"
          : "Cancel attempt";
  return (
    <div className="wholesale-details">
      {!action && (
        <dl className="wholesale-review-summary">
          <div>
            <dt>Status</dt>
            <dd>
              {detail.receipt
                ? "Delivered"
                : active?.status === "InTransit"
                  ? "In transit"
                  : active?.status === "Scheduled"
                    ? "Scheduled"
                    : "Needs scheduling"}
            </dd>
          </div>
          {showTotal && (
            <div>
              <dt>Order total</dt>
              <dd>
                <strong>{wholesalePeso(order.total)}</strong>
              </dd>
            </div>
          )}
          {active && (
            <div>
              <dt>Scheduled date</dt>
              <dd>{formatDisplayDate(active.date)}</dd>
            </div>
          )}
        </dl>
      )}
      {detail.receipt && (
        <>
          <WholesaleInstallmentScheduleView
            schedule={detail.receipt.snapshot.installmentSchedule}
            showTerms={showTotal}
          />
          <ModalTableFooter>
            <button
              className="button soft"
              disabled={busy}
              onClick={viewReceipt}
            >
              View receipt
            </button>
          </ModalTableFooter>
        </>
      )}
      {(action || showTotal) && (
        <>
          <section
            className="wholesale-context"
            aria-label="Delivery destination"
          >
            <strong>
              {detail.snapshot?.clientName ??
                detail.client?.name ??
                order.clientName}
            </strong>
            <p>
              {detail.snapshot?.address ??
                detail.client?.address ??
                "No delivery address"}
            </p>
            {action && active && (
              <p className="muted">
                {active.status === "InTransit" ? "In transit" : "Scheduled"} ·{" "}
                {formatDisplayDate(active.date)}
              </p>
            )}
            {active?.notes && (
              <p>
                <span className="field-label">Delivery instructions: </span>
                {active.notes}
              </p>
            )}
          </section>
          <details className="wholesale-review-overrides">
            <summary>
              <span>
                Items (
                {order.lines.reduce((sum, line) => sum + line.quantity, 0)}{" "}
                units)
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className="wholesale-details">
              <ModalDataTable className="data-table wholesale-task-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={line.productId}>
                      <td data-label="Product">{line.name}</td>
                      <td data-label="Quantity">{line.quantity} units</td>
                    </tr>
                  ))}
                </tbody>
              </ModalDataTable>
            </div>
          </details>
        </>
      )}
      {eligible && action && (
        <>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              const form = new FormData(event.currentTarget);
              if (!active) {
                mutate(path + "/schedule", "POST", {
                  revision: order.revision,
                  date: form.get("date"),
                  notes: form.get("notes"),
                });
              } else if (action === "deliver") {
                if (!parsedTime.success) {
                  setValidation(
                    "Enter the actual receipt date and time in Manila.",
                  );
                  return;
                }
                mutate(path + "/deliver", "POST", {
                  revision: order.revision,
                  scheduleId: active.id,
                  receivedBy: form.get("receivedBy"),
                  receivedAt: new Date(parsedTime.data).toISOString(),
                  receivedInFull: form.get("receivedInFull") === "on",
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
              {!active ? (
                <>
                  <div className="field">
                    <label htmlFor={formId + "-date"}>Scheduled date *</label>
                    <input
                      id={formId + "-date"}
                      name="date"
                      type="date"
                      min={pharmacyDate()}
                      defaultValue={pharmacyDate()}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={formId + "-notes"}>Notes</label>
                    <textarea
                      id={formId + "-notes"}
                      name="notes"
                      maxLength={500}
                    />
                  </div>
                </>
              ) : action === "deliver" ? (
                <>
                  <div className="wholesale-delivery-fields">
                    <div className="field">
                      <label htmlFor={formId + "-recipient"}>
                        Received by *
                      </label>
                      <input
                        id={formId + "-recipient"}
                        name="receivedBy"
                        maxLength={255}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={formId + "-received"}>
                        Received at (Manila) *
                      </label>
                      <input
                        id={formId + "-received"}
                        name="receivedAt"
                        type="datetime-local"
                        step="0.001"
                        min={
                          active.dispatchedAt
                            ? wholesaleManilaInput(
                                new Date(active.dispatchedAt),
                              )
                            : undefined
                        }
                        max={wholesaleManilaInput()}
                        value={receiptTime}
                        onChange={(event) => {
                          setReceiptTime(event.target.value);
                          setValidation("");
                        }}
                        required
                      />
                    </div>
                  </div>
                  {validation && (
                    <p className="inline-error" role="alert">
                      {validation}
                    </p>
                  )}
                  <label className="wholesale-check">
                    <input name="receivedInFull" type="checkbox" required />
                    All{" "}
                    {order.lines.reduce(
                      (sum, line) => sum + line.quantity,
                      0,
                    )}{" "}
                    units were received by the client.
                  </label>
                  {schedule && (
                    <WholesaleInstallmentScheduleView
                      schedule={schedule}
                      preview
                    />
                  )}
                  <p className="field-hint">
                    Confirming receipt posts the sale and starts the payment
                    schedule. The receipt cannot be edited.
                  </p>
                </>
              ) : action === "dispatch" ? (
                <p>
                  Confirm the goods have left for delivery. Stock stays reserved
                  until client receipt is confirmed.
                </p>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor={formId + "-reason"}>Reason *</label>
                    <input
                      id={formId + "-reason"}
                      name="reason"
                      maxLength={500}
                      required
                    />
                  </div>
                  {action === "fail" && (
                    <label className="wholesale-check">
                      <input name="returned" type="checkbox" required />
                      All dispatched goods returned to custody.
                    </label>
                  )}
                </>
              )}
            </fieldset>
          </form>
          <ModalTableFooter>
            <button
              className="button dark"
              type="submit"
              form={formId}
              disabled={busy}
            >
              {submitLabel}
            </button>
          </ModalTableFooter>
        </>
      )}
      {eligible && !active && !action && (
        <ModalTableFooter>
          <button
            className="button dark"
            disabled={busy}
            onClick={() => setAction("schedule")}
          >
            Schedule delivery
          </button>
        </ModalTableFooter>
      )}
      {eligible && active && !action && (
        <ModalTableFooter>
          <button
            className="button soft"
            disabled={busy}
            onClick={() =>
              setAction(active.status === "Scheduled" ? "cancel" : "fail")
            }
          >
            {active.status === "Scheduled"
              ? "Cancel attempt"
              : "Record failed delivery"}
          </button>
          <button
            className="button dark"
            disabled={busy}
            onClick={() => {
              setAction(active.status === "Scheduled" ? "dispatch" : "deliver");
              setReceiptTime(wholesaleManilaInput());
              setValidation("");
            }}
          >
            {active.status === "Scheduled"
              ? "Dispatch delivery"
              : "Confirm client receipt"}
          </button>
        </ModalTableFooter>
      )}
      {!!detail.attempts.length && (
        <details
          className="wholesale-review-overrides"
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary>
            <span>Delivery history ({detail.attempts.length})</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          {historyOpen && (
            <div className="wholesale-details">
              <ModalDataTable className="data-table wholesale-task-table">
                <thead>
                  <tr>
                    <th>Scheduled date</th>
                    <th>Dispatched</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.attempts.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Scheduled date">
                        {formatDisplayDate(item.date)}
                      </td>
                      <td data-label="Dispatched">
                        {item.dispatchedAt
                          ? wholesaleDateTime(item.dispatchedAt)
                          : "—"}
                      </td>
                      <td data-label="Status">
                        {item.status === "InTransit"
                          ? "In transit"
                          : item.status === "Completed"
                            ? "Delivered"
                            : item.status}
                      </td>
                      <td data-label="Notes">{item.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </ModalDataTable>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
