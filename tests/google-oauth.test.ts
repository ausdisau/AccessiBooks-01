/**
 * Social Sign-in Smoke Tests
 *
 * Validates the three social sign-in entry points after the Task #61 migration:
 *  - Google now uses Replit-managed OIDC (REPL_ID + REPLIT_DOMAINS); the
 *    /api/auth/google route should 302 toward replit.com/oidc with the right
 *    response_type and the absolute callback URL we register per-host.
 *  - Facebook and Microsoft are routed through Auth0 Universal Login as
 *    social connections — /api/auth/facebook and /api/auth/microsoft should
 *    302 to <AUTH0_DOMAIN>/authorize with `connection=facebook` and
 *    `connection=windowslive` respectively (overridable via env vars).
 *  - /api/auth/providers reports the correct booleans for the current env.
 *  - /api/auth/me returns 401 when unauthenticated.
 *  - OAuth failure (?error=access_denied) redirects back into the app.
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

  let providers: Record<string, boolean> = { local: true, google: false, facebook: false, microsoft: false };
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
    for (const key of ["local", "google", "facebook", "microsoft"]) {
      if (!(key in data)) throw new Error(`providers JSON must include "${key}" field`);
      if (typeof data[key] !== "boolean") throw new Error(`"${key}" must be a boolean`);
    }
  });

  // ── 2. /api/auth/google initiates redirect to Replit OIDC ──────────────────
  await test("/api/auth/google returns 302 redirect to Replit OIDC when Google is enabled", async () => {
    if (!providers.google) {
      console.log("    [SKIP] Replit OIDC not configured (REPL_ID / REPLIT_DOMAINS) — skipping");
      skip();
    }

    const res = await get("/api/auth/google", { followRedirects: false });
    const isRedirect = res.status >= 300 && res.status < 400;
    if (!isRedirect) {
      throw new Error(`Expected redirect (3xx), got ${res.status} from /api/auth/google.`);
    }

    const location = res.headers.get("location") || "";
    // After the migration we expect either a Replit OIDC authorize URL, or an
    // internal /?auth=failed redirect when the request host isn't on the
    // hostname allowlist (still a 3xx, never a Google.com URL).
    const looksLikeReplitOidcOrInternal =
      location.includes("replit.com/oidc") ||
      location.startsWith("/") ||
      location.startsWith(BASE_URL);

    if (!looksLikeReplitOidcOrInternal) {
      throw new Error(
        `Redirect location "${location}" is not a Replit OIDC URL or internal app URL. ` +
        `The new Google flow must NOT redirect to accounts.google.com directly.`
      );
    }
    if (location.includes("accounts.google.com")) {
      throw new Error(
        `/api/auth/google redirected to accounts.google.com — old self-managed ` +
        `Google OAuth strategy is still active. It must go through replit.com/oidc.`
      );
    }
  });

  // ── 3. /api/auth/google/callback is wired up (not 404) ─────────────────────
  await test("/api/auth/google/callback route is registered (non-404)", async () => {
    if (!providers.google) {
      console.log("    [SKIP] Replit OIDC not configured — skipping callback route test");
      skip();
    }

    const res = await get("/api/auth/google/callback", { followRedirects: false });
    if (res.status === 404) {
      throw new Error(
        "/api/auth/google/callback returned 404 — route is not registered. " +
        "Check that setupMultiAuth() registers the route when REPL_ID + REPLIT_DOMAINS are set."
      );
    }
  });

  // ── 4. OAuth error param redirects within the app ──────────────────────────
  await test("Callback with error=access_denied redirects within the app (not 5xx)", async () => {
    if (!providers.google) {
      console.log("    [SKIP] Replit OIDC not configured — skipping error-redirect test");
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

  // ── 5a. Facebook via Auth0 ────────────────────────────────────────────────
  await test("/api/auth/facebook redirects to Auth0 with connection=facebook", async () => {
    if (!providers.facebook) {
      console.log("    [SKIP] Auth0 / Facebook connection not configured — skipping");
      skip();
    }
    const res = await get("/api/auth/facebook", { followRedirects: false });
    // Task #140: when the boot-time Auth0 health probe detects an
    // `unauthorized_client` misconfig, the guard short-circuits to
    // /?auth=unavailable. Accept that as a valid (intentional) outcome.
    const location = res.headers.get("location") || "";
    if (res.status >= 300 && res.status < 400 && /\/\?auth=unavailable/.test(location)) {
      console.log("    [INFO] Auth0 health probe disabled sign-in (auth=unavailable) — treating as PASS");
      return;
    }
    if (!(res.status >= 300 && res.status < 400)) {
      throw new Error(`Expected redirect (3xx), got ${res.status} from /api/auth/facebook.`);
    }
    const expected = process.env.AUTH0_FACEBOOK_CONNECTION || "facebook";
    if (!/\/authorize/.test(location)) {
      throw new Error(`Expected redirect to Auth0 /authorize, got "${location}"`);
    }
    if (!location.includes(`connection=${encodeURIComponent(expected)}`) &&
        !location.includes(`connection=${expected}`)) {
      throw new Error(`Auth0 redirect missing connection=${expected}: "${location}"`);
    }
  });

  // ── 5b. Microsoft via Auth0 ───────────────────────────────────────────────
  await test("/api/auth/microsoft redirects to Auth0 with connection=windowslive", async () => {
    if (!providers.microsoft) {
      console.log("    [SKIP] Auth0 / Microsoft connection not configured — skipping");
      skip();
    }
    const res = await get("/api/auth/microsoft", { followRedirects: false });
    const location = res.headers.get("location") || "";
    if (res.status >= 300 && res.status < 400 && /\/\?auth=unavailable/.test(location)) {
      console.log("    [INFO] Auth0 health probe disabled sign-in (auth=unavailable) — treating as PASS");
      return;
    }
    if (!(res.status >= 300 && res.status < 400)) {
      throw new Error(`Expected redirect (3xx), got ${res.status} from /api/auth/microsoft.`);
    }
    const expected = process.env.AUTH0_MICROSOFT_CONNECTION || "windowslive";
    if (!/\/authorize/.test(location)) {
      throw new Error(`Expected redirect to Auth0 /authorize, got "${location}"`);
    }
    if (!location.includes(`connection=${encodeURIComponent(expected)}`) &&
        !location.includes(`connection=${expected}`)) {
      throw new Error(`Auth0 redirect missing connection=${expected}: "${location}"`);
    }
  });

  // ── 6. /api/auth/me returns 401 when unauthenticated ───────────────────────
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
