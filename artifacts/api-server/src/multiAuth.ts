/**
 * multiAuth.ts — OAuth social login strategies (active, used alongside auth.ts)
 *
 * Responsibility: registers Passport strategies for Google, Facebook, Microsoft,
 * and Auth0 (when the corresponding env vars are set). Also provides the
 * isAuthenticated middleware used throughout the server.
 *
 * Does NOT own session setup — that is done in auth.ts.
 * Does NOT handle Auth0 JWT token verification — that is in auth0.ts.
 */
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as Auth0Strategy } from "passport-auth0";
import * as oidcClient from "openid-client";
import { Strategy as OidcStrategy, type VerifyFunction } from "openid-client/passport";
import memoize from "memoizee";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPg from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import type { Express, Request, RequestHandler, Response, NextFunction } from "express";
import { storage } from "./storage";
import { users } from "@workspace/db";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { isAuth0Usable, markAuth0Unusable } from "./auth0Health";
import { makeAuth0CallbackHandler } from "./auth0CallbackHandler";
import {
  makeAuth0LogoutGetHandler,
  makeAuth0LogoutPostHandler,
} from "./auth0LogoutHandlers";

// Per-IP limiters — coarse shield against distributed attacks
const authLoginIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${req.ip ?? "unknown"}`,
  message: { message: "Too many login attempts. Please try again later." },
  skipSuccessfulRequests: true,
});

const authRegisterIpRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${req.ip ?? "unknown"}`,
  message: { message: "Too many registration attempts. Please try again later." },
});

// Per-identifier limiters — targeted lockout so a single account cannot be
// hammered even from many distributed IPs.
const authLoginIdentifierRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const id = (req.body?.email ?? req.body?.username ?? "").toString().toLowerCase().trim();
    return `id:login:${id || "unknown"}`;
  },
  message: { message: "Too many login attempts for this account. Please try again later." },
  skipSuccessfulRequests: true,
});

const authRegisterIdentifierRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req.body?.email ?? "").toString().toLowerCase().trim();
    return `id:register:${email || "unknown"}`;
  },
  message: { message: "Too many registration attempts for this address. Please try again later." },
});

// Local strategy (username/password)
passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        // Try DB first, then fall back to in-memory store (used when DB is full)
        let user: typeof users.$inferSelect | undefined;
        try {
          const [dbUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, email));
          user = dbUser;
        } catch {
          // DB query failed — fall through to in-memory check below
        }

        // Check in-memory store if not found in DB (covers DB-full registration fallback)
        if (!user) {
          user = storage.getMemUserByEmail(email) as typeof users.$inferSelect | undefined;
        }

        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }

        if (!user.passwordHash) {
          return done(null, false, { message: "Please use OAuth to sign in" });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return done(null, false, { message: "Invalid email or password" });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

const APP_URL = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, "") : null;

// ── Replit-managed Google OAuth (OpenID Connect) ─────────────────────────────
// We no longer maintain our own Google OAuth client. Instead we use Replit's
// managed OIDC provider (the "Log In with Replit" flow), which lets the user
// sign in with Google (and other providers) without us holding any
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. The user is upserted into our
// existing storage so the rest of the app sees the same session shape.
//
// Strategy is registered per-hostname because the OIDC callback URL must be
// absolute and match the host the browser landed on.
const REPLIT_OIDC_ENABLED = !!(process.env.REPL_ID && process.env.REPLIT_DOMAINS);

// Subset of the Replit OIDC ID-token claims we read on the verify callback.
// `idp` (identity provider) is set by Replit's OIDC issuer to the upstream
// social provider used for the sign-in (e.g. "google-oauth2"); we use it to
// enforce that the "Continue with Google" button only accepts Google identities.
interface ReplitOidcClaims {
  sub?: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  profile_image_url?: string | null;
  picture?: string | null;
  idp?: string | null;
  identity_provider?: string | null;
}

// Identity-provider claim values that Replit OIDC reports for a Google upstream.
// We accept any of these so the route stays "Google-only" even if the issuer
// label changes between bare "google" and "google-oauth2".
const GOOGLE_IDP_VALUES = new Set(["google", "google-oauth2"]);

// Build an allowlist of hostnames the Replit OIDC strategy is permitted to
// register a callback URL for. Without this, an attacker could spoof the Host
// header and force registration of an arbitrary callback URL (and grow the
// strategy cache without bound).
const ALLOWED_OIDC_HOSTS: ReadonlySet<string> = (() => {
  const hosts = new Set<string>();
  for (const h of (process.env.REPLIT_DOMAINS || "").split(",")) {
    const v = h.trim().toLowerCase();
    if (v) hosts.add(v);
  }
  if (APP_URL) {
    try {
      hosts.add(new URL(APP_URL).hostname.toLowerCase());
    } catch {
      /* APP_URL malformed — ignore */
    }
  }
  return hosts;
})();

function isAllowedOidcHost(hostname: string): boolean {
  return ALLOWED_OIDC_HOSTS.has(hostname.toLowerCase());
}

const getOidcConfig = memoize(
  async () => {
    return await oidcClient.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

const registeredOidcStrategies = new Set<string>();

async function ensureGoogleOidcStrategy(hostname: string) {
  const strategyName = `google:${hostname}`;
  if (registeredOidcStrategies.has(strategyName)) return strategyName;

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: oidcClient.TokenEndpointResponse & oidcClient.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const claims = tokens.claims() as ReplitOidcClaims | undefined;
      if (!claims?.sub) {
        return verified(new Error("Replit OIDC response missing sub claim"));
      }
      // The "Continue with Google" button must only accept Google identities.
      // Replit OIDC also brokers other providers; if the upstream `idp` claim is
      // present and is anything other than Google, refuse the login so a user
      // who picks (e.g.) GitHub at the Replit consent screen does not silently
      // get provisioned as a Google account here.
      const idp = claims.idp ?? claims.identity_provider ?? null;
      if (idp && !GOOGLE_IDP_VALUES.has(String(idp).toLowerCase())) {
        return verified(
          new Error(`Replit OIDC returned non-Google identity provider: ${idp}`),
        );
      }
      const sub = String(claims.sub);
      const user = await storage.upsertUser({
        // Keep the legacy `google-` prefix so existing accounts that signed in
        // via the old self-managed Google OAuth strategy continue to resolve
        // to the same row. New users get the prefix on first login.
        id: sub.startsWith("google-") ? sub : `google-${sub}`,
        email: claims.email ?? null,
        firstName: claims.first_name ?? claims.given_name ?? null,
        lastName: claims.last_name ?? claims.family_name ?? null,
        profileImageUrl: claims.profile_image_url ?? claims.picture ?? null,
        authProvider: "google",
        providerId: sub,
      });
      verified(null, user);
    } catch (err) {
      verified(err as Error);
    }
  };

  const strategy = new OidcStrategy(
    {
      name: strategyName,
      config,
      scope: "openid email profile",
      callbackURL: `https://${hostname}/api/auth/google/callback`,
    },
    verify,
  );
  passport.use(strategy);
  registeredOidcStrategies.add(strategyName);
  return strategyName;
}

// Auth0 Strategy (Universal Login / Authorization Code flow)
// Callback path matches the URL whitelisted in the Auth0 application settings:
//   <APP_URL>/api/auth/callback/auth0
if (process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET) {
  const auth0CallbackURL = APP_URL
    ? `${APP_URL}/api/auth/callback/auth0`
    : "/api/auth/callback/auth0";
  passport.use(
    new Auth0Strategy(
      {
        domain: process.env.AUTH0_DOMAIN,
        clientID: process.env.AUTH0_CLIENT_ID,
        clientSecret: process.env.AUTH0_CLIENT_SECRET,
        callbackURL: auth0CallbackURL,
        // Pass the API audience so Auth0 returns an access token usable against
        // our own API (in addition to the ID token). This is what makes downstream
        // M2M-style API calls possible from the user's session.
        audience: process.env.AUTH0_AUDIENCE,
        scope: "openid profile email offline_access",
        proxy: true,
        state: true,
        // We need access to `req` so we can persist Auth0 tokens on the session
        // itself. Putting them on the `user` object would lose them on the next
        // request because passport.deserializeUser() reloads the user from
        // storage and discards any non-persisted fields.
        passReqToCallback: true,
      } as any,
      async (
        req: Request,
        accessToken: string,
        refreshToken: string,
        extraParams: any,
        profile: any,
        done: any
      ) => {
        try {
          const email = profile.emails?.[0]?.value || profile._json?.email;
          const user = await storage.upsertUser({
            id: `auth0-${profile.id}`,
            email: email || null,
            firstName: profile.name?.givenName || profile._json?.given_name || null,
            lastName: profile.name?.familyName || profile._json?.family_name || null,
            profileImageUrl: profile._json?.picture || null,
            authProvider: "auth0",
            providerId: profile.id,
          });
          // Persist Auth0 tokens directly on the server-side session so they
          // survive across requests (passport's deserializeUser only restores
          // `user` from storage by id; ad-hoc fields on `user` are dropped).
          // The tokens never leave the server.
          if (req.session) {
            (req.session as any).auth0Tokens = {
              accessToken,
              refreshToken: refreshToken ?? null,
              expiresAt: extraParams?.expires_in
                ? Math.floor(Date.now() / 1000) + Number(extraParams.expires_in)
                : null,
            };
          }
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

/**
 * Read Auth0 tokens that were stored on the session during the OIDC callback.
 * Returns null if the session has no Auth0 login, or the token is expired.
 * Use this in route handlers that need to call downstream APIs on behalf of
 * an Auth0-authenticated user.
 */
export function getSessionAuth0Tokens(
  req: Request
): { accessToken: string; refreshToken: string | null; expiresAt: number | null } | null {
  const tokens = (req.session as any)?.auth0Tokens;
  if (!tokens?.accessToken) return null;
  if (tokens.expiresAt && tokens.expiresAt * 1000 < Date.now()) return null;
  return tokens;
}

let sessionMiddlewareInstance: any = null;

export function getSessionMiddleware() {
  return sessionMiddlewareInstance;
}

export function setupMultiAuth(app: Express) {
  const sessionTtl = 30 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  const SESSION_SECRET = process.env.SESSION_SECRET ?? (
    isProduction
      ? (() => { throw new Error("SESSION_SECRET must be set in production"); })()
      : (() => {
          console.warn("[WARN] SESSION_SECRET not set — using insecure default. Set this before deploying.");
          return "development-secret-change-in-production";
        })()
  );

  sessionMiddlewareInstance = session({
    secret: SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
  
  app.use(sessionMiddlewareInstance);
  
  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Serialize user to session (store user ID as string)
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });
  
  // Deserialize user from session (retrieve full user by string ID)
  passport.deserializeUser(async (id: string, done) => {
    try {
      // storage.getUser already checks in-memory store before hitting the DB
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });
  
  // Shared logout helpers (see server/auth0LogoutHandlers.ts).
  // For Auth0-authenticated users, after destroying the local session we point
  // the client at Auth0's /v2/logout so the SSO session is also cleared
  // (otherwise the next /api/auth/auth0 visit silently re-auths the same user).
  // - GET /api/logout returns a 302 redirect (browser navigation)
  // - POST /api/auth/logout returns JSON with the redirect URL so SPA dashboards
  //   can navigate manually after their fetch resolves
  // Cookie options here MUST mirror the session middleware's cookie config
  // above (httpOnly/secure/sameSite). Browsers only honor clearCookie when
  // the attributes line up, so a mismatch would silently leave the cookie
  // in place after a session.destroy failure (Task #150).
  const logoutOpts = {
    auth0Domain: process.env.AUTH0_DOMAIN,
    auth0ClientId: process.env.AUTH0_CLIENT_ID,
    appUrl: APP_URL,
    sessionCookieName: "connect.sid",
    sessionCookieOptions: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax" as const,
      path: "/",
    },
  };
  // Wrap the Auth0 GET handler so we also clear any Replit Auth session
  // (replit_sid cookie + DB row) before redirecting through Auth0 logout.
  const auth0LogoutGet = makeAuth0LogoutGetHandler(logoutOpts);
  app.get("/api/logout", async (req: Request, res: Response, next) => {
    try {
      const { clearSession, getSessionId } = await import("./lib/auth");
      const sid = getSessionId(req);
      await clearSession(res, sid);
    } catch (err) {
      console.error("Replit session cleanup error (GET /api/logout):", err);
    }
    return auth0LogoutGet(req, res, next);
  });
  app.post("/api/auth/logout", makeAuth0LogoutPostHandler(logoutOpts));
  
  // Local registration
  app.post("/api/auth/register", authRegisterIpRateLimiter, authRegisterIdentifierRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, role, companyName, website } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Validate role if provided
      const VALID_ROLES = ["advertiser", "publisher"];
      if (role && !VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be advertiser or publisher." });
      }

      // Check if email is already taken — both in DB and in the in-memory fallback store
      let existingUser = storage.getMemUserByEmail(email);
      if (!existingUser) {
        try {
          const [dbUser] = await db.select().from(users).where(eq(users.email, email));
          existingUser = dbUser;
        } catch (dbCheckError) {
          console.warn("[Auth] DB email-existence check failed, allowing attempt (createUser will handle uniqueness):", dbCheckError instanceof Error ? dbCheckError.message : String(dbCheckError));
        }
      }

      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user via storage abstraction (handles DB-full fallback automatically)
      const newUser = await storage.createUser({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        authProvider: "local",
        role: role || null,
        companyName: companyName || null,
        website: website || null,
      });

      // Log them in
      req.login(newUser, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed after registration" });
        }
        const { passwordHash: _pw, ...userWithoutPassword } = newUser;
        return res.json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Registration error:", error);
      // Unique-constraint violation (race condition on duplicate email) — return 400 not 500
      const pgCode = (error as { cause?: { code?: string } })?.cause?.code
        ?? (error as { code?: string })?.code;
      if (pgCode === "23505") {
        return res.status(400).json({ message: "Email already registered" });
      }
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Local login
  app.post("/api/auth/login", authLoginIpRateLimiter, authLoginIdentifierRateLimiter, (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ message: "Login failed" });
        }
        const { passwordHash, ...userWithoutPassword } = user;
        return res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  const auth0Enabled = !!(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET);
  // Google sign-in is now backed by Replit's managed OIDC provider — no
  // self-managed Google credentials required.
  const googleEnabled = REPLIT_OIDC_ENABLED;
  // Facebook and Microsoft sign-in are routed through Auth0 as social
  // connections (see docs/auth.md). They require Auth0 to be configured AND
  // the corresponding social connection to be enabled in the tenant. Because
  // we cannot tell from here whether the tenant has the connection enabled,
  // operators can opt out by setting AUTH0_FACEBOOK_ENABLED=false or
  // AUTH0_MICROSOFT_ENABLED=false (default: enabled when Auth0 is configured).
  const isOptOut = (v: string | undefined) =>
    v !== undefined && ["0", "false", "no", "off"].includes(v.toLowerCase());
  const facebookEnabled =
    auth0Enabled && !isOptOut(process.env.AUTH0_FACEBOOK_ENABLED);
  const microsoftEnabled =
    auth0Enabled && !isOptOut(process.env.AUTH0_MICROSOFT_ENABLED);

  // passport-auth0's typings don't expose `connection` (it's a runtime
  // pass-through to the Auth0 /authorize call), so we widen the option type
  // here in one place rather than sprinkling `as any` at each call site.
  type Auth0SocialOpts = passport.AuthenticateOptions & { connection: string };
  const auth0SocialOpts = (connection: string): Auth0SocialOpts => ({
    scope: "openid profile email",
    connection,
  });

  // Replit-managed Google OAuth entry point. Strategy is registered lazily on
  // first request so the absolute callback URL matches the host the browser
  // arrived on (works for both *.replit.dev and the production APP_URL host).
  if (googleEnabled) {
    app.get("/api/auth/google", async (req, res, next) => {
      if (!isAllowedOidcHost(req.hostname)) {
        console.warn(`[Auth] OIDC start refused for unrecognised host: ${req.hostname}`);
        return res.redirect("/?auth=failed");
      }
      try {
        const strategyName = await ensureGoogleOidcStrategy(req.hostname);
        passport.authenticate(strategyName, {
          scope: ["openid", "email", "profile"],
        })(req, res, next);
      } catch (err) {
        console.error("[Auth] Failed to start Replit OIDC flow:", err);
        res.redirect("/?auth=failed");
      }
    });

    app.get("/api/auth/google/callback", async (req, res, next) => {
      // If the provider returned an error (user denied, etc.) skip strategy
      // exchange and redirect back into the app.
      if (typeof req.query.error === "string") {
        return res.redirect("/?auth=failed");
      }
      if (!isAllowedOidcHost(req.hostname)) {
        console.warn(`[Auth] OIDC callback refused for unrecognised host: ${req.hostname}`);
        return res.redirect("/?auth=failed");
      }
      try {
        const strategyName = await ensureGoogleOidcStrategy(req.hostname);
        passport.authenticate(strategyName, {
          successReturnToOrRedirect: "/",
          failureRedirect: "/?auth=failed",
        })(req, res, next);
      } catch (err) {
        console.error("[Auth] Replit OIDC callback failed:", err);
        res.redirect("/?auth=failed");
      }
    });
  }

  // Task #140: short-circuit Auth0-mediated entry points when the boot-time
  // health probe (or a runtime callback) determined the tenant is misconfigured
  // (e.g. AUTH0_CLIENT_ID points at an M2M app that can't run authorization_code).
  // Returning a redirect with `?auth=unavailable` lets the login modal surface
  // a friendly toast instead of dumping users on Auth0's error page.
  const guardAuth0 = (req: Request, res: Response, next: NextFunction) => {
    if (!isAuth0Usable()) {
      // These are top-level browser-navigation endpoints, so always 302 to a
      // friendly in-app URL — the React shell reads `?auth=unavailable` and
      // shows a toast. We deliberately do NOT branch on the Accept header:
      // most user agents include `application/json` in their default Accept,
      // and serving a 503 here would break the click-to-sign-in flow.
      return res.redirect("/?auth=unavailable");
    }
    next();
  };

  // Facebook via Auth0 social connection.
  // Auth0's connection name for the Facebook social IdP is "facebook" by
  // default; it can be overridden with AUTH0_FACEBOOK_CONNECTION.
  if (facebookEnabled) {
    const facebookConnection = process.env.AUTH0_FACEBOOK_CONNECTION || "facebook";
    app.get("/api/auth/facebook", guardAuth0, (req, res, next) =>
      passport.authenticate("auth0", auth0SocialOpts(facebookConnection))(req, res, next)
    );
  }

  // Microsoft via Auth0 social connection.
  // Auth0's connection name for the Microsoft Account social IdP is
  // "windowslive" by default; override with AUTH0_MICROSOFT_CONNECTION if your
  // tenant uses a different name (e.g. "azuread").
  if (microsoftEnabled) {
    const microsoftConnection = process.env.AUTH0_MICROSOFT_CONNECTION || "windowslive";
    app.get("/api/auth/microsoft", guardAuth0, (req, res, next) =>
      passport.authenticate("auth0", auth0SocialOpts(microsoftConnection))(req, res, next)
    );
  }

  // Auth0 OAuth (Universal Login)
  // Login: GET /api/auth/auth0 -> redirects to Auth0 hosted login page
  // Callback: GET /api/auth/callback/auth0 (must be in Auth0 app's Allowed Callback URLs)
  if (auth0Enabled) {
    app.get(
      "/api/auth/auth0",
      guardAuth0,
      passport.authenticate("auth0", {
        scope: "openid profile email offline_access",
      })
    );
    app.get(
      "/api/auth/callback/auth0",
      guardAuth0,
      makeAuth0CallbackHandler({
        authenticator: (cb) =>
          passport.authenticate("auth0", cb) as RequestHandler,
        markUnusable: markAuth0Unusable,
      }),
    );
  }

  // Get available auth providers.
  // - google     → backed by Replit-managed OIDC (no GOOGLE_CLIENT_ID needed)
  // - facebook   → routed through Auth0 social connection
  // - microsoft  → routed through Auth0 social connection
  // - auth0      → direct "Continue with Auth0" (Universal Login, DB connection)
  app.get("/api/auth/providers", (req, res) => {
    res.json({
      local: true,
      google: googleEnabled,
      facebook: facebookEnabled,
      microsoft: microsoftEnabled,
      auth0: auth0Enabled,
    });
  });

  // Local logout (for local auth)
  app.post("/api/auth/logout/local", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user (for local auth)
  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      const user = req.user as any;
      const { passwordHash, ...userWithoutPassword } = user;
      return res.json(userWithoutPassword);
    }
    return res.status(401).json({ message: "Not authenticated" });
  });
}

export const isLocalAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

export const isAuthenticated = isLocalAuthenticated;

/**
 * Combined auth: accepts either a logged-in session cookie OR a valid Auth0
 * machine-to-machine bearer token. Use on routes that need to be callable by
 * both human users (via the web UI) and external services (via M2M tokens).
 *
 * Lazy-imports the Auth0 JWT verifier so non-Auth0 deployments aren't forced
 * to load it.
 */
export const isAuthenticatedOrM2M = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.isAuthenticated()) {
    return next();
  }
  const authHeader = req.headers.authorization || "";
  if (!/^Bearer\s+/i.test(authHeader)) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const { requireAuth0Token } = await import("./auth0Jwt");
    return requireAuth0Token()(req, res, next);
  } catch (err) {
    console.error("Auth0 bearer verification error:", err);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

/**
 * Middleware factory: gate a route to a set of subscription tiers. Returns 401
 * if unauthenticated, 403 if the user's tier is not in the allowed list.
 * Composes after isAuthenticated (or stand-alone — performs its own auth check).
 *
 * Example: app.post("/api/ai/foo", requireTier(["plus", "premium"]), handler)
 */
type Tier = "free" | "plus" | "premium";

/**
 * Middleware: requires the authenticated user to have the "admin" role.
 * Must be composed after isAuthenticated (or isLocalAuthenticated).
 * Returns 403 if the user is authenticated but not an admin.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
};

export const requireTier = (allowedTiers: Tier[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const tier = (req.user.subscriptionTier ?? "free") as Tier;
    if (!allowedTiers.includes(tier)) {
      return res.status(403).json({
        message: `This feature requires a ${allowedTiers.join(" or ")} subscription`,
        upgradeRequired: true,
        currentTier: tier,
        allowedTiers,
      });
    }
    return next();
  };
};
