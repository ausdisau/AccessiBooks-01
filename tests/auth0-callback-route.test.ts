/**
 * Route-level tests for the /api/auth/callback/auth0 handler (Task #145).
 *
 * The handler is built by `makeAuth0CallbackHandler` in
 * server/auth0CallbackHandler.ts; the production wiring in
 * server/multiAuth.ts injects the real `passport.authenticate("auth0", cb)`
 * as the authenticator.
 *
 * Here we mount the same handler on a tiny Express app and inject a
 * stub authenticator that fires `(err, user)` synchronously. That lets
 * us pin every documented redirect outcome without touching real
 * passport state or hitting the live Auth0 tenant.
 *
 * Required contract (from Task #140 / #145):
 *   - upstream `unauthorized_client`     → 302 /?auth=unavailable
 *   - any other auth error               → 302 /?auth=failed
 *   - !user (no error, no profile)       → 302 /?auth=failed
 *   - login session write failure        → 302 /?auth=failed
 *   - success                            → 302 /
 *
 * Run: npx tsx tests/auth0-callback-route.test.ts
 */

import express from "express";
import http from "http";
import {
  makeAuth0CallbackHandler,
  type Auth0AuthCallback,
} from "../server/auth0CallbackHandler";

type Result = { name: string; passed: boolean; error?: string };
const results: Result[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
  }
}

/**
 * Spin up an ephemeral express app whose /cb route uses the handler
 * under test, with the supplied stub authenticator + markUnusable.
 * Returns `{ get(), close() }`.
 */
async function bootHandler(opts: {
  fire: (cb: Auth0AuthCallback) => void;
  markUnusable?: (reason: string) => void;
  installLogIn?: boolean;
  loginErr?: unknown;
}) {
  const app = express();

  if (opts.installLogIn) {
    app.use((req, _res, next) => {
      (req as any).logIn = (
        _user: unknown,
        done: (err?: unknown) => void,
      ) => done(opts.loginErr);
      next();
    });
  }

  app.get(
    "/cb",
    makeAuth0CallbackHandler({
      authenticator: (cb) => (_req, _res, _next) => {
        // Defer to next tick so we mirror real passport.authenticate
        // (which always invokes its callback asynchronously after the
        // token exchange).
        setImmediate(() => opts.fire(cb));
      },
      markUnusable: opts.markUnusable ?? (() => {}),
      warn: () => {}, // silence test output
    }),
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  return {
    async get(path: string) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        redirect: "manual",
      });
      return {
        status: res.status,
        location: res.headers.get("location"),
      };
    },
    close() {
      return new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function run() {
  // ── Branch 1: unauthorized_client → /?auth=unavailable ────────────────────
  await test(
    "callback with unauthorized_client error redirects to /?auth=unavailable and flips health flag",
    async () => {
      let markedReason: string | null = null;
      const app = await bootHandler({
        fire: (cb) =>
          cb(
            {
              oauthError: {
                statusCode: 403,
                data: JSON.stringify({
                  error: "unauthorized_client",
                  error_description:
                    "Grant type 'authorization_code' not allowed for the client.",
                }),
              },
            },
            null,
          ),
        markUnusable: (reason) => {
          markedReason = reason;
        },
      });
      try {
        const r = await app.get("/cb");
        assertEq(r.status, 302, "status");
        assertEq(r.location, "/?auth=unavailable", "Location");
        if (!markedReason) {
          throw new Error("markUnusable was not called");
        }
      } finally {
        await app.close();
      }
    },
  );

  // Same outcome when oauthError.data is already parsed (object shape).
  await test(
    "callback with unauthorized_client (parsed-object data shape) redirects to /?auth=unavailable",
    async () => {
      let marked = false;
      const app = await bootHandler({
        fire: (cb) =>
          cb(
            { oauthError: { data: { error: "unauthorized_client" } } },
            null,
          ),
        markUnusable: () => {
          marked = true;
        },
      });
      try {
        const r = await app.get("/cb");
        assertEq(r.status, 302, "status");
        assertEq(r.location, "/?auth=unavailable", "Location");
        if (!marked) throw new Error("markUnusable was not called");
      } finally {
        await app.close();
      }
    },
  );

  // ── Branch 2: any other auth error → /?auth=failed ────────────────────────
  await test(
    "callback with invalid_grant error redirects to /?auth=failed (and does NOT flip health flag)",
    async () => {
      let marked = false;
      const app = await bootHandler({
        fire: (cb) =>
          cb(
            { oauthError: { data: JSON.stringify({ error: "invalid_grant" }) } },
            null,
          ),
        markUnusable: () => {
          marked = true;
        },
      });
      try {
        const r = await app.get("/cb");
        assertEq(r.status, 302, "status");
        assertEq(r.location, "/?auth=failed", "Location");
        if (marked) {
          throw new Error(
            "markUnusable must NOT be called for non-unauthorized_client errors",
          );
        }
      } finally {
        await app.close();
      }
    },
  );

  await test(
    "callback with access_denied error redirects to /?auth=failed",
    async () => {
      const app = await bootHandler({
        fire: (cb) => cb({ oauthError: { error: "access_denied" } }, null),
      });
      try {
        const r = await app.get("/cb");
        assertEq(r.status, 302, "status");
        assertEq(r.location, "/?auth=failed", "Location");
      } finally {
        await app.close();
      }
    },
  );

  await test(
    "callback with a plain network Error redirects to /?auth=failed",
    async () => {
      const app = await bootHandler({
        fire: (cb) => cb(new Error("ECONNRESET"), null),
      });
      try {
        const r = await app.get("/cb");
        assertEq(r.status, 302, "status");
        assertEq(r.location, "/?auth=failed", "Location");
      } finally {
        await app.close();
      }
    },
  );

  // ── Branch 3: !err but !user → /?auth=failed ──────────────────────────────
  await test(
    "callback with no error but no user redirects to /?auth=failed",
    async () => {
      const app = await bootHandler({ fire: (cb) => cb(null, false) });
      try {
        const r = await app.get("/cb");
        assertEq(r.status, 302, "status");
        assertEq(r.location, "/?auth=failed", "Location");
      } finally {
        await app.close();
      }
    },
  );

  // ── Branch 4: login session write failure → /?auth=failed ─────────────────
  await test(
    "callback with valid user but req.logIn failure redirects to /?auth=failed",
    async () => {
      const app = await bootHandler({
        fire: (cb) => cb(null, { id: 42, email: "x@example.com" }),
        installLogIn: true,
        loginErr: new Error("session store down"),
      });
      try {
        const r = await app.get("/cb");
        assertEq(r.status, 302, "status");
        assertEq(r.location, "/?auth=failed", "Location");
      } finally {
        await app.close();
      }
    },
  );

  // ── Branch 5: success → / ─────────────────────────────────────────────────
  await test("callback with valid user and successful login redirects to /", async () => {
    const app = await bootHandler({
      fire: (cb) => cb(null, { id: 42, email: "x@example.com" }),
      installLogIn: true,
    });
    try {
      const r = await app.get("/cb");
      assertEq(r.status, 302, "status");
      assertEq(r.location, "/", "Location");
    } finally {
      await app.close();
    }
  });

  // ── Print results ─────────────────────────────────────────────────────────
  console.log("=== Auth0 Callback Route Test Results ===");
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
  console.error(err);
  process.exit(1);
});
