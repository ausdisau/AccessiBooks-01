/**
 * auth0.ts — Auth0 Management API helpers + status route.
 *
 * After the Universal Login migration, the OIDC redirect flow lives in
 * server/multiAuth.ts (passport-auth0 strategy + /api/auth/auth0 routes), and
 * incoming bearer-token verification lives in server/auth0Jwt.ts.
 *
 * This module now only exposes:
 *   - getManagementClient() — for admin-style user management (used elsewhere)
 *   - setupAuth0Routes(app) — registers GET /api/auth/auth0/status only
 *   - isAuth0Configured()
 *
 * The previous Resource-Owner-Password-Grant (ROPG) endpoints
 * (/api/auth/auth0/login, /api/auth/auth0/register) have been removed —
 * Auth0 deprecates ROPG and Universal Login is the supported flow.
 */
import { ManagementClient } from "auth0";
import type { Express, Request, Response } from "express";

let managementClient: ManagementClient | null = null;

export function getManagementClient(): ManagementClient {
  if (!managementClient) {
    if (
      !process.env.AUTH0_DOMAIN ||
      !process.env.AUTH0_CLIENT_ID ||
      !process.env.AUTH0_CLIENT_SECRET
    ) {
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

export function setupAuth0Routes(app: Express) {
  if (
    !process.env.AUTH0_DOMAIN ||
    !process.env.AUTH0_CLIENT_ID ||
    !process.env.AUTH0_CLIENT_SECRET
  ) {
    console.log("Auth0 credentials not configured - Auth0 status route disabled");
    return;
  }

  app.get("/api/auth/auth0/status", (_req: Request, res: Response) => {
    res.json({
      configured: true,
      domain: process.env.AUTH0_DOMAIN,
      audienceConfigured: !!process.env.AUTH0_AUDIENCE,
      m2mConfigured: !!(
        process.env.AUTH0_M2M_CLIENT_ID && process.env.AUTH0_M2M_CLIENT_SECRET
      ),
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
