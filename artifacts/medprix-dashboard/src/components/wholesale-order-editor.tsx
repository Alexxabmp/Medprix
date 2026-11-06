import { useState } from "react";
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
  const [clientId, setClientId] = useState(order?.clientId ?? "");
  const [lines, setLines] = useState<WholesaleLine[]>(
    order?.lines.map(({ productId, quantity }) => ({
      productId,
      quantity,
    })) ?? [{ productId: "", quantity: 1 }],
  );
  const incomplete =
    !clientId ||
    lines.some(
      (line) =>
        !line.productId ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        products.find((product) => product.id === line.productId)
          ?.wholesalePrice == null,
    );
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
  }
  return (
    <WholesaleDialog
      title={order ? "Edit " + order.orderNumber : "New wholesale draft"}
      busy={busy}
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save({ clientId, lines });
        }}
      >
        <fieldset disabled={busy} className="wholesale-fields">
          <label className="field">
            Client
            <select
              required
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">
            Prices include VAT where applicable. Saving a draft does not reserve
            stock.
          </p>
          {unclassified && (
            <p role="status" className="field-hint">
              Some products need VAT classification before order confirmation
              becomes available.
            </p>
          )}
          {lines.map((line, index) => {
            const product = products.find((item) => item.id === line.productId);
            return (
              <div className="wholesale-line" key={index}>
                <label className="field">
                  Product
                  <select
                    required
                    value={line.productId}
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
                          {item.name} · {item.sku}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    required
                    value={line.quantity}
                    onChange={(event) =>
                      update(index, { quantity: Number(event.target.value) })
                    }
                  />
                </label>
                <div className="field">
                  Unit price
                  <strong>
                    {wholesalePeso(product?.wholesalePrice ?? null)}
                  </strong>
                </div>
                <button
                  type="button"
                  className="button soft"
                  aria-label={"Remove line " + (index + 1)}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
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
            Unconfigured prices must be set by Admin. Saving uses current
            wholesale prices for all lines.
          </p>
          <div className="wholesale-actions">
            <button type="submit" className="button dark" disabled={incomplete}>
              {busy ? "Saving…" : "Save draft"}
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
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
