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
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { Strategy as Auth0Strategy } from "passport-auth0";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { users } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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

// Google Strategy
const APP_URL = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, "") : null;

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const googleCallbackURL = APP_URL
    ? `${APP_URL}/api/auth/google/callback`
    : "/api/auth/google/callback";
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: googleCallbackURL,
        proxy: true,
        scope: ["profile", "email"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const user = await storage.upsertUser({
            id: `google-${profile.id}`,
            email: email || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            profileImageUrl: profile.photos?.[0]?.value || null,
            authProvider: "google",
            providerId: profile.id,
          });
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

// Facebook Strategy
// IMPORTANT: The full callback URL below must be added to your Facebook Developer Console
// under your app's "Valid OAuth Redirect URIs" setting:
//   <APP_URL>/api/auth/facebook/callback
// e.g. https://your-app.replit.app/api/auth/facebook/callback
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  const facebookCallbackURL = APP_URL
    ? `${APP_URL}/api/auth/facebook/callback`
    : "/api/auth/facebook/callback";
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: facebookCallbackURL,
        proxy: true,
        profileFields: ["id", "emails", "name", "picture"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const user = await storage.upsertUser({
            id: `facebook-${profile.id}`,
            email: email || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            profileImageUrl: profile.photos?.[0]?.value || null,
            authProvider: "facebook",
            providerId: profile.id,
          });
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

// Microsoft Strategy
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  const microsoftCallbackURL = APP_URL
    ? `${APP_URL}/api/auth/microsoft/callback`
    : "/api/auth/microsoft/callback";
  passport.use(
    new MicrosoftStrategy(
      {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: microsoftCallbackURL,
        proxy: true,
        scope: ["user.read"],
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value || profile._json?.userPrincipalName;
          const user = await storage.upsertUser({
            id: `microsoft-${profile.id}`,
            email: email || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            profileImageUrl: null,
            authProvider: "microsoft",
            providerId: profile.id,
          });
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
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
  
  // Shared logout helper.
  // For Auth0-authenticated users, after destroying the local session we point
  // the client at Auth0's /v2/logout so the SSO session is also cleared
  // (otherwise the next /api/auth/auth0 visit silently re-auths the same user).
  // - GET /api/logout returns a 302 redirect (browser navigation)
  // - POST /api/auth/logout returns JSON with the redirect URL so SPA dashboards
  //   can navigate manually after their fetch resolves
  function buildAuth0LogoutUrl(req: Request): string | null {
    const user = req.user as any;
    const isAuth0User = user?.authProvider === "auth0";
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const auth0ClientId = process.env.AUTH0_CLIENT_ID;
    if (!isAuth0User || !auth0Domain || !auth0ClientId) return null;
    const returnTo = APP_URL || `${req.protocol}://${req.get("host")}`;
    const url = new URL(`https://${auth0Domain}/v2/logout`);
    url.searchParams.set("client_id", auth0ClientId);
    url.searchParams.set("returnTo", returnTo);
    return url.toString();
  }

  app.get("/api/logout", (req, res) => {
    const auth0LogoutUrl = buildAuth0LogoutUrl(req);
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy((sessErr) => {
        if (sessErr) console.error("Session destroy error:", sessErr);
        res.redirect(auth0LogoutUrl ?? "/");
      });
    });
  });

  // POST logout alias for ad-platform dashboards (SPA fetch).
  // Returns the Auth0 logout URL when applicable so the client can redirect.
  app.post("/api/auth/logout", (req, res) => {
    const auth0LogoutUrl = buildAuth0LogoutUrl(req);
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy(() => {
        res.json({
          message: "Logged out",
          ...(auth0LogoutUrl ? { logoutUrl: auth0LogoutUrl } : {}),
        });
      });
    });
  });
  
  // Local registration
  app.post("/api/auth/register", async (req: Request, res: Response) => {
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
  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
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

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const facebookEnabled = !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  const microsoftEnabled = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  const auth0Enabled = !!(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET);

  // Google OAuth
  if (googleEnabled) {
    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
      (req, res) => res.redirect("/")
    );
  }

  // Facebook OAuth
  if (facebookEnabled) {
    app.get("/api/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
    app.get(
      "/api/auth/facebook/callback",
      passport.authenticate("facebook", { failureRedirect: "/?auth=failed" }),
      (req, res) => res.redirect("/")
    );
  }

  // Microsoft OAuth
  if (microsoftEnabled) {
    app.get("/api/auth/microsoft", passport.authenticate("microsoft"));
    app.get(
      "/api/auth/microsoft/callback",
      passport.authenticate("microsoft", { failureRedirect: "/?auth=failed" }),
      (req, res) => res.redirect("/")
    );
  }

  // Auth0 OAuth (Universal Login)
  // Login: GET /api/auth/auth0 -> redirects to Auth0 hosted login page
  // Callback: GET /api/auth/callback/auth0 (must be in Auth0 app's Allowed Callback URLs)
  if (auth0Enabled) {
    app.get(
      "/api/auth/auth0",
      passport.authenticate("auth0", {
        scope: "openid profile email offline_access",
      })
    );
    app.get(
      "/api/auth/callback/auth0",
      passport.authenticate("auth0", { failureRedirect: "/?auth=failed" }),
      (req, res) => res.redirect("/")
    );
  }

  // Get available auth providers
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
