/**
 * Task #67 — End-to-end API tests for the My Activity flow.
 *
 * Covers, against a running server:
 *   - opt-in gating on read/write/share/report endpoints
 *   - log → tag → report happy path with no PII leakage
 *   - caregiver share token works while opted in, 404s after opt-out / revoke / wipe
 *   - one-click wipe deletes events AND auto-revokes shares
 *
 * Auth strategy mirrors tests/account-settings.test.ts: register a fresh
 * local-auth user and reuse the session cookie. Skips cleanly when local
 * auth is disabled or the database is unreachable.
 *
 * Run: TEST_BASE_URL=http://localhost:5000 npx tsx tests/user-activity-api.test.ts
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const WAIT_TIMEOUT_MS = Number(process.env.SERVER_WAIT_MS ?? 30_000);
const POLL_INTERVAL_MS = 500;

type FetchOpts = {
  method?: string;
  body?: unknown;
  cookie?: string;
};

async function request(path: string, opts: FetchOpts = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  return fetch(`${BASE_URL}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
}

function extractSessionCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const parts = setCookie.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
  const pairs: string[] = [];
  for (const part of parts) {
    const first = part.split(";")[0].trim();
    if (first) pairs.push(first);
  }
  return pairs.length ? pairs.join("; ") : null;
}

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/providers`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

class SkipError extends Error { constructor() { super("SKIP"); } }

async function main() {
  const results: { name: string; passed: boolean; skipped?: boolean; error?: string }[] = [];
  const test = (name: string, fn: () => Promise<void>) =>
    fn()
      .then(() => results.push({ name, passed: true }))
      .catch((err: Error) => {
        if (err instanceof SkipError || err.message === "SKIP") {
          results.push({ name, passed: true, skipped: true });
        } else {
          results.push({ name, passed: false, error: err.message });
        }
      });

  console.log(`Waiting for server at ${BASE_URL} (up to ${WAIT_TIMEOUT_MS / 1000}s)...`);
  const reachable = await waitForServer(WAIT_TIMEOUT_MS);
  if (!reachable) {
    console.error(`[ERROR] Server at ${BASE_URL} not reachable.`);
    process.exit(1);
  }

  // ── Unauthenticated guards ────────────────────────────────────────────────
  await test("GET /api/activity/status → 401 unauth", async () => {
    const res = await request("/api/activity/status");
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test("POST /api/activity/log → 401 unauth", async () => {
    const res = await request("/api/activity/log", {
      method: "POST",
      body: { eventType: "transcript_opened" },
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test("DELETE /api/activity/events → 401 unauth", async () => {
    const res = await request("/api/activity/events", { method: "DELETE" });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // ── Register a fresh user ─────────────────────────────────────────────────
  const testEmail = `activity-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@accessibooks.test`;
  const testPassword = "TestPassword123!";
  const firstName = "Activity";
  const lastName = "Tester";
  let cookie: string | null = null;

  const registerRes = await request("/api/auth/register", {
    method: "POST",
    body: { email: testEmail, password: testPassword, firstName, lastName },
  });
  if (registerRes.status === 200) cookie = extractSessionCookie(registerRes);

  const authReady = registerRes.status === 200 && !!cookie;
  if (!authReady) {
    let localAuthConfigured = true;
    try {
      const probe = await request("/api/auth/providers");
      if (probe.ok) {
        const p = (await probe.json()) as { local?: boolean };
        localAuthConfigured = p.local !== false;
      }
    } catch {}
    const reason = !localAuthConfigured
      ? "local auth disabled"
      : `database registration failed (status=${registerRes.status})`;
    console.log(`    [SKIP REASON] ${reason}`);
  }

  // ── Opt-in gating: reads/writes are no-ops or 403 when not opted in ──────
  await test("GET /api/activity/events → optedIn:false before opt-in", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/events", { cookie: cookie! });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { optedIn: boolean; events: unknown[] };
    if (body.optedIn !== false) throw new Error("optedIn should be false before opt-in");
    if (body.events.length !== 0) throw new Error("events should be empty before opt-in");
  });

  await test("POST /api/activity/log → 403 before opt-in", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/log", {
      method: "POST",
      cookie: cookie!,
      body: { eventType: "transcript_opened" },
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  await test("POST /api/activity/shares → 403 before opt-in", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/shares", {
      method: "POST",
      cookie: cookie!,
      body: { caregiverLabel: "Sam" },
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  await test("GET /api/activity/report → 403 before opt-in", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/report", { cookie: cookie! });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  });

  // ── Opt in and exercise full flow ────────────────────────────────────────
  await test("POST /api/activity/opt-in {enabled:true} flips status", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/opt-in", {
      method: "POST",
      cookie: cookie!,
      body: { enabled: true },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { enabled: boolean; enabledAt: string | null };
    if (!body.enabled) throw new Error("enabled should be true");
    if (!body.enabledAt) throw new Error("enabledAt should be set");
  });

  let loggedEventId: string | null = null;
  await test("POST /api/activity/log persists an event after opt-in", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/log", {
      method: "POST",
      cookie: cookie!,
      body: {
        eventType: "transcript_opened",
        bookId: "book-xyz",
        bookTitle: "Test Book",
      },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { id: string; eventType: string; bookId: string };
    if (body.eventType !== "transcript_opened") throw new Error("wrong event type");
    if (body.bookId !== "book-xyz") throw new Error("wrong book id");
    loggedEventId = body.id;
  });

  await test("PATCH /api/activity/events/:id/tag rejects unknown vocabulary", async () => {
    if (!authReady) throw new SkipError();
    if (!loggedEventId) throw new SkipError();
    const res = await request(`/api/activity/events/${loggedEventId}/tag`, {
      method: "PATCH",
      cookie: cookie!,
      body: { outcomeTag: "free_text_tag" },
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  await test("PATCH /api/activity/events/:id/tag accepts a fixed-vocab tag", async () => {
    if (!authReady) throw new SkipError();
    if (!loggedEventId) throw new SkipError();
    const res = await request(`/api/activity/events/${loggedEventId}/tag`, {
      method: "PATCH",
      cookie: cookie!,
      body: { outcomeTag: "capacity_building" },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { outcomeTag: string };
    if (body.outcomeTag !== "capacity_building") throw new Error("tag not persisted");
  });

  await test("GET /api/activity/events lists the logged + tagged event", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/events", { cookie: cookie! });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as {
      optedIn: boolean;
      events: Array<{ id: string; outcomeTag: string | null }>;
    };
    if (!body.optedIn) throw new Error("should be opted in");
    if (!body.events.find((e) => e.id === loggedEventId && e.outcomeTag === "capacity_building")) {
      throw new Error("logged event with tag not in list");
    }
  });

  await test("GET /api/activity/report returns HTML with no PII (no email, no first name)", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/report", { cookie: cookie! });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const html = await res.text();
    if (!html.includes("My Activity Report")) throw new Error("report missing title");
    if (!html.includes("AccessiBooks user")) throw new Error("report missing neutral display label");
    if (html.includes(testEmail)) throw new Error("REPORT LEAKED EMAIL");
    if (html.includes(firstName)) throw new Error(`REPORT LEAKED FIRST NAME (${firstName})`);
    if (html.includes(lastName)) throw new Error(`REPORT LEAKED LAST NAME (${lastName})`);
  });

  // ── Caregiver share lifecycle ────────────────────────────────────────────
  let shareToken: string | null = null;
  let shareId: string | null = null;
  await test("POST /api/activity/shares creates a share with token", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/activity/shares", {
      method: "POST",
      cookie: cookie!,
      body: { caregiverLabel: "Sam (support)" },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { id: string; shareToken: string };
    if (!body.shareToken || body.shareToken.length < 32) throw new Error("token too short");
    shareToken = body.shareToken;
    shareId = body.id;
  });

  await test("GET /api/activity/share/:token/report works while opted in", async () => {
    if (!authReady || !shareToken) throw new SkipError();
    const res = await fetch(`${BASE_URL}/api/activity/share/${shareToken}/report`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const html = await res.text();
    if (!html.includes("Shared with:")) throw new Error("caregiver attribution missing");
    if (html.includes(testEmail)) throw new Error("CAREGIVER REPORT LEAKED EMAIL");
    if (html.includes(firstName)) throw new Error("CAREGIVER REPORT LEAKED FIRST NAME");
  });

  await test("GET /api/activity/share/:token/report returns 404 after opt-out", async () => {
    if (!authReady || !shareToken) throw new SkipError();
    const off = await request("/api/activity/opt-in", {
      method: "POST",
      cookie: cookie!,
      body: { enabled: false },
    });
    if (off.status !== 200) throw new Error(`opt-out failed: ${off.status}`);
    const res = await fetch(`${BASE_URL}/api/activity/share/${shareToken}/report`);
    if (res.status !== 404) throw new Error(`Expected 404 after opt-out, got ${res.status}`);
    // Re-enable for the next steps
    await request("/api/activity/opt-in", {
      method: "POST",
      cookie: cookie!,
      body: { enabled: true },
    });
  });

  await test("DELETE /api/activity/shares/:id revokes the token", async () => {
    if (!authReady || !shareToken || !shareId) throw new SkipError();
    const res = await request(`/api/activity/shares/${shareId}`, {
      method: "DELETE",
      cookie: cookie!,
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const after = await fetch(`${BASE_URL}/api/activity/share/${shareToken}/report`);
    if (after.status !== 404) throw new Error(`Expected 404 after revoke, got ${after.status}`);
  });

  // ── Wipe semantics ───────────────────────────────────────────────────────
  await test("DELETE /api/activity/events deletes events AND auto-revokes shares", async () => {
    if (!authReady) throw new SkipError();
    // Create a fresh share so we can prove wipe revokes it
    const shareRes = await request("/api/activity/shares", {
      method: "POST",
      cookie: cookie!,
      body: { caregiverLabel: "Pre-wipe" },
    });
    if (shareRes.status !== 200) throw new Error(`share create failed: ${shareRes.status}`);
    const { shareToken: token2 } = (await shareRes.json()) as { shareToken: string };

    const wipe = await request("/api/activity/events", { method: "DELETE", cookie: cookie! });
    if (wipe.status !== 200) throw new Error(`wipe failed: ${wipe.status}`);

    const events = await request("/api/activity/events", { cookie: cookie! });
    const body = (await events.json()) as { events: unknown[] };
    if (body.events.length !== 0) throw new Error("events not wiped");

    const tokenRes = await fetch(`${BASE_URL}/api/activity/share/${token2}/report`);
    if (tokenRes.status !== 404) throw new Error(`Expected 404 after wipe, got ${tokenRes.status}`);
  });

  // ── Report
  console.log("");
  for (const r of results) {
    const tag = r.skipped ? "SKIP" : r.passed ? "PASS" : "FAIL";
    console.log(`  ${tag.padEnd(4)}  ${r.name}${r.error ? ` — ${r.error}` : ""}`);
  }
  const failed = results.filter((r) => !r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  const passed = results.length - failed - skipped;
  console.log(`\n=== ${passed} passed, ${skipped} skipped, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
