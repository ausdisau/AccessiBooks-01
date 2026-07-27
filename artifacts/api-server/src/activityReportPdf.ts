/**
 * Task #116 — server-side PDF rendering of the user activity report.
 *
 * PARITY CONTRACT: `renderActivityReportPdf` accepts the exact same params as
 * `renderActivityReportHtml` (userActivity.ts) and must present the same
 * sections, disclaimers, and empty states. Both routes assemble data once via
 * `buildReport`, so consent/date bounding is inherited — never query extra
 * data here. No PII beyond what the HTML report already shows.
 *
 * Renderer: pdfkit (pure JS, no headless browser). It is EXTERNALIZED in
 * build.mjs because it reads its built-in AFM font data from disk at runtime,
 * which esbuild bundling would break. Standard fonts are WinAnsi-encoded, so
 * all text passes through `safe()` — unencodable characters (e.g. emoji in a
 * book title) become "?" instead of throwing.
 */

import PDFDocument from "pdfkit";
import {
  OUTCOME_TAG_LABELS,
  GOAL_METRIC_LABELS,
  GOAL_METRIC_UNITS,
  GOAL_PERIOD_LABELS,
  type OutcomeTag,
  type UserActivityEvent,
} from "@workspace/db";
// Circular import with userActivity (it imports renderActivityReportPdf). Safe: only
// hoisted function declarations are consumed, at request time. Keep it that way — no
// top-level value initialization may cross this boundary in either direction.
import {
  summarize,
  formatDuration,
  type BookProgress,
  type GoalProgress,
} from "./userActivity";

type Doc = InstanceType<typeof PDFDocument>;

export interface ActivityReportParams {
  displayName: string;
  from: Date;
  to: Date;
  events: UserActivityEvent[];
  audience: "self" | "caregiver";
  caregiverLabel?: string | null;
  progress?: BookProgress[];
  goals?: GoalProgress[];
}

// A4 geometry
const M = 50;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - M;

// CP1252 extras that ARE encodable beyond Latin-1 (curly quotes, dashes, etc.)
const WINANSI_EXTRA = new Set(
  "\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178".split(
    "",
  ),
);

/** Replace characters the WinAnsi-encoded standard fonts cannot render. */
function safe(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      WINANSI_EXTRA.has(ch)
    ) {
      out += ch;
    } else if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += " ";
    } else {
      out += "?";
    }
  }
  return out;
}

function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > BOTTOM) doc.addPage();
}

function heading(doc: Doc, text: string): void {
  ensureSpace(doc, 46);
  doc.moveDown(0.9);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#111111")
    .text(safe(text), M, doc.y, { width: CONTENT_W });
  const y = doc.y + 2;
  doc.moveTo(M, y).lineTo(M + CONTENT_W, y).strokeColor("#dddddd").lineWidth(0.5).stroke();
  doc.y = y + 7;
  doc.x = M;
}

function metaText(doc: Doc, text: string, opts: { italic?: boolean } = {}): void {
  ensureSpace(doc, 24);
  doc
    .font(opts.italic ? "Helvetica-Oblique" : "Helvetica")
    .fontSize(9)
    .fillColor("#555555")
    .text(safe(text), M, doc.y, { width: CONTENT_W });
  doc.x = M;
  doc.moveDown(0.3);
}

const PREAMBLE_BODY =
  "This is a plain-language summary of how the user used AccessiBooks during the period above. " +
  "It is generated from the user's own activity log and shows listening time, transcript use, " +
  "accessibility-feature use, and any outcome tags the user assigned. " +
  "It is not a clinical assessment, NDIS plan, or proof of any specific outcome \u2014 " +
  "it is a record of platform use that the user (or a person they have authorised) can " +
  "consider alongside other evidence.";

function preambleBox(doc: Doc): void {
  const pad = 10;
  const textW = CONTENT_W - 4 - pad * 2;
  doc.fontSize(9.5);
  doc.font("Helvetica-Bold");
  const labelH = doc.heightOfString("About this report.", { width: textW });
  doc.font("Helvetica");
  const bodyH = doc.heightOfString(PREAMBLE_BODY, { width: textW });
  const boxH = labelH + bodyH + pad * 2 + 2;
  ensureSpace(doc, boxH + 12);
  const x = M;
  const y = doc.y;
  doc.save();
  doc.rect(x, y, CONTENT_W, boxH).fill("#f8f8f8");
  doc.rect(x, y, 4, boxH).fill("#4f7cff");
  doc.restore();
  doc
    .fillColor("#111111")
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text("About this report.", x + 4 + pad, y + pad, { width: textW });
  doc.font("Helvetica").text(PREAMBLE_BODY, x + 4 + pad, doc.y + 1, { width: textW });
  doc.y = y + boxH;
  doc.x = M;
  doc.moveDown(1);
}

function statGrid(doc: Doc, stats: { label: string; value: string }[]): void {
  const gap = 10;
  const cols = 2;
  const boxW = (CONTENT_W - gap) / cols;
  const boxH = 52;
  const rows = Math.ceil(stats.length / cols);
  ensureSpace(doc, rows * (boxH + gap));
  const startY = doc.y;
  stats.forEach((st, i) => {
    const cx = M + (i % cols) * (boxW + gap);
    const cy = startY + Math.floor(i / cols) * (boxH + gap);
    doc.rect(cx, cy, boxW, boxH).strokeColor("#dddddd").lineWidth(0.7).stroke();
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#555555")
      .text(safe(st.label), cx + 10, cy + 9, { width: boxW - 20 });
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor("#111111")
      .text(safe(st.value), cx + 10, cy + 24, { width: boxW - 20 });
  });
  doc.y = startY + rows * boxH + (rows - 1) * gap;
  doc.x = M;
  doc.moveDown(0.5);
}

function drawTable(
  doc: Doc,
  cols: { header: string; width: number }[],
  rows: string[][],
  opts: { caption?: string; emptyText?: string } = {},
): void {
  if (opts.caption) metaText(doc, opts.caption);
  const cellPad = 5;
  const headerH = 18;

  const drawHeader = () => {
    ensureSpace(doc, headerH + 24);
    const y = doc.y;
    doc.rect(M, y, CONTENT_W, headerH).fill("#f5f5f5");
    doc.fillColor("#111111").font("Helvetica-Bold").fontSize(9);
    let x = M;
    for (const c of cols) {
      doc.text(safe(c.header), x + cellPad, y + 5, { width: c.width - cellPad * 2 });
      x += c.width;
    }
    doc.y = y + headerH;
    doc.x = M;
  };

  drawHeader();

  if (!rows.length) {
    if (opts.emptyText) {
      const y = doc.y;
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor("#555555")
        .text(safe(opts.emptyText), M + cellPad, y + 5, { width: CONTENT_W - cellPad * 2 });
      doc.y += 8;
      doc.x = M;
    }
    doc.moveDown(0.5);
    return;
  }

  doc.font("Helvetica").fontSize(9).fillColor("#111111");
  for (const row of rows) {
    const rowH =
      Math.max(
        ...row.map((cell, i) =>
          doc.heightOfString(safe(cell) || " ", { width: cols[i].width - cellPad * 2 }),
        ),
      ) +
      cellPad * 2 -
      2;
    if (doc.y + rowH > BOTTOM) {
      doc.addPage();
      drawHeader();
      doc.font("Helvetica").fontSize(9).fillColor("#111111");
    }
    const y = doc.y;
    let x = M;
    row.forEach((cell, i) => {
      doc.text(safe(cell), x + cellPad, y + cellPad - 1, { width: cols[i].width - cellPad * 2 });
      x += cols[i].width;
    });
    doc
      .moveTo(M, y + rowH)
      .lineTo(M + CONTENT_W, y + rowH)
      .strokeColor("#eeeeee")
      .lineWidth(0.5)
      .stroke();
    doc.y = y + rowH;
    doc.x = M;
    doc.font("Helvetica").fontSize(9).fillColor("#111111");
  }
  doc.moveDown(0.6);
}

function bulletList(doc: Doc, items: string[]): void {
  doc.font("Helvetica").fontSize(9.5).fillColor("#111111");
  for (const item of items) {
    const text = safe(item);
    const h = doc.heightOfString(text, { width: CONTENT_W - 14 });
    ensureSpace(doc, h + 8);
    const y0 = doc.y;
    doc.text("\u2022", M + 2, y0);
    doc.text(text, M + 14, y0, { width: CONTENT_W - 14 });
    doc.y = y0 + h + 4;
    doc.x = M;
  }
}

function goalsSection(doc: Doc, goals: GoalProgress[]): void {
  heading(doc, "Goals & progress");
  if (!goals.length) {
    metaText(
      doc,
      "No goals have been set, or there isn't enough completed activity in this date range to show goal trends.",
      { italic: true },
    );
    return;
  }
  metaText(
    doc,
    "Progress toward goals set by the user or their caregiver, over complete weeks or months within this date range.",
  );
  for (const g of goals) {
    const metricLabel = GOAL_METRIC_LABELS[g.metric] ?? g.metric;
    const unit = GOAL_METRIC_UNITS[g.metric] ?? "";
    const periodWord = GOAL_PERIOD_LABELS[g.period] ?? g.period;
    const periodNoun = g.period === "week" ? "weeks" : "months";
    ensureSpace(doc, 72);
    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#111111")
      .text(safe(`${metricLabel} \u2014 ${g.target} ${unit} ${periodWord}`), M, doc.y, {
        width: CONTENT_W,
      });
    doc.x = M;
    if (!g.trend.length) {
      metaText(doc, `Not enough completed ${periodNoun} in this date range to show a trend.`, {
        italic: true,
      });
      continue;
    }
    metaText(doc, `Met target in ${g.metPeriods} of ${g.totalPeriods} ${periodNoun}.`);
    drawTable(
      doc,
      [
        { header: "Period", width: 195 },
        { header: "Actual", width: 100 },
        { header: "Target", width: 100 },
        { header: "Status", width: 100 },
      ],
      g.trend.map((t) => [
        t.label,
        `${t.actual} ${unit}`.trim(),
        `${t.target} ${unit}`.trim(),
        t.met ? "Met" : "Not met",
      ]),
    );
  }
}

function drawReport(doc: Doc, params: ActivityReportParams): void {
  const {
    displayName,
    from,
    to,
    events,
    audience,
    caregiverLabel,
    progress = [],
    goals = [],
  } = params;
  const s = summarize(events);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#111111").text("My Activity Report", M, doc.y, {
    width: CONTENT_W,
  });
  doc.x = M;
  doc.moveDown(0.2);
  const metaParts = [displayName, `${fmtDate(from)} \u2013 ${fmtDate(to)}`];
  if (audience === "caregiver" && caregiverLabel) metaParts.push(`Shared with: ${caregiverLabel}`);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#555555")
    .text(safe(metaParts.join(" \u00B7 ")), M, doc.y, { width: CONTENT_W });
  doc.x = M;
  doc.moveDown(0.9);

  preambleBox(doc);

  heading(doc, "At a glance");
  statGrid(doc, [
    { label: "Total listening / reading", value: formatDuration(s.totalListenSeconds) },
    { label: "Transcript opens", value: String(s.transcriptOpens) },
    { label: "Accessibility adjustments", value: String(s.accessibilityChanges) },
    { label: "Logged events", value: String(s.totalEvents) },
  ]);

  goalsSection(doc, goals);

  heading(doc, "Outcome tags");
  drawTable(
    doc,
    [
      { header: "Outcome", width: 345 },
      { header: "Sessions tagged", width: 150 },
    ],
    Object.entries(s.byTag).map(([t, c]) => [
      OUTCOME_TAG_LABELS[t as OutcomeTag] ?? t,
      String(c),
    ]),
    {
      caption: "Tags assigned by the user, from a fixed vocabulary.",
      emptyText: "No outcome tags assigned in this period.",
    },
  );

  heading(doc, "Per book");
  drawTable(
    doc,
    [
      { header: "Title", width: 285 },
      { header: "Sessions", width: 90 },
      { header: "Time", width: 120 },
    ],
    [...s.perBook]
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 25)
      .map((b) => [b.title ?? b.bookId, String(b.sessions), formatDuration(b.seconds)]),
    { emptyText: "No book sessions in this period." },
  );

  heading(doc, "Per-book progress");
  drawTable(
    doc,
    [
      { header: "Title", width: 225 },
      { header: "Progress", width: 70 },
      { header: "Status", width: 90 },
      { header: "Last played", width: 110 },
    ],
    progress.slice(0, 25).map((p) => [
      p.title ?? p.bookId,
      p.percent != null ? `${p.percent}%` : "\u2014",
      p.completed ? "Completed" : p.percent != null ? "In progress" : "Started",
      p.lastPlayedAt
        ? p.lastPlayedAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "\u2014",
    ]),
    {
      caption: "Progress is read from your overall listening history, not just this date range.",
      emptyText: "No per-book progress recorded.",
    },
  );

  heading(doc, "What this report is and isn't");
  bulletList(doc, [
    "It only includes activity recorded after the user opted in.",
    "Outcome tags reflect the user's own framing \u2014 they are not clinical judgements.",
    "Disabling activity tracking stops new collection. The user can wipe all stored events at any time.",
    "No additional disability-related data or PII is collected by this report.",
  ]);
}

/** Render the activity report as a PDF buffer. Same content as the HTML report. */
export function renderActivityReportPdf(params: ActivityReportParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: M, bottom: M, left: M, right: M },
      info: { Title: "My Activity Report \u2014 AccessiBooks" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      drawReport(doc, params);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
