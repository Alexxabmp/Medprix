import {
  createContext,
  useContext,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "@/styles/wholesale-workflow.css";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import {
  useModalTableStandard,
  ModalTableLayout,
  ModalTableContext,
} from "./modal-table-layout";

export type WholesaleDialogVariant = "form" | "compact-table" | "table";
type Presentation = {
  title: string;
  variant: WholesaleDialogVariant;
  back: () => void;
};
const ViewContext = createContext<((view: Presentation | null) => void) | null>(
  null,
);
/** Child tasks update their existing shell, never open a second dialog. */
export function useWholesaleDialogView(view: Presentation | null) {
  const update = useContext(ViewContext);
  const backRef = useRef(view?.back);
  backRef.current = view?.back;
  const back = useCallback(() => backRef.current?.(), []);
  const title = view?.title,
    variant = view?.variant;
  useLayoutEffect(() => {
    if (!update || !title || !variant) return;
    update({ title, variant, back });
    return () => update(null);
  }, [update, title, variant, back]);
}

export function WholesaleDialog({
  title,
  titleIcon,
  description,
  busy,
  close,
  back,
  children,
  footer,
  variant,
  hidden = false,
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
  footer?: ReactNode;
  variant?: WholesaleDialogVariant;
  hidden?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const preview = useModalTableStandard();
  const [view, setView] = useState<Presentation | null>(null);
  const effectiveVariant = view?.variant ?? variant ?? "form";
  useDialogAccessibility(!hidden, ".wholesale-dialog", close, busy);
  useLayoutEffect(() => {
    if (hidden) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [hidden]);
  const shownTitle = view?.title ?? title;
  const previousTitle = useRef(shownTitle);
  useLayoutEffect(() => {
    const changed = previousTitle.current !== shownTitle;
    previousTitle.current = shownTitle;
    if (hidden || !changed) return;
    const dialog = document.querySelector<HTMLElement>(".wholesale-dialog");
    const body = dialog?.querySelector<HTMLElement>(".wholesale-dialog-body");
    if (body) body.scrollTop = 0;
    const frame = requestAnimationFrame(() => {
      const input = Array.from(
        body?.querySelectorAll<HTMLElement>(
          "input:not(:disabled), textarea:not(:disabled), [role=combobox]",
        ) ?? [],
      ).find((element) => element.getClientRects().length > 0);
      (
        input ??
        dialog?.querySelector<HTMLElement>(
          '[aria-label="Back"], .modal-table-footer button, .wholesale-form-footer button',
        )
      )?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [shownTitle, hidden]);
  if (hidden) return null;
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
          (preview ? " modal-table-standard" : "") +
          " wholesale-modal-" +
          effectiveVariant +
          (className ? " " + className : "")
        }
      >
        <ViewContext.Provider value={setView}>
          <ModalTableContext.Provider value={preview}>
            <ModalTableLayout>
              <div className="modal-header">
                <div>
                  <div className="wholesale-dialog-title">
                    {titleIcon}
                    <h2>{view?.title ?? title}</h2>
                  </div>
                  {description && <p className="modal-sub">{description}</p>}
                </div>
                <div className="wholesale-dialog-header-actions">
                  {(view?.back ?? back) && (
                    <button
                      type="button"
                      className="button soft wholesale-dialog-back"
                      aria-label="Back"
                      onClick={view?.back ?? back}
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
              {footer && (
                <footer className="modal-actions wholesale-form-footer">
                  {footer}
                </footer>
              )}
            </ModalTableLayout>
          </ModalTableContext.Provider>
        </ViewContext.Provider>
      </section>
    </div>,
    document.body,
  );
}
