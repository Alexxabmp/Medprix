import type { ShiftReceipt } from "./types";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g,
  (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function row(label: string, value: unknown, className = ""): string {
  if (value === undefined || value === null || value === "") return "";
  return `<div class="row ${className}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

export function receiptDocument(receipt: ShiftReceipt): string {
  const source = receipt.printSource;
  const number = source ? source.transactionNumber : receipt.id;
  const sourceDate = source ? source.dateTime : receipt.dateTime;
  const parsed = sourceDate && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(sourceDate) ? new Date(sourceDate) : null;
  const date = parsed && Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed)
    : sourceDate;
  const items = receipt.itemsList?.length
    ? receipt.itemsList.map((item) => `<section class="item">
        <strong>${escapeHtml(item.product)}</strong>
        ${row(`${item.quantity}${item.unitPrice ? ` × ${item.unitPrice}` : ""}`, item.subtotal ?? " ")}
      </section>`).join("")
    : `<p>${escapeHtml(source ? source.itemsSummary : receipt.itemsSummary)}</p>`;
  return `<!doctype html><html lang="${escapeHtml(typeof navigator === "undefined" ? "en" : navigator.language)}"><head>
    <meta charset="utf-8"><title>Receipt ${escapeHtml(number)}</title>
    <style>
      @page { margin: 8mm; }
      * { box-sizing: border-box; }
      html { color-scheme: light; background: #e5e5e2; height: 100%; }
      body { margin: 0; padding: 10mm 0;
        min-height: 100%; display: flex;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .paper { width: 80mm; max-width: 100%; margin: auto; flex: none; padding: 5mm 4mm;
        background: white; box-shadow: 0 3px 18px #00000020; overflow-wrap: anywhere; }
      h1 { margin: 0 0 4mm; text-align: center; font-size: 16px; letter-spacing: 1px; }
      .row { display: flex; justify-content: space-between; gap: 4mm; }
      .row > :last-child { text-align: right; }
      .meta, .items, .totals { padding-bottom: 3mm; margin-bottom: 3mm; border-bottom: 1px dashed #666; }
      .item { margin: 3mm 0; break-inside: avoid; }
      .item .row { padding-left: 2mm; }
      .total { font-size: 16px; font-weight: bold; border-block: 2px solid #555; margin: 3mm 0; padding: 1mm 0; }
      .thanks { text-align: center; margin: 4mm 0 0; font-weight: bold; letter-spacing: 1px; }
      @media print { body { padding: 0; } }
    </style></head><body><article class="paper" aria-label="Transaction receipt">
    <h1>MEDPRIX</h1><div class="meta">
      ${row("Receipt no.", number)}${row("Date", date)}
      ${row("Cashier", source ? source.user : receipt.cashier)}${row("Payment", source ? source.payment : receipt.method)}
      ${row("Status", source ? source.status : receipt.status)}</div>
    <div class="items"><div class="row"><strong>ITEM</strong><strong>AMOUNT</strong></div>${items}</div>
    <div class="totals">${row("Subtotal", receipt.subtotal)}${row("VAT", receipt.vat)}
      ${row("Discount", receipt.discount)}
      ${row("TOTAL", source ? source.total : (receipt.totalFormatted || new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(receipt.total)), "total")}
      ${row("Amount received", receipt.amountReceived)}${row("Change", receipt.change)}</div>
    <p class="thanks">THANK YOU!</p></article></body></html>`;
}

let printing = false;

export async function printReceipt(receipt: ShiftReceipt): Promise<void> {
  if (printing) return;
  printing = true;
  const frame = document.createElement("iframe");
  frame.title = "Receipt print document";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:400px;height:600px;border:0";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    frame.remove();
    printing = false;
  };
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error("Could not prepare receipt."));
      timer = setTimeout(() => reject(new Error("Receipt preparation timed out.")), 15_000);
    });
    frame.srcdoc = receiptDocument(receipt);
    document.body.appendChild(frame);
    await loaded;
    clearTimeout(timer);
    const printWindow = frame.contentWindow;
    if (!printWindow) throw new Error("Could not open receipt print document.");
    await printWindow.document.fonts.ready;
    printWindow.addEventListener("afterprint", cleanup, { once: true });
    timer = setTimeout(cleanup, 300_000);
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
