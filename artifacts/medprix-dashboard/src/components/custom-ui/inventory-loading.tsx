import type { ComponentProps, ReactNode } from "react";
import { Package } from "lucide-react";
import {
  fetchInventoryData,
  fetchTransactionsData,
  getPharmacyInventoryStatus,
  getPharmacyTransactionsStatus,
  usePharmacyInventoryStatus,
  usePharmacyTransactionsStatus,
  type PharmacySourceStatus,
} from "@/lib/pharmacy-store";
import { Summary } from "./summary-card";
import { SourceSummary, SourceFeedback, SourceRefreshButton, SourceTableBody as SharedTableBody } from "./source-state";

// Status subscriptions stay below the page's expensive list calculations.
export function InventorySummary(props: ComponentProps<typeof Summary>) {
  return <SourceSummary {...props} status={usePharmacyInventoryStatus()} />;
}
export function InventoryRefreshButton() {
  return <SourceRefreshButton status={usePharmacyInventoryStatus()} label="stock" retryOnError={false} onRefresh={() => void refreshStock()} />;
}

const refreshStock = () =>
  getPharmacyInventoryStatus().pending
    ? Promise.resolve()
    : fetchInventoryData(true);
const refreshMovements = () =>
  getPharmacyTransactionsStatus().pending
    ? Promise.resolve()
    : fetchTransactionsData(true);
export function InventoryFeedback() {
  return (
    <SourceFeedback
      status={usePharmacyInventoryStatus()}
      onRetry={() => void refreshStock()}
      label="stock"
    />
  );
}
export function MovementFeedback() {
  return (
    <SourceFeedback
      status={usePharmacyTransactionsStatus()}
      onRetry={() => void refreshMovements()}
      label="movements"
    />
  );
}

type BodyProps = { children: ReactNode; empty: boolean };
function SourceTableBody({
  status,
  children,
  empty,
  colSpan,
  label,
  emptyMessage,
}: BodyProps & {
  status: PharmacySourceStatus;
  colSpan: number;
  label: string;
  emptyMessage: string;
}) {
  return <SharedTableBody status={status} label={label} colSpan={colSpan}>
    {!empty ? children : <tr><td colSpan={colSpan} className="empty-state-cell"><div className="empty-state" role="status">
      <Package size={25} aria-hidden="true" /><div>{emptyMessage}</div>
    </div></td></tr>}
  </SharedTableBody>;
}

export function InventoryTableBody(props: BodyProps) {
  return (
    <SourceTableBody
      {...props}
      status={usePharmacyInventoryStatus()}
      colSpan={9}
      label="Inventory"
      emptyMessage="No products match that search or filter."
    />
  );
}
export function MovementTableBody(props: BodyProps) {
  return (
    <SourceTableBody
      {...props}
      status={usePharmacyTransactionsStatus()}
      colSpan={7}
      label="Stock movements"
      emptyMessage="No stock movements found matching your search or filter."
    />
  );
}
export function InventoryPaginationLabel({
  children,
}: {
  children: ReactNode;
}) {
  const { hasData, error } = usePharmacyInventoryStatus();
  return (
    <span className="muted">
      {hasData
        ? children
        : error
          ? "Inventory unavailable"
          : "Loading inventory…"}
    </span>
  );
}
export function MovementPaginationLabel({ children }: { children: ReactNode }) {
  const { hasData, error } = usePharmacyTransactionsStatus();
  return (
    <span className="muted">
      {hasData
        ? children
        : error
          ? "Movements unavailable"
          : "Loading movements…"}
    </span>
  );
}
