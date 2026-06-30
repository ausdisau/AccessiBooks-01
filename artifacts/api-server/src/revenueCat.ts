import crypto from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient } from "@replit/revenuecat-sdk/client";
import {
  listEntitlements,
  listCustomerActiveEntitlements,
} from "@replit/revenuecat-sdk";
import { storage } from "./storage";

// Map a RevenueCat entitlement lookup_key -> AccessiBooks subscription tier.
const ENTITLEMENT_TIER: Record<string, "plus" | "premium"> = {
  plus: "plus",
  premium: "premium",
};

export interface RevenueCatSyncResult {
  tier: string;
  status: string | null;
  subscriptionEndDate: string | null;
}

class UserNotFoundError extends Error {
  code = "USER_NOT_FOUND";
}

export function isUserNotFoundError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { code?: string }).code === "USER_NOT_FOUND"
  );
}

// Auth is injected by the Replit Connectors proxy for the "revenuecat"
// connection. Access tokens expire — never cache this client.
async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();
  const proxyFetch = connectors.createProxyFetch("revenuecat");
  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    fetch: proxyFetch,
  });
}

/**
 * Pull the user's active entitlements from RevenueCat (the source of truth for
 * mobile purchases) and reconcile them into users.subscriptionTier.
 *
 * Safety: this only ever changes rows that RevenueCat owns. It never downgrades
 * Stripe-owned rows, institutional/admin rows, or rows it cannot prove it owns
 * (subscriptionProvider !== "revenuecat"). The customer_id is always the
 * server-trusted user id — callers must never pass a client-supplied id.
 */
export async function syncRevenueCatEntitlementsForUser(
  userId: string,
): Promise<RevenueCatSyncResult> {
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!projectId) throw new Error("REVENUECAT_PROJECT_ID is not configured");

  const user = await storage.getUser(userId);
  if (!user) {
    throw new UserNotFoundError(`User not found for RevenueCat sync: ${userId}`);
  }

  const client = await getUncachableRevenueCatClient();

  // Build entitlement id -> lookup_key map (active_entitlements returns ids).
  const { data: entData, error: entErr } = await listEntitlements({
    client,
    path: { project_id: projectId },
    query: { limit: 100 },
  });
  if (entErr) throw new Error("Failed to list RevenueCat entitlements");
  const idToLookup = new Map<string, string>();
  for (const e of entData?.items ?? []) idToLookup.set(e.id, e.lookup_key);

  // Active entitlements for this customer (app_user_id === our user id).
  const {
    data: actData,
    error: actErr,
    response: actRes,
  } = await listCustomerActiveEntitlements({
    client,
    path: { project_id: projectId, customer_id: userId },
    query: { limit: 100 },
  });

  let activeItems: { entitlement_id: string; expires_at: number | null }[] = [];
  if (actErr) {
    // 404 => the customer has never transacted: treat as no active entitlements.
    if (actRes?.status === 404) {
      activeItems = [];
    } else {
      throw new Error(
        `Failed to fetch RevenueCat active entitlements (status ${actRes?.status ?? "?"})`,
      );
    }
  } else {
    activeItems = (actData?.items ?? []) as {
      entitlement_id: string;
      expires_at: number | null;
    }[];
  }

  // Resolve the strongest active tier and its expiry.
  const now = Date.now();
  const tierExpiry: Record<string, number | null> = {};
  for (const item of activeItems) {
    if (item.expires_at !== null && item.expires_at <= now) continue;
    const lookup = idToLookup.get(item.entitlement_id);
    const tier = lookup ? ENTITLEMENT_TIER[lookup] : undefined;
    if (!tier) continue;
    if (!(tier in tierExpiry)) {
      tierExpiry[tier] = item.expires_at;
    } else {
      const prev = tierExpiry[tier];
      if (prev !== null && (item.expires_at === null || item.expires_at > prev)) {
        tierExpiry[tier] = item.expires_at;
      }
    }
  }
  const activeTier =
    "premium" in tierExpiry ? "premium" : "plus" in tierExpiry ? "plus" : null;

  // RevenueCat may only own rows that are unowned/free or already
  // RevenueCat-owned. It must never overwrite admin/institutional rows, and
  // never replace or reduce a paid subscription owned by another provider
  // (e.g. Stripe). This guard applies to BOTH the upgrade and downgrade paths
  // so a mobile entitlement can never clobber web/Stripe or privileged state.
  const currentTier = user.subscriptionTier ?? "free";
  const provider =
    (user as { subscriptionProvider?: string | null }).subscriptionProvider ??
    null;
  const isProtectedTier =
    currentTier === "institutional" || currentTier === "admin";
  const isPaidTier = currentTier === "plus" || currentTier === "premium";
  const revenueCatMayWrite =
    !isProtectedTier && (provider === "revenuecat" || !isPaidTier);

  // Current persisted state, returned whenever RevenueCat must not write.
  const unchanged: RevenueCatSyncResult = {
    tier: currentTier,
    status: user.subscriptionStatus ?? null,
    subscriptionEndDate: user.subscriptionEndDate
      ? new Date(user.subscriptionEndDate).toISOString()
      : null,
  };

  if (activeTier) {
    // A protected row (admin/institutional) or a non-RevenueCat paid
    // subscription (e.g. Stripe) owns this user — leave it untouched.
    if (!revenueCatMayWrite) return unchanged;

    const endMs = tierExpiry[activeTier];
    const endDate = endMs ? new Date(endMs) : null;
    await storage.updateUserSubscription(userId, {
      subscriptionTier: activeTier,
      subscriptionStatus: "active",
      subscriptionEndDate: endDate,
      subscriptionProvider: "revenuecat",
    });
    return {
      tier: activeTier,
      status: "active",
      subscriptionEndDate: endDate ? endDate.toISOString() : null,
    };
  }

  // No active RevenueCat entitlement. Only downgrade rows RevenueCat owns —
  // never flip another provider's free/lapsed row to RevenueCat.
  if (!isProtectedTier && provider === "revenuecat") {
    await storage.updateUserSubscription(userId, {
      subscriptionTier: "free",
      subscriptionStatus: "canceled",
      subscriptionEndDate: null,
      subscriptionProvider: "revenuecat",
    });
    return { tier: "free", status: "canceled", subscriptionEndDate: null };
  }

  // Leave non-RevenueCat / protected rows untouched.
  return unchanged;
}

// ── Webhook auth ─────────────────────────────────────────────────────────
// RevenueCat sends the exact Authorization header value configured in the
// dashboard webhook settings. Compare it in constant time against
// REVENUECAT_WEBHOOK_AUTH_HEADER. Missing config => reject (fail closed).
export function isRevenueCatWebhookAuthorized(
  headerValue: string | undefined,
): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
  if (!expected) return false;
  if (!headerValue) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Webhook idempotency (evict entries older than 24h) ────────────────────
const processedEvents = new Map<string, number>();

export function isRevenueCatEventProcessed(eventId: string): boolean {
  const now = Date.now();
  for (const [id, ts] of processedEvents.entries()) {
    if (now - ts > 24 * 60 * 60 * 1000) processedEvents.delete(id);
  }
  return processedEvents.has(eventId);
}

export function markRevenueCatEventProcessed(eventId: string): void {
  processedEvents.set(eventId, Date.now());
}
