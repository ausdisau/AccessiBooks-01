/**
 * Google OAuth Flow Tests
 *
 * Tests the Google OAuth sign-in flow end-to-end at the HTTP level:
 *  - /api/auth/providers endpoint correctly advertises Google availability
 *  - /api/auth/google initiates a 302 redirect toward Google's authorization endpoint
 *  - /api/auth/google/callback route is registered and responds (not 404)
 *  - /api/auth/me returns 401 for unauthenticated requests (session guard works)
 *  - OAuth failure redirect goes back to the app (not an external page)
 *
 * Findings from live e2e run (April 10 2026):
 *  - providers.google = true (GOOGLE_CLIENT_ID is set)
 *  - "Continue with Google" button renders correctly in login modal
 *  - /api/auth/google correctly initiates the OAuth redirect chain
 *  - /api/auth/google/callback route is wired up (non-404)
 *  - ISSUE: Google returns Error 401 "deleted_client" — the OAuth client
 *    referenced by GOOGLE_CLIENT_ID has been deleted in Google Cloud Console.
 *    The app-side code is correct; the credentials need to be regenerated.
 *
 * Run: TEST_BASE_URL=http://localhost:5000 npx tsx tests/google-oauth.test.ts
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const WAIT_TIMEOUT_MS = Number(process.env.SERVER_WAIT_MS ?? 30_000);
const POLL_INTERVAL_MS = 500;

async function get(path: string, opts: { followRedirects?: boolean } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: opts.followRedirects ? "follow" : "manual",
    headers: { Accept: "application/json, text/html, */*" },
  });
  return res;
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

async function runTests() {
  const results: { name: string; passed: boolean; skipped?: boolean; error?: string }[] = [];

  function test(name: string, fn: () => Promise<void>) {
    return fn()
      .then(() => results.push({ name, passed: true }))
      .catch((err: Error) => {
        if (err.message === "SKIP") {
          results.push({ name, passed: true, skipped: true });
        } else {
          results.push({ name, passed: false, error: err.message });
        }
      });
  }

  const skip = () => { throw new Error("SKIP"); };

  console.log(`Waiting for server at ${BASE_URL} (up to ${WAIT_TIMEOUT_MS / 1000}s)...`);
  const reachable = await waitForServer(WAIT_TIMEOUT_MS);
  if (!reachable) {
    console.error(`\n[ERROR] Server at ${BASE_URL} is not reachable after ${WAIT_TIMEOUT_MS / 1000}s. Start the app first.\n`);
    process.exit(1);
  }
  console.log("Server is up. Running tests...\n");

  let providers: Record<string, boolean> = { local: true, google: false };
  try {
    providers = await (await get("/api/auth/providers")).json() as Record<string, boolean>;
  } catch {
    // will fail in test below
  }

  // ── 1. /api/auth/providers ──────────────────────────────────────────────────
  await test("/api/auth/providers responds with 200 and correct JSON shape", async () => {
    const res = await get("/api/auth/providers");
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json() as Record<string, boolean>;
    if (!("google" in data)) throw new Error('providers JSON must include "google" field');
    if (!("local" in data)) throw new Error('providers JSON must include "local" field');
    if (typeof data.google !== "boolean") throw new Error('"google" must be a boolean');
  });

  // ── 2. /api/auth/google initiates redirect ──────────────────────────────────
  await test("/api/auth/google returns 302 redirect when Google is configured", async () => {
    if (!providers.google) {
      console.log("    [SKIP] GOOGLE_CLIENT_ID not set — skipping redirect test");
      skip();
    }

    const res = await get("/api/auth/google", { followRedirects: false });
    const isRedirect = res.status >= 300 && res.status < 400;
    if (!isRedirect) {
      throw new Error(
        `Expected redirect (3xx), got ${res.status}. ` +
        `Route /api/auth/google may not be registered (check GOOGLE_CLIENT_ID env var).`
      );
    }

    const location = res.headers.get("location") || "";
    const looksLikeGoogleOrInternal =
      location.includes("google") ||
      location.includes("accounts") ||
      location.startsWith("/") ||
      location.startsWith(BASE_URL);

    if (!looksLikeGoogleOrInternal) {
      throw new Error(
        `Redirect location "${location}" does not look like a Google OAuth URL or internal redirect`
      );
    }
  });

  // ── 3. /api/auth/google/callback is wired up (not 404) ─────────────────────
  await test("/api/auth/google/callback route is registered (non-404)", async () => {
    if (!providers.google) {
      console.log("    [SKIP] GOOGLE_CLIENT_ID not set — skipping callback route test");
      skip();
    }

    const res = await get("/api/auth/google/callback", { followRedirects: false });
    if (res.status === 404) {
      throw new Error(
        "/api/auth/google/callback returned 404 — route is not registered. " +
        "Check that setupMultiAuth() registers the route when GOOGLE_CLIENT_ID is set."
      );
    }
  });

  // ── 4. OAuth error param redirects within the app ──────────────────────────
  await test("Callback with error=access_denied redirects within the app (not 5xx)", async () => {
    if (!providers.google) {
      console.log("    [SKIP] GOOGLE_CLIENT_ID not set — skipping error-redirect test");
      skip();
    }

    const res = await get("/api/auth/google/callback?error=access_denied", {
      followRedirects: false,
    });

    if (res.status >= 500) {
      throw new Error(
        `Callback with error=access_denied returned server error ${res.status}. ` +
        `Passport.js should redirect to /?auth=failed instead.`
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") || "";
      if (location.includes("accounts.google.com")) {
        throw new Error(
          `Error callback redirected back to Google (${location}). ` +
          `Expected redirect to /?auth=failed or similar app URL.`
        );
      }
    }
  });

  // ── 5. /api/auth/me returns 401 when unauthenticated ───────────────────────
  await test("/api/auth/me returns 401 for unauthenticated requests", async () => {
    const res = await get("/api/auth/me");
    if (res.status !== 401) {
      throw new Error(
        `Expected 401 for unauthenticated /api/auth/me, got ${res.status}. ` +
        `Session guard may not be working correctly.`
      );
    }
    const body = await res.json() as Record<string, string>;
    if (!body.message) {
      throw new Error("Response should include a message field");
    }
  });

  // ── Print results ────────────────────────────────────────────────────────────
  console.log("=== Google OAuth Test Results ===");
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    if (r.skipped) {
      console.log(`  SKIP  ${r.name}`);
      skipped++;
    } else if (r.passed) {
      console.log(`  PASS  ${r.name}`);
      passed++;
    } else {
      console.log(`  FAIL  ${r.name}`);
      console.log(`        ${r.error}`);
      failed++;
    }
  }

  console.log(
    `\n${passed} passed, ${failed} failed, ${skipped} skipped\n`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
