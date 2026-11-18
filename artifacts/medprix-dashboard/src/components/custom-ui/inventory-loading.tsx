import type { ComponentProps, ReactNode } from "react";
import { AlertCircle, LoaderCircle, Package, RefreshCw } from "lucide-react";
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

// Status subscriptions stay below the page's expensive list calculations.
export function InventorySummary(props: ComponentProps<typeof Summary>) {
  const { hasData, error } = usePharmacyInventoryStatus();
  return (
    <Summary
      {...props}
      value={hasData ? props.value : "—"}
      caption={
        hasData ? props.caption : error ? "Stock unavailable" : "Loading stock…"
      }
      tone={hasData ? props.tone : "muted"}
      action={
        hasData ? (
          props.action
        ) : error ? (
          <AlertCircle size={14} aria-hidden="true" />
        ) : (
          <LoaderCircle
            size={14}
            className="spin action-spinner"
            aria-hidden="true"
          />
        )
      }
    />
  );
}

export function InventoryRefreshButton() {
  const { pending } = usePharmacyInventoryStatus();
  return (
    <button
      type="button"
      className="button soft"
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? "Updating stock" : "Refresh stock"}
      onClick={() => void refreshStock()}
    >
      <RefreshCw
        size={14}
        className={pending ? "spin action-spinner" : undefined}
        aria-hidden="true"
      />
      Refresh stock
    </button>
  );
}

function SourceFeedback({
  status,
  refresh,
  label,
}: {
  status: PharmacySourceStatus;
  refresh: () => Promise<unknown>;
  label: string;
}) {
  if (!status.error) return null;
  return (
    <div className="inline-error" role="alert">
      <span className="action-error-copy">
        <AlertCircle size={16} aria-hidden="true" />
        <span>
          {status.error}
          {status.hasData ? ` Showing previously loaded ${label}.` : ""}
        </span>
      </span>
      <button
        type="button"
        className="button soft"
        disabled={status.pending}
        aria-busy={status.pending}
        aria-label={status.pending ? `Refreshing ${label}` : `Retry ${label}`}
        onClick={() => void refresh()}
      >
        <RefreshCw
          size={13}
          className={status.pending ? "spin action-spinner" : undefined}
          aria-hidden="true"
        />
        Retry
      </button>
    </div>
  );
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
      refresh={refreshStock}
      label="stock"
    />
  );
}
export function MovementFeedback() {
  return (
    <SourceFeedback
      status={usePharmacyTransactionsStatus()}
      refresh={refreshMovements}
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
  return (
    <tbody aria-busy={!status.hasData && (status.pending || !status.error)}>
      {status.hasData && !empty ? (
        children
      ) : (
        <tr>
          <td colSpan={colSpan} className="empty-state-cell">
            <div className="empty-state" role="status">
              {!status.hasData ? (
                status.error ? (
                  <AlertCircle size={25} aria-hidden="true" />
                ) : (
                  <LoaderCircle
                    size={25}
                    className="spin action-spinner"
                    aria-hidden="true"
                  />
                )
              ) : (
                <Package size={25} aria-hidden="true" />
              )}
              <div>
                {!status.hasData
                  ? status.error
                    ? `${label} unavailable. Use Retry to recover.`
                    : `Loading ${label.toLowerCase()}…`
                  : emptyMessage}
              </div>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
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
