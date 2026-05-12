/**
 * SelfServeAdProvider — wraps existing selectSelfServeAd() from selfServeAds.ts.
 */
import type { IAdProvider, AdRequestContext, AdProviderResponse } from "../adService";
import { selectSelfServeAd, recordImpression } from "../selfServeAds";

export class SelfServeAdProvider implements IAdProvider {
  readonly name = "self-serve";

  async requestAd(context: AdRequestContext): Promise<AdProviderResponse | null> {
    const adType = context.adType === "preroll" ? "preroll" : "midroll";
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
