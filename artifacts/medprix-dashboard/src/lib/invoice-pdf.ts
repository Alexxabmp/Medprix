// Pure TypeScript PDF generator for Medprix Pharmacy Invoices
// Produces a standard, valid PDF 1.4 document without external dependencies.

export interface InvoicePdfData {
  invoiceNumber: string;
  poNumber?: string | null;
  supplier: string;
  paymentTerms?: string;
  modeOfPayment?: string;
  nextPaymentDate?: string;
  dueDate?: string;
  invoiceAmount: string | number;
  totalPaid?: string | number;
  balance?: string | number;
  status: string;
  payments?: Array<{
    id?: string;
    amountPaid: string | number;
    paymentDate: string;
    modeOfPayment?: string;
    notes?: string | null;
  }>;
}

export interface ReceivingReportPdfData {
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  deliveryStatus: string;
  batchNumber: string;
  quantityDelivered: number | string;
  expirationDate: string;
  expiryStatus: string;
  notes?: string;
  items?: Array<{
    product: string;
    sku?: string;
    batchNumber?: string;
    expirationDate?: string;
    quantityDelivered: number | string;
  }>;
}

function pdfSafeText(input: unknown): string {
  return String(input ?? "")
    .replace(/[\\()]/g, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount || 0));
  return `PHP ${isNaN(num) ? "0.00" : num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildInvoicePdf(invoice: InvoicePdfData): Uint8Array {
  const generatedAt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;

  const commands: string[] = [];

  // Top Dark Header Banner
  commands.push(
    `0.09 0.11 0.14 rg`,
    `${marginX} ${pageHeight - 96} ${contentWidth} 58 re f`,
    `1 1 1 rg`,
    `BT /F2 15 Tf ${marginX + 16} ${pageHeight - 64} Td (${pdfSafeText("MEDPRIX PHARMACY")}) Tj ET`,
    `0.78 0.82 0.88 rg`,
    `BT /F2 10 Tf ${marginX + 16} ${pageHeight - 82} Td (${pdfSafeText("PURCHASE INVOICE STATEMENT")}) Tj ET`,
    `BT /F1 8.5 Tf ${marginX + 320} ${pageHeight - 64} Td (${pdfSafeText(`Generated: ${generatedAt}`)}) Tj ET`,
    `BT /F1 8.5 Tf ${marginX + 320} ${pageHeight - 80} Td (${pdfSafeText(`Status: ${invoice.status.toUpperCase()}`)}) Tj ET`,
  );

  // Invoice & Supplier Metadata Cards (2 Columns)
  const metaY = pageHeight - 170;
  const metaHeight = 62;
  const colWidth = (contentWidth - 12) / 2;

  // Left card: Invoice Information
  commands.push(
    `0.96 0.97 0.98 rg`,
    `0.85 0.87 0.90 RG 0.8 w`,
    `${marginX} ${metaY} ${colWidth} ${metaHeight} re B`,
    `0.42 0.45 0.50 rg`,
    `BT /F2 8 Tf ${marginX + 12} ${metaY + 46} Td (${pdfSafeText("INVOICE DETAILS")}) Tj ET`,
    `0.09 0.11 0.14 rg`,
    `BT /F2 11 Tf ${marginX + 12} ${metaY + 28} Td (${pdfSafeText(`Invoice #: ${invoice.invoiceNumber}`)}) Tj ET`,
    `0.35 0.38 0.42 rg`,
    `BT /F1 9 Tf ${marginX + 12} ${metaY + 12} Td (${pdfSafeText(`Purchase Order: ${invoice.poNumber || "N/A"}`)}) Tj ET`,
  );

  // Right card: Supplier Information & Due Date
  const col2X = marginX + colWidth + 12;
  const termsLabel = invoice.paymentTerms || "Net 30";
  const modeLabel = invoice.modeOfPayment || "Bank Transfer";
  const nextPayLabel = invoice.nextPaymentDate || invoice.dueDate || "N/A";
  commands.push(
    `0.96 0.97 0.98 rg`,
    `0.85 0.87 0.90 RG 0.8 w`,
    `${col2X} ${metaY} ${colWidth} ${metaHeight} re B`,
    `0.42 0.45 0.50 rg`,
    `BT /F2 8 Tf ${col2X + 12} ${metaY + 46} Td (${pdfSafeText("SUPPLIER, TERMS & NEXT PAYMENT")}) Tj ET`,
    `0.09 0.11 0.14 rg`,
    `BT /F2 11 Tf ${col2X + 12} ${metaY + 28} Td (${pdfSafeText(invoice.supplier)}) Tj ET`,
    `0.35 0.38 0.42 rg`,
    `BT /F1 8.5 Tf ${col2X + 12} ${metaY + 12} Td (${pdfSafeText(`${termsLabel} | Mode: ${modeLabel} | Next: ${nextPayLabel}`)}) Tj ET`,
  );

  // 3 Financial Summary Cards (Total Amount, Paid, Balance)
  const finY = metaY - 60;
  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const cardHeight = 48;

  const summaryCards = [
    { label: "TOTAL INVOICE AMOUNT", value: formatCurrency(invoice.invoiceAmount) },
    { label: "TOTAL PAID", value: formatCurrency(invoice.totalPaid ?? 0) },
    { label: "CURRENT BALANCE", value: formatCurrency(invoice.balance ?? invoice.invoiceAmount) },
  ];

  summaryCards.forEach((c, idx) => {
    const cx = marginX + idx * (cardWidth + cardGap);
    commands.push(
      `0.96 0.97 0.98 rg`,
      `0.85 0.87 0.90 RG 0.8 w`,
      `${cx.toFixed(2)} ${finY} ${cardWidth.toFixed(2)} ${cardHeight} re B`,
      `0.42 0.45 0.50 rg`,
      `BT /F2 7.5 Tf ${(cx + 12).toFixed(2)} ${finY + 31} Td (${pdfSafeText(c.label)}) Tj ET`,
      `0.09 0.11 0.14 rg`,
      `BT /F2 12 Tf ${(cx + 12).toFixed(2)} ${finY + 13} Td (${pdfSafeText(c.value)}) Tj ET`,
    );
  });

  // Payment History Section
  let tableY = finY - 36;
  commands.push(
    `0.09 0.11 0.14 rg`,
    `BT /F2 11 Tf ${marginX} ${tableY} Td (${pdfSafeText("PAYMENT HISTORY")}) Tj ET`,
  );

  tableY -= 18;

  // Table Header
  const colDateW = 120;
  const colRefW = 230;
  const colAmtW = contentWidth - colDateW - colRefW;

  commands.push(
    `0.92 0.94 0.96 rg`,
    `${marginX} ${tableY - 4} ${contentWidth} 20 re f`,
    `0.25 0.28 0.32 rg`,
    `BT /F2 8.5 Tf ${marginX + 8} ${tableY + 2} Td (${pdfSafeText("PAYMENT DATE")}) Tj ET`,
    `BT /F2 8.5 Tf ${marginX + colDateW + 8} ${tableY + 2} Td (${pdfSafeText("REFERENCE / NOTES")}) Tj ET`,
    `BT /F2 8.5 Tf ${marginX + colDateW + colRefW + 8} ${tableY + 2} Td (${pdfSafeText("AMOUNT PAID")}) Tj ET`,
    `0.80 0.83 0.86 RG 0.6 w`,
    `${marginX} ${tableY - 4} m ${marginX + contentWidth} ${tableY - 4} l S`,
  );

  tableY -= 22;

  const payments = invoice.payments || [];
  if (payments.length === 0) {
    commands.push(
      `0.50 0.53 0.57 rg`,
      `BT /F1 9 Tf ${marginX + 8} ${tableY} Td (${pdfSafeText("No payments recorded yet for this invoice.")}) Tj ET`,
      `0.88 0.90 0.92 RG 0.5 w`,
      `${marginX} ${tableY - 6} m ${marginX + contentWidth} ${tableY - 6} l S`,
    );
    tableY -= 20;
  } else {
    payments.forEach((p, idx) => {
      const bg = idx % 2 === 1 ? `0.98 0.98 0.99 rg ${marginX} ${tableY - 5} ${contentWidth} 18 re f ` : "";
      if (bg) commands.push(bg);
      commands.push(
        `0.15 0.18 0.22 rg`,
        `BT /F1 9 Tf ${marginX + 8} ${tableY} Td (${pdfSafeText(p.paymentDate || "N/A")}) Tj ET`,
        `BT /F1 9 Tf ${marginX + colDateW + 8} ${tableY} Td (${pdfSafeText(p.notes || "Supplier settlement")}) Tj ET`,
        `0.09 0.11 0.14 rg`,
        `BT /F2 9 Tf ${marginX + colDateW + colRefW + 8} ${tableY} Td (${pdfSafeText(formatCurrency(p.amountPaid))}) Tj ET`,
        `0.88 0.90 0.92 RG 0.5 w`,
        `${marginX} ${tableY - 5} m ${marginX + contentWidth} ${tableY - 5} l S`,
      );
      tableY -= 20;
    });
  }

  // Footer Note
  commands.push(
    `0.55 0.58 0.62 rg`,
    `BT /F1 8 Tf ${marginX} 40 Td (${pdfSafeText("Medprix Pharmacy - Official Procurement & Accounts Payable Statement")}) Tj ET`,
    `BT /F1 8 Tf ${marginX + 380} 40 Td (${pdfSafeText(`Page 1 of 1`)}) Tj ET`,
  );

  // Assemble PDF Structure
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const offsets: number[] = [];

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  const startObj = (id: number) => {
    offsets[id] = byteLength;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr("endobj\n");
  };

  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  // 1: Catalog
  startObj(1);
  pushStr("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  // 2: Pages
  startObj(2);
  pushStr("<< /Type /Pages /Kids [5 0 R] /Count 1 >>\n");
  endObj();

  // 3: Font F1 (Helvetica)
  startObj(3);
  pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n");
  endObj();

  // 4: Font F2 (Helvetica-Bold)
  startObj(4);
  pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n");
  endObj();

  // 5: Page
  startObj(5);
  pushStr(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>\n`,
  );
  endObj();

  // 6: Contents
  const streamBody = commands.join("\n");
  const streamBytes = encoder.encode(streamBody);
  startObj(6);
  pushStr(`<< /Length ${streamBytes.length} >>\nstream\n`);
  chunks.push(streamBytes);
  byteLength += streamBytes.length;
  pushStr("\nendstream\n");
  endObj();

  // Cross-reference table
  const totalObjects = 6;
  const xrefOffset = byteLength;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let id = 1; id <= totalObjects; id++) {
    pushStr(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const output = new Uint8Array(byteLength);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }
  return output;
}

export function downloadInvoicePdf(invoice: InvoicePdfData): void {
  const bytes = buildInvoicePdf(invoice);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Invoice-${invoice.invoiceNumber || "Statement"}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildReceivingReportPdf(report: ReceivingReportPdfData): Uint8Array {
  const generatedAt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;
  const commands: string[] = [];

  commands.push(
    `0.09 0.11 0.14 rg`,
    `${marginX} ${pageHeight - 96} ${contentWidth} 58 re f`,
    `1 1 1 rg`,
    `BT /F2 15 Tf ${marginX + 16} ${pageHeight - 64} Td (${pdfSafeText("MEDPRIX PHARMACY")}) Tj ET`,
    `0.78 0.82 0.88 rg`,
    `BT /F2 10 Tf ${marginX + 16} ${pageHeight - 82} Td (${pdfSafeText("RECEIVING REPORT STATEMENT")}) Tj ET`,
    `BT /F1 8.5 Tf ${marginX + 320} ${pageHeight - 64} Td (${pdfSafeText(`Generated: ${generatedAt}`)}) Tj ET`,
    `BT /F1 8.5 Tf ${marginX + 320} ${pageHeight - 80} Td (${pdfSafeText(`Status: ${report.deliveryStatus.toUpperCase()}`)}) Tj ET`,
  );

  const metaY = pageHeight - 170;
  const metaHeight = 62;
  const colWidth = (contentWidth - 12) / 2;

  commands.push(
    `0.96 0.97 0.98 rg`,
    `0.85 0.87 0.90 RG 0.8 w`,
    `${marginX} ${metaY} ${colWidth} ${metaHeight} re B`,
    `0.42 0.45 0.50 rg`,
    `BT /F2 8 Tf ${marginX + 12} ${metaY + 46} Td (${pdfSafeText("PURCHASE ORDER & SUPPLIER")}) Tj ET`,
    `0.09 0.11 0.14 rg`,
    `BT /F2 11 Tf ${marginX + 12} ${metaY + 28} Td (${pdfSafeText(`PO #: ${report.poNumber}`)}) Tj ET`,
    `0.35 0.38 0.42 rg`,
    `BT /F1 9 Tf ${marginX + 12} ${metaY + 12} Td (${pdfSafeText(`Supplier: ${report.supplier}`)}) Tj ET`,
  );

  const col2X = marginX + colWidth + 12;
  commands.push(
    `0.96 0.97 0.98 rg`,
    `0.85 0.87 0.90 RG 0.8 w`,
    `${col2X} ${metaY} ${colWidth} ${metaHeight} re B`,
    `0.42 0.45 0.50 rg`,
    `BT /F2 8 Tf ${col2X + 12} ${metaY + 46} Td (${pdfSafeText("DELIVERY & BATCH SUMMARY")}) Tj ET`,
    `0.09 0.11 0.14 rg`,
    `BT /F2 11 Tf ${col2X + 12} ${metaY + 28} Td (${pdfSafeText(`Batch: ${report.batchNumber} (${report.quantityDelivered} units)`)}) Tj ET`,
    `0.35 0.38 0.42 rg`,
    `BT /F1 9 Tf ${col2X + 12} ${metaY + 12} Td (${pdfSafeText(`Delivered: ${report.deliveryDate}  |  Expiry: ${report.expirationDate} (${report.expiryStatus})`)}) Tj ET`,
  );

  const noteY = metaY - 56;
  commands.push(
    `0.96 0.97 0.98 rg`,
    `0.85 0.87 0.90 RG 0.8 w`,
    `${marginX} ${noteY} ${contentWidth} 44 re B`,
    `0.42 0.45 0.50 rg`,
    `BT /F2 8 Tf ${marginX + 12} ${noteY + 28} Td (${pdfSafeText("NOTES & REMARKS")}) Tj ET`,
    `0.09 0.11 0.14 rg`,
    `BT /F1 9.5 Tf ${marginX + 12} ${noteY + 12} Td (${pdfSafeText(report.notes || "No notes recorded.")}) Tj ET`,
  );

  let tableY = noteY - 34;
  commands.push(
    `0.09 0.11 0.14 rg`,
    `BT /F2 11 Tf ${marginX} ${tableY} Td (${pdfSafeText("DELIVERED ITEMS")}) Tj ET`,
  );
  tableY -= 18;

  commands.push(
    `0.92 0.94 0.96 rg`,
    `${marginX} ${tableY - 4} ${contentWidth} 20 re f`,
    `0.25 0.28 0.32 rg`,
    `BT /F2 8.5 Tf ${marginX + 8} ${tableY + 2} Td (${pdfSafeText("PRODUCT")}) Tj ET`,
    `BT /F2 8.5 Tf ${marginX + 210} ${tableY + 2} Td (${pdfSafeText("BATCH NUMBER")}) Tj ET`,
    `BT /F2 8.5 Tf ${marginX + 340} ${tableY + 2} Td (${pdfSafeText("EXPIRATION")}) Tj ET`,
    `BT /F2 8.5 Tf ${marginX + 435} ${tableY + 2} Td (${pdfSafeText("QTY")}) Tj ET`,
    `0.80 0.83 0.86 RG 0.6 w`,
    `${marginX} ${tableY - 4} m ${marginX + contentWidth} ${tableY - 4} l S`,
  );
  tableY -= 22;

  const items = report.items && report.items.length > 0
    ? report.items
    : [{
        product: "Order Delivery Batch",
        batchNumber: report.batchNumber,
        expirationDate: report.expirationDate,
        quantityDelivered: report.quantityDelivered,
      }];

  items.forEach((item, idx) => {
    const bg = idx % 2 === 1 ? `0.98 0.98 0.99 rg ${marginX} ${tableY - 5} ${contentWidth} 18 re f ` : "";
    if (bg) commands.push(bg);
    commands.push(
      `0.15 0.18 0.22 rg`,
      `BT /F1 9 Tf ${marginX + 8} ${tableY} Td (${pdfSafeText(item.product || "Item")}) Tj ET`,
      `BT /F1 9 Tf ${marginX + 210} ${tableY} Td (${pdfSafeText(item.batchNumber || report.batchNumber)}) Tj ET`,
      `BT /F1 9 Tf ${marginX + 340} ${tableY} Td (${pdfSafeText(item.expirationDate || report.expirationDate)}) Tj ET`,
      `0.09 0.11 0.14 rg`,
      `BT /F2 9 Tf ${marginX + 435} ${tableY} Td (${pdfSafeText(`${item.quantityDelivered} units`)}) Tj ET`,
      `0.88 0.90 0.92 RG 0.5 w`,
      `${marginX} ${tableY - 5} m ${marginX + contentWidth} ${tableY - 5} l S`,
    );
    tableY -= 20;
  });

  commands.push(
    `0.55 0.58 0.62 rg`,
    `BT /F1 8 Tf ${marginX} 40 Td (${pdfSafeText("Medprix Pharmacy - Official Receiving Report Statement")}) Tj ET`,
    `BT /F1 8 Tf ${marginX + 380} 40 Td (${pdfSafeText(`Page 1 of 1`)}) Tj ET`,
  );

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const offsets: number[] = [];

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    byteLength += bytes.length;
  };
  const startObj = (id: number) => {
    offsets[id] = byteLength;
    pushStr(`${id} 0 obj\n`);
  };
  const endObj = () => {
    pushStr("endobj\n");
  };

  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  startObj(1);
  pushStr("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();
  startObj(2);
  pushStr("<< /Type /Pages /Kids [5 0 R] /Count 1 >>\n");
  endObj();
  startObj(3);
  pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n");
  endObj();
  startObj(4);
  pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n");
  endObj();
  startObj(5);
  pushStr(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>\n`,
  );
  endObj();
  const streamBody = commands.join("\n");
  const streamBytes = encoder.encode(streamBody);
  startObj(6);
  pushStr(`<< /Length ${streamBytes.length} >>\nstream\n`);
  chunks.push(streamBytes);
  byteLength += streamBytes.length;
  pushStr("\nendstream\n");
  endObj();

  const totalObjects = 6;
  const xrefOffset = byteLength;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let id = 1; id <= totalObjects; id++) {
    pushStr(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const output = new Uint8Array(byteLength);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }
  return output;
}

export function downloadReceivingReportPdf(report: ReceivingReportPdfData): void {
  const bytes = buildReceivingReportPdf(report);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Receiving-Report-${report.poNumber || "Statement"}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
