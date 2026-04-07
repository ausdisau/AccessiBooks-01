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
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email));

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

// Auth0 Strategy
if (process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET) {
  const auth0CallbackURL = APP_URL
    ? `${APP_URL}/api/auth/auth0/callback`
    : "/api/auth/auth0/callback";
  passport.use(
    new Auth0Strategy(
      {
        domain: process.env.AUTH0_DOMAIN,
        clientID: process.env.AUTH0_CLIENT_ID,
        clientSecret: process.env.AUTH0_CLIENT_SECRET,
        callbackURL: auth0CallbackURL,
        proxy: true,
      },
      async (accessToken: string, refreshToken: string, extraParams: any, profile: any, done: any) => {
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
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
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
  
  sessionMiddlewareInstance = session({
    secret: process.env.SESSION_SECRET || 'development-secret-change-in-production',
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
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id));
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });
  
  // Main logout endpoint
  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
        res.redirect("/");
      });
    });
  });
  
  // Local registration
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Check if user exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          firstName: firstName || null,
          lastName: lastName || null,
          authProvider: "local",
        })
        .returning();

      // Log them in
      req.login(newUser, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed after registration" });
        }
        const { passwordHash, ...userWithoutPassword } = newUser;
        return res.json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Registration error:", error);
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

  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID) {
    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
      (req, res) => res.redirect("/")
    );
  }

  // Facebook OAuth
  if (process.env.FACEBOOK_APP_ID) {
    app.get("/api/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
    app.get(
      "/api/auth/facebook/callback",
      passport.authenticate("facebook", { failureRedirect: "/?auth=failed" }),
      (req, res) => res.redirect("/")
    );
  }

  // Microsoft OAuth
  if (process.env.MICROSOFT_CLIENT_ID) {
    app.get("/api/auth/microsoft", passport.authenticate("microsoft"));
    app.get(
      "/api/auth/microsoft/callback",
      passport.authenticate("microsoft", { failureRedirect: "/?auth=failed" }),
      (req, res) => res.redirect("/")
    );
  }

  // Auth0 OAuth
  if (process.env.AUTH0_DOMAIN) {
    app.get("/api/auth/auth0", passport.authenticate("auth0"));
    app.get(
      "/api/auth/auth0/callback",
      passport.authenticate("auth0", { failureRedirect: "/?auth=failed" }),
      (req, res) => res.redirect("/")
    );
  }

  // Get available auth providers
  app.get("/api/auth/providers", (req, res) => {
    res.json({
      local: true, // Always available
      google: !!process.env.GOOGLE_CLIENT_ID, // Via Passport
      facebook: !!process.env.FACEBOOK_APP_ID, // Via Passport
      microsoft: !!process.env.MICROSOFT_CLIENT_ID, // Via Passport
      auth0: !!(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET), // Auth0 M2M API
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
