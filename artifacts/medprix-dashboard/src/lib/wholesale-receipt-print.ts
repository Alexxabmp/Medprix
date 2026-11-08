import type { DeliveryReceipt } from "./wholesale-api";
import { printDocument } from "./receipt-print";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

const amount = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const decimal = (value: bigint) => {
  const whole = (value / 100n).toLocaleString("en-PH");
  return whole + "." + String(value % 100n).padStart(2, "0");
};

export const deliveryReceiptStyles = `
.delivery-receipt-paper {
  box-sizing: border-box;
  width: 100%;
  min-width: 690px;
  min-height: 1000px;
  padding: 40px;
  background: #fff;
  color: #171717;
  font:
    12px/1.5 Arial,
    sans-serif;
  display: flex;
  flex-direction: column;
  overflow-wrap: anywhere;
  color-scheme: light;
}
.delivery-receipt-paper * {
  box-sizing: border-box;
}
.delivery-receipt-paper h1,
.delivery-receipt-paper h2,
.delivery-receipt-paper p {
  margin: 0;
}
.delivery-receipt-paper .dr-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 24px;
  padding-bottom: 28px;
  border-bottom: 2px solid #222;
}
.delivery-receipt-paper .dr-merchant {
  font-size: 18px;
  font-weight: 700;
}
.delivery-receipt-paper .dr-heading {
  text-align: right;
}
.delivery-receipt-paper h1 {
  font:
    700 24px/1.25 Arial,
    sans-serif;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}
.delivery-receipt-paper .dr-details {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 40px;
  padding: 22px 0;
}
.delivery-receipt-paper h2 {
  font:
    700 11px/1.5 Arial,
    sans-serif;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #444;
  margin-bottom: 4px;
}
.delivery-receipt-paper .dr-address {
  white-space: pre-wrap;
}
.delivery-receipt-paper .dr-pair {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.delivery-receipt-paper table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.delivery-receipt-paper th {
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  background: #fff;
  color: #171717;
  padding: 8px 4px;
  border-top: 1px solid #555;
  border-bottom: 1px solid #555;
}
.delivery-receipt-paper td {
  padding: 11px 4px;
  border-bottom: 1px solid #d5d5d5;
  vertical-align: top;
  font-size: 11px;
}
.delivery-receipt-paper tr {
  break-inside: avoid;
}
.delivery-receipt-paper thead {
  display: table-header-group;
  background: #fff;
}
.delivery-receipt-paper th:first-child,
.delivery-receipt-paper td:first-child {
  padding-left: 0;
}
.delivery-receipt-paper .dr-number {
  text-align: right;
  white-space: nowrap;
}
.delivery-receipt-paper .dr-tax {
  display: block;
  color: #555;
  font-size: 10px;
  margin-top: 3px;
}
.delivery-receipt-paper .dr-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 230px;
  gap: 30px;
  margin-top: 24px;
  break-inside: avoid;
}
.delivery-receipt-paper .dr-total {
  font-size: 15px;
  font-weight: 700;
  border-top: 2px solid #222;
  padding-top: 7px;
  margin-top: 5px;
}
.delivery-receipt-paper .dr-acknowledgment {
  margin-top: auto;
  padding-top: 80px;
  break-inside: avoid;
}
.delivery-receipt-paper .dr-received {
  width: 220px;
  margin-left: auto;
  border-top: 1px solid #777;
  padding-top: 6px;
}
.delivery-receipt-paper .dr-footer {
  border-top: 1px solid #ddd;
  padding-top: 9px;
  margin-top: 24px;
  font-size: 10px;
  color: #444;
}
@media print {
  .delivery-receipt-paper {
    min-width: 0;
    width: 100%;
    min-height: 265mm;
    padding: 0;
  }
}
`;

export function deliveryReceiptMarkup(receipt: DeliveryReceipt): string {
  const e = escapeHtml;
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  const rows = receipt.lines.flatMap((line) =>
    receipt.batches
      .filter((batch) => batch.productId === line.productId)
      .map((batch) => ({ line, batch })),
  );
  const units = receipt.lines.reduce((sum, line) => sum + line.quantity, 0);
  return `<article class="delivery-receipt-paper" aria-label="Delivery receipt document">
    <header class="dr-header">
      <div class="dr-merchant">${e(receipt.merchantName)}</div>
      <div class="dr-heading"><h1>DELIVERY RECEIPT</h1>
        <p>DR No. <strong>${e(receipt.receiptNumber)}</strong></p>
        <p>Date: ${e(date(receipt.deliveredAt))}</p>
      </div>
    </header>
    <section class="dr-details">
      <div><h2>Deliver to</h2><strong>${e(receipt.clientName)}</strong><p class="dr-address">${e(receipt.address)}</p></div>
      <div><h2>Order details</h2>
        <p class="dr-pair"><span>Order reference</span><strong>${e(receipt.orderNumber)}</strong></p>
        <p class="dr-pair"><span>Payment due</span><span>${e(date(receipt.dueDate + "T00:00:00+08:00"))}</span></p>
      </div>
    </section>
    <table aria-label="Delivered items"><colgroup>
      <col style="width:4%"><col style="width:30%"><col style="width:13%"><col style="width:15%">
      <col style="width:7%"><col style="width:15%"><col style="width:16%">
    </colgroup><thead><tr>
      <th>#</th><th>DESCRIPTION</th><th>LOT NO.</th><th>EXPIRY</th>
      <th class="dr-number">QTY</th><th class="dr-number">UNIT PRICE</th><th class="dr-number">AMOUNT</th>
    </tr></thead><tbody>
      ${rows
        .map(
          ({ line, batch }, index) => `<tr>
        <td>${index + 1}</td><td><strong>${e(line.name)}</strong><span class="dr-tax">${line.isVatExempt ? "VAT-exempt" : "VAT included"}</span></td>
        <td>${e(batch.batchNumber)}</td><td>${e(batch.expiry)}</td><td class="dr-number">${e(batch.quantity)}</td>
        <td class="dr-number">${decimal(amount(line.unitPrice))}</td><td class="dr-number">${decimal(amount(line.unitPrice) * BigInt(batch.quantity))}</td>
      </tr>`,
        )
        .join("")}
    </tbody></table>
    <section class="dr-summary">
      <div><p>Items: ${receipt.lines.length} products · ${units} units</p></div>
      <div>
        <p class="dr-pair"><span>VAT (included)</span><span>${decimal(amount(receipt.vat))}</span></p>
        <p class="dr-pair dr-total"><span>TOTAL (PHP)</span><span>${decimal(amount(receipt.total))}</span></p>
      </div>
    </section>
    <section class="dr-acknowledgment"><div class="dr-received"><strong>Received by</strong>
      <p>${e(receipt.receivedBy)}</p><p>${e(date(receipt.deliveredAt))}</p>
    </div></section>
    <footer class="dr-footer">This receipt confirms delivery. It does not record a payment.</footer>
  </article>`;
}

export function deliveryReceiptDocument(receipt: DeliveryReceipt): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(receipt.receiptNumber)}</title>
    <style>@page { size: A4; margin: 14mm; } html, body { margin: 0; padding: 0; background: white; color: black; color-scheme: light; }
    ${deliveryReceiptStyles}</style></head><body>${deliveryReceiptMarkup(receipt)}</body></html>`;
}

export async function printDeliveryReceipt(
  receipt: DeliveryReceipt,
): Promise<void> {
  await printDocument(deliveryReceiptDocument(receipt));
}
