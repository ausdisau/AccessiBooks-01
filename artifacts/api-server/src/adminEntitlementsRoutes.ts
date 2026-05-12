/**
 * adminEntitlementsRoutes.ts — Admin-only entitlement config grid (Task #70)
 *
 * GET  /api/admin/entitlements   → returns the catalogue + current grid.
 * PUT  /api/admin/entitlements   → bulk-saves a subset of (featureKey, tier)
 *                                  rows; reloads the in-memory cache so new
 *                                  requests see the change immediately.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  ENTITLEMENT_FEATURES,
  DEFAULT_ENTITLEMENT_MATRIX,
  type EntitlementFeatureKey,
  type SubscriptionTier,
} from "@workspace/db";
import {
  getEntitlementConfigGrid,
  saveEntitlementConfigGrid,
} from "./entitlementConfig";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!(req as any).isAuthenticated?.() || !user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

const saveBodySchema = z.object({
  rows: z.array(z.object({
    featureKey: z.string().min(1),
    tier: z.enum(["free", "plus", "premium", "institutional"]),
    enabled: z.boolean(),
  })).min(1).max(200),
});

export function registerAdminEntitlementsRoutes(app: Express) {
  app.get("/api/admin/entitlements", requireAdmin, async (_req, res) => {
    try {
      const rows = await getEntitlementConfigGrid();
      // Index by `${featureKey}::${tier}` for the UI.
      const matrix: Record<string, boolean> = {};
      for (const r of rows) matrix[`${r.featureKey}::${r.tier}`] = r.enabled;

      res.json({
        features: ENTITLEMENT_FEATURES,
        tiers: ["free", "plus", "premium", "institutional"] as SubscriptionTier[],
        matrix,
        defaults: DEFAULT_ENTITLEMENT_MATRIX,
      });
    } catch (err) {
      console.error("[AdminEntitlements] GET failed:", err);
      res.status(500).json({ message: "Failed to load entitlement config" });
    }
  });

  app.put("/api/admin/entitlements", requireAdmin, async (req, res) => {
    try {
      const parsed = saveBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", errors: parsed.error.errors });
      }
      const validKeys = new Set<string>(ENTITLEMENT_FEATURES.map(f => f.key));
      const safe = parsed.data.rows.filter(r => validKeys.has(r.featureKey as EntitlementFeatureKey));
      const updated = await saveEntitlementConfigGrid(safe);
      const userId = (req as any).user?.id;
      console.log(`[AdminEntitlements] ${userId} updated ${updated} entitlement rows`);
      res.json({ updated });
    } catch (err) {
      console.error("[AdminEntitlements] PUT failed:", err);
      res.status(500).json({ message: "Failed to save entitlement config" });
    }
  });
}
