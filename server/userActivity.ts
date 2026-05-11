/**
 * Task #67 — NDIS-friendly user-facing activity tracking.
 *
 * - Strictly opt-in: writes are no-ops unless the user has set
 *   `accessibilityPreferences.profile.activityTrackingEnabled === true`.
 * - Per-user (separate from anonymised product_events).
 * - Outcome tags are bound to a fixed vocabulary.
 * - Caregiver share is a user-issued read-only token.
 * - One-click data wipe.
 */

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
import {
  accessibilityPreferences,
  userActivityEvents,
  userActivityShares,
  users,
  listeningHistory,
  OUTCOME_TAGS,
  ACTIVITY_EVENT_TYPES,
  OUTCOME_TAG_LABELS,
  ACTIVITY_EVENT_LABELS,
  type A11yProfile,
  type ActivityEventType,
  type OutcomeTag,
  type UserActivityEvent,
} from "@shared/schema";

/**
 * Per-book progress derived from the existing listening_history table.
 * Surfaced in the report alongside session counts so users see real
 * completion state, not just visit counts.
 */
export interface BookProgress {
  bookId: string;
  title: string | null;
  currentTime: number; // seconds
  totalDuration: number | null; // seconds
  percent: number | null; // 0–100, null if duration unknown
  completed: boolean;
  lastPlayedAt: Date | null;
}
import { isAuthenticated } from "./multiAuth";

function userIdFrom(req: Request): string | null {
  const u = (req as any).user;
  return u?.id || u?.claims?.sub || null;
}

async function getProfile(userId: string): Promise<A11yProfile | null> {
  try {
    const [row] = await db
      .select()
      .from(accessibilityPreferences)
      .where(eq(accessibilityPreferences.userId, userId))
      .limit(1);
    return (row?.profile ?? null) as A11yProfile | null;
  } catch {
    return null;
  }
}

async function isOptedIn(userId: string): Promise<boolean> {
  const profile = await getProfile(userId);
  return !!profile?.activityTrackingEnabled;
}

/**
 * Fire-and-forget activity logger. No-ops when the user has not opted in.
 * Safe to call from request handlers — never awaited in the request path.
 */
export function trackUserActivity(
  userId: string | null | undefined,
  eventType: ActivityEventType,
  opts: {
    bookId?: string | null;
    bookTitle?: string | null;
    durationSeconds?: number | null;
  } = {},
): void {
  if (!userId) return;
  (async () => {
    try {
      if (!(await isOptedIn(userId))) return;
      await db.insert(userActivityEvents).values({
        userId,
        eventType,
        bookId: opts.bookId ?? null,
        bookTitle: opts.bookTitle ?? null,
        durationSeconds: opts.durationSeconds ?? null,
        outcomeTag: null,
        note: null,
      });
    } catch (err) {
      console.error("[UserActivity] track error:", (err as Error)?.message);
    }
  })();
}

const tagSchema = z.enum(OUTCOME_TAGS);
const eventTypeSchema = z.enum(ACTIVITY_EVENT_TYPES);

function parseDateRange(req: Request): { from: Date; to: Date } | { error: string } {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const fromRaw = req.query.from as string | undefined;
  const toRaw = req.query.to as string | undefined;
  const from = fromRaw ? new Date(fromRaw) : defaultFrom;
  const to = toRaw ? new Date(toRaw) : now;
  if (isNaN(from.getTime())) return { error: "Invalid 'from' date." };
  if (isNaN(to.getTime())) return { error: "Invalid 'to' date." };
  if (from > to) return { error: "'from' must be on or before 'to'." };
  return { from, to };
}

function summarize(events: UserActivityEvent[]) {
  const byType: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  const byBook: Record<string, { title: string | null; sessions: number; seconds: number }> = {};
  let totalListenSeconds = 0;
  let transcriptOpens = 0;
  let a11yChanges = 0;

  for (const e of events) {
    byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    if (e.outcomeTag) byTag[e.outcomeTag] = (byTag[e.outcomeTag] || 0) + 1;
    if (e.eventType === "playback_session" || e.eventType === "ebook_session") {
      totalListenSeconds += e.durationSeconds ?? 0;
    }
    if (e.eventType === "transcript_opened") transcriptOpens++;
    if (e.eventType === "accessibility_change") a11yChanges++;
    if (e.bookId) {
      const b = byBook[e.bookId] ||= { title: e.bookTitle ?? null, sessions: 0, seconds: 0 };
      if (e.bookTitle && !b.title) b.title = e.bookTitle;
      b.sessions++;
      b.seconds += e.durationSeconds ?? 0;
    }
  }

  return {
    totalEvents: events.length,
    totalListenSeconds,
    transcriptOpens,
    accessibilityChanges: a11yChanges,
    byType,
    byTag,
    perBook: Object.entries(byBook).map(([id, v]) => ({ bookId: id, ...v })),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 minutes";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} minute${m === 1 ? "" : "s"}`;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"}`;
}

export function renderActivityReportHtml(params: {
  displayName: string;
  from: Date;
  to: Date;
  events: UserActivityEvent[];
  audience: "self" | "caregiver";
  caregiverLabel?: string | null;
  progress?: BookProgress[];
}): string {
  const { displayName, from, to, events, audience, caregiverLabel, progress = [] } = params;
  const s = summarize(events);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const tagRows = Object.entries(s.byTag)
    .map(
      ([t, c]) =>
        `<tr><th scope="row">${escapeHtml(OUTCOME_TAG_LABELS[t as OutcomeTag] ?? t)}</th><td>${c}</td></tr>`,
    )
    .join("") ||
    `<tr><td colspan="2"><em>No outcome tags assigned in this period.</em></td></tr>`;

  const bookRows = s.perBook
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 25)
    .map(
      (b) =>
        `<tr><th scope="row">${escapeHtml(b.title ?? b.bookId)}</th><td>${b.sessions}</td><td>${formatDuration(b.seconds)}</td></tr>`,
    )
    .join("") ||
    `<tr><td colspan="3"><em>No book sessions in this period.</em></td></tr>`;

  const progressRows = progress
    .slice(0, 25)
    .map((p) => {
      const pct = p.percent != null ? `${p.percent}%` : "—";
      const status = p.completed ? "Completed" : (p.percent != null ? "In progress" : "Started");
      const lastPlayed = p.lastPlayedAt
        ? p.lastPlayedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "—";
      return `<tr>
        <th scope="row">${escapeHtml(p.title ?? p.bookId)}</th>
        <td>${pct}</td>
        <td>${status}</td>
        <td>${lastPlayed}</td>
      </tr>`;
    })
    .join("") ||
    `<tr><td colspan="4"><em>No per-book progress recorded.</em></td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>My Activity Report — AccessiBooks</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 760px; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.55;
         color: #111; background: #fff; }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  thead th { background: #f5f5f5; }
  .preamble { background: #f8f8f8; border-left: 4px solid #4f7cff; padding: 0.75rem 1rem;
              border-radius: 4px; margin-top: 1rem; font-size: 0.95rem; }
  .meta { color: #555; font-size: 0.9rem; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
               gap: 0.75rem; margin-top: 0.5rem; }
  .stat { border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem; }
  .stat-label { font-size: 0.8rem; color: #555; }
  .stat-value { font-size: 1.4rem; font-weight: 700; }
  .print-btn { margin: 1rem 0; padding: 0.5rem 1rem; border-radius: 6px;
               border: 1px solid #4f7cff; background: #4f7cff; color: white; cursor: pointer; }
  @media print { .print-btn { display: none; } body { margin: 0; max-width: none; } }
</style>
</head>
<body>
  <button class="print-btn" type="button" onclick="window.print()" aria-label="Print or save as PDF">
    Print / Save as PDF
  </button>
  <h1>My Activity Report</h1>
  <p class="meta">
    <strong>${escapeHtml(displayName)}</strong> &middot;
    ${fmtDate(from)} – ${fmtDate(to)}
    ${audience === "caregiver" && caregiverLabel ? ` &middot; Shared with: ${escapeHtml(caregiverLabel)}` : ""}
  </p>

  <section class="preamble" aria-label="About this report">
    <strong>About this report.</strong>
    This is a plain-language summary of how the user used AccessiBooks during the period above.
    It is generated from the user's own activity log and shows listening time, transcript use,
    accessibility-feature use, and any outcome tags the user assigned.
    It is <em>not</em> a clinical assessment, NDIS plan, or proof of any specific outcome —
    it is a record of platform use that the user (or a person they have authorised) can
    consider alongside other evidence.
  </section>

  <h2>At a glance</h2>
  <div class="stat-grid" role="list">
    <div class="stat" role="listitem">
      <div class="stat-label">Total listening / reading</div>
      <div class="stat-value">${formatDuration(s.totalListenSeconds)}</div>
    </div>
    <div class="stat" role="listitem">
      <div class="stat-label">Transcript opens</div>
      <div class="stat-value">${s.transcriptOpens}</div>
    </div>
    <div class="stat" role="listitem">
      <div class="stat-label">Accessibility adjustments</div>
      <div class="stat-value">${s.accessibilityChanges}</div>
    </div>
    <div class="stat" role="listitem">
      <div class="stat-label">Logged events</div>
      <div class="stat-value">${s.totalEvents}</div>
    </div>
  </div>

  <h2>Outcome tags</h2>
  <table>
    <caption class="meta">Tags assigned by the user, from a fixed vocabulary.</caption>
    <thead><tr><th scope="col">Outcome</th><th scope="col">Sessions tagged</th></tr></thead>
    <tbody>${tagRows}</tbody>
  </table>

  <h2>Per book</h2>
  <table>
    <thead><tr><th scope="col">Title</th><th scope="col">Sessions</th><th scope="col">Time</th></tr></thead>
    <tbody>${bookRows}</tbody>
  </table>

  <h2>Per-book progress</h2>
  <table>
    <caption class="meta">Progress is read from your overall listening history, not just this date range.</caption>
    <thead><tr>
      <th scope="col">Title</th>
      <th scope="col">Progress</th>
      <th scope="col">Status</th>
      <th scope="col">Last played</th>
    </tr></thead>
    <tbody>${progressRows}</tbody>
  </table>

  <h2>What this report is and isn't</h2>
  <ul>
    <li>It only includes activity recorded after the user opted in.</li>
    <li>Outcome tags reflect the user's own framing — they are not clinical judgements.</li>
    <li>Disabling activity tracking stops new collection. The user can wipe all stored events at any time.</li>
    <li>No additional disability-related data or PII is collected by this report.</li>
  </ul>
</body>
</html>`;
}

export function registerUserActivityRoutes(app: Express) {
  // ---------------- Status / opt-in ----------------
  app.get("/api/activity/status", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const profile = await getProfile(userId);
    res.json({
      enabled: !!profile?.activityTrackingEnabled,
      enabledAt: profile?.activityTrackingEnabledAt ?? null,
    });
  });

  app.post("/api/activity/opt-in", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const enabled = !!req.body?.enabled;
    const existing: A11yProfile = (await getProfile(userId)) ?? ({} as A11yProfile);
    const merged: A11yProfile = {
      ...existing,
      activityTrackingEnabled: enabled,
      activityTrackingEnabledAt: enabled
        ? existing.activityTrackingEnabledAt ?? new Date().toISOString()
        : null,
    };
    try {
      await db
        .insert(accessibilityPreferences)
        .values({ userId, profile: merged })
        .onConflictDoUpdate({
          target: accessibilityPreferences.userId,
          set: { profile: merged, syncedAt: new Date() },
        });
      // On opt-OUT, auto-revoke any outstanding caregiver shares so that
      // re-enabling tracking later does not silently re-activate old
      // tokens. Matches the user expectation of "stop sharing now".
      if (!enabled) {
        await db
          .update(userActivityShares)
          .set({ revokedAt: new Date() })
          .where(and(eq(userActivityShares.userId, userId), sql`${userActivityShares.revokedAt} IS NULL`));
      }
    } catch (err) {
      console.error("[UserActivity] opt-in DB error:", (err as Error).message);
      return res.status(503).json({ message: "Could not save preference. Try again." });
    }
    res.json({
      enabled,
      enabledAt: merged.activityTrackingEnabledAt ?? null,
    });
  });

  // ---------------- Events list / log / tag ----------------
  app.get("/api/activity/events", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!(await isOptedIn(userId))) {
      return res.json({ optedIn: false, events: [], summary: summarize([]) });
    }
    const range = parseDateRange(req);
    if ("error" in range) return res.status(400).json({ message: range.error });
    const { from, to } = range;
    try {
      const rows = await db
        .select()
        .from(userActivityEvents)
        .where(
          and(
            eq(userActivityEvents.userId, userId),
            gte(userActivityEvents.occurredAt, from),
            lte(userActivityEvents.occurredAt, to),
          ),
        )
        .orderBy(desc(userActivityEvents.occurredAt))
        .limit(500);
      res.json({ optedIn: true, from, to, events: rows, summary: summarize(rows) });
    } catch (err) {
      console.error("[UserActivity] list error:", (err as Error).message);
      res.status(500).json({ message: "Failed to load activity" });
    }
  });

  const logSchema = z.object({
    eventType: eventTypeSchema,
    bookId: z.string().nullish(),
    bookTitle: z.string().nullish(),
    durationSeconds: z.number().int().nonnegative().nullish(),
  });

  app.post("/api/activity/log", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!(await isOptedIn(userId))) {
      return res.status(403).json({ message: "Activity tracking is not enabled" });
    }
    const parsed = logSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid event" });
    try {
      const [row] = await db
        .insert(userActivityEvents)
        .values({
          userId,
          eventType: parsed.data.eventType,
          bookId: parsed.data.bookId ?? null,
          bookTitle: parsed.data.bookTitle ?? null,
          durationSeconds: parsed.data.durationSeconds ?? null,
        })
        .returning();
      res.json(row);
    } catch (err) {
      console.error("[UserActivity] log error:", (err as Error).message);
      res.status(500).json({ message: "Failed to log activity" });
    }
  });

  const tagPatchSchema = z.object({
    outcomeTag: tagSchema.nullable(),
    note: z.string().max(280).nullish(),
  });

  app.patch("/api/activity/events/:id/tag", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!(await isOptedIn(userId))) {
      return res.status(403).json({ message: "Activity tracking is not enabled" });
    }
    const parsed = tagPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid tag" });
    try {
      const [row] = await db
        .update(userActivityEvents)
        .set({ outcomeTag: parsed.data.outcomeTag, note: parsed.data.note ?? null })
        .where(
          and(eq(userActivityEvents.id, req.params.id), eq(userActivityEvents.userId, userId)),
        )
        .returning();
      if (!row) return res.status(404).json({ message: "Event not found" });
      res.json(row);
    } catch (err) {
      console.error("[UserActivity] tag error:", (err as Error).message);
      res.status(500).json({ message: "Failed to update tag" });
    }
  });

  // ---------------- Wipe ----------------
  app.delete("/api/activity/events", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      await db.delete(userActivityEvents).where(eq(userActivityEvents.userId, userId));
      // Also revoke any outstanding shares so wipe is total.
      await db
        .update(userActivityShares)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(userActivityShares.userId, userId), sql`${userActivityShares.revokedAt} IS NULL`),
        );
      res.json({ wiped: true });
    } catch (err) {
      console.error("[UserActivity] wipe error:", (err as Error).message);
      res.status(500).json({ message: "Failed to wipe activity" });
    }
  });

  // ---------------- Caregiver share ----------------
  const shareSchema = z.object({
    caregiverLabel: z.string().min(1).max(120),
    rangeFrom: z.string().nullish(),
    rangeTo: z.string().nullish(),
  });

  app.get("/api/activity/shares", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!(await isOptedIn(userId))) {
      return res.json([]);
    }
    try {
      const rows = await db
        .select()
        .from(userActivityShares)
        .where(eq(userActivityShares.userId, userId))
        .orderBy(desc(userActivityShares.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[UserActivity] shares list error:", (err as Error).message);
      res.status(500).json({ message: "Failed to list shares" });
    }
  });

  app.post("/api/activity/shares", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!(await isOptedIn(userId))) {
      return res.status(403).json({ message: "Enable activity tracking before sharing." });
    }
    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid share request" });
    const token = randomBytes(24).toString("hex");
    try {
      const [row] = await db
        .insert(userActivityShares)
        .values({
          userId,
          caregiverLabel: parsed.data.caregiverLabel,
          shareToken: token,
          rangeFrom: parsed.data.rangeFrom ? new Date(parsed.data.rangeFrom) : null,
          rangeTo: parsed.data.rangeTo ? new Date(parsed.data.rangeTo) : null,
        })
        .returning();
      res.json(row);
    } catch (err) {
      console.error("[UserActivity] share create error:", (err as Error).message);
      res.status(500).json({ message: "Failed to create share" });
    }
  });

  app.delete("/api/activity/shares/:id", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const [row] = await db
        .update(userActivityShares)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(userActivityShares.id, req.params.id), eq(userActivityShares.userId, userId)),
        )
        .returning();
      if (!row) return res.status(404).json({ message: "Share not found" });
      res.json(row);
    } catch (err) {
      console.error("[UserActivity] revoke error:", (err as Error).message);
      res.status(500).json({ message: "Failed to revoke share" });
    }
  });

  // ---------------- Reports ----------------
  async function buildReport(userId: string, range: { from: Date; to: Date }) {
    const rows = await db
      .select()
      .from(userActivityEvents)
      .where(
        and(
          eq(userActivityEvents.userId, userId),
          gte(userActivityEvents.occurredAt, range.from),
          lte(userActivityEvents.occurredAt, range.to),
        ),
      )
      .orderBy(desc(userActivityEvents.occurredAt))
      .limit(2000);
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    // Per-book progress from the user's listening_history. We surface this
    // alongside session counts so the report shows real completion state, not
    // just visit counts. Progress is *not* date-bounded — coordinators
    // typically want the most recent overall position per title.
    let progress: BookProgress[] = [];
    try {
      const histRows = await db
        .select()
        .from(listeningHistory)
        .where(eq(listeningHistory.userId, userId))
        .orderBy(desc(listeningHistory.lastPlayedAt))
        .limit(50);
      progress = histRows.map((h) => {
        const total = h.totalDuration ?? null;
        const cur = h.currentTime ?? 0;
        const pct = total && total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : null;
        return {
          bookId: h.bookId,
          title: h.bookTitle ?? null,
          currentTime: cur,
          totalDuration: total,
          percent: pct,
          completed: !!h.completedAt || (pct != null && pct >= 99),
          lastPlayedAt: h.lastPlayedAt ?? null,
        };
      });
    } catch (err) {
      console.error("[UserActivity] progress lookup failed:", (err as Error).message);
    }

    return { events: rows, user: u, progress };
  }

  app.get("/api/activity/report", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!(await isOptedIn(userId))) {
      return res.status(403).send("Enable activity tracking first.");
    }
    const range = parseDateRange(req);
    if ("error" in range) return res.status(400).send(range.error);
    try {
      const { events, progress } = await buildReport(userId, range);
      const html = renderActivityReportHtml({
        displayName: "AccessiBooks user",
        from: range.from,
        to: range.to,
        events,
        audience: "self",
        progress,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      console.error("[UserActivity] report error:", (err as Error).message);
      res.status(500).send("Failed to render report");
    }
  });

  // Public, token-scoped, read-only caregiver view. No auth required —
  // possession of the token grants access. Token is single-use revocable.
  app.get("/api/activity/share/:token/report", async (req, res) => {
    try {
      const [share] = await db
        .select()
        .from(userActivityShares)
        .where(eq(userActivityShares.shareToken, req.params.token))
        .limit(1);
      if (!share || share.revokedAt) {
        return res.status(404).send("This shared report is no longer available.");
      }
      // Re-check opt-in: a user opting out should immediately invalidate
      // any outstanding share token, even if the share row itself has not
      // been explicitly revoked.
      if (!(await isOptedIn(share.userId))) {
        return res.status(404).send("This shared report is no longer available.");
      }
      const range = {
        from: share.rangeFrom ?? new Date(Date.now() - 30 * 86400 * 1000),
        to: share.rangeTo ?? new Date(),
      };
      const { events, progress } = await buildReport(share.userId, range);
      const html = renderActivityReportHtml({
        displayName: "AccessiBooks user",
        from: range.from,
        to: range.to,
        events,
        audience: "caregiver",
        caregiverLabel: share.caregiverLabel,
        progress,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      console.error("[UserActivity] caregiver report error:", (err as Error).message);
      res.status(500).send("Failed to render report");
    }
  });
}

// Re-export helpers for tests.
export const __test = { summarize, escapeHtml, formatDuration };
