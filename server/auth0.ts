/**
 * auth0.ts — Auth0 SDK integration (optional, only active when AUTH0_* env vars are set)
 *
 * Responsibility: Auth0 Management API (user management), Authentication API
 * (machine-to-machine login), and JWKS-based JWT token verification for
 * API requests bearing Auth0 access tokens.
 *
 * Does NOT set up session or Passport strategies — those are in multiAuth.ts.
 * Only activated when AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET are present.
 */
import { ManagementClient, AuthenticationClient } from "auth0";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

let managementClient: ManagementClient | null = null;
let authenticationClient: AuthenticationClient | null = null;
let jwksClient: jwksRsa.JwksClient | null = null;

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_LOGIN_ATTEMPTS = 5;

function getManagementClient(): ManagementClient {
  if (!managementClient) {
    if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_CLIENT_ID || !process.env.AUTH0_CLIENT_SECRET) {
      throw new Error("Auth0 credentials not configured");
    }
    
    managementClient = new ManagementClient({
      domain: process.env.AUTH0_DOMAIN,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
    });
  }
  return managementClient;
}

function getAuthenticationClient(): AuthenticationClient {
  if (!authenticationClient) {
    if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_CLIENT_ID || !process.env.AUTH0_CLIENT_SECRET) {
      throw new Error("Auth0 credentials not configured");
    }
    
    authenticationClient = new AuthenticationClient({
      domain: process.env.AUTH0_DOMAIN,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
    });
  }
  return authenticationClient;
}

function getJwksClient(): jwksRsa.JwksClient {
  if (!jwksClient) {
    if (!process.env.AUTH0_DOMAIN) {
      throw new Error("Auth0 domain not configured");
    }
    
    jwksClient = jwksRsa({
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    });
  }
  return jwksClient;
}

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        const signingKey = key?.getPublicKey();
        if (signingKey) {
          resolve(signingKey);
        } else {
          reject(new Error("No signing key found"));
        }
      }
    });
  });
}

async function verifyIdToken(idToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.header.kid) {
      return reject(new Error("Invalid token structure"));
    }
    
    getSigningKey(decoded.header.kid)
      .then((signingKey) => {
        jwt.verify(
          idToken,
          signingKey,
          {
            algorithms: ["RS256"],
            issuer: `https://${process.env.AUTH0_DOMAIN}/`,
            audience: process.env.AUTH0_CLIENT_ID,
          },
          (err, verified) => {
            if (err) {
              reject(err);
            } else {
              resolve(verified);
            }
          }
        );
      })
      .catch(reject);
  });
}

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(identifier);
  
  if (!record) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now });
    return true;
  }
  
  if (now - record.lastAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now });
    return true;
  }
  
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }
  
  record.count++;
  record.lastAttempt = now;
  return true;
}

function clearRateLimit(identifier: string) {
  loginAttempts.delete(identifier);
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now - record.lastAttempt > RATE_LIMIT_WINDOW * 2) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function setupAuth0Routes(app: Express) {
  if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_CLIENT_ID || !process.env.AUTH0_CLIENT_SECRET) {
    console.log("Auth0 credentials not configured - Auth0 routes disabled");
    return;
  }

  app.post("/api/auth/auth0/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const rateLimitKey = `register:${clientIp}`;
      
      if (!checkRateLimit(rateLimitKey)) {
        return res.status(429).json({ 
          message: "Too many registration attempts. Please try again later." 
        });
      }

      const management = getManagementClient();

      const auth0User = await management.users.create({
        connection: "Username-Password-Authentication",
        email,
        password,
        given_name: firstName || undefined,
        family_name: lastName || undefined,
        email_verified: false,
      });

      const userId = `auth0-${auth0User.data.user_id}`;
      
      await storage.upsertUser({
        id: userId,
        email: email,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: auth0User.data.picture || null,
        authProvider: "auth0",
        providerId: auth0User.data.user_id || null,
      });

      res.json({ 
        success: true, 
        message: "Account created successfully. Please log in.",
        userId: userId
      });
    } catch (error: any) {
      console.error("Auth0 registration error:", error);
      
      if (error.statusCode === 409) {
        return res.status(409).json({ message: "Email already registered" });
      }
      
      res.status(500).json({ 
        message: error.message || "Failed to create account" 
      });
    }
  });

  app.post("/api/auth/auth0/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const rateLimitKey = `login:${clientIp}:${email}`;
      
      if (!checkRateLimit(rateLimitKey)) {
        return res.status(429).json({ 
          message: "Too many login attempts. Please try again later." 
        });
      }

      const auth = getAuthenticationClient();

      const tokenResponse = await auth.oauth.passwordGrant({
        username: email,
        password: password,
        realm: "Username-Password-Authentication",
        audience: process.env.AUTH0_AUDIENCE || `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
        scope: "openid profile email",
      });

      const idToken = tokenResponse.data.id_token;
      if (!idToken) {
        return res.status(500).json({ message: "No ID token received from Auth0" });
      }
      
      let userClaims: any;
      try {
        userClaims = await verifyIdToken(idToken);
      } catch (verifyError: any) {
        console.error("Token verification failed:", verifyError);
        return res.status(401).json({ message: "Invalid authentication token" });
      }

      const userId = `auth0-${userClaims.sub}`;
      
      clearRateLimit(rateLimitKey);

      const user = await storage.upsertUser({
        id: userId,
        email: userClaims.email || email,
        firstName: userClaims.given_name || userClaims.nickname || null,
        lastName: userClaims.family_name || null,
        profileImageUrl: userClaims.picture || null,
        authProvider: "auth0",
        providerId: userClaims.sub || null,
      });

      (req as any).login(user, (err: Error) => {
        if (err) {
          console.error("Session login error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        
        const { passwordHash, ...userWithoutPassword } = user as any;
        res.json({ 
          success: true,
          user: userWithoutPassword,
          accessToken: tokenResponse.data.access_token,
          expiresIn: tokenResponse.data.expires_in,
        });
      });
    } catch (error: any) {
      console.error("Auth0 login error:", error);
      
      if (error.statusCode === 403 || error.statusCode === 401) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      res.status(500).json({ 
        message: error.message || "Failed to log in" 
      });
    }
  });

  app.get("/api/auth/auth0/status", (req: Request, res: Response) => {
    res.json({
      configured: true,
      domain: process.env.AUTH0_DOMAIN,
    });
  });
}

export function isAuth0Configured(): boolean {
  return !!(
    process.env.AUTH0_DOMAIN && 
    process.env.AUTH0_CLIENT_ID && 
    process.env.AUTH0_CLIENT_SECRET
  );
}
