import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { useState } from "react";
import { DeliveryReceiptView } from "./delivery-receipt-view";
import {
  wholesaleGet,
  type DeliveryReceipt,
  type DeliveryReceiptSummary,
} from "@/lib/wholesale-api";
import { safeError } from "@/lib/feedback";

export function WholesaleDeliveryReceipts({
  receipts,
  search,
  disabled,
}: {
  receipts: DeliveryReceiptSummary[];
  search: string;
  disabled: boolean;
}) {
  const [receipt, setReceipt] = useState<DeliveryReceipt | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const visible = receipts.filter((row) =>
    (row.receiptNumber + " " + row.orderNumber + " " + row.clientName)
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      {error && (
        <div role="alert" className="inline-error">
          {error}
        </div>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>Receipt</th>
            <th>Order</th>
            <th>Client</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id}>
              <td>{row.receiptNumber}</td>
              <td>{row.orderNumber}</td>
              <td>{row.clientName}</td>
              <td>
                <button
                  className="button soft wholesale-receipt-open"
                  aria-busy={opening}
                  aria-label="View receipt"
                  disabled={disabled || opening}
                  onClick={async () => {
                    setOpening(true);
                    setError("");
                    try {
                      setReceipt(
                        await wholesaleGet<DeliveryReceipt>(
                          "/delivery-receipts/" + row.id,
                        ),
                      );
                    } catch (failure) {
                      setError(safeError(failure));
                    } finally {
                      setOpening(false);
                    }
                  }}
                >
                  {opening ? "Opening..." : "View receipt"}
                </button>
              </td>
            </tr>
          ))}
          {!visible.length && (
            <tr>
              <TableEmptyState colSpan={4}>
                {search
                  ? "No matching receipts."
                  : "No delivery receipts found."}
              </TableEmptyState>
            </tr>
          )}
        </tbody>
      </table>
      {receipt && (
        <DeliveryReceiptView receipt={receipt} close={() => setReceipt(null)} />
      )}
    </>
  );
}
