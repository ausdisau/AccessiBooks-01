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
  frequencyCapMinutes?: number;
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
    a11y_suppress_if: ["focusShell", "lowSensoryMode", "calmMode", "sensoryMode"],
    format: "audio_preroll",
  },
  "audio-midroll": {
    id: "audio-midroll",
    type: "audio",
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusShell", "lowSensoryMode", "calmMode", "sensoryMode"],
    format: "audio_midroll",
    frequencyCapMinutes: 15,
  },
  "rewarded-unlock": {
    id: "rewarded-unlock",
    type: "rewarded",
    tier_eligible: ["free"],
    a11y_suppress_if: [],
    format: "rewarded",
  },
  // Task #64: Engagement & Monetization placements
  "hub-banner": {
    id: "hub-banner",
    type: "display",
    dimensions: { width: 728, height: 90 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell", "reduceDistractionMode"],
    format: "display_banner",
  },
  "community-thread": {
    id: "community-thread",
    type: "display",
    dimensions: { width: 300, height: 250 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell", "reduceDistractionMode"],
    format: "display_banner",
  },
  "event-replay-preroll": {
    id: "event-replay-preroll",
    type: "display",
    dimensions: { width: 300, height: 250 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell"],
    format: "display_banner",
  },

  // ── Task #166: In-content audio/ebook ad placements ──────────────────────

  /** Audio post-roll: plays after the final chapter of an audiobook ends. Free tier only. */
  "audio-postroll": {
    id: "audio-postroll",
    type: "audio",
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusShell", "lowSensoryMode", "calmMode", "sensoryMode"],
    format: "audio_preroll",
    frequencyCapMinutes: 15,
  },

  /** Ebook full-page interstitial: shown between chapters. Free tier only.
   *  Minimum display time enforced client-side (3 seconds) before dismiss is available. */
  "ebook-interstitial": {
    id: "ebook-interstitial",
    type: "display",
    dimensions: { width: 600, height: 400 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell", "lowSensoryMode", "calmMode", "sensoryMode", "reduceDistractionMode"],
    format: "display_banner",
    frequencyCapMinutes: 15,
  },

  /** Ebook persistent bottom banner: sits at the bottom of the reading view. Free tier only.
   *  Suppressible per-session when lowSensory state is active. */
  "ebook-banner": {
    id: "ebook-banner",
    type: "display",
    dimensions: { width: 728, height: 90 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell", "lowSensoryMode", "calmMode", "sensoryMode"],
    format: "display_banner",
  },

  /** Ebook end-of-chapter sponsored card: shown on chapter completion screen. Free tier only. */
  "ebook-end-of-chapter": {
    id: "ebook-end-of-chapter",
    type: "display",
    dimensions: { width: 300, height: 250 },
    tier_eligible: ["free"],
    a11y_suppress_if: ["focusMode", "focusShell", "lowSensoryMode", "calmMode", "sensoryMode"],
    format: "display_banner",
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
