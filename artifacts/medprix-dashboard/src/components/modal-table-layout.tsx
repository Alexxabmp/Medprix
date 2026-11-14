import { AppTooltip, TableValue } from "./ui/tooltip";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

/** The application default; the development comparison may explicitly opt out. */
export const ModalTableContext = createContext<{
  renderValue: (value: string) => ReactNode;
  renderHint?: (value: string, children: ReactElement) => ReactNode;
} | null>({
  renderValue: (value) => <TableValue value={value} />,
  renderHint: (value, children) => (
    <AppTooltip content={value}>{children}</AppTooltip>
  ),
});

export function useModalTableStandard() {
  return useContext(ModalTableContext);
}

export function ModalTableValue({ value }: { value: string }) {
  const preview = useModalTableStandard();
  return <>{preview ? preview.renderValue(value) : value}</>;
}

export function ModalTableHint({
  value,
  children,
}: {
  value: string;
  children: ReactElement;
}) {
  const preview = useModalTableStandard();
  return (
    <>{preview?.renderHint ? preview.renderHint(value, children) : children}</>
  );
}

const FooterTarget = createContext<HTMLElement | null>(null);

/** Stationary shell slots around the one vertically scrolling modal body. */
export function ModalTableLayout({
  children,
  close,
  busy = false,
}: {
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const preview = useModalTableStandard();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  if (!preview) return <>{children}</>;
  return (
    <FooterTarget.Provider value={target}>
      {children}
      <footer className="modal-table-footer" aria-label="Modal footer">
        <div className="modal-table-footer-content" ref={setTarget} />
        <button
          type="button"
          className="button soft"
          disabled={busy}
          onClick={close}
        >
          Close
        </button>
      </footer>
    </FooterTarget.Provider>
  );
}

export function ModalTableBody({ children }: { children: ReactNode }) {
  return useModalTableStandard() ? (
    <div className="modal-table-body">{children}</div>
  ) : (
    <>{children}</>
  );
}

export function ModalTableFooter({ children }: { children: ReactNode }) {
  const preview = useModalTableStandard();
  const target = useContext(FooterTarget);
  return preview ? (
    target ? (
      createPortal(children, target)
    ) : null
  ) : (
    <>{children}</>
  );
}

export function ModalTableFrame({ children }: { children: ReactNode }) {
  return useModalTableStandard() ? (
    <div className="modal-table-frame">{children}</div>
  ) : (
    <>{children}</>
  );
}

export function useModalTableRows<T>(rows: T[], resetKey = "") {
  const preview = useModalTableStandard();
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [resetKey]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  return {
    rows: preview ? rows.slice((safePage - 1) * 10, safePage * 10) : rows,
    page: safePage,
    total: rows.length,
    change: setPage,
    offset: preview ? (safePage - 1) * 10 : 0,
  };
}

export function ModalTablePager({
  page,
  total,
  change,
  label,
  loading = false,
}: {
  page: number;
  total: number;
  change: (page: number) => void;
  label: string;
  loading?: boolean;
}) {
  if (!useModalTableStandard() || total <= 10) return null;
  return (
    <nav className="modal-table-pager" aria-label={label + " pagination"}>
      <span>
        {label} · {Math.min((page - 1) * 10 + 1, total)}–
        {Math.min(page * 10, total)} of {total}
      </span>
      <button
        type="button"
        className="button soft"
        disabled={loading || page <= 1}
        onClick={() => change(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {Math.ceil(total / 10)}
      </span>
      <button
        type="button"
        className="button soft"
        disabled={loading || page * 10 >= total}
        onClick={() => change(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
