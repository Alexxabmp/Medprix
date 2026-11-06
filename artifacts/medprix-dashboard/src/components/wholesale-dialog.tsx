import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

export function WholesaleDialog({
  title,
  description,
  busy,
  close,
  children,
  review = false,
}: {
  title: string;
  description?: string;
  busy: boolean;
  close: () => void;
  children: ReactNode;
  review?: boolean;
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
    <div className="modal-backdrop wholesale-backdrop">
      <section
        className={
          "modal wholesale-dialog" + (review ? " wholesale-review-dialog" : "")
        }
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p className="modal-sub">{description}</p>}
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close dialog"
            onClick={close}
            disabled={busy}
          >
            <X size={16} />
          </button>
        </div>
        <div className="wholesale-dialog-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
