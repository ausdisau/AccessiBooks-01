// Dependency-free PDF generation for NDIS invoices.
//
// Hand-rolled on purpose: the production server is bundled by esbuild and we
// want zero runtime file/native dependencies. Libraries like pdfkit read AFM
// font-metric files from disk at runtime, which breaks inside a single-file
// bundle. This writer emits a single A4 page using the built-in Helvetica /
// Helvetica-Bold fonts (no embedding required) plus simple vector rules.

import type { NdisInvoice } from "@workspace/db";

type RGB = [number, number, number];

// Helvetica advance widths (per 1000 em) for the glyphs used in right-aligned
// currency figures — enough to align the money column precisely.
const CURRENCY_WIDTHS: Record<string, number> = {
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556,
  "7": 556, "8": 556, "9": 556, "$": 556, ".": 278, ",": 278, " ": 278,
  "-": 333, "(": 333, ")": 333, A: 667, U: 722, D: 722, S: 667,
};

function currencyWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += CURRENCY_WIDTHS[ch] ?? 556;
  return (w / 1000) * size;
}

// Approximate width for word-wrapping arbitrary text (Helvetica averages
// ~0.5em). Used only to decide line breaks, not for precise alignment.
function approxWidth(s: string, size: number): number {
  return s.length * size * 0.5;
}

function sanitize(s: string): string {
  return s
    .replace(/[\u2012\u2013\u2014\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, "");
}

class InvoicePdf {
  private ops: string[] = [];
  readonly width = 595.28; // A4 width in points
  readonly height = 841.89; // A4 height in points

  private escape(s: string): string {
    return sanitize(s)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  text(x: number, y: number, s: string, opts: { size?: number; bold?: boolean; color?: RGB } = {}): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? "F2" : "F1";
    const [r, g, b] = opts.color ?? [0, 0, 0];
    this.ops.push(`${r} ${g} ${b} rg`);
    this.ops.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${this.escape(s)}) Tj ET`);
  }

  textRight(xRight: number, y: number, s: string, opts: { size?: number; bold?: boolean; color?: RGB } = {}): void {
    const size = opts.size ?? 10;
    this.text(xRight - currencyWidth(sanitize(s), size), y, s, opts);
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: { width?: number; color?: RGB } = {}): void {
    const w = opts.width ?? 0.5;
    const [r, g, b] = opts.color ?? [0, 0, 0];
    this.ops.push(`${r} ${g} ${b} RG ${w.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  rect(x: number, y: number, w: number, h: number, fill: RGB): void {
    const [r, g, b] = fill;
    this.ops.push(`${r} ${g} ${b} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  /** Word-wrap text to a max width, returning the lines. */
  wrap(s: string, maxWidth: number, size: number): string[] {
    const words = sanitize(s).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (approxWidth(candidate, size) > maxWidth && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = candidate;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  build(): Buffer {
    const content = this.ops.join("\n");
    const objects: string[] = [
      `<< /Type /Catalog /Pages 2 0 R >>`,
      `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width.toFixed(2)} ${this.height.toFixed(2)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    ];

    let pdf = `%PDF-1.4\n`;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(pdf, "latin1"));
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "latin1");
  }
}

export interface InvoiceProvider {
  name: string;
  abn: string;
  email: string;
  website: string;
}

function money(cents: number, currency: string): string {
  return `${currency} $${(cents / 100).toFixed(2)}`;
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const MANAGEMENT_LABELS: Record<string, string> = {
  self_managed: "Self-managed",
  plan_managed: "Plan-managed",
  agency_managed: "NDIA-managed (Agency)",
};

/** Render an NDIS invoice to a PDF Buffer. */
export function renderInvoicePdf(inv: NdisInvoice, provider: InvoiceProvider): Buffer {
  const pdf = new InvoicePdf();
  const M = 50; // page margin
  const right = pdf.width - M;
  const ink: RGB = [0.1, 0.1, 0.12];
  const muted: RGB = [0.45, 0.45, 0.5];
  const accent: RGB = [0.15, 0.35, 0.55];
  let y = pdf.height - M;

  // Header band
  pdf.text(M, y, provider.name, { size: 18, bold: true, color: accent });
  const title = inv.gstCents > 0 ? "TAX INVOICE" : "INVOICE";
  pdf.textRight(right, y, title, { size: 18, bold: true, color: ink });
  y -= 16;
  pdf.text(M, y, `ABN: ${provider.abn}`, { size: 9, color: muted });
  pdf.textRight(right, y, `No. ${inv.invoiceNumber}`, { size: 10, color: ink });
  y -= 12;
  pdf.text(M, y, provider.email, { size: 9, color: muted });
  pdf.textRight(right, y, `Issued: ${fmtDate(inv.issuedAt)}`, { size: 9, color: muted });
  y -= 12;
  pdf.text(M, y, provider.website, { size: 9, color: muted });
  y -= 18;
  pdf.line(M, y, right, y, { width: 1, color: accent });
  y -= 24;

  // Bill-to block
  pdf.text(M, y, "NDIS PARTICIPANT", { size: 9, bold: true, color: muted });
  y -= 14;
  pdf.text(M, y, inv.participantName, { size: 12, bold: true, color: ink });
  y -= 14;
  pdf.text(M, y, `NDIS number: ${inv.ndisNumber}`, { size: 10, color: ink });
  y -= 13;
  pdf.text(M, y, `Plan management: ${MANAGEMENT_LABELS[inv.managementType] ?? inv.managementType}`, { size: 10, color: ink });
  if (inv.planManagerName || inv.planManagerEmail) {
    y -= 13;
    const pm = [inv.planManagerName, inv.planManagerEmail].filter(Boolean).join(" · ");
    pdf.text(M, y, `Plan manager: ${pm}`, { size: 10, color: ink });
  }
  if (inv.serviceStartDate || inv.serviceEndDate) {
    y -= 13;
    const period = inv.serviceStartDate && inv.serviceEndDate && inv.serviceStartDate !== inv.serviceEndDate
      ? `${fmtDate(inv.serviceStartDate)} – ${fmtDate(inv.serviceEndDate)}`
      : fmtDate(inv.serviceStartDate || inv.serviceEndDate);
    pdf.text(M, y, `Service period: ${period}`, { size: 10, color: ink });
  }
  y -= 26;

  // Line-item table header
  const colQty = right - 230;
  const colUnit = right - 120;
  pdf.rect(M, y - 4, right - M, 18, [0.95, 0.96, 0.98]);
  pdf.text(M + 4, y, "Description", { size: 9, bold: true, color: ink });
  pdf.textRight(colQty, y, "Qty", { size: 9, bold: true, color: ink });
  pdf.textRight(colUnit, y, "Unit", { size: 9, bold: true, color: ink });
  pdf.textRight(right - 4, y, "Amount", { size: 9, bold: true, color: ink });
  y -= 22;

  // Line item
  const descLines = pdf.wrap(inv.supportItemName, colQty - M - 12, 10);
  pdf.text(M + 4, y, descLines[0], { size: 10, color: ink });
  pdf.textRight(colQty, y, String(inv.quantity), { size: 10, color: ink });
  pdf.textRight(colUnit, y, money(inv.unitPriceCents, inv.currency).replace(/^[A-Z]+ /, ""), { size: 10, color: ink });
  pdf.textRight(right - 4, y, money(inv.amountCents, inv.currency).replace(/^[A-Z]+ /, ""), { size: 10, color: ink });
  for (let i = 1; i < descLines.length; i++) {
    y -= 12;
    pdf.text(M + 4, y, descLines[i], { size: 10, color: ink });
  }
  if (inv.supportItemNumber) {
    y -= 12;
    pdf.text(M + 4, y, `Support item: ${inv.supportItemNumber}`, { size: 8.5, color: muted });
  }
  if (inv.serviceDescription) {
    for (const ln of pdf.wrap(inv.serviceDescription, colQty - M - 12, 8.5)) {
      y -= 11;
      pdf.text(M + 4, y, ln, { size: 8.5, color: muted });
    }
  }
  y -= 14;
  pdf.line(M, y, right, y, { width: 0.5, color: muted });
  y -= 18;

  // Totals
  const labelX = right - 170;
  pdf.textRight(labelX, y, "Subtotal", { size: 10, color: muted });
  pdf.textRight(right - 4, y, money(inv.amountCents, inv.currency).replace(/^[A-Z]+ /, ""), { size: 10, color: ink });
  y -= 15;
  pdf.textRight(labelX, y, `GST (${inv.gstTreatment})`, { size: 10, color: muted });
  pdf.textRight(right - 4, y, money(inv.gstCents, inv.currency).replace(/^[A-Z]+ /, ""), { size: 10, color: ink });
  y -= 8;
  pdf.line(labelX - 10, y, right, y, { width: 0.5, color: muted });
  y -= 16;
  pdf.text(labelX - 60, y, "TOTAL", { size: 11, bold: true, color: ink });
  pdf.textRight(right - 4, y, money(inv.totalCents, inv.currency), { size: 12, bold: true, color: accent });
  y -= 30;

  // Status line
  const claimLabel: Record<string, string> = {
    unclaimed: "Not yet claimed", submitted: "Submitted", paid: "Reimbursed", rejected: "Rejected",
  };
  pdf.text(M, y, `Invoice status: ${inv.status}    Claim status: ${claimLabel[inv.claimStatus] ?? inv.claimStatus}`, { size: 9, color: muted });

  // Footer disclaimer (anchored near the bottom)
  let fy = M + 40;
  pdf.line(M, fy + 16, right, fy + 16, { width: 0.5, color: [0.85, 0.85, 0.88] });
  const disclaimer = `${provider.name} is not a registered NDIS provider. This invoice is provided to help self-managed and plan-managed participants claim eligible AccessiBooks costs; claimability depends on the participant's individual NDIS plan. Please confirm the correct support item number with your plan manager or the NDIA.`;
  for (const ln of pdf.wrap(disclaimer, right - M, 7.5)) {
    pdf.text(M, fy, ln, { size: 7.5, color: muted });
    fy -= 10;
  }

  return pdf.build();
}
