/**
 * entitlements.ts — Centralised access-control service (Task #44)
 *
 * Single source of truth for all tier-based access decisions.
 * Every pure helper is synchronous so it can be unit-tested without a DB.
 * The one async helper — resolveEntitlementOverride — performs a single
 * DB query that callers must await before passing the effectiveTier in.
 *
 * Access hierarchy (strongest → weakest):
 *   institutional > premium > plus > free / anonymous
 */

import { db } from "./db";
import { entitlements } from "@workspace/db";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import type { SubscriptionTier } from "@workspace/db";
import { isFeatureEnabledByConfig } from "./entitlementConfig";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

/**
 * Minimal user shape accepted by all helpers.
 * Anonymous users (req.user === null) are treated as { subscriptionTier: "free" }.
 */
export interface EntitlementUser {
  id?: string;
  subscriptionTier?: string | null;
}

/**
 * Minimal book shape accepted by access helpers.
 * Columns added in Task #44 — callers fall back to safe defaults if absent.
 */
export interface EntitlementBook {
  id: string;
  isPremium: boolean;
  freeTierAvailable?: boolean;
  adSupported?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// Tier helpers
// ────────────────────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = {
  free: 0,
  plus: 1,
  premium: 2,
  institutional: 2, // institutional is at least as capable as premium
};

function tierRank(tier: string): number {
  return TIER_RANK[tier] ?? 0;
}

/** Normalise any string to a known SubscriptionTier, defaulting to "free". */
function normaliseTier(raw: string | null | undefined): SubscriptionTier {
  const known: SubscriptionTier[] = ["free", "plus", "premium", "institutional"];
  const t = (raw ?? "free") as SubscriptionTier;
  return known.includes(t) ? t : "free";
}

// ────────────────────────────────────────────────────────────────────
// 1. Async override lookup (DB) — call this BEFORE the sync helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Look up an active, non-expired entitlement override for the user.
 * Returns the override tier string, or null if no override is active.
 *
 * Callers (middleware) await this once, then pass the result to
 * getUserEffectiveTier() as the second argument.
 */
export async function resolveEntitlementOverride(
  userId: string,
  bookId?: string,
): Promise<string | null> {
  const now = new Date();

  const rows = await db
    .select({ tier: entitlements.tier })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
        or(isNull(entitlements.bookId), eq(entitlements.bookId, bookId ?? "")),
      ),
    )
    .limit(1);

  return rows[0]?.tier ?? null;
}

// ────────────────────────────────────────────────────────────────────
// 2. getUserEffectiveTier — resolves actual access level
// ────────────────────────────────────────────────────────────────────

/**
 * Returns the effective subscription tier for a user, taking any active
 * entitlement override into account.
 *
 * @param user            The authenticated user (or null for anonymous).
 * @param overrideTier    Result of resolveEntitlementOverride() — pass null
 *                        if the caller did not resolve overrides.
 */
export function getUserEffectiveTier(
  user: EntitlementUser | null,
  overrideTier: string | null = null,
): SubscriptionTier {
  const baseTier = normaliseTier(user?.subscriptionTier);

  if (!overrideTier) return baseTier;

  const overrideNormalised = normaliseTier(overrideTier);
  return tierRank(overrideNormalised) > tierRank(baseTier)
    ? overrideNormalised
    : baseTier;
}

// ────────────────────────────────────────────────────────────────────
// 3. canAccessTitle — catalogue gate
// ────────────────────────────────────────────────────────────────────

export interface AccessResult {
  allowed: boolean;
  reason: string;
  upgradeRequired: boolean;
}

/**
 * Returns whether the effective tier can access the given book.
 *
 * Access rules:
 *  - institutional or premium → always allowed
 *  - plus → allowed always (ad-free, but same catalogue scope as free
 *    PLUS all non-premium-flagged titles; only isPremium=true AND
 *    freeTierAvailable=false titles require premium/institutional)
 *  - free / anonymous → allowed only if freeTierAvailable = true
 *    (or if the book is not marked premium)
 *
 * Note: "premium" prefix convention is retired — use isPremium flag instead.
 */
export function canAccessTitle(
  effectiveTier: SubscriptionTier,
  book: EntitlementBook,
): AccessResult {
  // Highest tiers: always allowed
  if (effectiveTier === "institutional" || effectiveTier === "premium") {
    return { allowed: true, reason: "premium_or_institutional_tier", upgradeRequired: false };
  }

  // Plus: ad-free, same catalogue scope as free + non-premium titles.
  // Only blocked from isPremium=true AND freeTierAvailable=false titles.
  if (effectiveTier === "plus") {
    const freeTierAvailable = book.freeTierAvailable ?? true;
    if (book.isPremium && !freeTierAvailable) {
      return {
        allowed: false,
        reason: "title_requires_premium_tier",
        upgradeRequired: true,
      };
    }
    return { allowed: true, reason: "plus_tier", upgradeRequired: false };
  }

  // Free / anonymous
  const freeTierAvailable = book.freeTierAvailable ?? true;
  if (book.isPremium && !freeTierAvailable) {
    return {
      allowed: false,
      reason: "title_requires_paid_subscription",
      upgradeRequired: true,
    };
  }

  return { allowed: true, reason: "free_tier_available", upgradeRequired: false };
}

// ────────────────────────────────────────────────────────────────────
// 4. shouldServeAds — ad-injection gate
// ────────────────────────────────────────────────────────────────────

/**
 * Returns true if an audio ad should be served for this playback session.
 *
 * Paid tiers (plus, premium, institutional) are always ad-free regardless of
 * the book's adSupported flag.  For free users, the book's adSupported flag
 * is the secondary gate.
 */
export function shouldServeAds(
  user: EntitlementUser | null,
  effectiveTier: SubscriptionTier,
  book?: EntitlementBook,
): boolean {
  // Any paid tier is ad-free
  if (effectiveTier !== "free") return false;

  // Respect the book-level ad flag (defaults to true = ads allowed)
  const adSupported = book?.adSupported ?? true;
  return adSupported;
}

// ────────────────────────────────────────────────────────────────────
// 5. canDownloadOffline — offline download gate
// ────────────────────────────────────────────────────────────────────

/**
 * Returns true if the user's effective tier permits offline downloads.
 * Only premium and institutional tiers allow offline downloads.
 */
export function canDownloadOffline(effectiveTier: SubscriptionTier): boolean {
  // Admin-configured override takes precedence (Task #70).
  const cfg = isFeatureEnabledByConfig("offline_downloads", effectiveTier);
  if (cfg !== undefined) return cfg;
  return effectiveTier === "premium" || effectiveTier === "institutional";
}

// ────────────────────────────────────────────────────────────────────
// 6. canUsePremiumFeature — named feature gate
// ────────────────────────────────────────────────────────────────────

type PremiumFeature =
  | "advanced_personalization"
  | "ai_coach_full"
  | "ultra_audio_quality"
  | "multi_device_5plus"
  | "unlimited_tts";

/**
 * Returns true if the user's effective tier grants access to the named
 * premium feature.
 */
export function canUsePremiumFeature(
  effectiveTier: SubscriptionTier,
  feature: PremiumFeature | string,
): boolean {
  // Admin-configured override takes precedence (Task #70). When the
  // feature key has a row for the requested tier in entitlement_config,
  // honour it. Otherwise fall through to the hard-coded mapping below.
  const cfg = isFeatureEnabledByConfig(feature, effectiveTier);
  if (cfg !== undefined) return cfg;

  switch (feature) {
    case "advanced_personalization":
    case "ai_coach_full":
    case "ultra_audio_quality":
    case "unlimited_tts":
      return effectiveTier === "premium" || effectiveTier === "institutional";

    case "multi_device_5plus":
      return effectiveTier === "premium" || effectiveTier === "institutional";

    default:
      // Unknown features default to premium-only
      return effectiveTier === "premium" || effectiveTier === "institutional";
  }
}
