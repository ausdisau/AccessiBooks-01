/**
 * SelfServeAdProvider — wraps existing selectSelfServeAd() from selfServeAds.ts.
 * Also handles display ad requests by selecting self-serve creatives that have
 * a companion image (companionImageUrl), returning them as display creatives.
 */
import type { IAdProvider, AdRequestContext, AdProviderResponse } from "../adService";
import { selectSelfServeAd, selectSelfServeDisplayAd, recordImpression } from "../selfServeAds";

export class SelfServeAdProvider implements IAdProvider {
  readonly name = "self-serve";

  async requestAd(context: AdRequestContext): Promise<AdProviderResponse | null> {
    if (context.adType === "display") {
      const displayAd = await selectSelfServeDisplayAd(context.contentGenre);
      if (!displayAd) return null;

      return {
        id: `selfserve-display-${displayAd.creativeId}`,
        provider: "self-serve",
        title: displayAd.title,
        advertiser: displayAd.advertiser,
        imageUrl: displayAd.imageUrl,
        clickThrough: displayAd.clickThrough,
        duration: 0,
        tracking: {
          impression: [], start: [], firstQuartile: [], midpoint: [],
          thirdQuartile: [], complete: [], skip: [], mute: [], unmute: [],
          pause: [], resume: [], error: [], clickTracking: [],
        },
        isProgrammatic: true,
      };
    }

    // Self-serve billing schema only supports preroll/midroll columns; post-roll
    // creatives are billed as midroll (same CPM tier as mid-content placements)
    // while the upstream context.adType continues to carry "postroll" for
    // analytics and impression logging.
    const adType: "preroll" | "midroll" =
      context.adType === "preroll" ? "preroll" : "midroll";
    const selfServeAd = await selectSelfServeAd(adType, context.contentGenre);
    if (!selfServeAd) return null;

    const impressionId = await recordImpression(
      selfServeAd.campaignId,
      selfServeAd.creativeId,
      context.userId,
      adType,
    );

    return {
      id: `selfserve-${selfServeAd.creativeId}`,
      provider: "self-serve",
      title: selfServeAd.title,
      advertiser: selfServeAd.advertiser,
      audioUrl: selfServeAd.audioUrl,
      mimeType: selfServeAd.mimeType,
      duration: selfServeAd.duration,
      companion: selfServeAd.companionImageUrl ? {
        imageUrl: selfServeAd.companionImageUrl,
        clickThrough: selfServeAd.clickThroughUrl,
        width: 300,
        height: 250,
        trackingPixels: [],
      } : undefined,
      tracking: {
        impression: [], start: [], firstQuartile: [], midpoint: [],
        thirdQuartile: [], complete: [], skip: [], mute: [], unmute: [],
        pause: [], resume: [], error: [], clickTracking: [],
      },
      isProgrammatic: true,
      _selfServeImpressionId: impressionId,
    };
  }
}
