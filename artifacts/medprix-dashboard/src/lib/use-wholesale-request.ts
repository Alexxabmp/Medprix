import { useRef, useState } from "react";
import { wholesaleWrite, type WholesaleRequest } from "@/lib/wholesale-api";
import { safeError } from "@/lib/feedback";

export function useWholesaleRequest(
  namespace: string,
  saved: () => Promise<void>,
  writer = wholesaleWrite,
) {
  const storageKey =
    "medprix-wholesale-" +
    namespace +
    ":" +
    (localStorage.getItem("medprix-username") ?? "");
  const [pending, setPending] = useState<WholesaleRequest | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function submit(request: WholesaleRequest) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      await writer(request);
      sessionStorage.removeItem(storageKey);
      setPending(null);
      await saved();
    } catch (failure) {
      if ((failure as { definitive?: boolean }).definitive) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
      }
      setError(safeError(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    pending,
    locked: busy || pending !== null,
    clearError: () => setError(""),
    mutate: (path: string, body: unknown) => {
      if (!pending && !inFlight.current)
        void submit({ key: crypto.randomUUID(), path, method: "POST", body });
    },
    retry: () => {
      if (pending) void submit(pending);
    },
  };
}
