import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { WholesaleDialog } from "./wholesale-dialog";
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
  error,
  close,
  save,
  retry,
}: {
  order: WholesaleOrder | null;
  clients: WholesaleClient[];
  products: WholesaleProduct[];
  busy: boolean;
  error: string;
  retry?: () => void;
  close: () => void;
  save: (draft: { clientId: string; lines: WholesaleLine[] }) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = useState(order?.clientId ?? "");
  const [lines, setLines] = useState<WholesaleLine[]>(
    order?.lines.map(({ productId, quantity }) => ({
      productId,
      quantity,
    })) ?? [{ productId: "", quantity: 1 }],
  );
  const [attempted, setAttempted] = useState(false);
  const invalidQuantity = (quantity: number) =>
    !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000;
  const missingPrice = (line: WholesaleLine) =>
    Boolean(line.productId) &&
    products.find((product) => product.id === line.productId)?.wholesalePrice ==
      null;
  const validationError = !clientId
    ? "Select a client before saving the draft."
    : lines.some((line) => !line.productId)
      ? "Select a product for every line."
      : lines.some((line) => invalidQuantity(line.quantity))
        ? "Enter a whole quantity from 1 to 1,000,000 for every line."
        : lines.some(missingPrice)
          ? "This draft cannot be saved until Admin configures a wholesale unit price for each selected product."
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
      description="Prices include VAT where applicable. Fields marked * are required."
      busy={busy}
      close={close}
    >
      <form
        ref={form}
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
          save({ clientId, lines });
        }}
      >
        <fieldset disabled={busy} className="wholesale-fields">
          <div className="field">
            <label htmlFor="wholesale-draft-client">Client *</label>
            <select
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
            </select>
          </div>
          <p className="field-hint">Saving a draft does not reserve stock.</p>
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
              <div className="wholesale-line" key={index}>
                <div className="field">
                  <label htmlFor={"wholesale-draft-product-" + index}>
                    Product *
                  </label>
                  <select
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
                  </select>
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
                    {wholesalePeso(product?.wholesalePrice ?? null)}
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
            className="button soft"
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
          <p className="field-hint">
            Wholesale unit prices are maintained by Admin.
          </p>
          {attempted && validationError && (
            <div className="inline-error" role="alert">
              {validationError}
            </div>
          )}
          <div className="wholesale-actions">
            <button type="submit" className="button dark">
              {busy ? "Saving…" : "Save draft"}
            </button>
          </div>
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
