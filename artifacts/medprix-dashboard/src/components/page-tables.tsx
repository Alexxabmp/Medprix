import type { ReactNode } from "react";
import { TableValue } from "@/components/ui/tooltip";
import { PageTableContext } from "./page-table-context";
import { PageTableBoundary } from "./page-table-boundary";

const presentation = { renderValue: (value: string) => <TableValue value={value} /> };

/** Shared presentation only; existing page components keep their data and controls. */
export function PageTables({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  return <PageTableContext.Provider value={enabled ? presentation : null}>
    {enabled ? <PageTableBoundary>{children}</PageTableBoundary> : children}
  </PageTableContext.Provider>;
}
