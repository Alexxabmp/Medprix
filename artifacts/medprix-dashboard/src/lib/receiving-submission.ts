export type ReceivingPayload = {
  poId: string;
  deliveryDate: string;
  deliveryStatus: string;
  items: {
    productId: string;
    batchNumber: string;
    expirationDate: string;
    quantityDelivered: number;
  }[];
};
export type PendingReceiving = { key: string; payload: ReceivingPayload };

/** Per-tab recovery, scoped to the authenticated server user. Never auto-submits. */
export function createReceivingSubmitter(
  ownerId: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = sessionStorage,
  send: typeof fetch = fetch,
) {
  const storageKey = `medprix_receiving_v1:${ownerId}`;
  let pending: PendingReceiving | null = null;
  const stored = storage.getItem(storageKey);
  if (stored) {
    try {
      pending = JSON.parse(stored);
      if (!pending?.key || !Array.isArray(pending.payload?.items))
        throw new Error();
    } catch {
      throw new Error(
        "The saved receiving reference could not be read. Ask an administrator to check receiving reports before saving another.",
      );
    }
  }
  let busy = false;
  async function verifyOwner() {
    const response = await send("/api/me", {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const actor = await response.json().catch(() => null);
    if (
      !response.ok ||
      actor?.id !== ownerId ||
      !["Admin", "FrontDesk"].includes(actor?.role)
    )
      throw new Error(
        "The receiving account has changed or no longer has access. Sign in to the original account to check its pending report.",
      );
  }
  function confirm(data: any) {
    if (
      !pending ||
      data?.delivery?.id !== pending.key ||
      !Array.isArray(data.items)
    )
      throw new Error(
        "Receiving confirmation was incomplete. Check the saved result before retrying.",
      );
    // If cleanup fails, retain the safe replayable reference rather than lose it in memory.
    storage.removeItem(storageKey);
    pending = null;
    return data;
  }
  async function check() {
    if (!pending) return null;
    await verifyOwner();
    const response = await send(`/api/supplier-deliveries/${pending.key}`, {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        data?.error ||
          "Could not check the receiving report. Keep its reference and try again.",
      );
    if (data?.state === "committed") return confirm(data);
    if (data?.state !== "not_found")
      throw new Error("The receiving result could not be read.");
    return null; // May still be in flight. Retry only this same reference/payload.
  }
  async function submit(payload?: ReceivingPayload) {
    if (busy) throw new Error("This receiving report is already being saved.");
    if (
      pending &&
      payload &&
      JSON.stringify(payload) !== JSON.stringify(pending.payload)
    )
      throw new Error(
        "Check the pending receiving report before changing its details.",
      );
    if (!pending) {
      if (!payload)
        throw new Error("No receiving report is awaiting confirmation.");
      const next = {
        key: crypto.randomUUID(),
        payload: structuredClone(payload),
      };
      // A recoverable reference must exist before any network write.
      storage.setItem(storageKey, JSON.stringify(next));
      pending = next;
    }
    busy = true;
    try {
      await verifyOwner();
      const response = await send("/api/supplier-deliveries", {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": pending.key,
        },
        body: JSON.stringify(pending.payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        // These responses definitively reject this exact attempt; no automatic retry.
        if (
          response.status === 400 ||
          (response.status === 409 && data?.code !== "reference_conflict")
        ) {
          storage.removeItem(storageKey);
          pending = null;
        }
        throw new Error(
          data?.error ||
            "Receiving could not be confirmed. Check the result before retrying.",
        );
      }
      return confirm(data);
    } finally {
      busy = false;
    }
  }
  return { getPending: () => pending, submit, check };
}
