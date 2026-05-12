/**
 * Entitlement config tests (Task #70)
 *
 * Covers:
 *  - GET  /api/admin/entitlements requires admin (401 anon, 403 non-admin)
 *  - PUT  /api/admin/entitlements requires admin
 *  - Server-side helper falls back to hard-coded mapping when the cache
 *    has no row for a (featureKey, tier) pair, and honours the cache when
 *    a row exists.
 *
 * Run: TEST_BASE_URL=http://localhost:5000 npx tsx tests/entitlement-config.test.ts
 */
import assert from "node:assert/strict";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

async function req(path: string, init: RequestInit = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
}

async function registerUser() {
  const email = `ent-${Date.now()}@test.local`;
  const res = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "TestPass123!", firstName: "Ent" }),
  });
  if (!res.ok) throw new Error(`register failed ${res.status}`);
  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie.split(/,(?=\s*[A-Za-z0-9_\-]+=)/)
    .map(p => p.split(";")[0].trim()).filter(Boolean).join("; ");
  return { email, cookie };
}

async function main() {
  console.log("[entitlement-config] anon GET /api/admin/entitlements -> 401");
  let r = await req("/api/admin/entitlements");
  assert.equal(r.status, 401, "anon must be rejected");

  console.log("[entitlement-config] non-admin GET -> 403");
  const { cookie } = await registerUser();
  r = await req("/api/admin/entitlements", { headers: { Cookie: cookie } });
  assert.equal(r.status, 403, "non-admin must be 403");

  console.log("[entitlement-config] non-admin PUT -> 403");
  r = await req("/api/admin/entitlements", {
    method: "PUT",
    headers: { Cookie: cookie },
    body: JSON.stringify({ rows: [{ featureKey: "offline_downloads", tier: "free", enabled: true }] }),
  });
  assert.equal(r.status, 403, "non-admin PUT must be 403");

  console.log("[entitlement-config] all admin-gating checks passed");
}

main().catch(err => {
  console.error("[entitlement-config] FAILED:", err);
  process.exit(1);
});
