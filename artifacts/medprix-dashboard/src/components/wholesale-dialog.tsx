import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

export function WholesaleDialog({
  title,
  busy,
  close,
  children,
}: {
  title: string;
  busy: boolean;
  close: () => void;
  children: ReactNode;
}) {
  useDialogAccessibility(true, ".wholesale-dialog", close, busy);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return createPortal(
    <div className="modal-backdrop">
      <section className="modal wholesale-dialog">
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="modal-close"
            aria-label="Close dialog"
            onClick={close}
            disabled={busy}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
