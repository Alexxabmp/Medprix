import { Children, createContext, useContext, type ReactNode, type ComponentPropsWithoutRef } from "react";
import { AppTooltip } from "@/components/ui/tooltip";

/** Enabled by the page-table owner; null retains the baseline workbench comparison. */
export const PageTableContext = createContext<{
  renderValue: (value: string) => ReactNode;
} | null>(null);

export function usePageTableStandard() {
  return useContext(PageTableContext);
}

export function PageTableValue({ value }: { value: string }) {
  const standard = usePageTableStandard();
  return <>{standard && value ? standard.renderValue(value) : value}</>;
}

/** Compact accessible action using the shared application tooltip. */
export function PageTableAction({ label, icon, children, ...props }: ComponentPropsWithoutRef<"button"> & { label: string; icon: ReactNode }) {
  const standard = usePageTableStandard();
  if (!standard) return <button {...props}>{children}</button>;
  return <AppTooltip content={label}><button {...props} style={props.style ? { ...props.style, padding: 0 } : undefined} aria-label={label} className={`${props.className ?? ""} page-table-icon-action`}>{icon}</button></AppTooltip>;
}

export function PageTableScroll({ children }: { children: ReactNode }) {
  return usePageTableStandard() ? <div className="page-table-inner-scroll">{children}</div> : <>{children}</>;
}

/** Keep header and body order together; baseline workbench remains available. */
export function PageTableRow({ order, children, ...props }: ComponentPropsWithoutRef<"tr"> & { order: readonly number[] }) {
  const standard = usePageTableStandard();
  const cells = Children.toArray(children);
  return <tr {...props}>{standard ? order.map(index => cells[index]).filter(Boolean) : children}</tr>;
}
