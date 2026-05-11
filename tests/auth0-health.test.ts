/**
 * Unit tests for server/auth0Health.ts (Task #140).
 *
 * Covers the response-classification logic in `runAuth0HealthCheck()`:
 *   - `invalid_grant` / `invalid_request` from /oauth/token → healthy
 *   - `unauthorized_client` → unusable (grant_type misconfig)
 *   - `invalid_client` → unusable (client_id/secret mismatch)
 *   - `access_denied` / unexpected payload → unusable (conservative fallback)
 *   - missing env vars → unusable + warning
 *
 * Run: TEST_BASE_URL=http://localhost:5000 npx tsx tests/auth0-health.test.ts
 * (TEST_BASE_URL is unused; kept for parity with our other test workflows.)
 */

import {
  isAuth0Usable,
  getAuth0HealthStatus,
  runAuth0HealthCheck,
  __resetAuth0HealthForTests,
} from "../server/auth0Health";

type Result = { name: string; passed: boolean; error?: string };
const results: Result[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
  }
}

function setEnv(domain?: string, clientId?: string, secret?: string) {
  if (domain === undefined) delete process.env.AUTH0_DOMAIN;
  else process.env.AUTH0_DOMAIN = domain;
  if (clientId === undefined) delete process.env.AUTH0_CLIENT_ID;
  else process.env.AUTH0_CLIENT_ID = clientId;
  if (secret === undefined) delete process.env.AUTH0_CLIENT_SECRET;
  else process.env.AUTH0_CLIENT_SECRET = secret;
}

function mockFetch(responseBody: any, status = 200) {
  (globalThis as any).fetch = async () =>
    new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

// Snapshot original env so we can restore at the end.
const original = {
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  secret: process.env.AUTH0_CLIENT_SECRET,
};
const originalFetch = globalThis.fetch;

async function run() {
  // Silence console during tests so the runner's output stays clean.
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = () => {};
  console.log = () => {};

  await test("invalid_grant → healthy (auth0Usable=true)", async () => {
    setEnv("test.auth0.com", "cid", "csec");
    __resetAuth0HealthForTests();
    mockFetch({ error: "invalid_grant", error_description: "bogus code" });
    await runAuth0HealthCheck();
    if (!isAuth0Usable()) throw new Error("expected usable=true after invalid_grant");
    if (getAuth0HealthStatus().reason !== null) throw new Error("expected reason=null");
  });

  await test("invalid_request → healthy (auth0Usable=true)", async () => {
    setEnv("test.auth0.com", "cid", "csec");
    __resetAuth0HealthForTests();
    mockFetch({ error: "invalid_request" });
    await runAuth0HealthCheck();
    if (!isAuth0Usable()) throw new Error("expected usable=true after invalid_request");
  });

  await test("unauthorized_client → unusable + reason set", async () => {
    setEnv("test.auth0.com", "cid", "csec");
    __resetAuth0HealthForTests();
    mockFetch({
      error: "unauthorized_client",
      error_description: "Grant type 'authorization_code' not allowed for the client",
    });
    await runAuth0HealthCheck();
    if (isAuth0Usable()) throw new Error("expected usable=false after unauthorized_client");
    const reason = getAuth0HealthStatus().reason || "";
    if (!/authorization_code|unauthorized_client/.test(reason)) {
      throw new Error(`expected reason to mention the misconfig, got: ${reason}`);
    }
  });

  await test("invalid_client → unusable", async () => {
    setEnv("test.auth0.com", "cid", "csec");
    __resetAuth0HealthForTests();
    mockFetch({ error: "invalid_client", error_description: "Unauthorized" });
    await runAuth0HealthCheck();
    if (isAuth0Usable()) throw new Error("expected usable=false after invalid_client");
  });

  await test("access_denied → unusable (conservative fallback)", async () => {
    setEnv("test.auth0.com", "cid", "csec");
    __resetAuth0HealthForTests();
    mockFetch({ error: "access_denied" });
    await runAuth0HealthCheck();
    if (isAuth0Usable()) throw new Error("expected usable=false after access_denied");
  });

  await test("unexpected payload (no error field) → unusable", async () => {
    setEnv("test.auth0.com", "cid", "csec");
    __resetAuth0HealthForTests();
    mockFetch({ unexpected: "shape" }, 500);
    await runAuth0HealthCheck();
    if (isAuth0Usable()) throw new Error("expected usable=false on unexpected payload");
  });

  await test("partial env vars (missing AUTH0_CLIENT_SECRET) → unusable + warning", async () => {
    setEnv("test.auth0.com", "cid", undefined);
    __resetAuth0HealthForTests();
    let warned = false;
    console.warn = (...args: any[]) => {
      if (args.join(" ").includes("missing required env var")) warned = true;
    };
    await runAuth0HealthCheck();
    console.warn = () => {};
    if (isAuth0Usable()) throw new Error("expected usable=false when env vars are partial");
    if (!warned) throw new Error("expected a startup warning for missing env vars");
    const reason = getAuth0HealthStatus().reason || "";
    if (!/AUTH0_CLIENT_SECRET/.test(reason)) {
      throw new Error(`expected reason to name the missing var, got: ${reason}`);
    }
  });

  await test("no env vars set → silent (still usable)", async () => {
    setEnv(undefined, undefined, undefined);
    __resetAuth0HealthForTests();
    let warned = false;
    console.warn = () => { warned = true; };
    await runAuth0HealthCheck();
    console.warn = () => {};
    if (!isAuth0Usable()) throw new Error("expected usable=true when Auth0 unconfigured");
    if (warned) throw new Error("should NOT warn when Auth0 is intentionally unconfigured");
  });

  // Restore.
  console.warn = origWarn;
  console.log = origLog;
  globalThis.fetch = originalFetch as any;
  setEnv(original.domain, original.clientId, original.secret);

  console.log("=== Auth0 Health Check Test Results ===");
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.passed) {
      console.log(`  PASS  ${r.name}`);
      passed++;
    } else {
      console.log(`  FAIL  ${r.name}`);
      console.log(`        ${r.error}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
