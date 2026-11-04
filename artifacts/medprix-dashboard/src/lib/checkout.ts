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
    isVatExempt?: boolean;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }[];
  [key: string]: unknown;
};
export type PendingCheckout = {
  payload: CheckoutPayload;
  requestKey: string;
  ownerId?: string;
};
export class CheckoutRejectedError extends Error {}
export class CheckoutUncertainError extends Error {}
const storageKey = "medprix_pending_checkout_v2";

function checkoutStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function createCheckoutSubmitter(
  send: typeof fetch = fetch,
  newKey = () => crypto.randomUUID(),
  storage:
    | Pick<Storage, "getItem" | "setItem" | "removeItem">
    | undefined = checkoutStorage(),
) {
  let ownerId: string | undefined,
    activeStorageKey = storageKey,
    pending: PendingCheckout | undefined,
    busy = false;
  let initializing: Promise<void> | undefined;
  function parse(raw: string | null | undefined) {
    if (!raw) return undefined;
    try {
      const value = JSON.parse(raw);
      if (
        typeof value?.requestKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value.requestKey,
        ) ||
        !Array.isArray(value.payload?.items) ||
        !value.payload.items.length ||
        value.payload.items.length > 200 ||
        typeof value.payload.total !== "string" ||
        typeof value.payload.amountReceived !== "string" ||
        value.payload.items.some(
          (item: any) =>
            typeof item?.productId !== "string" ||
            typeof item.unitPrice !== "string" ||
            !Number.isFinite(Number(item.unitPrice.replace(/[^0-9.]/g, ""))) ||
            !Number.isSafeInteger(item.quantity) ||
            item.quantity < 1,
        )
      )
        throw Error();
      return value as PendingCheckout;
    } catch {
      throw new CheckoutUncertainError(
        "The pending checkout reference could not be read. Ask an administrator to review payment records.",
      );
    }
  }
  async function actor() {
    const response = await send("/api/me", {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const user = await response.json().catch(() => null);
    if (
      !response.ok ||
      !user?.id ||
      !["Admin", "Cashier"].includes(user.role) ||
      (ownerId && ownerId !== user.id)
    )
      throw new CheckoutUncertainError(
        "The checkout account changed or no longer has access. Sign in to the original account before checking this payment.",
      );
    return String(user.id);
  }
  async function initialize() {
    if (!initializing)
      initializing = (async () => {
        ownerId = await actor();
        activeStorageKey = "medprix_pending_checkout_v3:" + ownerId;
        // Old unscoped records are retained for reconciliation, never auto-upgraded.
        pending =
          parse(storage?.getItem(activeStorageKey)) ??
          parse(storage?.getItem(storageKey));
        if (pending?.ownerId && pending.ownerId !== ownerId)
          pending = undefined;
      })().catch((error) => {
        initializing = undefined;
        throw error;
      });
    await initializing;
  }
  function clear() {
    try {
      storage?.removeItem(activeStorageKey);
      if (pending?.payload.contractVersion !== 3)
        storage?.removeItem(storageKey);
    } catch {
      /* A retained reference remains safely replayable. */
    }
    pending = undefined;
  }
  function confirm(data: any) {
    const canonical =
      typeof data?.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(data.id) &&
      data.id === pending?.requestKey;
    const legacy =
      Number.isSafeInteger(data?.id) &&
      data.id > 0 &&
      pending?.payload.contractVersion !== 3;
    if (
      !(canonical || legacy) ||
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
    busy = true;
    try {
      await initialize();
      await actor();
      const nextPayload =
        pending && pending.payload.contractVersion !== 3
          ? payload
          : { ...payload, contractVersion: 3 };
      if (
        pending &&
        JSON.stringify(pending.payload) !== JSON.stringify(nextPayload)
      )
        throw new CheckoutUncertainError(
          "A checkout is awaiting confirmation. Check its result before changing the sale.",
        );
      if (!pending) {
        const next = {
          payload: structuredClone(nextPayload),
          requestKey: newKey(),
          ownerId,
        };
        try {
          if (!storage) throw Error();
          storage.setItem(activeStorageKey, JSON.stringify(next));
        } catch {
          throw new CheckoutRejectedError(
            "Checkout cannot start without retaining its request reference. Enable session storage and try again.",
          );
        }
        pending = next;
      }
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
          ["reference_conflict", "client_version"].includes(data?.code) ||
          [401, 403].includes(response.status)
        )
          throw new CheckoutUncertainError(
            data?.error || "Check the payment using its original account.",
          );
        if (
          [400, 404, 409, 422].includes(response.status) &&
          typeof data?.error === "string"
        ) {
          clear();
          throw new CheckoutRejectedError(
            safeError(
              { status: response.status, data },
              "Checkout was rejected. Review the cart.",
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
        "Checkout could not be confirmed. Your cart and reference are retained. Check the result before another sale.",
      );
    } finally {
      busy = false;
    }
  }
  return Object.assign(submit, {
    initialize: async () => {
      await initialize();
      return pending;
    },
    getPending: () => pending,
    retry: () => {
      if (!pending)
        throw new CheckoutRejectedError(
          "There is no pending checkout to retry.",
        );
      return submit(pending.payload);
    },
    async reconcile() {
      if (busy) return null;
      busy = true;
      try {
        await initialize();
        await actor();
        if (!pending) return null;
        const response = await send(
          "/api/pos/checkouts/" + pending.requestKey,
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
              "Could not check this checkout. Keep its reference.",
            ),
          );
        if (data?.state === "not_found") return null;
        if (data?.state !== "committed")
          throw new CheckoutUncertainError(
            "The checkout result was incomplete. Check again.",
          );
        return confirm(data.transaction);
      } finally {
        busy = false;
      }
    },
  });
}
