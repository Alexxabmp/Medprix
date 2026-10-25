export function createCheckoutSubmitter(send: typeof fetch = fetch, newKey = () => crypto.randomUUID()) {
  let pending: { fingerprint: string; payload: any; requestKey: string } | undefined;
  let busy = false;
  return async (payload: any) => {
    if (busy) throw new Error("Checkout is already being saved.");
    const { dateTime: _date, transactionNumber: _number, ...details } = payload;
    const fingerprint = JSON.stringify(details);
    if (!pending || pending.fingerprint !== fingerprint) {
      pending = { fingerprint, payload, requestKey: newKey() };
    }
    busy = true;
    try {
      const response = await send("/api/admin/transactions", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pending.payload, requestKey: pending.requestKey }),
      });
      if (!response.ok) throw new Error("Payment could not be confirmed. Retry without changing the cart or reloading this page.");
      const saved = await response.json();
      if (!Number.isSafeInteger(saved.id) || saved.id <= 0 || !saved.transactionNumber || !Array.isArray(saved.items)) {
        throw new Error("Payment confirmation was incomplete. Retry the unchanged checkout.");
      }
      pending = undefined;
      return saved;
    } finally {
      busy = false;
    }
  };
}
