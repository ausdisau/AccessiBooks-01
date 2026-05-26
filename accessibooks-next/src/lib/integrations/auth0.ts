import { logger } from "../logger";

export interface AuthProviderInfo {
  id: string;
  name: string;
  enabled: boolean;
  authorizeUrl?: string;
}

/**
 * Returns the list of OAuth providers that are configured via env vars.
 * Real OAuth wiring is part of the downstream Auth.js task (see Task #182
 * out-of-scope); this just reports availability so the client can render
 * the right login buttons.
 */
export function listProviders(): AuthProviderInfo[] {
  const providers: AuthProviderInfo[] = [
    {
      id: "local",
      name: "Email and password",
      enabled: true,
    },
    {
      id: "google",
      name: "Google",
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    {
      id: "facebook",
      name: "Facebook",
      enabled: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
    },
    {
      id: "microsoft",
      name: "Microsoft",
      enabled: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    },
    {
      id: "auth0",
      name: "Auth0",
      enabled: Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID),
    },
  ];
  const enabled = providers.filter((p) => p.enabled);
  if (enabled.length === 1) {
    logger.debug("Only local auth is configured");
  }
  return providers;
}
