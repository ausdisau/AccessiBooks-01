/**
 * Task #67 — User-facing activity report tests.
 *
 * These cover the pure helpers exported from server/userActivity.ts
 * (summarize, escapeHtml, formatDuration) and the renderActivityReportHtml
 * template — opt-in gating, write/read, tagging, scoping, rendering.
 *
 * Run with: npx tsx tests/user-activity.test.ts
 */

import { __test, renderActivityReportHtml } from "../server/userActivity";
import {
  OUTCOME_TAGS,
  OUTCOME_TAG_LABELS,
  ACTIVITY_EVENT_TYPES,
  type UserActivityEvent,
} from "../shared/schema";

const { summarize, escapeHtml, formatDuration } = __test;

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err instanceof Error ? err.message : String(err)}`);
    fail++;
  }
}
function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertContains(haystack: string, needle: string, msg: string) {
  if (!haystack.includes(needle)) throw new Error(`${msg}: missing "${needle}"`);
}
function assertNotContains(haystack: string, needle: string, msg: string) {
  if (haystack.includes(needle)) throw new Error(`${msg}: should not contain "${needle}"`);
}

const ev = (
  i: number,
  overrides: Partial<UserActivityEvent> = {},
): UserActivityEvent => ({
  id: `e${i}`,
  userId: "u1",
  eventType: "playback_session",
  bookId: null,
  bookTitle: null,
  durationSeconds: null,
  outcomeTag: null,
  note: null,
  occurredAt: new Date("2026-05-01T10:00:00Z"),
  ...overrides,
} as UserActivityEvent);

console.log("\n=== Outcome tag vocabulary is fixed and labelled ===");
test("OUTCOME_TAGS has exactly 4 NDIS-aligned values", () => {
  assertEq(OUTCOME_TAGS.length, 4, "tag count");
  for (const t of ["capacity_building", "independent_access", "daily_living", "communication_support"]) {
    if (!(OUTCOME_TAGS as readonly string[]).includes(t)) {
      throw new Error(`missing tag ${t}`);
    }
    if (!(t in OUTCOME_TAG_LABELS)) throw new Error(`missing label for ${t}`);
  }
});

test("ACTIVITY_EVENT_TYPES covers core surfaces", () => {
  for (const t of ["playback_session", "transcript_opened", "accessibility_change"]) {
    if (!(ACTIVITY_EVENT_TYPES as readonly string[]).includes(t)) {
      throw new Error(`missing event type ${t}`);
    }
  }
});

console.log("\n=== formatDuration ===");
test("formats < 1h as minutes", () => assertEq(formatDuration(120), "2 minutes", "120s"));
test("formats whole hours", () => assertEq(formatDuration(3600), "1 hour", "3600s"));
test("formats hours + minutes", () => assertEq(formatDuration(3660), "1 hour 1 minute", "3660s"));
test("zero is human", () => assertEq(formatDuration(0), "0 minutes", "0s"));

console.log("\n=== escapeHtml ===");
test("escapes angle brackets and quotes", () => {
  assertEq(escapeHtml(`<script>"x"&y</script>`),
    "&lt;script&gt;&quot;x&quot;&amp;y&lt;/script&gt;",
    "escape");
});

console.log("\n=== summarize ===");
test("aggregates by type, tag, book", () => {
  const events: UserActivityEvent[] = [
    ev(1, { eventType: "playback_session", durationSeconds: 600, bookId: "b1", bookTitle: "Book One", outcomeTag: "capacity_building" }),
    ev(2, { eventType: "playback_session", durationSeconds: 1200, bookId: "b1", bookTitle: "Book One" }),
    ev(3, { eventType: "transcript_opened", bookId: "b1" }),
    ev(4, { eventType: "accessibility_change" }),
    ev(5, { eventType: "ebook_session", durationSeconds: 300, bookId: "b2", bookTitle: "Book Two", outcomeTag: "daily_living" }),
  ];
  const s = summarize(events);
  assertEq(s.totalEvents, 5, "total");
  assertEq(s.totalListenSeconds, 600 + 1200 + 300, "listen seconds includes ebook");
  assertEq(s.transcriptOpens, 1, "transcript opens");
  assertEq(s.accessibilityChanges, 1, "a11y changes");
  assertEq(s.byType["playback_session"], 2, "playback count");
  assertEq(s.byTag["capacity_building"], 1, "tag count cap");
  assertEq(s.byTag["daily_living"], 1, "tag count daily");
  assertEq(s.perBook.length, 2, "books");
  const b1 = s.perBook.find((b) => b.bookId === "b1")!;
  assertEq(b1.sessions, 3, "b1 sessions (incl transcript)");
  assertEq(b1.seconds, 1800, "b1 seconds");
  assertEq(b1.title, "Book One", "b1 title");
});

test("empty list summarises cleanly", () => {
  const s = summarize([]);
  assertEq(s.totalEvents, 0, "empty");
  assertEq(s.totalListenSeconds, 0, "empty seconds");
  assertEq(s.perBook.length, 0, "no books");
});

console.log("\n=== renderActivityReportHtml ===");
test("renders preamble, stats, tag table, per-book table", () => {
  const html = renderActivityReportHtml({
    displayName: "Alex",
    from: new Date("2026-04-11T00:00:00Z"),
    to: new Date("2026-05-11T00:00:00Z"),
    events: [
      ev(1, { eventType: "playback_session", durationSeconds: 1800, bookId: "b1", bookTitle: "Pride & Prejudice", outcomeTag: "capacity_building" }),
      ev(2, { eventType: "transcript_opened", bookId: "b1", bookTitle: "Pride & Prejudice" }),
      ev(3, { eventType: "accessibility_change" }),
    ],
    audience: "self",
  });
  assertContains(html, "<title>My Activity Report — AccessiBooks</title>", "title");
  assertContains(html, "About this report.", "preamble");
  assertContains(html, "clinical assessment", "preamble disclaimer");
  assertContains(html, "Alex", "display name");
  assertContains(html, "30 minutes", "stat duration");
  assertContains(html, "Capacity building", "tag label");
  assertContains(html, "Pride &amp; Prejudice", "book title escaped");
  assertContains(html, "What this report is and isn", "footer disclaimer");
  assertNotContains(html, "Shared with:", "self report should not show share label");
});

test("caregiver audience adds Shared with label and escapes it", () => {
  const html = renderActivityReportHtml({
    displayName: "Alex",
    from: new Date("2026-04-11T00:00:00Z"),
    to: new Date("2026-05-11T00:00:00Z"),
    events: [],
    audience: "caregiver",
    caregiverLabel: `Sam <"support">`,
  });
  assertContains(html, "Shared with:", "caregiver attribution");
  assertContains(html, "Sam &lt;&quot;support&quot;&gt;", "caregiver label escaped");
  assertContains(html, "No outcome tags assigned", "empty tag fallback");
  assertContains(html, "No book sessions", "empty book fallback");
});

test("renders print button (suppressed by @media print CSS)", () => {
  const html = renderActivityReportHtml({
    displayName: "Alex",
    from: new Date(),
    to: new Date(),
    events: [],
    audience: "self",
  });
  assertContains(html, `onclick="window.print()"`, "print button");
  assertContains(html, "@media print", "print css");
});

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
