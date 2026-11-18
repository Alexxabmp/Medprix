import { ReadDialog, useReadDialog } from "./read-dialog";
import { SourceTableBody, type SourceState } from "./custom-ui/source-state";
import { AppTooltip } from "@/components/ui/tooltip";
import { PageTableValue, PageTableScroll } from "@/components/page-table-context";
import { TableEmptyState } from "@/components/custom-ui/empty-state";
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { DeliveryReceiptView } from "./delivery-receipt-view";
import {
  wholesaleGet,
  type DeliveryReceipt,
  type DeliveryReceiptSummary,
} from "@/lib/wholesale-api";

const PAGE_SIZE = 15;

export function WholesaleDeliveryReceipts({
  receipts,
  search,
  disabled,
  source,
}: {
  receipts: DeliveryReceiptSummary[];
  search: string;
  disabled: boolean;
  source: SourceState;
}) {
  const read = useReadDialog<DeliveryReceipt>();
  const [printing, setPrinting] = useState(false);
  const opening = read.state?.pending ?? false;
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
      <PageTableScroll><table data-page-table="wholesale-receipts" className="data-table">
        <thead>
          <tr>
            <th>Receipt</th>
            <th>Order</th>
            <th>Client</th>
            <th className="table-action-head">Action</th>
          </tr>
        </thead>
        <SourceTableBody status={source} label="Delivery receipts" colSpan={4}>
          {paginated.map((row) => (
            <tr key={row.id}>
              <td>{row.receiptNumber}</td>
              <td>{row.orderNumber}</td>
              <td><PageTableValue value={row.clientName} /></td>
              <td className="table-action-cell">
                <div className="table-actions">
                  <AppTooltip content={"View receipt"}><button
                    className="button soft table-action-btn"
                    aria-busy={opening}
                    aria-label="View receipt"

                    disabled={disabled || opening}
                    onClick={() => read.open("Delivery receipt details", () => wholesaleGet<DeliveryReceipt>("/delivery-receipts/" + row.id))}
                  >
                    <Eye size={13} />
                  </button></AppTooltip>
                </div>
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
        </SourceTableBody>
      </table></PageTableScroll>
      <div className="table-pagination" role="navigation" aria-label="Delivery receipts pagination">
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
      <ReadDialog task={read} variant="form" busy={printing} description={receipt => receipt.receiptNumber}>
        {receipt => <DeliveryReceiptView receipt={receipt} close={read.close} embedded onBusyChange={setPrinting} />}
      </ReadDialog>
    </>
  );
}
