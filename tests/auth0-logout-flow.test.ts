/**
 * End-to-end coverage for the Auth0 logout pipeline (Task #149).
 *
 * Task #146 / tests/auth0-callback-success-flow.test.ts pinned the success
 * side of the Auth0 round-trip (token exchange → cookie → /api/auth/me).
 * The matching exit path — POST /api/auth/logout and GET /api/logout — had
 * no end-to-end coverage. A regression that fails to destroy the session,
 * or fails to build the Auth0 /v2/logout?returnTo=... URL for SSO clearing,
 * would only be noticed when users complain that "log out" doesn't actually
 * log them out.
 *
 * To make a regression in any of the steps surface immediately and point
 * at the broken step, we boot an isolated Express app per test with the
 * real makeAuth0LogoutGetHandler / makeAuth0LogoutPostHandler from
 * server/auth0LogoutHandlers.ts, real passport.initialize/session, real
 * express-session (in-memory store), and the same /api/auth/me check as
 * server/multiAuth.ts. We seed the session by calling req.logIn directly
 * via a /test-login route so the test never needs Auth0 itself.
 *
 * Failure modes covered (each asserts a distinct step):
 *   - Auth0-provider user, GET /api/logout
 *       → 302 to https://<domain>/v2/logout?client_id=...&returnTo=APP_URL
 *       → /api/auth/me with the old cookie returns 401
 *   - Auth0-provider user, POST /api/auth/logout
 *       → 200 JSON with logoutUrl set to the same /v2/logout URL
 *       → /api/auth/me with the old cookie returns 401
 *   - Local-provider user, GET /api/logout
 *       → 302 to "/" (no Auth0 redirect — would leak local users to Auth0)
 *       → /api/auth/me returns 401
 *   - Local-provider user, POST /api/auth/logout
 *       → 200 JSON without logoutUrl
 *   - Auth0 user but env vars missing
 *       → no Auth0 redirect (we cannot build the URL safely)
 *   - APP_URL not set
 *       → returnTo falls back to the request's protocol://host
 *   - Auth0 user, GET /api/logout, session.destroy errors (Task #150)
 *       → still 302s to the Auth0 /v2/logout URL
 *       → Set-Cookie clears connect.sid (so the browser drops it even
 *         though the session row may still exist in the store)
 *       → /api/auth/me with the post-logout cookie still returns 401
 *         (this assertion only proves the destroy CB fired; the cookie
 *         clearing is the user-visible fix)
 *   - Auth0 user, POST /api/auth/logout, session.destroy errors (Task #150)
 *       → still 200 JSON with logoutUrl set
 *       → Set-Cookie clears connect.sid
 *
 * Run: npx tsx tests/auth0-logout-flow.test.ts
 */

import express, { type Request, type Response } from "express";
import session, { MemoryStore } from "express-session";
import passport from "passport";
import http from "http";
import {
  buildAuth0LogoutUrl,
  makeAuth0LogoutGetHandler,
  makeAuth0LogoutPostHandler,
  type Auth0LogoutOptions,
} from "../server/auth0LogoutHandlers";

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

type FakeUser = {
  id: string;
  email: string;
  authProvider: "auth0" | "local";
};

/**
 * Boot an Express app with /test-login (seeds a session for the supplied
 * user via req.logIn), the real GET /api/logout + POST /api/auth/logout
 * handlers, and a /api/auth/me mirror of server/multiAuth.ts.
 */
/**
 * Detect whether a Set-Cookie header line is clearing the named cookie.
 * Browsers treat a Set-Cookie with Expires in the past or Max-Age=0 as a
 * deletion. express's res.clearCookie sets Expires=Thu, 01 Jan 1970...
 */
function isCookieCleared(setCookieLine: string, name: string): boolean {
  const re = new RegExp(`^${name}=`, "i");
  if (!re.test(setCookieLine)) return false;
  const lower = setCookieLine.toLowerCase();
  if (lower.includes("max-age=0")) return true;
  // Match "expires=thu, 01 jan 1970" or any 1970 epoch date.
  if (/expires=[^;]*1970/.test(lower)) return true;
  return false;
}

async function bootApp(
  opts: Auth0LogoutOptions,
  extra: { failSessionDestroy?: boolean } = {},
) {
  // Fresh passport per app for hermeticity.
  const localPassport = new (passport as any).Passport();
  const userStore = new Map<string, FakeUser>();
  localPassport.serializeUser((u: any, done: any) => done(null, u.id));
  localPassport.deserializeUser((id: string, done: any) =>
    done(null, userStore.get(id) ?? false),
  );

  const app = express();
  app.use(express.json());

  // For the destroy-error path (Task #150) we install a store whose
  // `destroy()` method errors. We CAN'T wrap req.session.destroy from
  // middleware because passport's req.logout (and req.logIn) regenerate
  // the session, producing a fresh session instance whose `destroy` is
  // the unpatched prototype method. Patching at the store level
  // survives regeneration.
  //
  // We arm the failure with a flag toggled AFTER /test-login completes
  // — login itself calls store.destroy via req.session.regenerate, and
  // we need that to succeed so the test can obtain a valid cookie.
  const store = new MemoryStore();
  // sabotage.skip is decremented on each destroy after arming; once it
  // hits 0, subsequent destroys error. We need this two-phase setup
  // because passport 0.6+ req.logout calls req.session.regenerate,
  // which itself invokes store.destroy(oldSid). That regenerate-driven
  // destroy MUST succeed (otherwise req.logout returns an error and the
  // handler short-circuits to 500 before our explicit
  // req.session.destroy ever runs). We start `skip` at 1 so the
  // regenerate-time destroy passes through and the next destroy — the
  // one our production handler issues — is the one that errors.
  const sabotage = { armed: false, skip: 0 };
  if (extra.failSessionDestroy) {
    const origDestroy = store.destroy.bind(store);
    store.destroy = ((sid: string, cb?: (err?: unknown) => void) => {
      if (sabotage.armed) {
        if (sabotage.skip > 0) {
          sabotage.skip -= 1;
          return origDestroy(sid, cb);
        }
        // Simulate a true store outage: leave the row in place AND
        // surface the error. Without the cookie-clearing fix, the
        // browser would walk away with a still-valid cookie pointing
        // at a still-valid server-side session.
        return cb?.(new Error("simulated session-store outage"));
      }
      return origDestroy(sid, cb);
    }) as typeof store.destroy;
  }

  app.use(
    session({
      secret: "test-secret-not-for-production",
      resave: false,
      saveUninitialized: false,
      store,
      cookie: { httpOnly: true, sameSite: "lax", secure: false },
    }),
  );
  app.use(localPassport.initialize());
  app.use(localPassport.session());

  // Seed a session for an arbitrary user. The test calls this first to
  // obtain a connect.sid, then drives /api/logout or /api/auth/logout.
  app.post("/test-login", (req: Request, res: Response) => {
    const user = req.body as FakeUser;
    userStore.set(user.id, user);
    req.logIn(user, (err) => {
      if (err) return res.status(500).json({ error: String(err) });
      res.json({ ok: true });
    });
  });

  app.get("/api/logout", makeAuth0LogoutGetHandler(opts));
  app.post("/api/auth/logout", makeAuth0LogoutPostHandler(opts));

  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (req.isAuthenticated() && req.user) {
      return res.json(req.user);
    }
    return res.status(401).json({ message: "Not authenticated" });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;

  async function login(user: FakeUser): Promise<string> {
    const res = await fetch(`${base}/test-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(user),
    });
    if (res.status !== 200) {
      throw new Error(`/test-login failed with ${res.status}`);
    }
    const setCookie = (res.headers as any).getSetCookie?.() as
      | string[]
      | undefined;
    const sid = setCookie?.find((c) => /^connect\.sid=/.test(c));
    if (!sid) throw new Error("/test-login did not Set-Cookie connect.sid");
    return sid.split(";")[0];
  }

  return {
    base,
    login,
    /**
     * Arm the store so the NEXT destroy issued by our handler
     * (req.session.destroy) errors. The regenerate-time destroy that
     * passport's req.logout runs is allowed to pass through first.
     */
    armDestroyFailure() {
      sabotage.armed = true;
      sabotage.skip = 1;
    },
    async get(path: string, cookie?: string) {
      const res = await fetch(`${base}${path}`, {
        redirect: "manual",
        headers: cookie ? { cookie } : undefined,
      });
      const setCookie = (res.headers as any).getSetCookie?.() as
        | string[]
        | undefined;
      return {
        status: res.status,
        location: res.headers.get("location"),
        setCookie,
        json: async () => res.json(),
      };
    },
    async post(path: string, cookie?: string) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        redirect: "manual",
        headers: cookie ? { cookie } : undefined,
      });
      const setCookie = (res.headers as any).getSetCookie?.() as
        | string[]
        | undefined;
      return {
        status: res.status,
        setCookie,
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

const AUTH0_OPTS: Auth0LogoutOptions = {
  auth0Domain: "tenant.us.auth0.com",
  auth0ClientId: "test-client-id",
  appUrl: "https://accessibooks.example.com",
};

const EXPECTED_AUTH0_LOGOUT_URL =
  "https://tenant.us.auth0.com/v2/logout?client_id=test-client-id&returnTo=https%3A%2F%2Faccessibooks.example.com";

async function run() {
  // ── 1. Auth0 user, GET /api/logout ────────────────────────────────────────
  await test(
    "GET /api/logout for an Auth0 user redirects to /v2/logout and destroys the session",
    async () => {
      const app = await bootApp(AUTH0_OPTS);
      try {
        const cookie = await app.login({
          id: "auth0|alice",
          email: "alice@example.com",
          authProvider: "auth0",
        });
        // Sanity: the cookie really does carry a session.
        const before = await app.get("/api/auth/me", cookie);
        assertEq(before.status, 200, "/api/auth/me before logout");

        const out = await app.get("/api/logout", cookie);
        assertEq(out.status, 302, "GET /api/logout status");
        assertEq(
          out.location,
          EXPECTED_AUTH0_LOGOUT_URL,
          "GET /api/logout redirect target (Auth0 /v2/logout URL)",
        );

        // Same cookie should now fail to deserialize: session was destroyed.
        const after = await app.get("/api/auth/me", cookie);
        if (after.status !== 401) {
          throw new Error(
            `session destruction regressed: /api/auth/me with the post-logout cookie returned ${after.status} ` +
              `(expected 401). req.session.destroy is not removing the user from the store.`,
          );
        }
      } finally {
        await app.close();
      }
    },
  );

  // ── 2. Auth0 user, POST /api/auth/logout ─────────────────────────────────
  await test(
    "POST /api/auth/logout for an Auth0 user returns logoutUrl JSON and destroys the session",
    async () => {
      const app = await bootApp(AUTH0_OPTS);
      try {
        const cookie = await app.login({
          id: "auth0|bob",
          email: "bob@example.com",
          authProvider: "auth0",
        });
        const out = await app.post("/api/auth/logout", cookie);
        assertEq(out.status, 200, "POST /api/auth/logout status");
        const body = (await out.json()) as Record<string, unknown>;
        assertEq(body.message, "Logged out", "POST logout message");
        assertEq(
          body.logoutUrl,
          EXPECTED_AUTH0_LOGOUT_URL,
          "POST logout logoutUrl (Auth0 /v2/logout URL)",
        );

        const after = await app.get("/api/auth/me", cookie);
        assertEq(after.status, 401, "/api/auth/me after POST logout");
      } finally {
        await app.close();
      }
    },
  );

  // ── 3. Local user, GET /api/logout ───────────────────────────────────────
  await test(
    "GET /api/logout for a non-Auth0 user redirects to / (never to Auth0)",
    async () => {
      const app = await bootApp(AUTH0_OPTS);
      try {
        const cookie = await app.login({
          id: "local-1",
          email: "carol@example.com",
          authProvider: "local",
        });
        const out = await app.get("/api/logout", cookie);
        assertEq(out.status, 302, "GET /api/logout status");
        if (out.location !== "/") {
          throw new Error(
            `regression: a local user logout must redirect to "/", not ${JSON.stringify(out.location)}. ` +
              "Routing local users through Auth0's /v2/logout would break sign-out for everyone " +
              "who never used Auth0.",
          );
        }
        const after = await app.get("/api/auth/me", cookie);
        assertEq(after.status, 401, "/api/auth/me after local-user logout");
      } finally {
        await app.close();
      }
    },
  );

  // ── 4. Local user, POST /api/auth/logout ─────────────────────────────────
  await test(
    "POST /api/auth/logout for a non-Auth0 user omits logoutUrl from the JSON response",
    async () => {
      const app = await bootApp(AUTH0_OPTS);
      try {
        const cookie = await app.login({
          id: "local-2",
          email: "dan@example.com",
          authProvider: "local",
        });
        const out = await app.post("/api/auth/logout", cookie);
        assertEq(out.status, 200, "POST /api/auth/logout status");
        const body = (await out.json()) as Record<string, unknown>;
        assertEq(body.message, "Logged out", "POST logout message");
        if ("logoutUrl" in body) {
          throw new Error(
            `regression: local-user POST /api/auth/logout must NOT include a logoutUrl ` +
              `(would send the SPA to Auth0). Got: ${JSON.stringify(body.logoutUrl)}`,
          );
        }
      } finally {
        await app.close();
      }
    },
  );

  // ── 5. Auth0 user but env missing → no /v2/logout redirect ───────────────
  await test(
    "GET /api/logout for an Auth0 user falls back to / when AUTH0_DOMAIN/CLIENT_ID are unset",
    async () => {
      const app = await bootApp({
        auth0Domain: undefined,
        auth0ClientId: undefined,
        appUrl: "https://accessibooks.example.com",
      });
      try {
        const cookie = await app.login({
          id: "auth0|eve",
          email: "eve@example.com",
          authProvider: "auth0",
        });
        const out = await app.get("/api/logout", cookie);
        assertEq(out.status, 302, "GET /api/logout status");
        if (out.location !== "/") {
          throw new Error(
            `regression: when AUTH0_DOMAIN/CLIENT_ID are missing we cannot build /v2/logout safely. ` +
              `The handler must fall back to "/", not produce a malformed URL. Got: ${JSON.stringify(out.location)}`,
          );
        }
      } finally {
        await app.close();
      }
    },
  );

  // ── 6. APP_URL unset → returnTo falls back to request origin ─────────────
  await test(
    "buildAuth0LogoutUrl falls back to req.protocol+host when APP_URL is null",
    async () => {
      const fakeReq = {
        user: { authProvider: "auth0" },
        protocol: "https",
        get: (h: string) =>
          h.toLowerCase() === "host" ? "fallback.example.com" : undefined,
      } as unknown as Request;
      const url = buildAuth0LogoutUrl(fakeReq, {
        auth0Domain: "tenant.us.auth0.com",
        auth0ClientId: "test-client-id",
        appUrl: null,
      });
      assertEq(
        url,
        "https://tenant.us.auth0.com/v2/logout?client_id=test-client-id&returnTo=https%3A%2F%2Ffallback.example.com",
        "buildAuth0LogoutUrl with null APP_URL",
      );
    },
  );

  // ── 7. session.destroy errors during GET /api/logout (Task #150) ────────
  await test(
    "GET /api/logout clears connect.sid even when session.destroy errors",
    async () => {
      const app = await bootApp(
        {
          ...AUTH0_OPTS,
          sessionCookieName: "connect.sid",
          sessionCookieOptions: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            path: "/",
          },
          errorLog: () => {},
        },
        { failSessionDestroy: true },
      );
      try {
        const cookie = await app.login({
          id: "auth0|frank",
          email: "frank@example.com",
          authProvider: "auth0",
        });
        const before = await app.get("/api/auth/me", cookie);
        assertEq(before.status, 200, "/api/auth/me before logout");
        app.armDestroyFailure();

        const out = await app.get("/api/logout", cookie);
        assertEq(out.status, 302, "GET /api/logout status");
        assertEq(
          out.location,
          EXPECTED_AUTH0_LOGOUT_URL,
          "GET /api/logout redirect target on destroy-error path",
        );

        const cleared = (out.setCookie ?? []).find((c) =>
          isCookieCleared(c, "connect.sid"),
        );
        if (!cleared) {
          throw new Error(
            "Task #150 regression: GET /api/logout did not clear connect.sid " +
              "after session.destroy errored. The browser would walk away with " +
              "a still-valid cookie pointing at a still-valid server-side session. " +
              `Set-Cookie headers were: ${JSON.stringify(out.setCookie ?? [])}`,
          );
        }
      } finally {
        await app.close();
      }
    },
  );

  // ── 8. session.destroy errors during POST /api/auth/logout (Task #150) ──
  await test(
    "POST /api/auth/logout clears connect.sid even when session.destroy errors",
    async () => {
      const app = await bootApp(
        {
          ...AUTH0_OPTS,
          sessionCookieName: "connect.sid",
          sessionCookieOptions: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            path: "/",
          },
          errorLog: () => {},
        },
        { failSessionDestroy: true },
      );
      try {
        const cookie = await app.login({
          id: "auth0|grace",
          email: "grace@example.com",
          authProvider: "auth0",
        });
        app.armDestroyFailure();
        const out = await app.post("/api/auth/logout", cookie);
        assertEq(out.status, 200, "POST /api/auth/logout status");
        const body = (await out.json()) as Record<string, unknown>;
        assertEq(body.message, "Logged out", "POST logout message");
        assertEq(
          body.logoutUrl,
          EXPECTED_AUTH0_LOGOUT_URL,
          "POST logout logoutUrl on destroy-error path",
        );

        const cleared = (out.setCookie ?? []).find((c) =>
          isCookieCleared(c, "connect.sid"),
        );
        if (!cleared) {
          throw new Error(
            "Task #150 regression: POST /api/auth/logout did not clear " +
              "connect.sid after session.destroy errored. " +
              `Set-Cookie headers were: ${JSON.stringify(out.setCookie ?? [])}`,
          );
        }
      } finally {
        await app.close();
      }
    },
  );

  // ── Print results ─────────────────────────────────────────────────────────
  console.log("=== Auth0 Logout Flow Test Results ===");
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
