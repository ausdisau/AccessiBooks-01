/**
 * auth0Jwt.ts — Verifies incoming Auth0-issued bearer tokens (M2M or user access tokens).
 *
 * Use case: external services or backend processes call our API with
 *   Authorization: Bearer <jwt>
 * and the JWT is signed by Auth0 with audience === AUTH0_AUDIENCE.
 *
 * The middleware verifies signature against Auth0's JWKS, checks issuer/audience/exp,
 * and on success attaches:
 *   - req.auth0Token  -> the decoded JWT payload
 *   - req.user        -> a synthesized identity (so downstream code that reads req.user works)
 *
 * It does NOT create or read a session — purely stateless bearer auth.
 */
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

let jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!process.env.AUTH0_DOMAIN) {
    throw new Error("AUTH0_DOMAIN not configured");
  }
  if (!jwksClient) {
    jwksClient = jwksRsa({
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000, // 10 minutes
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
      if (err) return reject(err);
      const signingKey = key?.getPublicKey();
      if (!signingKey) return reject(new Error("No signing key found"));
      resolve(signingKey);
    });
  });
}

export interface Auth0TokenPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  scope?: string;
  azp?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export async function verifyAuth0AccessToken(token: string): Promise<Auth0TokenPayload> {
  if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_AUDIENCE) {
    throw new Error("AUTH0_DOMAIN and AUTH0_AUDIENCE must be set");
  }

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
    throw new Error("Invalid token structure");
  }

  const signingKey = await getSigningKey(decoded.header.kid);

  return new Promise<Auth0TokenPayload>((resolve, reject) => {
    jwt.verify(
      token,
      signingKey,
      {
        algorithms: ["RS256"],
        issuer: `https://${process.env.AUTH0_DOMAIN}/`,
        audience: process.env.AUTH0_AUDIENCE,
      },
      (err, payload) => {
        if (err) return reject(err);
        resolve(payload as Auth0TokenPayload);
      }
    );
  });
}

function tokenHasScopes(token: Auth0TokenPayload, required: string[]): boolean {
  if (required.length === 0) return true;
  const granted = new Set<string>();
  if (typeof token.scope === "string") {
    token.scope.split(/\s+/).filter(Boolean).forEach((s) => granted.add(s));
  }
  if (Array.isArray(token.permissions)) {
    token.permissions.forEach((p) => granted.add(p));
  }
  return required.every((s) => granted.has(s));
}

/**
 * Express middleware factory. Validates an `Authorization: Bearer <jwt>` header
 * against Auth0 JWKS. Optionally enforces required scopes/permissions.
 */
export function requireAuth0Token(requiredScopes: string[] = []) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      return res.status(401).json({ message: "Missing bearer token" });
    }

    try {
      const payload = await verifyAuth0AccessToken(match[1]);
      if (!tokenHasScopes(payload, requiredScopes)) {
        return res.status(403).json({
          message: "Insufficient scope",
          required: requiredScopes,
        });
      }

      // Synthesize a user-shaped object so downstream handlers that read req.user
      // (and only need an id/email) keep working. We prefix with `auth0|m2m:` for
      // M2M tokens (no `email` claim) and `auth0|` for user tokens.
      const isM2M = !payload.email && (payload.sub || "").endsWith("@clients");
      (req as any).auth0Token = payload;
      (req as any).user = {
        id: isM2M ? `auth0-m2m-${payload.sub}` : `auth0-${payload.sub}`,
        email: (payload as any).email ?? null,
        authProvider: "auth0",
        providerId: payload.sub,
        isM2M,
        tokenScopes: typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [],
      };
      return next();
    } catch (err: any) {
      return res.status(401).json({
        message: "Invalid or expired token",
        error: err?.message,
      });
    }
  };
}
