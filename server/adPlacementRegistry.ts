/**
 * adPlacementRegistry.ts — Typed registry of all ad placements.
 *
 * Each placement carries:
 *   - type: "display" | "audio" | "rewarded"
 *   - dimensions: pixel dimensions for display placements
 *   - tier_eligible: only "free" tier sees ads
 *   - a11y_suppress_if: list of accessibility preference keys that suppress this placement
 */

import type { AdFormat } from "./adFeatureFlags";
import type { Router, Request, Response } from "express";

export type PlacementType = "display" | "audio" | "rewarded";

export interface AdPlacement {
  id: string;
  type: PlacementType;
  dimensions?: { width: number; height: number };
  tier_eligible: string[];
  a11y_suppress_if: string[];
  format: AdFormat;
}

export const AD_PLACEMENT_REGISTRY: Record<string, AdPlacement> = {
  "library-banner-top": {
    id: "library-banner-top",
    type: "display",
    dimensions: { width: 728, height: 90 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell"],
    format: "display_banner",
  },
  "title-detail-slot": {
    id: "title-detail-slot",
    type: "display",
    dimensions: { width: 300, height: 250 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell"],
    format: "display_banner",
  },
  "player-sidebar": {
    id: "player-sidebar",
    type: "display",
    dimensions: { width: 300, height: 250 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell", "captionsOn"],
    format: "display_banner",
  },
  "audio-preroll": {
    id: "audio-preroll",
    type: "audio",
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusShell"],
    format: "audio_preroll",
  },
  "audio-midroll": {
    id: "audio-midroll",
    type: "audio",
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusShell"],
    format: "audio_midroll",
  },
  "rewarded-unlock": {
    id: "rewarded-unlock",
    type: "rewarded",
    tier_eligible: ["free"],
    a11y_suppress_if: [],
    format: "rewarded",
  },
};

export function getPlacement(placementId: string): AdPlacement | null {
  return AD_PLACEMENT_REGISTRY[placementId] ?? null;
}

export function registerPlacementRoutes(router: Router): void {
  router.get("/api/ads/placement/:id", (req: Request, res: Response) => {
    const placement = getPlacement(req.params.id);
    if (!placement) {
      return res.status(404).json({ error: "Placement not found" });
    }
    res.json(placement);
  });
}
