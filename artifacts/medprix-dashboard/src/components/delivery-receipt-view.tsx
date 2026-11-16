import { useState } from "react";
import { Printer } from "lucide-react";
import { WholesaleDialog } from "./wholesale-dialog";
import { wholesalePeso, type DeliveryReceipt } from "@/lib/wholesale-api";
import { printDeliveryReceipt } from "@/lib/wholesale-receipt-print";
import { safeError } from "@/lib/feedback";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/business-date";
import { ModalTableFooter } from "./modal-table-layout";
import { WholesaleInstallmentScheduleView } from "./wholesale-installment-schedule";

export function DeliveryReceiptView({
  receipt,
  close,
  embedded = false,
  onBusyChange,
}: {
  receipt: DeliveryReceipt;
  close: () => void;
  embedded?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);
  const deliveredAt = formatDisplayDateTime(receipt.deliveredAt, "Asia/Manila");
  const quantity = receipt.lines.reduce((sum, line) => sum + line.quantity, 0);
  const content = (
    <div className="delivery-receipt-details">
      <strong>{receipt.merchantName}</strong>
      <dl className="delivery-receipt-meta">
        <div>
          <dt>Delivery status</dt>
          <dd>
            <span className="pill success">Delivered</span>
          </dd>
        </div>
        <div>
          <dt>Order reference</dt>
          <dd>{receipt.orderNumber}</dd>
        </div>
        <div>
          <dt>Actual client receipt</dt>
          <dd>{deliveredAt}</dd>
        </div>
        <div>
          <dt>Recorded on</dt>
          <dd>{formatDisplayDateTime(receipt.recordedAt, "Asia/Manila")}</dd>
        </div>
        <div>
          <dt>Received by</dt>
          <dd>{receipt.receivedBy}</dd>
        </div>
      </dl>
      <section
        className="delivery-receipt-client"
        aria-label="Delivery recipient"
      >
        <span className="field-label">Delivered to</span>
        <strong>{receipt.clientName}</strong>
        <p>{receipt.address}</p>
      </section>
      <section className="delivery-receipt-items">
        <div className="delivery-receipt-section-heading">
          <h3>Delivered items</h3>
          <span className="muted">
            {quantity} {quantity === 1 ? "unit" : "units"}
          </span>
        </div>
        {receipt.lines.map((line) => (
          <div className="delivery-receipt-item" key={line.productId}>
            <div className="delivery-receipt-item-heading">
              <strong>{line.name}</strong>
              <strong>{wholesalePeso(line.total)}</strong>
            </div>
            <p className="muted">
              {line.sku} / {line.quantity} × {wholesalePeso(line.unitPrice)} ·{" "}
              {line.isVatExempt ? "VAT-exempt" : "VAT included"}
            </p>
            <ul
              className="delivery-receipt-batches"
              aria-label={"Batches for " + line.name}
            >
              {receipt.batches
                .filter((batch) => batch.productId === line.productId)
                .map((batch, index) => (
                  <li key={index}>
                    <span>
                      Batch <strong>{batch.batchNumber}</strong>
                    </span>
                    <span>
                      Expires {formatDisplayDate(batch.expiry)} ·{" "}
                      {batch.quantity} {batch.quantity === 1 ? "unit" : "units"}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>
      <dl className="delivery-receipt-totals">
        <div>
          <dt>VAT (included)</dt>
          <dd>{wholesalePeso(receipt.vat)}</dd>
        </div>
        <div className="delivery-receipt-total">
          <dt>Total amount</dt>
          <dd>{wholesalePeso(receipt.total)}</dd>
        </div>
      </dl>
      <WholesaleInstallmentScheduleView
        schedule={receipt.installmentSchedule}
      />
      <p className="delivery-receipt-note">
        This receipt confirms delivery. It does not record a payment.
      </p>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <ModalTableFooter>
        <div className="modal-actions delivery-receipt-actions">
          <button
            type="button"
            className="button primary-action"
            disabled={printing}
            onClick={async () => {
              setPrinting(true);
              onBusyChange?.(true);
              setError("");
              try {
                await printDeliveryReceipt(receipt);
              } catch (failure) {
                setError(safeError(failure));
              } finally {
                setPrinting(false);
                onBusyChange?.(false);
              }
            }}
          >
            <Printer size={14} />
            {printing ? "Preparing receipt…" : "Print delivery receipt"}
          </button>
        </div>
      </ModalTableFooter>
    </div>
  );
  return embedded ? (
    content
  ) : (
    <WholesaleDialog
      variant="form"
      title="Delivery receipt details"
      description={receipt.receiptNumber}
      busy={printing}
      close={close}
      className="delivery-receipt-dialog"
      animate={false}
    >
      {content}
    </WholesaleDialog>
  );
}
