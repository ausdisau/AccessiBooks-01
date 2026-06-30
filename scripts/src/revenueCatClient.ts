import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient } from "@replit/revenuecat-sdk/client";

/**
 * Build an authenticated RevenueCat REST API client.
 *
 * Auth is injected by the Replit Connectors proxy for the "revenuecat"
 * connection, so no API key is stored in env. Access tokens expire, so NEVER
 * cache this client — call this function again to get a fresh one for each
 * operation.
 */
export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();
  const proxyFetch = connectors.createProxyFetch("revenuecat");
  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    fetch: proxyFetch,
  });
}
