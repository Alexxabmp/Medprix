import { safeError } from "./feedback";

export type CheckoutPayload = {
  dateTime: string;
  payment: "Cash" | "GCash" | "Card";
  discountType: "None" | "Senior" | "PWD";
  total: string;
  amountReceived: string;
  items: {
    productId: string;
    product: string;
    sku?: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }[];
  [key: string]: unknown;
};
export type PendingCheckout = { payload: CheckoutPayload; requestKey: string };
export class CheckoutRejectedError extends Error {}
export class CheckoutUncertainError extends Error {}
const storageKey = "medprix_pending_checkout_v2";

export function createCheckoutSubmitter(
  send: typeof fetch = fetch,
  newKey = () => crypto.randomUUID(),
  storage:
    | Pick<Storage, "getItem" | "setItem" | "removeItem">
    | undefined = typeof sessionStorage === "undefined"
    ? undefined
    : sessionStorage,
) {
  let pending: PendingCheckout | undefined;
  const stored = storage?.getItem(storageKey);
  if (stored) {
    try {
      pending = JSON.parse(stored);
      if (!pending?.requestKey || !Array.isArray(pending.payload?.items))
        throw new Error();
    } catch {
      throw new CheckoutUncertainError(
        "The pending checkout reference could not be read. Ask an administrator to check payment records before another sale.",
      );
    }
  }
  let busy = false;
  function clear() {
    pending = undefined;
    try {
      storage?.removeItem(storageKey);
    } catch {
      /* Reconciliation of a retained reference is safe. */
    }
  }
  function confirm(data: any) {
    if (
      !Number.isSafeInteger(data?.id) ||
      data.id <= 0 ||
      !data.transactionNumber ||
      !Array.isArray(data.items) ||
      data.stockCommitted !== true
    )
      throw new CheckoutUncertainError(
        "Checkout confirmation was incomplete. Check its result before another sale.",
      );
    clear();
    return data;
  }
  async function submit(payload: CheckoutPayload) {
    if (busy)
      throw new CheckoutUncertainError("Checkout is already being saved.");
    if (pending && JSON.stringify(pending.payload) !== JSON.stringify(payload))
      throw new CheckoutUncertainError(
        "A checkout is still awaiting confirmation. Check its result before changing the sale.",
      );
    if (!pending) {
      const next = { payload, requestKey: newKey() };
      try {
        if (!storage) throw new Error();
        storage.setItem(storageKey, JSON.stringify(next));
      } catch {
        throw new CheckoutRejectedError(
          "Checkout could not start because its request reference cannot be retained. Enable session storage and try again.",
        );
      }
      pending = next;
    }
    busy = true;
    try {
      const response = await send("/api/pos/checkouts", {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pending.payload,
          requestKey: pending.requestKey,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (
          [400, 401, 403, 404, 409, 422].includes(response.status) &&
          typeof data?.error === "string"
        ) {
          clear();
          throw new CheckoutRejectedError(
            safeError(
              { status: response.status, data },
              "Checkout was rejected. Review the cart before paying.",
            ),
          );
        }
        throw new CheckoutUncertainError(
          "Checkout could not be confirmed. Check its result before trying again.",
        );
      }
      return confirm(data);
    } catch (error) {
      if (
        error instanceof CheckoutRejectedError ||
        error instanceof CheckoutUncertainError
      )
        throw error;
      throw new CheckoutUncertainError(
        "Checkout could not be confirmed. Your cart and request reference are retained. Check the result before another sale.",
      );
    } finally {
      busy = false;
    }
  }
  return Object.assign(submit, {
    getPending: () => pending,
    retry: () => {
      if (!pending)
        throw new CheckoutRejectedError(
          "There is no pending checkout to retry.",
        );
      return submit(pending.payload);
    },
    async reconcile() {
      if (!pending || busy) return null;
      busy = true;
      try {
        const response = await send(
          `/api/pos/checkouts/${pending.requestKey}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok)
          throw new CheckoutUncertainError(
            safeError(
              { status: response.status, data },
              "Could not check this checkout. Keep its reference and check again.",
            ),
          );
        if (data?.state === "not_found") return null;
        if (data?.state !== "committed")
          throw new CheckoutUncertainError(
            "The checkout result was incomplete. Please check again.",
          );
        return confirm(data.transaction);
      } finally {
        busy = false;
      }
    },
  });
}
