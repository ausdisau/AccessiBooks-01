/**
 * replitAuth.ts — DEPRECATED. Replit OIDC has been replaced by Auth0
 * (see server/multiAuth.ts and server/auth0Jwt.ts).
 *
 * This file is no longer wired into the application — `setupAuth` here is not
 * called from anywhere. It is kept temporarily for reference / safe rollback;
 * delete after the Auth0 migration has been verified in production.
 *
 * Do NOT import from this file in new code.
 */
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days for extended sessions
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset session expiry on each request for seamless experience
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user: any = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    const isOidcUser = user?.claims?.sub; // OIDC users have claims.sub
    
    req.logout(() => {
      // Clear session
      req.session?.destroy(() => {});
      
      // For OIDC users, redirect to end session URL
      // For local auth users, just redirect to home
      if (isOidcUser) {
        res.redirect(
          client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href
        );
      } else {
        res.redirect("/");
      }
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  const bufferTime = 5 * 60; // Refresh 5 minutes before expiry for seamless experience
  
  if (now <= user.expires_at - bufferTime) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    
    // Touch session to keep it alive
    if (req.session) {
      req.session.touch();
    }
    
    return next();
  } catch (error) {
    console.error("Token refresh failed:", error);
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Silent refresh middleware - refreshes tokens in background without blocking
export const silentRefreshMiddleware: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!req.isAuthenticated() || !user?.expires_at) {
    return next();
  }
  
  const now = Math.floor(Date.now() / 1000);
  const refreshThreshold = 10 * 60; // Start refreshing 10 minutes before expiry
  
  if (now > user.expires_at - refreshThreshold && user.refresh_token) {
    // Perform silent refresh in background (non-blocking)
    (async () => {
      try {
        const config = await getOidcConfig();
        const tokenResponse = await client.refreshTokenGrant(config, user.refresh_token);
        updateUserSession(user, tokenResponse);
        
        if (req.session) {
          req.session.touch();
        }
      } catch (error) {
        console.log("Silent token refresh failed, will retry on next request");
      }
    })();
  }
  
  next();
};
