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
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
import {
  accessibilityPreferences,
  userActivityEvents,
  userActivityShares,
  users,
  listeningHistory,
  dailyListeningLog,
  progressGoals,
  OUTCOME_TAGS,
  ACTIVITY_EVENT_TYPES,
  OUTCOME_TAG_LABELS,
  ACTIVITY_EVENT_LABELS,
  GOAL_METRICS,
  GOAL_PERIODS,
  GOAL_METRIC_LABELS,
  GOAL_METRIC_UNITS,
  GOAL_PERIOD_LABELS,
  type A11yProfile,
  type ActivityEventType,
  type OutcomeTag,
  type UserActivityEvent,
  type GoalMetric,
  type GoalPeriod,
  type ProgressGoal,
} from "@workspace/db";

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

// ============================================================
// Task #221 — progress goals: aggregation + reporting helpers.
// Goal targets are tracked per UTC period (weeks anchored to
// Monday, months to the 1st). Listening/books/active-days come
// from the gamification daily_listening_log; transcript opens
// from the opt-in activity events. Progress/report endpoints are
// always gated by the Task #67 opt-in (+ token) before this runs.
// ============================================================

const WEEKLY_WINDOW = 8; // rolling weeks shown in-app
const MONTHLY_WINDOW = 6; // rolling months shown in-app

export interface GoalTrendPoint {
  label: string;
  actual: number;
  target: number;
  met: boolean;
}

export interface GoalProgress {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
  current: { label: string; actual: number; target: number; percent: number; met: boolean } | null;
  trend: GoalTrendPoint[];
  metPeriods: number;
  totalPeriods: number;
}

interface PeriodBucket {
  start: Date;
  end: Date; // exclusive
  label: string;
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfPeriodUTC(d: Date, period: GoalPeriod): Date {
  if (period === "month") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const sinceMonday = (base.getUTCDay() + 6) % 7; // Monday = 0
  base.setUTCDate(base.getUTCDate() - sinceMonday);
  return base;
}

function nextPeriodUTC(start: Date, period: GoalPeriod): Date {
  if (period === "month") {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  }
  const n = new Date(start);
  n.setUTCDate(n.getUTCDate() + 7);
  return n;
}

function periodLabel(start: Date, period: GoalPeriod): string {
  if (period === "month") {
    return start.toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" });
  }
  return (
    "Week of " + start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  );
}

// Rolling window ending at the period containing `to`. Includes the current
// (possibly partial) period — used for the motivating in-app live view.
function rollingPeriods(period: GoalPeriod, to: Date, count: number): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  let cur = startOfPeriodUTC(to, period);
  for (let i = 0; i < count; i++) {
    buckets.unshift({ start: cur, end: nextPeriodUTC(cur, period), label: periodLabel(cur, period) });
    cur = startOfPeriodUTC(new Date(cur.getTime() - 1), period); // step back one period
  }
  return buckets;
}

// Only periods that fall ENTIRELY within [from,to], capped to the most recent
// `count`. Used for self/caregiver reports so a scoped share can't leak
// activity outside the consented date range and partial edge periods aren't
// judged against a target.
function boundedPeriods(period: GoalPeriod, from: Date, to: Date, count: number): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  let cur = startOfPeriodUTC(from, period);
  if (cur.getTime() < from.getTime()) cur = nextPeriodUTC(cur, period);
  let guard = 0;
  while (guard++ < 600) {
    const end = nextPeriodUTC(cur, period);
    if (end.getTime() > to.getTime()) break;
    buckets.push({ start: cur, end, label: periodLabel(cur, period) });
    cur = end;
  }
  return buckets.length > count ? buckets.slice(buckets.length - count) : buckets;
}

/**
 * Compute per-goal progress + trend. When `opts.from`/`opts.to` are provided
 * (reports) only complete periods within that range are used; otherwise a
 * rolling in-app window (8 weeks / 6 months) is used. One read per data source
 * is shared across all goals, then bucketed in JS.
 */
async function computeGoalProgress(
  userId: string,
  goals: ProgressGoal[],
  opts: { from?: Date; to?: Date } = {},
): Promise<GoalProgress[]> {
  if (!goals.length) return [];
  const bounded = !!(opts.from && opts.to);
  const to = opts.to ?? new Date();

  const bucketsByGoal = new Map<string, PeriodBucket[]>();
  let minStart = Infinity;
  let maxEnd = -Infinity;
  let needLogs = false;
  let needTranscript = false;

  for (const g of goals) {
    const period = g.period as GoalPeriod;
    const count = period === "week" ? WEEKLY_WINDOW : MONTHLY_WINDOW;
    const buckets = bounded
      ? boundedPeriods(period, opts.from!, to, count)
      : rollingPeriods(period, to, count);
    bucketsByGoal.set(g.id, buckets);
    for (const b of buckets) {
      minStart = Math.min(minStart, b.start.getTime());
      maxEnd = Math.max(maxEnd, b.end.getTime());
    }
    if (g.metric === "transcript_opens") needTranscript = true;
    else needLogs = true;
  }

  let logRows: { date: string; minutesListened: number; booksCompleted: number }[] = [];
  let transcriptEvents: { occurredAt: Date }[] = [];
  if (isFinite(minStart)) {
    const overallStart = new Date(minStart);
    const overallEnd = new Date(maxEnd);
    if (needLogs) {
      logRows = await db
        .select({
          date: dailyListeningLog.date,
          minutesListened: dailyListeningLog.minutesListened,
          booksCompleted: dailyListeningLog.booksCompleted,
        })
        .from(dailyListeningLog)
        .where(
          and(
            eq(dailyListeningLog.userId, userId),
            gte(dailyListeningLog.date, utcDateStr(overallStart)),
            lt(dailyListeningLog.date, utcDateStr(overallEnd)),
          ),
        );
    }
    if (needTranscript) {
      transcriptEvents = await db
        .select({ occurredAt: userActivityEvents.occurredAt })
        .from(userActivityEvents)
        .where(
          and(
            eq(userActivityEvents.userId, userId),
            eq(userActivityEvents.eventType, "transcript_opened"),
            gte(userActivityEvents.occurredAt, overallStart),
            lt(userActivityEvents.occurredAt, overallEnd),
          ),
        );
    }
  }

  const valueFor = (metric: GoalMetric, b: PeriodBucket): number => {
    if (metric === "transcript_opens") {
      return transcriptEvents.filter((e) => e.occurredAt >= b.start && e.occurredAt < b.end).length;
    }
    const sStr = utcDateStr(b.start);
    const eStr = utcDateStr(b.end);
    const inB = logRows.filter((r) => r.date >= sStr && r.date < eStr);
    if (metric === "listening_minutes") return inB.reduce((a, r) => a + (r.minutesListened || 0), 0);
    if (metric === "books_completed") return inB.reduce((a, r) => a + (r.booksCompleted || 0), 0);
    // active_days: days with any listening or a completed book
    return inB.filter((r) => (r.minutesListened || 0) > 0 || (r.booksCompleted || 0) > 0).length;
  };

  return goals.map((g) => {
    const metric = g.metric as GoalMetric;
    const buckets = bucketsByGoal.get(g.id) ?? [];
    const trend: GoalTrendPoint[] = buckets.map((b) => {
      const actual = valueFor(metric, b);
      return { label: b.label, actual, target: g.target, met: actual >= g.target };
    });
    const last = trend[trend.length - 1];
    const current = last
      ? {
          label: last.label,
          actual: last.actual,
          target: g.target,
          percent: g.target > 0 ? Math.min(100, Math.round((last.actual / g.target) * 100)) : 0,
          met: last.met,
        }
      : null;
    return {
      id: g.id,
      metric,
      period: g.period as GoalPeriod,
      target: g.target,
      current,
      trend,
      metPeriods: trend.filter((t) => t.met).length,
      totalPeriods: trend.length,
    };
  });
}

function renderGoalsSectionHtml(goals: GoalProgress[]): string {
  if (!goals.length) {
    return `<h2>Goals &amp; progress</h2>
  <p class="meta"><em>No goals have been set, or there isn't enough completed activity in this date range to show goal trends.</em></p>`;
  }
  const cards = goals
    .map((g) => {
      const metricLabel = GOAL_METRIC_LABELS[g.metric] ?? g.metric;
      const unit = GOAL_METRIC_UNITS[g.metric] ?? "";
      const periodWord = GOAL_PERIOD_LABELS[g.period] ?? g.period;
      const periodNoun = g.period === "week" ? "weeks" : "months";
      const header = `${escapeHtml(metricLabel)} — ${g.target} ${escapeHtml(unit)} ${escapeHtml(periodWord)}`;
      if (!g.trend.length) {
        return `<div class="goal-card">
        <h3>${header}</h3>
        <p class="meta"><em>Not enough completed ${periodNoun} in this date range to show a trend.</em></p>
      </div>`;
      }
      const rows = g.trend
        .map(
          (t) => `<tr>
          <th scope="row">${escapeHtml(t.label)}</th>
          <td>${t.actual} ${escapeHtml(unit)}</td>
          <td>${t.target} ${escapeHtml(unit)}</td>
          <td>${t.met ? "✓ Met" : "Not met"}</td>
        </tr>`,
        )
        .join("");
      return `<div class="goal-card">
      <h3>${header}</h3>
      <p class="meta">Met target in <strong>${g.metPeriods} of ${g.totalPeriods}</strong> ${periodNoun}.</p>
      <table>
        <thead><tr><th scope="col">Period</th><th scope="col">Actual</th><th scope="col">Target</th><th scope="col">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    })
    .join("");
  return `<h2>Goals &amp; progress</h2>
  <p class="meta">Progress toward goals set by the user or their caregiver, over complete weeks or months within this date range.</p>
  ${cards}`;
}

export function renderActivityReportHtml(params: {
  displayName: string;
  from: Date;
  to: Date;
  events: UserActivityEvent[];
  audience: "self" | "caregiver";
  caregiverLabel?: string | null;
  progress?: BookProgress[];
  goals?: GoalProgress[];
}): string {
  const { displayName, from, to, events, audience, caregiverLabel, progress = [], goals = [] } = params;
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
  .goal-card { border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem 1rem; margin-top: 1rem; }
  .goal-card h3 { margin: 0 0 0.25rem; font-size: 1.05rem; }
  @media print { .print-btn { display: none; } body { margin: 0; max-width: none; }
                 .goal-card { break-inside: avoid; } }
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

  ${renderGoalsSectionHtml(goals)}

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
      // And soft-archive goals so stale targets don't reappear after a wipe.
      await db
        .update(progressGoals)
        .set({ archivedAt: new Date() })
        .where(and(eq(progressGoals.userId, userId), sql`${progressGoals.archivedAt} IS NULL`));
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

  // ---------------- Progress goals (Task #221) ----------------
  // Goal rows are plain config, so CRUD is auth-only (no opt-in needed). The
  // progress endpoint and the shared reports stay opt-in/token gated because
  // they read real activity.
  const MAX_ACTIVE_GOALS = 10;

  // Per metric/period sanity caps so a goal target stays meaningful and a
  // typo can't request an unbounded aggregation window.
  function targetLimit(metric: GoalMetric, period: GoalPeriod): number {
    if (metric === "active_days") return period === "week" ? 7 : 31;
    if (metric === "listening_minutes") return period === "week" ? 10080 : 44640;
    return period === "week" ? 1000 : 4000; // books_completed, transcript_opens
  }

  function targetTooHighMessage(metric: GoalMetric, period: GoalPeriod): string {
    return `Target is too high (max ${targetLimit(metric, period)} ${GOAL_METRIC_UNITS[metric]} ${GOAL_PERIOD_LABELS[period]}).`;
  }

  const createGoalSchema = z.object({
    metric: z.enum(GOAL_METRICS),
    period: z.enum(GOAL_PERIODS),
    target: z.number().int().positive(),
  });

  const patchGoalSchema = z.object({
    target: z.number().int().positive(),
  });

  app.get("/api/activity/goals", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const rows = await db
        .select()
        .from(progressGoals)
        .where(and(eq(progressGoals.userId, userId), sql`${progressGoals.archivedAt} IS NULL`))
        .orderBy(desc(progressGoals.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[UserActivity] goals list error:", (err as Error).message);
      res.status(500).json({ message: "Failed to load goals" });
    }
  });

  // Live in-app progress (rolling 8 weeks / 6 months). Opt-in gated because it
  // reads real activity, unlike goal CRUD.
  app.get("/api/activity/goals/progress", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!(await isOptedIn(userId))) {
      return res.json({ optedIn: false, goals: [] });
    }
    try {
      const goals = await db
        .select()
        .from(progressGoals)
        .where(and(eq(progressGoals.userId, userId), sql`${progressGoals.archivedAt} IS NULL`))
        .orderBy(desc(progressGoals.createdAt));
      const progress = await computeGoalProgress(userId, goals);
      res.json({ optedIn: true, goals: progress });
    } catch (err) {
      console.error("[UserActivity] goal progress error:", (err as Error).message);
      res.status(500).json({ message: "Failed to compute goal progress" });
    }
  });

  app.post("/api/activity/goals", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const parsed = createGoalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid goal" });
    const { metric, period, target } = parsed.data;
    if (target > targetLimit(metric, period)) {
      return res.status(400).json({ message: targetTooHighMessage(metric, period) });
    }
    try {
      const active = await db
        .select()
        .from(progressGoals)
        .where(and(eq(progressGoals.userId, userId), sql`${progressGoals.archivedAt} IS NULL`));
      if (active.length >= MAX_ACTIVE_GOALS) {
        return res
          .status(400)
          .json({ message: `You can track up to ${MAX_ACTIVE_GOALS} goals at a time.` });
      }
      if (active.some((g) => g.metric === metric && g.period === period)) {
        return res
          .status(409)
          .json({ message: "You already have a goal for this measure and period." });
      }
      try {
        const [row] = await db
          .insert(progressGoals)
          .values({ userId, metric, period, target })
          .returning();
        res.json(row);
      } catch (insertErr) {
        // Partial unique index (user_id, metric, period) WHERE archived_at IS
        // NULL closes the race where two concurrent POSTs both pass the
        // application-level duplicate pre-check above.
        if ((insertErr as { code?: string }).code === "23505") {
          return res
            .status(409)
            .json({ message: "You already have a goal for this measure and period." });
        }
        throw insertErr;
      }
    } catch (err) {
      console.error("[UserActivity] goal create error:", (err as Error).message);
      res.status(500).json({ message: "Failed to create goal" });
    }
  });

  app.patch("/api/activity/goals/:id", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const parsed = patchGoalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid goal update" });
    try {
      const [existing] = await db
        .select()
        .from(progressGoals)
        .where(
          and(
            eq(progressGoals.id, req.params.id),
            eq(progressGoals.userId, userId),
            sql`${progressGoals.archivedAt} IS NULL`,
          ),
        )
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Goal not found" });
      const metric = existing.metric as GoalMetric;
      const period = existing.period as GoalPeriod;
      if (parsed.data.target > targetLimit(metric, period)) {
        return res.status(400).json({ message: targetTooHighMessage(metric, period) });
      }
      const [row] = await db
        .update(progressGoals)
        .set({ target: parsed.data.target, updatedAt: new Date() })
        .where(and(eq(progressGoals.id, req.params.id), eq(progressGoals.userId, userId)))
        .returning();
      res.json(row);
    } catch (err) {
      console.error("[UserActivity] goal update error:", (err as Error).message);
      res.status(500).json({ message: "Failed to update goal" });
    }
  });

  app.delete("/api/activity/goals/:id", isAuthenticated, async (req, res) => {
    const userId = userIdFrom(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const [row] = await db
        .update(progressGoals)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(progressGoals.id, req.params.id),
            eq(progressGoals.userId, userId),
            sql`${progressGoals.archivedAt} IS NULL`,
          ),
        )
        .returning();
      if (!row) return res.status(404).json({ message: "Goal not found" });
      res.json({ archived: true });
    } catch (err) {
      console.error("[UserActivity] goal delete error:", (err as Error).message);
      res.status(500).json({ message: "Failed to delete goal" });
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

    // Per-book progress from the user's listening_history, BOUNDED to the
    // report's date range by lastPlayedAt. Bounding is required so a scoped
    // caregiver share can never reveal titles or positions the user played
    // outside the consented window. Rows with a null lastPlayedAt cannot be
    // date-placed and are therefore excluded from range-scoped reports.
    let progress: BookProgress[] = [];
    try {
      const histRows = await db
        .select()
        .from(listeningHistory)
        .where(
          and(
            eq(listeningHistory.userId, userId),
            gte(listeningHistory.lastPlayedAt, range.from),
            lte(listeningHistory.lastPlayedAt, range.to),
          ),
        )
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

    // Goal progress, BOUNDED to the report's date range (complete periods only)
    // so a scoped caregiver share never reveals activity outside the consented
    // window. Failure here must not break the rest of the report.
    let goalProgress: GoalProgress[] = [];
    try {
      const goals = await db
        .select()
        .from(progressGoals)
        .where(and(eq(progressGoals.userId, userId), sql`${progressGoals.archivedAt} IS NULL`))
        .orderBy(desc(progressGoals.createdAt));
      if (goals.length) {
        goalProgress = await computeGoalProgress(userId, goals, { from: range.from, to: range.to });
      }
    } catch (err) {
      console.error("[UserActivity] goal progress lookup failed:", (err as Error).message);
    }

    return { events: rows, user: u, progress, goalProgress };
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
      const { events, progress, goalProgress } = await buildReport(userId, range);
      const html = renderActivityReportHtml({
        displayName: "AccessiBooks user",
        from: range.from,
        to: range.to,
        events,
        audience: "self",
        progress,
        goals: goalProgress,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
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
      const { events, progress, goalProgress } = await buildReport(share.userId, range);
      const html = renderActivityReportHtml({
        displayName: "AccessiBooks user",
        from: range.from,
        to: range.to,
        events,
        audience: "caregiver",
        caregiverLabel: share.caregiverLabel,
        progress,
        goals: goalProgress,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.send(html);
    } catch (err) {
      console.error("[UserActivity] caregiver report error:", (err as Error).message);
      res.status(500).send("Failed to render report");
    }
  });
}

// Re-export helpers for tests.
export const __test = { summarize, escapeHtml, formatDuration };
