import { SelectField } from "./custom-ui/select-field";
import { useId, useRef, useState } from "react";
import type { WholesalePaymentPlan } from "@workspace/api-zod";
import { Plus, Trash2 } from "lucide-react";
import { WholesaleDialog } from "./wholesale-dialog";
import { wholesaleDraftPreview } from "@/lib/wholesale-draft-preview";
import "@/styles/wholesale-workflow.css";
import {
  wholesalePeso,
  type WholesaleClient,
  type WholesaleProduct,
  type WholesaleOrder,
  type WholesaleLine,
} from "@/lib/wholesale-api";

export function WholesaleOrderEditor({
  order,
  clients,
  products,
  busy,
  submitting = busy,
  error,
  close,
  save,
  retry,
}: {
  order: WholesaleOrder | null;
  clients: WholesaleClient[];
  products: WholesaleProduct[];
  busy: boolean;
  submitting?: boolean;
  error: string;
  retry?: () => void;
  close: () => void;
  save: (draft: {
    clientId: string;
    paymentPlan: WholesalePaymentPlan;
    lines: WholesaleLine[];
  }) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const formId = useId();
  const [clientId, setClientId] = useState(order?.clientId ?? "");
  const [paymentPlan, setPaymentPlan] = useState<WholesalePaymentPlan | "">(
    order?.paymentPlan ?? "",
  );
  const [lines, setLines] = useState<WholesaleLine[]>(
    order?.lines.map(({ productId, quantity }) => ({
      productId,
      quantity,
    })) ?? [{ productId: "", quantity: 1 }],
  );
  const [attempted, setAttempted] = useState(false);
  const preview = wholesaleDraftPreview(products, lines, paymentPlan);
  const invalidQuantity = (quantity: number) =>
    !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000;
  const missingPrice = (line: WholesaleLine) =>
    Boolean(line.productId) &&
    products.find((product) => product.id === line.productId)?.wholesalePrice ==
      null;
  const validationError = !clientId
    ? "Select a client before saving the draft."
    : !paymentPlan
      ? "Choose Net-30 or Net-60 before saving the draft."
      : lines.some((line) => !line.productId)
        ? "Select a product for every line."
        : lines.some((line) => invalidQuantity(line.quantity))
          ? "Enter a whole quantity from 1 to 1,000,000 for every line."
          : lines.some(missingPrice)
            ? "This draft cannot be saved until Admin configures a wholesale unit price for each selected product."
            : preview.overflow
              ? "The order total exceeds the supported amount."
              : "";
  const unclassified = lines.some(
    (line) =>
      products.find((product) => product.id === line.productId)?.isVatExempt ===
      null,
  );
  function update(index: number, patch: Partial<WholesaleLine>) {
    setLines((current) =>
      current.map((line, position) =>
        position === index ? { ...line, ...patch } : line,
      ),
    );
    setAttempted(false);
  }
  return (
    <WholesaleDialog
      title={order ? "Edit " + order.orderNumber : "New wholesale draft"}
      busy={submitting}
      close={close}
      footer={
        <>
          <button
            className="button dark"
            type="submit"
            form={formId}
            disabled={busy}
          >
            {submitting ? "Saving…" : "Save draft and review"}
          </button>
        </>
      }
    >
      <form
        ref={form}
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setAttempted(true);
          if (validationError) {
            requestAnimationFrame(() =>
              form.current
                ?.querySelector<HTMLElement>('[aria-invalid="true"]')
                ?.focus(),
            );
            return;
          }
          if (paymentPlan) save({ clientId, paymentPlan, lines });
        }}
      >
        <fieldset disabled={busy} className="wholesale-fields">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="wholesale-draft-client">Client *</label>
              <SelectField
                searchable
                pickerLabel="Client"
                id="wholesale-draft-client"
                required
                value={clientId}
                aria-invalid={attempted && !clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setAttempted(false);
                }}
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="field">
              <label htmlFor="wholesale-draft-plan">Payment plan *</label>
              <SelectField
                id="wholesale-draft-plan"
                required
                value={paymentPlan}
                aria-invalid={attempted && !paymentPlan}
                onChange={(event) => {
                  setPaymentPlan(
                    event.target.value as WholesalePaymentPlan | "",
                  );
                  setAttempted(false);
                }}
              >
                <option value="">Select payment plan</option>
                <option value="Net30">Net-30 — 4 weekly installments</option>
                <option value="Net60">Net-60 — 8 weekly installments</option>
              </SelectField>
            </div>
          </div>
          {clientId && (
            <section
              className="wholesale-context"
              aria-label="Delivery destination"
            >
              <span className="field-label">Delivery address</span>
              <p>
                {clients.find((client) => client.id === clientId)?.address ||
                  "No delivery address. Add one before confirming this order."}
              </p>
            </section>
          )}
          {order && (
            <div className="inline-error" role="note">
              Saving changes uses current wholesale prices. Any existing price
              override must be approved again.
            </div>
          )}
          {unclassified && (
            <p role="status" className="field-hint">
              Some products need VAT classification before order confirmation
              becomes available.
            </p>
          )}
          {lines.map((line, index) => {
            const product = products.find((item) => item.id === line.productId);
            const priceMissing = missingPrice(line);
            return (
              <div className="wholesale-line wholesale-draft-line" key={index}>
                <div className="field">
                  <label htmlFor={"wholesale-draft-product-" + index}>
                    Product *
                  </label>
                  <SelectField
                    searchable
                    pickerLabel={`Product line ${index + 1}`}
                    id={"wholesale-draft-product-" + index}
                    required
                    value={line.productId}
                    aria-invalid={
                      priceMissing || (attempted && !line.productId)
                    }
                    aria-describedby={
                      priceMissing
                        ? "wholesale-price-error-" + index
                        : undefined
                    }
                    onChange={(event) =>
                      update(index, { productId: event.target.value })
                    }
                  >
                    <option value="">Select product</option>
                    {products
                      .filter(
                        (item) =>
                          item.id === line.productId ||
                          !lines.some((other) => other.productId === item.id),
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.sku} · {item.availableStock}{" "}
                          available
                        </option>
                      ))}
                  </SelectField>
                </div>
                <div className="field">
                  <label htmlFor={"wholesale-draft-quantity-" + index}>
                    Quantity *
                  </label>
                  <input
                    id={"wholesale-draft-quantity-" + index}
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    required
                    value={line.quantity}
                    aria-invalid={attempted && invalidQuantity(line.quantity)}
                    onChange={(event) =>
                      update(index, { quantity: Number(event.target.value) })
                    }
                  />
                </div>
                <div className="field">
                  <span className="field-label">Unit price</span>
                  <strong>
                    {product ? wholesalePeso(product.wholesalePrice) : "—"}
                  </strong>
                </div>
                <div className="field">
                  <span className="field-label">Line total</span>
                  <strong>
                    {preview.lineTotals[index] === null
                      ? "—"
                      : wholesalePeso(preview.lineTotals[index])}
                  </strong>
                </div>
                <button
                  type="button"
                  className="button soft"
                  aria-label={"Remove line " + (index + 1)}
                  disabled={lines.length === 1}
                  onClick={() => {
                    setLines((current) =>
                      current.filter((_, position) => position !== index),
                    );
                    setAttempted(false);
                  }}
                >
                  <Trash2 size={15} />
                </button>
                {priceMissing && (
                  <span
                    id={"wholesale-price-error-" + index}
                    className="field-error wholesale-line-error"
                    role="alert"
                  >
                    No wholesale unit price is configured for{" "}
                    {product?.name ?? "this product"}. Ask Admin to set one
                    before saving.
                  </span>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="button soft w-fit"
            disabled={lines.length >= 100}
            onClick={() =>
              setLines((current) => [
                ...current,
                { productId: "", quantity: 1 },
              ])
            }
          >
            <Plus size={15} /> Add line
          </button>
          <dl
            className="delivery-receipt-totals"
            aria-label="Draft total"
            aria-live="polite"
          >
            <div>
              <dt>Total (incl. VAT)</dt>
              <dd>
                <strong>
                  {preview.total === null ? "—" : wholesalePeso(preview.total)}
                </strong>
              </dd>
            </div>
          </dl>
          {paymentPlan && (
            <p className="field-hint">
              {paymentPlan === "Net60" ? "8" : "4"} weekly installments from
              client receipt. Final settlement within{" "}
              {paymentPlan === "Net60" ? "60" : "30"} days. No interest or
              penalties.
            </p>
          )}
          {attempted && validationError && (
            <div className="inline-error" role="alert">
              {validationError}
            </div>
          )}
        </fieldset>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        {retry && (
          <button type="button" className="button dark" onClick={retry}>
            Retry saved request
          </button>
        )}
      </form>
    </WholesaleDialog>
  );
}
