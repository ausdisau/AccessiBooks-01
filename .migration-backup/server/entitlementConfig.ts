/**
 * entitlementConfig.ts — Server-stored (featureKey × tier) overrides (Task #70)
 *
 * The admin-edited entitlement_config table is loaded once at boot into a
 * synchronous in-memory cache so the existing sync helpers in
 * server/entitlements.ts can consult it without changing their signatures.
 * Saving from the admin page invalidates and reloads the cache so changes
 * take effect for new requests immediately (no restart).
 *
 * If a (featureKey, tier) pair is missing from config, callers fall back
 * to the hard-coded mapping in entitlements.ts.
 */

import { db } from "./db";
import {
  entitlementConfig,
  ENTITLEMENT_FEATURES,
  DEFAULT_ENTITLEMENT_MATRIX,
  type EntitlementConfig,
  type EntitlementFeatureKey,
  type SubscriptionTier,
} from "@shared/schema";
import { sql } from "drizzle-orm";

type ConfigCache = Map<string, boolean>; // key = `${featureKey}::${tier}`

let cache: ConfigCache = new Map();
let loadedOnce = false;
let loadingPromise: Promise<void> | null = null;

function cacheKey(featureKey: string, tier: string): string {
  return `${featureKey}::${tier}`;
}

/** Load all rows into the in-memory cache. Safe to call multiple times. */
export async function loadEntitlementConfig(): Promise<void> {
  try {
    const rows = await db.select().from(entitlementConfig);
    const next: ConfigCache = new Map();
    for (const r of rows) next.set(cacheKey(r.featureKey, r.tier), r.enabled);
    cache = next;
    loadedOnce = true;
  } catch (err) {
    // DB unreachable — leave existing cache in place. Sync callers will
    // fall back to hard-coded defaults via entitlements.ts.
    console.warn("[EntitlementConfig] Failed to load config:", (err as Error).message);
  }
}

/** Synchronous lookup — returns undefined if no config row exists for the
 *  given pair (callers must then fall back to their hard-coded default). */
export function isFeatureEnabledByConfig(
  featureKey: string,
  tier: string,
): boolean | undefined {
  if (!loadedOnce) return undefined;
  return cache.get(cacheKey(featureKey, tier));
}

/** Invalidate + reload (called after admin saves the grid). */
export async function reloadEntitlementConfig(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = loadEntitlementConfig().finally(() => {
    loadingPromise = null;
  });
  return loadingPromise;
}

/** Seed missing (featureKey, tier) rows from the documented defaults. Existing
 *  rows are left untouched so prior admin edits survive a restart. */
export async function seedEntitlementConfigDefaults(): Promise<void> {
  try {
    const tiers: SubscriptionTier[] = ["free", "plus", "premium", "institutional"];
    const values: Array<{ featureKey: string; tier: string; enabled: boolean }> = [];
    for (const f of ENTITLEMENT_FEATURES) {
      for (const t of tiers) {
        const enabled = DEFAULT_ENTITLEMENT_MATRIX[f.key as EntitlementFeatureKey]?.[t] ?? false;
        values.push({ featureKey: f.key, tier: t, enabled });
      }
    }
    // Insert ignore on conflict — preserves any admin edits.
    await db
      .insert(entitlementConfig)
      .values(values)
      .onConflictDoNothing({ target: [entitlementConfig.featureKey, entitlementConfig.tier] });
    await loadEntitlementConfig();
  } catch (err) {
    console.warn("[EntitlementConfig] Seed skipped:", (err as Error).message);
  }
}

/** Snapshot of all config rows for the admin UI. */
export async function getEntitlementConfigGrid(): Promise<EntitlementConfig[]> {
  return db.select().from(entitlementConfig);
}

/** Bulk upsert from the admin grid. Returns the number of rows touched. */
export async function saveEntitlementConfigGrid(
  rows: Array<{ featureKey: string; tier: string; enabled: boolean }>,
): Promise<number> {
  if (rows.length === 0) return 0;
  // Validate keys/tiers against the catalogue so a typo can't disable a
  // hard-coded fallback by accident.
  const validKeys = new Set(ENTITLEMENT_FEATURES.map(f => f.key));
  const validTiers = new Set<string>(["free", "plus", "premium", "institutional"]);
  const safe = rows.filter(r => validKeys.has(r.featureKey as EntitlementFeatureKey) && validTiers.has(r.tier));
  if (safe.length === 0) return 0;

  for (const r of safe) {
    await db
      .insert(entitlementConfig)
      .values({ featureKey: r.featureKey, tier: r.tier, enabled: r.enabled })
      .onConflictDoUpdate({
        target: [entitlementConfig.featureKey, entitlementConfig.tier],
        set: { enabled: r.enabled, updatedAt: sql`now()` },
      });
  }
  await reloadEntitlementConfig();
  return safe.length;
}
