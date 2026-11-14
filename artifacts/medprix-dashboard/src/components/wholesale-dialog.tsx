import { useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { useModalTableStandard, ModalTableLayout, ModalTableContext } from "./modal-table-layout";

export function WholesaleDialog({
  title,
  titleIcon,
  description,
  busy,
  close,
  back,
  children,
  review = false,
  animate = true,
  className = "",
}: {
  title: string;
  titleIcon?: ReactNode;
  description?: string;
  busy: boolean;
  close: () => void;
  back?: () => void;
  children: ReactNode;
  review?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const preview = useModalTableStandard();
  const tableDialog = review || /wholesale-(summary|account)-dialog/.test(className);
  useDialogAccessibility(true, ".wholesale-dialog", close, busy);
  useLayoutEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return createPortal(
    <div
      className={
        "modal-backdrop wholesale-backdrop" +
        (animate ? "" : " wholesale-dialog-static")
      }
    >
      <section
        className={
          "modal wholesale-dialog" +
          (preview && tableDialog ? " modal-table-standard" : "") +
          (review ? " wholesale-review-dialog" : "") +
          (className ? " " + className : "")
        }
      >
        <ModalTableContext.Provider value={tableDialog ? preview : null}>
        <ModalTableLayout close={close} busy={busy}>
        <div className="modal-header">
          <div>
            <div className="wholesale-dialog-title">
              {titleIcon}
              <h2>{title}</h2>
            </div>
            {description && <p className="modal-sub">{description}</p>}
          </div>
          <div className="wholesale-dialog-header-actions">
            {back && (
              <button
                type="button"
                className="button soft wholesale-dialog-back"
                aria-label="Back"
                onClick={back}
                disabled={busy}
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
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
        </div>
        <div className="wholesale-dialog-body">{children}</div>
        </ModalTableLayout>
        </ModalTableContext.Provider>
      </section>
    </div>,
    document.body,
  );
}
