/**
 * Minimal A4 PDF writer for Medprix business documents (purchase order, receiving report,
 * supplier invoice record, payment advice). No dependencies: standard Helvetica fonts,
 * automatic text wrapping and page breaks. Peso amounts print as "PHP" because the
 * standard PDF fonts have no peso sign.
 */
export type PdfColumn = { label: string; width: number; align?: "left" | "right" };
export type PdfDocument = {
  title: string;
  number: string;
  date: string;
  pharmacy: { name: string; lines: string[] };
  boxes?: { heading: string; lines: string[] }[];
  table?: { columns: PdfColumn[]; rows: string[][]; totals?: [string, string][] };
  extraTables?: { heading: string; columns: PdfColumn[]; rows: string[][] }[];
  paragraphs?: string[];
  callout?: string;
  signatures?: { name: string; role: string }[];
  footer: string;
};

const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 48, CONTENT_W = PAGE_W - MARGIN * 2;

// Helvetica advance widths (per 1000 em) for printable ASCII; enough for wrapping and right alignment.
const HELV = "278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584".split(",").map(Number);
const HELV_B = "278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584".split(",").map(Number);

export function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/₱\s?/g, "PHP ")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/·/g, "-")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
}
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? HELV_B : HELV;
  let w = 0;
  for (const ch of text) w += table[ch.charCodeAt(0) - 32] ?? 556;
  return (w * size) / 1000;
}
function wrap(text: string, size: number, width: number, bold = false): string[] {
  const words = pdfText(text).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, bold) <= width || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function buildDocumentPdf(doc: PdfDocument): Uint8Array {
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = 0;
  const color = (r: number, g: number, b: number) => ops.push(`${r} ${g} ${b} rg`);
  const stroke = (r: number, g: number, b: number) => ops.push(`${r} ${g} ${b} RG`);
  const text = (x: number, yy: number, value: string, size: number, bold = false, align: "left" | "right" = "left", width = 0) => {
    const clean = pdfText(value);
    const xx = align === "right" ? x + width - textWidth(clean, size, bold) : x;
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${xx.toFixed(2)} ${yy.toFixed(2)} Td (${escape(clean)}) Tj ET`);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, w = 0.6) => ops.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);

  const newPage = (first: boolean) => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = PAGE_H - MARGIN;
    if (first) {
      color(0.08, 0.08, 0.09);
      text(MARGIN, y - 18, doc.pharmacy.name, 15, true);
      color(0.29, 0.29, 0.32);
      doc.pharmacy.lines.forEach((l, i) => text(MARGIN, y - 34 - i * 12, l, 9));
      color(0.08, 0.08, 0.09);
      text(MARGIN, y - 18, doc.title.toUpperCase(), 17, true, "right", CONTENT_W);
      text(MARGIN, y - 34, doc.number, 10, true, "right", CONTENT_W);
      color(0.29, 0.29, 0.32);
      text(MARGIN, y - 47, `Date: ${doc.date}`, 9, false, "right", CONTENT_W);
      y -= Math.max(60, 40 + doc.pharmacy.lines.length * 12) + 10;
      stroke(0.85, 0.85, 0.87); line(MARGIN, y, PAGE_W - MARGIN, y);
      y -= 18;
    } else {
      color(0.29, 0.29, 0.32);
      text(MARGIN, y - 10, `${doc.title} ${doc.number} (continued)`, 9, true);
      y -= 28;
    }
  };
  const ensure = (needed: number) => { if (y - needed < MARGIN + 30) newPage(false); };

  newPage(true);

  // Info boxes, two per row.
  const boxes = doc.boxes ?? [];
  for (let i = 0; i < boxes.length; i += 2) {
    const pair = boxes.slice(i, i + 2);
    const boxW = (CONTENT_W - 14) / 2;
    const wrapped = pair.map(b => b.lines.flatMap(l => wrap(l, 9, boxW - 20)));
    const h = 26 + Math.max(...wrapped.map(w => w.length)) * 12 + 8;
    ensure(h + 10);
    pair.forEach((box, j) => {
      const x = MARGIN + j * (boxW + 14);
      stroke(0.84, 0.84, 0.86); ops.push(`0.8 w ${x} ${y - h} ${boxW} ${h} re S`);
      color(0.37, 0.37, 0.41); text(x + 10, y - 16, box.heading.toUpperCase(), 7.5, true);
      color(0.08, 0.08, 0.09);
      wrapped[j]!.forEach((l, k) => text(x + 10, y - 30 - k * 12, l, 9));
    });
    y -= h + 14;
  }

  const drawTable = (columns: PdfColumn[], rows: string[][], totals?: [string, string][], heading?: string) => {
    const scale = CONTENT_W / columns.reduce((s, c) => s + c.width, 0);
    const widths = columns.map(c => c.width * scale);
    const header = () => {
      ensure(40);
      if (heading) { color(0.08, 0.08, 0.09); text(MARGIN, y - 10, heading, 10, true); y -= 18; }
      color(0.08, 0.08, 0.09); ops.push(`${MARGIN} ${y - 20} ${CONTENT_W} 20 re f`);
      color(1, 1, 1);
      let x = MARGIN;
      columns.forEach((c, i) => { text(x + 6, y - 14, c.label, 8.5, true, c.align ?? "left", widths[i]! - 12); x += widths[i]!; });
      y -= 20;
    };
    header();
    for (const row of rows) {
      const cells = row.map((cell, i) => wrap(cell, 9, widths[i]! - 12));
      const h = Math.max(...cells.map(c => c.length)) * 11 + 9;
      if (y - h < MARGIN + 30) { newPage(false); header(); }
      color(0.08, 0.08, 0.09);
      let x = MARGIN;
      cells.forEach((lines, i) => {
        lines.forEach((l, k) => text(x + 6, y - 13 - k * 11, l, 9, false, columns[i]!.align ?? "left", widths[i]! - 12));
        x += widths[i]!;
      });
      y -= h;
      stroke(0.9, 0.9, 0.92); line(MARGIN, y, PAGE_W - MARGIN, y);
    }
    if (!rows.length) { color(0.37, 0.37, 0.41); text(MARGIN + 6, y - 14, "None", 9); y -= 22; }
    for (const [label, value] of totals ?? []) {
      ensure(18);
      color(0.08, 0.08, 0.09);
      text(MARGIN, y - 15, label, 10, true, "right", CONTENT_W - 120);
      text(MARGIN, y - 15, value, 10, true, "right", CONTENT_W - 6);
      y -= 18;
    }
    y -= 12;
  };
  if (doc.table) drawTable(doc.table.columns, doc.table.rows, doc.table.totals);
  for (const t of doc.extraTables ?? []) drawTable(t.columns, t.rows, undefined, t.heading);

  if (doc.callout) {
    const lines = wrap(doc.callout, 9.5, CONTENT_W - 24);
    const h = lines.length * 13 + 16;
    ensure(h + 8);
    color(0.965, 0.965, 0.973); ops.push(`${MARGIN} ${y - h} ${CONTENT_W} ${h} re f`);
    color(0.08, 0.08, 0.09);
    lines.forEach((l, i) => text(MARGIN + 12, y - 18 - i * 13, l, 9.5));
    y -= h + 14;
  }
  for (const p of doc.paragraphs ?? []) {
    const lines = wrap(p, 9, CONTENT_W);
    ensure(lines.length * 12 + 6);
    color(0.29, 0.29, 0.32);
    lines.forEach((l, i) => text(MARGIN, y - 10 - i * 12, l, 9));
    y -= lines.length * 12 + 8;
  }
  if (doc.signatures?.length) {
    ensure(80);
    y -= 30;
    const w = (CONTENT_W - 40) / 2;
    doc.signatures.slice(0, 2).forEach((s, i) => {
      const x = MARGIN + i * (w + 40);
      stroke(0.08, 0.08, 0.09); line(x, y, x + w, y, 0.8);
      color(0.08, 0.08, 0.09); text(x, y - 14, s.name, 9.5, true);
      color(0.37, 0.37, 0.41); text(x, y - 26, s.role, 8.5);
    });
    y -= 36;
  }
  pages.push(ops);

  // Assemble: 1 catalog, 2 pages, 3 F1, 4 F2, then page/content pairs.
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((pageOps, i) => {
    const footer = [`0.54 0.54 0.58 rg`, `BT /F1 8 Tf ${MARGIN} 28 Td (${escape(pdfText(doc.footer))}) Tj ET`,
      `BT /F1 8 Tf ${PAGE_W - MARGIN - textWidth(`Page ${i + 1} of ${pages.length}`, 8)} 28 Td (Page ${i + 1} of ${pages.length}) Tj ET`];
    const stream = [...pageOps, ...footer].join("\n");
    objects[pageIds[i]!] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`;
    objects[pageIds[i]! + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens the PDF in a new tab so it can be printed or shared from the browser's viewer. */
export function openPdf(bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank", "noopener");
  if (!tab) downloadPdf(bytes, "document.pdf");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
