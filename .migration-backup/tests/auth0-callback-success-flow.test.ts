/**
 * End-to-end success-path coverage for /api/auth/callback/auth0 (Task #146).
 *
 * Task #145 + tests/auth0-callback-route.test.ts already pin every documented
 * redirect outcome of the callback handler in isolation, including the
 * happy-path "302 /" response. What was missing — and what real users will
 * notice first if it breaks — is the rest of the sign-in pipeline that
 * hangs off that 302:
 *
 *   1. token exchange returns a profile (we stub the passport-auth0
 *      authenticator so no live tenant or HTTP is needed)
 *   2. the handler calls req.logIn → passport.serializeUser writes to the
 *      session store and Express sets a session cookie
 *   3. the browser follows the redirect, sends the cookie back, and
 *      /api/auth/me deserializes the user and returns the profile
 *
 * To make a regression in any of those steps surface immediately and point
 * at the broken step, we boot an isolated Express app per test with the
 * real makeAuth0CallbackHandler, real passport.initialize/session, real
 * express-session (in-memory store), and the same /api/auth/me route as
 * server/multiAuth.ts. The Auth0 strategy itself is replaced with a stub
 * authenticator we control, so the test never reaches out to the network.
 *
 * Failure modes covered (each asserts a distinct step):
 *   - token exchange fails       → no cookie, redirect to /?auth=failed
 *   - profile upsert fails       → no cookie, redirect to /?auth=failed
 *   - session write fails        → no cookie, redirect to /?auth=failed
 *   - happy path                 → cookie set, /?auth=me returns the user,
 *                                  redirect lands on /
 *
 * Run: npx tsx tests/auth0-callback-success-flow.test.ts
 */

import express, { type Request, type Response } from "express";
import session from "express-session";
import passport from "passport";
import http from "http";
import {
  makeAuth0CallbackHandler,
  type Auth0AuthCallback,
  type PassportLikeUser,
} from "../server/auth0CallbackHandler";

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

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

type FakeUser = { id: string; email: string; firstName?: string };

/**
 * Boot an Express app whose /cb mirrors the production
 * /api/auth/callback/auth0 wiring (real passport + session + handler) and
 * whose /api/auth/me mirrors the production session-only check.
 *
 * `verify` simulates the passport-auth0 verify callback: it receives the
 * caller-supplied profile and returns `{ user }` to log in, an `{ error }`
 * to surface a token-exchange failure, or throws to simulate a profile-upsert
 * (storage.upsertUser) failure.
 */
async function bootApp(opts: {
  // What passport-auth0's verify callback would resolve to.
  verify: () => Promise<{ user?: FakeUser; error?: unknown }> | { user?: FakeUser; error?: unknown };
  // Optional override of passport.serializeUser to simulate a session write
  // failure. When omitted, the default (serialize by id) is used.
  serializeUser?: Parameters<typeof passport.serializeUser>[0];
}) {
  // Use a fresh passport instance per app so each test is hermetic.
  const localPassport = new (passport as any).Passport();
  // In-memory user store; deserializeUser pulls from here on every request.
  const userStore = new Map<string, FakeUser>();

  localPassport.serializeUser(
    opts.serializeUser ??
      ((user: any, done: (err: any, id?: string) => void) => done(null, user.id)),
  );
  localPassport.deserializeUser((id: string, done: (err: any, user?: FakeUser | false) => void) => {
    const u = userStore.get(id);
    done(null, u ?? false);
  });

  const app = express();
  app.use(
    session({
      secret: "test-secret-not-for-production",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", secure: false },
    }),
  );
  app.use(localPassport.initialize());
  app.use(localPassport.session());

  // Stub authenticator: invoked by makeAuth0CallbackHandler with a node-style
  // (err, user) callback. We resolve `verify()` and surface the result the
  // same way passport-auth0 would after a successful token exchange.
  const authenticator = (cb: Auth0AuthCallback) =>
    (async (_req: any, _res: any, _next: any) => {
      try {
        const r = await opts.verify();
        if (r.error) return cb(r.error, null);
        if (!r.user) return cb(null, false);
        // Mirror real passport-auth0: route the verify result through req.logIn
        // by handing it back as `user` to the handler-supplied callback. The
        // handler will call req.logIn(user, ...) which exercises serializeUser
        // and writes the session cookie.
        userStore.set(r.user.id, r.user);
        return cb(null, r.user as PassportLikeUser);
      } catch (err) {
        // verify() throwing = profile upsert step failure
        return cb(err, null);
      }
    }) as any;

  let markedReason: string | null = null;
  app.get(
    "/cb",
    makeAuth0CallbackHandler({
      authenticator,
      markUnusable: (reason) => {
        markedReason = reason;
      },
      warn: () => {}, // silence test noise
    }),
  );

  // Mirror server/multiAuth.ts /api/auth/me
  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (req.isAuthenticated() && req.user) {
      const { passwordHash: _ph, ...userWithoutPassword } = req.user as any;
      return res.json(userWithoutPassword);
    }
    return res.status(401).json({ message: "Not authenticated" });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    get markedReason() {
      return markedReason;
    },
    async get(path: string, cookie?: string) {
      const res = await fetch(`${base}${path}`, {
        redirect: "manual",
        headers: cookie ? { cookie } : undefined,
      });
      return {
        status: res.status,
        location: res.headers.get("location"),
        // Use getSetCookie() so multiple cookies (rare here) round-trip cleanly.
        setCookie: (res.headers as any).getSetCookie?.() as string[] | undefined,
        json: async () => res.json(),
      };
    },
    close() {
      return new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

/** Pull the connect.sid cookie back out for use on a follow-up request. */
function pickSessionCookie(setCookie: string[] | undefined): string | null {
  if (!setCookie || setCookie.length === 0) return null;
  const first = setCookie.find((c) => /^connect\.sid=/.test(c));
  if (!first) return null;
  // Just the name=value part — drop attributes (Path=, HttpOnly, etc).
  return first.split(";")[0];
}

async function run() {
  // ── 1. Happy path: token exchange OK + session write OK + /api/auth/me ───
  await test(
    "success: callback issues session cookie, /api/auth/me returns profile, redirects to /",
    async () => {
      const fakeUser: FakeUser = {
        id: "auth0-123",
        email: "alice@example.com",
        firstName: "Alice",
      };
      const app = await bootApp({
        verify: () => ({ user: fakeUser }),
      });
      try {
        const cb = await app.get("/cb");
        assertEq(cb.status, 302, "callback status");
        assertEq(cb.location, "/", "callback redirect location");
        const cookie = pickSessionCookie(cb.setCookie);
        if (!cookie) {
          throw new Error(
            "session step regressed: callback returned 302 / but did not Set-Cookie. " +
              "req.logIn → passport.serializeUser → session-store write is broken.",
          );
        }

        const me = await app.get("/api/auth/me", cookie);
        if (me.status !== 200) {
          throw new Error(
            `deserialize step regressed: /api/auth/me with the new session cookie returned ${me.status} ` +
              `(expected 200). passport.deserializeUser is not restoring the user that req.logIn just wrote.`,
          );
        }
        const body = (await me.json()) as Record<string, unknown>;
        assertEq(body.id, fakeUser.id, "/api/auth/me id");
        assertEq(body.email, fakeUser.email, "/api/auth/me email");
      } finally {
        await app.close();
      }
    },
  );

  // ── 2. Token exchange fails → /?auth=failed, no cookie ────────────────────
  await test(
    "token-exchange failure: redirects to /?auth=failed and does not establish a session",
    async () => {
      const app = await bootApp({
        verify: () => ({
          // A non-`unauthorized_client` upstream error must NOT flip the
          // health flag and must NOT issue a cookie.
          error: { oauthError: { error: "invalid_grant" } },
        }),
      });
      try {
        const cb = await app.get("/cb");
        assertEq(cb.status, 302, "callback status");
        // Handler returns /?auth=failed&reason=invalid_grant for known codes.
        assertEq(
          cb.location,
          "/?auth=failed&reason=invalid_grant",
          "callback redirect location",
        );
        const cookie = pickSessionCookie(cb.setCookie);
        if (cookie) {
          throw new Error(
            "regression: a failed token exchange should NOT issue a session cookie, " +
              `but Set-Cookie was: ${cookie}`,
          );
        }
        if (app.markedReason) {
          throw new Error(
            "regression: invalid_grant must not flip the Auth0 health flag " +
              "(only unauthorized_client should).",
          );
        }
        // /api/auth/me with no cookie should remain 401.
        const me = await app.get("/api/auth/me");
        assertEq(me.status, 401, "/api/auth/me status without cookie");
      } finally {
        await app.close();
      }
    },
  );

  // ── 3. Profile upsert fails (verify throws) → /?auth=failed, no cookie ───
  await test(
    "profile-upsert failure: verify throws, callback redirects to /?auth=failed without a session",
    async () => {
      const app = await bootApp({
        verify: () => {
          // Simulate storage.upsertUser blowing up inside the passport-auth0
          // verify callback. The handler must classify this as a generic
          // failure (not unauthorized_client) and not establish a session.
          throw new Error("storage.upsertUser: connection refused");
        },
      });
      try {
        const cb = await app.get("/cb");
        assertEq(cb.status, 302, "callback status");
        assertEq(cb.location, "/?auth=failed", "callback redirect location");
        if (pickSessionCookie(cb.setCookie)) {
          throw new Error(
            "regression: a thrown error inside verify (profile upsert) must not establish a session cookie.",
          );
        }
      } finally {
        await app.close();
      }
    },
  );

  // ── 4. Session write fails → /?auth=failed, no usable cookie ──────────────
  await test(
    "session-write failure: serializeUser errors out, callback redirects to /?auth=failed",
    async () => {
      const fakeUser: FakeUser = { id: "auth0-456", email: "bob@example.com" };
      const app = await bootApp({
        verify: () => ({ user: fakeUser }),
        // Simulate the session store / serializer failing (e.g. Postgres
        // session table down). The handler must surface this as an in-app
        // /?auth=failed redirect, NEVER as a 5xx.
        serializeUser: (_user: any, done: (err: any) => void) =>
          done(new Error("session store down")),
      });
      try {
        const cb = await app.get("/cb");
        if (cb.status >= 500) {
          throw new Error(
            `session-write failure regressed to a ${cb.status} server error. ` +
              "The handler must catch req.logIn errors and redirect to /?auth=failed.",
          );
        }
        assertEq(cb.status, 302, "callback status");
        // Handler tags session-write failures with reason=session_error so the
        // UI can show a more specific message ("we logged you in but couldn't
        // save the session") instead of the generic failure copy.
        assertEq(
          cb.location,
          "/?auth=failed&reason=session_error",
          "callback redirect location",
        );

        // Even if a cookie was set, /api/auth/me must not return a user
        // because the session was never populated.
        const cookie = pickSessionCookie(cb.setCookie);
        const me = await app.get("/api/auth/me", cookie ?? undefined);
        assertEq(me.status, 401, "/api/auth/me status after failed login");
      } finally {
        await app.close();
      }
    },
  );

  // ── Print results ─────────────────────────────────────────────────────────
  console.log("=== Auth0 Callback Success-Flow Test Results ===");
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
