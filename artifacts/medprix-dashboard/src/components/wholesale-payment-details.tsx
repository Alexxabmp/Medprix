import { ModalDataTable } from "./modal-data-table";
import { TableEmptyState } from "./custom-ui/empty-state";
import {
  wholesaleDateTime,
  wholesalePeso,
  type WholesaleCollection,
} from "@/lib/wholesale-api";

export function WholesalePaymentDetails({
  payment,
}: {
  payment: WholesaleCollection;
}) {
  return (
    <>
      <dl className="wholesale-review-summary wholesale-payment-summary">
        <div>
          <dt>Payment amount</dt>
          <dd>
            <strong>{wholesalePeso(payment.amount)}</strong>
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span
              className={`pill ${payment.reversalId ? "neutral" : "success"}`}
            >
              {payment.reversalId ? "Reversed" : "Recorded"}
            </span>
          </dd>
        </div>
      </dl>
      <dl className="wholesale-detail-list wholesale-payment-metadata">
        <div>
          <dt>Collected at (Manila)</dt>
          <dd>{wholesaleDateTime(payment.collectedAt)}</dd>
        </div>
        <div>
          <dt>Collector</dt>
          <dd>{payment.collectorName}</dd>
        </div>
        <div>
          <dt>Payment method</dt>
          <dd>{payment.method}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>{payment.reference || "No reference"}</dd>
        </div>
      </dl>
      {payment.notes && (
        <section className="modal-section wholesale-payment-notes">
          <h3>Notes</h3>
          <p>{payment.notes}</p>
        </section>
      )}
      <section className="modal-section" aria-label="Installment allocations">
        <h3>Installment allocations</h3>
        {payment.reversalId && (
          <p className="field-hint">
            Original allocations are retained for history. This reversed payment
            no longer reduces the balance.
          </p>
        )}
        <ModalDataTable className="data-table">
          <thead>
            <tr>
              <th>Installment</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(payment.allocations ?? []).map((allocation) => (
              <tr key={allocation.sequenceNumber}>
                <td>Installment {allocation.sequenceNumber}</td>
                <td>{wholesalePeso(allocation.amount)}</td>
              </tr>
            ))}
            {!payment.allocations?.length && (
              <tr>
                <TableEmptyState colSpan={2}>
                  No installment allocations recorded.
                </TableEmptyState>
              </tr>
            )}
          </tbody>
        </ModalDataTable>
      </section>
      {payment.reversalId && (
        <section
          className="wholesale-context wholesale-payment-notes"
          aria-label="Reversal details"
        >
          <h3>Reversal details</h3>
          <dl className="wholesale-detail-list">
            <div>
              <dt>Reason</dt>
              <dd>{payment.reversalReason || "No reason recorded"}</dd>
            </div>
            {payment.reversedAt && (
              <div>
                <dt>Reversed at (Manila)</dt>
                <dd>{wholesaleDateTime(payment.reversedAt)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </>
  );
}
