import { useEffect, useRef } from "react";

/** Keyboard behavior for the app's existing portal dialogs. */
export function useDialogAccessibility(
  open: boolean,
  selector: string,
  close: () => void,
  pending = false,
) {
  const closeRef = useRef(close);
  const pendingRef = useRef(pending);
  closeRef.current = close;
  pendingRef.current = pending;
  useEffect(() => {
    if (!open) return;
    const dialog = document.querySelector<HTMLElement>(selector);
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = dialog.querySelector("h2");
    if (heading) {
      heading.id ||= `dialog-${crypto.randomUUID()}`;
      dialog.setAttribute("aria-labelledby", heading.id);
    }
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      // A nested payment dialog owns its own keyboard interaction.
      if (event.target instanceof Node && !dialog!.contains(event.target))
        return;
      if (event.key === "Escape" && !pendingRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = controls();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0].focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (opener?.isConnected) opener.focus();
    };
  }, [open, selector]);
}
