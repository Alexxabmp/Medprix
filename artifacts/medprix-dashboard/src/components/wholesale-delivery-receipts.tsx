import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { DeliveryReceiptView } from "./delivery-receipt-view";
import {
  wholesaleGet,
  type DeliveryReceipt,
  type DeliveryReceiptSummary,
} from "@/lib/wholesale-api";
import { safeError } from "@/lib/feedback";

const PAGE_SIZE = 15;

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
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const visible = receipts.filter((row) =>
    (row.receiptNumber + " " + row.orderNumber + " " + row.clientName)
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = visible.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
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
            <th className="table-action-head">Action</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((row) => (
            <tr key={row.id}>
              <td>{row.receiptNumber}</td>
              <td>{row.orderNumber}</td>
              <td>{row.clientName}</td>
              <td className="table-action-cell">
                <div className="table-actions">
                  <button
                    className="button soft table-action-btn"
                    aria-busy={opening}
                    aria-label="View receipt"
                    title="View receipt"
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
                    <Eye size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!visible.length && (
            <tr>
              <td colSpan={4} className="muted">
                {search
                  ? "No matching receipts."
                  : "No delivery receipts found."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="wholesale-pagination">
        <span className="muted">
          Page {safePage} of {totalPages} ({visible.length} receipts)
        </span>
        <button
          type="button"
          className="button soft"
          disabled={safePage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          className="button soft"
          disabled={safePage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </button>
      </div>
      {receipt && (
        <DeliveryReceiptView receipt={receipt} close={() => setReceipt(null)} />
      )}
    </>
  );
}
