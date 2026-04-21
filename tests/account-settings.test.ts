/**
 * Account & Settings page tests
 *
 * Covers:
 *  - GET  /api/settings/summary
 *      • returns 401 for unauthenticated requests
 *      • returns { user, preferences, billing } shape for an authenticated free user
 *      • subscriptionTier is correctly surfaced ("free" by default) — this is the
 *        signal the Account page uses to decide whether to render the
 *        ad-preference toggles or the "you're listening ad-free" message
 *        (Plus/Premium fork). The UI fork is asserted at the API level here
 *        because manufacturing a Plus session in tests would require Stripe
 *        plumbing that lives outside this test surface.
 *  - GET  /api/a11y/preferences
 *      • returns DEFAULT_A11Y_PROFILE when unauthenticated
 *      • returns the persisted profile (merged with defaults) for an auth'd user
 *  - PUT  /api/a11y/preferences
 *      • requires authentication (401)
 *      • accepts a partial profile patch and persists it
 *      • subsequent partial patches DEEP-MERGE with the existing stored profile
 *        — the previously-set fields must NOT be wiped. This is the regression
 *        guard for the original bug (PUT was a full overwrite).
 *      • the merged profile is reflected in GET /api/settings/summary
 *
 * Auth strategy: registers a fresh local-auth user via POST /api/auth/register
 * and reuses the returned session cookie for all subsequent requests. No OAuth
 * required.
 *
 * Run: TEST_BASE_URL=http://localhost:5000 npx tsx tests/account-settings.test.ts
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const WAIT_TIMEOUT_MS = Number(process.env.SERVER_WAIT_MS ?? 30_000);
const POLL_INTERVAL_MS = 500;

type FetchOpts = {
  method?: string;
  body?: unknown;
  cookie?: string;
  followRedirects?: boolean;
};

async function request(path: string, opts: FetchOpts = {}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.cookie) headers["Cookie"] = opts.cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: opts.followRedirects ? "follow" : "manual",
  });
  return res;
}

function extractSessionCookie(res: Response): string | null {
  // express-session sets cookies on Set-Cookie; collect the connect.sid pair.
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  // node fetch flattens multiple Set-Cookie headers into one comma-joined
  // string. Split on ", " only when followed by a cookie-name= pattern.
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
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

class SkipError extends Error {
  constructor() { super("SKIP"); }
}

async function runTests() {
  const results: { name: string; passed: boolean; skipped?: boolean; error?: string }[] = [];

  function test(name: string, fn: () => Promise<void>) {
    return fn()
      .then(() => results.push({ name, passed: true }))
      .catch((err: Error) => {
        if (err instanceof SkipError || err.message === "SKIP") {
          results.push({ name, passed: true, skipped: true });
        } else {
          results.push({ name, passed: false, error: err.message });
        }
      });
  }

  console.log(`Waiting for server at ${BASE_URL} (up to ${WAIT_TIMEOUT_MS / 1000}s)...`);
  const reachable = await waitForServer(WAIT_TIMEOUT_MS);
  if (!reachable) {
    console.error(`\n[ERROR] Server at ${BASE_URL} is not reachable after ${WAIT_TIMEOUT_MS / 1000}s. Start the app first.\n`);
    process.exit(1);
  }
  console.log("Server is up. Running tests...\n");

  // ── Unauthenticated guards ────────────────────────────────────────────────
  await test("GET /api/settings/summary returns 401 when unauthenticated", async () => {
    const res = await request("/api/settings/summary");
    if (res.status !== 401) {
      throw new Error(`Expected 401, got ${res.status}`);
    }
    const body = (await res.json()) as Record<string, unknown>;
    if (!("message" in body)) throw new Error("401 response should include a message field");
  });

  await test("PUT /api/a11y/preferences returns 401 when unauthenticated", async () => {
    const res = await request("/api/a11y/preferences", {
      method: "PUT",
      body: { profile: { fontSize: 22 } },
    });
    if (res.status !== 401) {
      throw new Error(`Expected 401, got ${res.status}`);
    }
  });

  await test("GET /api/a11y/preferences returns DEFAULT profile when unauthenticated", async () => {
    const res = await request("/api/a11y/preferences");
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { profile?: Record<string, unknown> };
    if (!body.profile || typeof body.profile !== "object") {
      throw new Error("Expected response to include a `profile` object");
    }
    // Spot-check a few fields from DEFAULT_A11Y_PROFILE
    if (body.profile.fontSize !== 16) throw new Error(`Default fontSize should be 16, got ${body.profile.fontSize}`);
    if (body.profile.preferredSkipForward !== 15) throw new Error(`Default preferredSkipForward should be 15, got ${body.profile.preferredSkipForward}`);
    if (body.profile.autoAdvanceChapters !== true) throw new Error(`Default autoAdvanceChapters should be true, got ${body.profile.autoAdvanceChapters}`);
  });

  // ── Register a throwaway free-tier user for the authenticated tests ──────
  const testEmail = `settings-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@accessibooks.test`;
  const testPassword = "TestPassword123!";
  let sessionCookie: string | null = null;

  const registerRes = await request("/api/auth/register", {
    method: "POST",
    body: { email: testEmail, password: testPassword, firstName: "Settings", lastName: "Test" },
  });
  if (registerRes.status === 200) {
    sessionCookie = extractSessionCookie(registerRes);
  }

  const authReady = registerRes.status === 200 && !!sessionCookie;
  if (!authReady) {
    console.log(`    [WARN] Could not register test user (status=${registerRes.status}). Authenticated tests will be skipped.`);
  }

  // ── Authenticated GET /api/settings/summary ──────────────────────────────
  await test("GET /api/settings/summary returns { user, preferences, billing } shape for free user", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/settings/summary", { cookie: sessionCookie! });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as {
      user?: { id?: string; email?: string; subscriptionTier?: string };
      preferences?: Record<string, unknown>;
      billing?: { canManagePortal?: boolean };
    };
    if (!body.user || !body.preferences || !body.billing) {
      throw new Error(`Response missing one of {user, preferences, billing}: ${JSON.stringify(Object.keys(body))}`);
    }
    if (body.user.email !== testEmail) {
      throw new Error(`Expected user.email=${testEmail}, got ${body.user.email}`);
    }
    if (body.user.subscriptionTier !== "free") {
      throw new Error(`Expected user.subscriptionTier="free" for new user, got ${body.user.subscriptionTier}`);
    }
    if (body.billing.canManagePortal !== false) {
      throw new Error(`Expected billing.canManagePortal=false for user without Stripe customer, got ${body.billing.canManagePortal}`);
    }
    // Preferences should at minimum have the new Account-page fields
    const required = ["fontSize", "preferredSkipForward", "preferredSkipBack", "autoAdvanceChapters", "transcriptOpenByDefault"];
    for (const key of required) {
      if (!(key in body.preferences)) {
        throw new Error(`preferences missing required field: ${key}`);
      }
    }
  });

  // ── PUT /api/a11y/preferences: first partial patch persists ──────────────
  await test("PUT /api/a11y/preferences accepts a partial patch and persists it", async () => {
    if (!authReady) throw new SkipError();
    const patch1 = {
      preferredSkipForward: 30,
      preferredSkipBack: 10,
      autoAdvanceChapters: false,
    };
    const putRes = await request("/api/a11y/preferences", {
      method: "PUT",
      cookie: sessionCookie!,
      body: { profile: patch1 },
    });
    if (putRes.status !== 200) throw new Error(`PUT expected 200, got ${putRes.status}`);

    const getRes = await request("/api/a11y/preferences", { cookie: sessionCookie! });
    if (getRes.status !== 200) throw new Error(`GET expected 200, got ${getRes.status}`);
    const body = (await getRes.json()) as { profile: Record<string, unknown> };
    if (body.profile.preferredSkipForward !== 30) throw new Error(`preferredSkipForward not persisted; got ${body.profile.preferredSkipForward}`);
    if (body.profile.preferredSkipBack !== 10) throw new Error(`preferredSkipBack not persisted; got ${body.profile.preferredSkipBack}`);
    if (body.profile.autoAdvanceChapters !== false) throw new Error(`autoAdvanceChapters not persisted; got ${body.profile.autoAdvanceChapters}`);
  });

  // ── PUT /api/a11y/preferences: second patch DEEP MERGES (regression guard)
  await test("PUT /api/a11y/preferences deep-merges subsequent patches (does not overwrite earlier fields)", async () => {
    if (!authReady) throw new SkipError();
    const patch2 = {
      transcriptOpenByDefault: true,
      reduceDistractionMode: true,
      sleepTimerDefault: 30,
    };
    const putRes = await request("/api/a11y/preferences", {
      method: "PUT",
      cookie: sessionCookie!,
      body: { profile: patch2 },
    });
    if (putRes.status !== 200) throw new Error(`PUT expected 200, got ${putRes.status}`);

    const getRes = await request("/api/a11y/preferences", { cookie: sessionCookie! });
    const body = (await getRes.json()) as { profile: Record<string, unknown> };

    // patch2 fields must be present
    if (body.profile.transcriptOpenByDefault !== true) throw new Error(`transcriptOpenByDefault not persisted; got ${body.profile.transcriptOpenByDefault}`);
    if (body.profile.reduceDistractionMode !== true) throw new Error(`reduceDistractionMode not persisted; got ${body.profile.reduceDistractionMode}`);
    if (body.profile.sleepTimerDefault !== 30) throw new Error(`sleepTimerDefault not persisted; got ${body.profile.sleepTimerDefault}`);

    // patch1 fields must STILL be present — this is the deep-merge invariant
    if (body.profile.preferredSkipForward !== 30) {
      throw new Error(
        `Deep-merge violated: preferredSkipForward was wiped by second PUT (got ${body.profile.preferredSkipForward}, expected 30). ` +
        `PUT /api/a11y/preferences must merge with the existing stored profile, not replace it.`
      );
    }
    if (body.profile.preferredSkipBack !== 10) {
      throw new Error(`Deep-merge violated: preferredSkipBack was wiped by second PUT (got ${body.profile.preferredSkipBack}, expected 10).`);
    }
    if (body.profile.autoAdvanceChapters !== false) {
      throw new Error(`Deep-merge violated: autoAdvanceChapters was wiped by second PUT (got ${body.profile.autoAdvanceChapters}, expected false).`);
    }
  });

  // ── /api/settings/summary reflects merged preferences ────────────────────
  await test("GET /api/settings/summary returns the merged preferences after updates", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/settings/summary", { cookie: sessionCookie! });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { preferences: Record<string, unknown> };
    if (body.preferences.preferredSkipForward !== 30) {
      throw new Error(`/api/settings/summary should reflect persisted preferredSkipForward=30, got ${body.preferences.preferredSkipForward}`);
    }
    if (body.preferences.transcriptOpenByDefault !== true) {
      throw new Error(`/api/settings/summary should reflect persisted transcriptOpenByDefault=true, got ${body.preferences.transcriptOpenByDefault}`);
    }
  });

  // ── Plus/Premium ad-free fork: tier exposed on /api/settings/summary ─────
  await test("GET /api/settings/summary exposes subscriptionTier so the UI can render the ad-free fork", async () => {
    if (!authReady) throw new SkipError();
    const res = await request("/api/settings/summary", { cookie: sessionCookie! });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = (await res.json()) as { user: { subscriptionTier?: string } };
    // The Account & Settings page renders the ad preferences toggles only when
    // tier === "free". For "plus"/"premium"/"institutional" it shows the
    // "you're listening ad-free" message. This assertion guards the API
    // contract that drives that fork.
    const allowedTiers = ["free", "plus", "premium", "institutional"];
    if (!allowedTiers.includes(body.user.subscriptionTier ?? "")) {
      throw new Error(`subscriptionTier must be one of ${allowedTiers.join("|")}, got ${body.user.subscriptionTier}`);
    }
  });

  // ── Print results ────────────────────────────────────────────────────────
  console.log("=== Account & Settings Test Results ===");
  let passed = 0, failed = 0, skipped = 0;
  for (const r of results) {
    if (r.skipped) { console.log(`  SKIP  ${r.name}`); skipped++; }
    else if (r.passed) { console.log(`  PASS  ${r.name}`); passed++; }
    else { console.log(`  FAIL  ${r.name}`); console.log(`        ${r.error}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
