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
  back?: () => void;
  description?: string;
  busy?: boolean;
  className?: string;
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
    hasBack = Boolean(view?.back),
    variant = view?.variant,
    description = view?.description,
    busy = view?.busy,
    className = view?.className;
  useLayoutEffect(() => {
    if (!update || !title || !variant) return;
    update({
      title,
      variant,
      back: hasBack ? back : undefined,
      description,
      busy,
      className,
    });
    return () => update(null);
  }, [update, title, variant, back, hasBack, description, busy, className]);
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
  embedded = false,
  focusOnViewChange = true,
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
  embedded?: boolean;
  focusOnViewChange?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const preview = useModalTableStandard();
  const [view, setView] = useState<Presentation | null>(null);
  const effectiveVariant = view?.variant ?? variant ?? "form";
  const effectiveBusy = busy || Boolean(view?.busy);
  const shownDescription = view?.description ?? description;
  useWholesaleDialogView(
    embedded && !hidden
      ? {
          title,
          variant: variant ?? "form",
          back: back ?? close,
          description,
          busy,
          className,
        }
      : null,
  );
  useDialogAccessibility(
    !hidden && !embedded,
    ".wholesale-dialog",
    close,
    effectiveBusy,
  );
  useLayoutEffect(() => {
    if (hidden || embedded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [hidden, embedded]);
  const shownTitle = view?.title ?? title;
  const shownBack = view ? view.back : back;
  const previousTitle = useRef(shownTitle);
  useLayoutEffect(() => {
    const changed = previousTitle.current !== shownTitle;
    previousTitle.current = shownTitle;
    if (hidden || embedded || !focusOnViewChange || !changed) return;
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
  }, [shownTitle, hidden, embedded, focusOnViewChange]);
  if (hidden) return null;
  if (embedded) return <>{children}</>;
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
          (className ? " " + className : "") +
          (view?.className ? " " + view.className : "")
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
                  {shownDescription && (
                    <p className="modal-sub">{shownDescription}</p>
                  )}
                </div>
                <div className="wholesale-dialog-header-actions">
                  {shownBack && (
                    <button
                      type="button"
                      className="button soft wholesale-dialog-back"
                      aria-label="Back"
                      onClick={shownBack}
                      disabled={effectiveBusy}
                    >
                      <ArrowLeft size={14} /> Back
                    </button>
                  )}
                  <button
                    type="button"
                    className="modal-close"
                    aria-label="Close dialog"
                    onClick={close}
                    disabled={effectiveBusy}
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
