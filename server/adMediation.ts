/**
 * adMediation.ts — Programmatic Audio Ad Mediation Layer
 *
 * Responsibility: Waterfall ad selection for audio playback ads (pre-roll/mid-roll):
 *   1. Entitlement check (shouldServeAds) — paid/institutional tiers and ad-free
 *      books are short-circuited with 204 before any provider work.
 *   2. AdDecisionService.decide() — server-side eligibility gate (a11y, flags).
 *   3. AdService waterfall: ProgrammaticAdProvider → SelfServeAdProvider → HouseAdProvider.
 *
 * Routes registered:
 *   - GET /api/ads/request         — request an audio ad (preroll or midroll)
 *   - GET /api/ads/placement/:id   — get placement registry entry
 *   - POST /api/ads/rewarded/complete — record rewarded ad completion
 *   - GET /api/ads/rewarded/status — get active rewarded period status
 *   - POST /api/ads/tracking       — fire VAST tracking pixels server-side
 *   - GET /api/ads/providers       — list configured providers and their status
 *   - GET /api/ads/analytics       — in-memory ad request analytics
 *
 * NOT responsible for display (banner) ads — see adPlatformRoutes.ts.
 * NOT responsible for ad campaign CRUD — see selfServeAds.ts.
 */
import { Router, type Request, type Response } from "express";
import { AdService } from "./adService";
import { AdDecisionService } from "./adDecision";
import { ProgrammaticAdProvider } from "./adProviders/ProgrammaticAdProvider";
import { SelfServeAdProvider } from "./adProviders/SelfServeAdProvider";
import { HouseAdProvider } from "./adProviders/HouseAdProvider";
import { registerPlacementRoutes } from "./adPlacementRegistry";
import { registerRewardedRoutes } from "./adRewards";
import { getAllFlags } from "./adFeatureFlags";
import { resolveEntitlementOverride, getUserEffectiveTier, shouldServeAds } from "./entitlements";
import { storage } from "./storage";

export interface AdProvider {
  name: string;
  enabled: boolean;
  priority: number;
  tagUrl: string;
  timeout: number;
}

export interface ProgrammaticAd {
  id: string;
  provider: string;
  title: string;
  description?: string;
  advertiser?: string;
  audioUrl: string;
  mimeType: string;
  duration: number;
  skipOffset?: number;
  companion?: {
    imageUrl: string;
    clickThrough?: string;
    width: number;
    height: number;
    trackingPixels: string[];
  };
  tracking: import("./vastParser").VASTTrackingEvents;
  isProgrammatic: true;
}

export interface HouseAd {
  id: string;
  provider: "house";
  title: string;
  description: string;
  duration: number;
  isProgrammatic: false;
}

export type AdResponse = ProgrammaticAd | HouseAd;

const adService = new AdService([
  new ProgrammaticAdProvider(),
  new SelfServeAdProvider(),
  new HouseAdProvider(),
]);

interface AdAnalytics {
  totalRequests: number;
  providerFills: Record<string, number>;
  houseFills: number;
  errors: number;
  lastRequestTime: number;
}

const analytics: AdAnalytics = {
  totalRequests: 0,
  providerFills: {},
  houseFills: 0,
  errors: 0,
  lastRequestTime: 0,
};

async function getA11yProfile(req: Request): Promise<Record<string, boolean | undefined>> {
  try {
    const user = (req as any).user;
    if (!user?.id) return {};

    const response = await fetch(
      `http://localhost:${process.env.PORT || 5000}/api/a11y/preferences`,
      {
        headers: {
          Cookie: req.headers.cookie || "",
        },
      },
    );
    if (!response.ok) return {};
    const data = await response.json() as { profile?: Record<string, any> };
    return data.profile ?? {};
  } catch {
    return {};
  }
}

export function registerAdMediationRoutes(router: Router) {
  registerPlacementRoutes(router);
  registerRewardedRoutes(router);

  router.get("/api/ads/request", async (req: Request, res: Response) => {
    try {
      // Ad-safety: require authentication, and never serve ads to paid (Plus or
      // Premium) subscribers. Unauthenticated callers receive 401; paid users
      // receive 204 No Content; free users receive the ad.
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const tier = (req.user as { subscriptionTier?: string }).subscriptionTier;
      if (tier === "plus" || tier === "premium") {
        return res.status(204).end();
      }

      const adType = (req.query.type as string) === "midroll" ? "midroll" : "preroll";
      const contentGenre = req.query.genre as string | undefined;
      const bookId = req.query.bookId as string | undefined;
      const placementId = (req.query.placement as string) ||
        (adType === "midroll" ? "audio-midroll" : "audio-preroll");
      const user = (req as any).user ?? null;

      // ── Entitlement check: paid / institutional tiers + ad-free books ─────
      const userId: string | undefined = user?.claims?.sub || user?.id;
      const overrideTier = userId ? await resolveEntitlementOverride(userId, bookId) : null;
      const dbUser = userId ? await storage.getUser(userId) : null;
      const effectiveTier = getUserEffectiveTier(dbUser, overrideTier);
      const book = bookId ? await storage.getBook(bookId) : undefined;

      if (!shouldServeAds(user, effectiveTier, book)) {
        return res.status(204).end();
      }
      // ─────────────────────────────────────────────────────────────────────

      analytics.totalRequests++;
      analytics.lastRequestTime = Date.now();

      const a11yProfile = await getA11yProfile(req);
      const decision = AdDecisionService.decide(user, placementId, a11yProfile);

      if (!decision.serve) {
        console.log(`[AdMediation] Suppressed: reason=${decision.reason} placement=${placementId}`);
        return res.status(204).end();
      }

      const context = {
        adType: adType as "preroll" | "midroll",
        contentGenre,
        userId: user?.id,
        placementId,
      };

      const ad = await adService.requestAd(context);
      const suppressAnimated =
        decision.suppressAnimation === true ||
        a11yProfile.suppressAnimatedAds === true;

      // If user prefers static-only ads and the ad has a companion with animated format, filter it out
      // For house ads and audio-only ads this has no effect. For programmatic with companion, clear animated companions.
      if (suppressAnimated && ad.isProgrammatic) {
        const programmaticAd = ad as ProgrammaticAd;
        if (programmaticAd.companion && programmaticAd.companion.imageUrl) {
          const url = programmaticAd.companion.imageUrl.toLowerCase();
          if (url.endsWith(".gif") || url.includes("animated") || url.includes("video")) {
            programmaticAd.companion = undefined;
          }
        }
      }

      if (ad.isProgrammatic) {
        analytics.providerFills[ad.provider] = (analytics.providerFills[ad.provider] || 0) + 1;
      } else {
        analytics.houseFills++;
      }

      const responseBody = {
        ...ad,
        suppressAnimation: decision.suppressAnimation,
        suppressAudio: decision.suppressAudio,
      };

      res.json(responseBody);
    } catch (err) {
      analytics.errors++;
      console.error("[AdMediation] Request error:", err);
      const fallback: HouseAd = {
        id: "house-premium-1",
        provider: "house",
        title: "Go Premium",
        description: "Upgrade to Premium for ad-free listening, unlimited skips, and high-quality audio.",
        duration: 12,
        isProgrammatic: false,
      };
      analytics.houseFills++;
      res.json(fallback);
    }
  });

  router.post("/api/ads/tracking", async (req: Request, res: Response) => {
    try {
      const { urls } = req.body as { urls: string[] };
      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: "Missing urls array" });
      }

      const results = await Promise.allSettled(
        urls.map(url =>
          fetch(url, {
            method: "GET",
            headers: { "User-Agent": "AccessiBooks/1.0" },
          }).catch(() => null)
        )
      );

      const fired = results.filter(r => r.status === "fulfilled").length;
      res.json({ fired, total: urls.length });
    } catch (err) {
      console.error("[AdMediation] Tracking error:", err);
      res.status(500).json({ error: "Tracking failed" });
    }
  });

  router.get("/api/ads/providers", (_req: Request, res: Response) => {
    const programmaticEnvs = [
      process.env.ADSWIZZ_TAG_URL,
      process.env.TRITON_TAG_URL,
      process.env.ADPERSONAM_TAG_URL,
    ].filter(Boolean);

    const status = [
      ...programmaticEnvs.map((url, i) => ({
        name: ["adswizz", "triton", "adpersonam"][i],
        enabled: true,
        priority: i + 1,
        timeout: 3000,
        configured: true,
      })),
      { name: "self-serve", enabled: true, priority: 10, timeout: 5000, configured: true },
      { name: "house", enabled: true, priority: 999, timeout: 0, configured: true },
    ];

    res.json({
      providers: status,
      activeCount: status.filter(p => p.enabled).length,
      hasProgrammatic: programmaticEnvs.length > 0,
      flags: getAllFlags(),
    });
  });

  router.get("/api/ads/analytics", (_req: Request, res: Response) => {
    res.json({
      ...analytics,
      fillRate: analytics.totalRequests > 0
        ? ((analytics.totalRequests - analytics.houseFills) / analytics.totalRequests * 100).toFixed(1) + "%"
        : "N/A",
    });
  });
}
