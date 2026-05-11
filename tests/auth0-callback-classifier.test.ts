/**
 * Unit tests for server/auth0CallbackClassifier.ts (Task #145).
 *
 * The /api/auth/callback/auth0 custom callback in server/multiAuth.ts uses
 * `classifyAuth0CallbackError(err)` to decide whether passport-auth0 just
 * surfaced the `unauthorized_client` grant-type misconfig (→ flip the cached
 * Auth0 health flag and redirect to /?auth=unavailable) or some other error
 * (→ generic /?auth=failed).
 *
 * passport-auth0 / the underlying oauth2 layer surface upstream errors in a
 * handful of shapes depending on version, transport, and whether the token
 * endpoint returned a body. A regression in the classifier would silently
 * stop catching the misconfig and bounce real users back to a broken Auth0
 * page. These tests pin the contract for every shape we've seen.
 *
 * Run: npx tsx tests/auth0-callback-classifier.test.ts
 */

import { classifyAuth0CallbackError } from "../server/auth0CallbackClassifier";

type Result = { name: string; passed: boolean; error?: string };
const results: Result[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
  }
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── unauthorized_client (the case that motivated Task #140 + #145) ─────────

test("err.oauthError.data is a JSON string with unauthorized_client", () => {
  // This is the most common shape we see from passport-auth0 in production:
  // the underlying oauth2 layer hands us the raw token-endpoint response body.
  const err = {
    oauthError: {
      statusCode: 403,
      data: JSON.stringify({
        error: "unauthorized_client",
        error_description: "Grant type 'authorization_code' not allowed for the client.",
      }),
    },
  };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "unauthorized_client", "kind");
  if (c.kind !== "unauthorized_client") return;
  if (!/authorization_code/.test(c.reason)) {
    throw new Error(`reason should mention the misconfig, got: ${c.reason}`);
  }
});

test("err.oauthError.data is already a parsed object", () => {
  const err = {
    oauthError: {
      data: {
        error: "unauthorized_client",
        error_description: "Grant disabled",
      },
    },
  };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "unauthorized_client", "kind");
  if (c.kind !== "unauthorized_client") return;
  assertEq(c.reason, "Grant disabled", "reason");
});

test("err.oauthError.error is the bare code (no body)", () => {
  const err = { oauthError: { error: "unauthorized_client" } };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "unauthorized_client", "kind");
});

test("err.error is the bare code (no nested oauthError)", () => {
  const err = { error: "unauthorized_client" };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "unauthorized_client", "kind");
});

test("missing error_description falls back to a sensible default reason", () => {
  const err = { oauthError: { error: "unauthorized_client" } };
  const c = classifyAuth0CallbackError(err);
  if (c.kind !== "unauthorized_client") throw new Error("expected unauthorized_client");
  if (!c.reason || !/unauthorized_client/.test(c.reason)) {
    throw new Error(`expected default reason mentioning unauthorized_client, got: ${c.reason}`);
  }
});

test("malformed JSON in err.oauthError.data does not throw", () => {
  const err = { oauthError: { data: "not-json{{" } };
  // Should fall back to "other" without throwing.
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "other", "kind");
});

// ── other error codes (must NOT misclassify as unauthorized_client) ────────

test("invalid_grant is classified as 'other'", () => {
  const err = {
    oauthError: { data: JSON.stringify({ error: "invalid_grant" }) },
  };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "other", "kind");
  if (c.kind === "other") assertEq(c.code, "invalid_grant", "code");
});

test("access_denied is classified as 'other'", () => {
  const err = { oauthError: { error: "access_denied" } };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "other", "kind");
});

test("invalid_client is classified as 'other' (handled separately upstream)", () => {
  // invalid_client is handled by the boot probe (server/auth0Health.ts).
  // The runtime callback path treats it as "other" → /?auth=failed.
  const err = { oauthError: { data: JSON.stringify({ error: "invalid_client" }) } };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "other", "kind");
});

test("plain Error with only a message is classified as 'other'", () => {
  const c = classifyAuth0CallbackError(new Error("network timeout"));
  assertEq(c.kind, "other", "kind");
  if (c.kind === "other") assertEq(c.code, null, "code");
});

test("null / undefined / non-object inputs do not throw", () => {
  assertEq(classifyAuth0CallbackError(null).kind, "other", "null");
  assertEq(classifyAuth0CallbackError(undefined).kind, "other", "undefined");
  assertEq(classifyAuth0CallbackError("oops").kind, "other", "string");
  assertEq(classifyAuth0CallbackError(42).kind, "other", "number");
});

// ── Precedence / fallback edge cases ────────────────────────────────────────

test("oauthError.data wins over top-level err.code when both disagree", () => {
  // Locks parsing precedence: the inner OAuth body is the source of truth,
  // not a generic outer code passport may attach.
  const err = {
    code: "invalid_grant",
    oauthError: { data: JSON.stringify({ error: "unauthorized_client" }) },
  };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "unauthorized_client", "kind");
});

test("malformed oauthError.data falls back to err.code", () => {
  // If the token-endpoint body is unparsable, we must not crash and must
  // still surface the next-best signal (top-level code) to the route.
  const err = {
    code: "unauthorized_client",
    oauthError: { data: "<html>500</html>" },
  };
  const c = classifyAuth0CallbackError(err);
  assertEq(c.kind, "unauthorized_client", "kind");
});

// ── Print results ───────────────────────────────────────────────────────────

console.log("=== Auth0 Callback Classifier Test Results ===");
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
