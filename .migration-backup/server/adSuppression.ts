/**
 * Low-Bandwidth + suppress-animated companion filter (Task #66).
 *
 * Side-effect-free helper extracted from adMediation.ts so it can be
 * imported by unit tests without booting Express, storage, or providers.
 *
 * Rules:
 *   - When `suppressAnimationDecision`, `suppressAnimatedAds`, or
 *     `lowBandwidthMode` is set, drop the companion entirely if its image
 *     URL ends in `.gif`, contains `animated`, or contains `video`.
 *   - When `lowBandwidthMode` is set, additionally strip any `videoUrl`
 *     property on the companion regardless of file extension.
 *   - House / non-programmatic ads are unaffected.
 */
export interface SuppressionOpts {
  lowBandwidthMode?: boolean;
  suppressAnimatedAds?: boolean;
  suppressAnimationDecision?: boolean;
}

export function applyLowBandwidthSuppression<
  T extends {
    isProgrammatic: boolean;
    companion?: { imageUrl?: string; videoUrl?: string } | undefined;
  },
>(ad: T, opts: SuppressionOpts): T {
  const lowBandwidth = opts.lowBandwidthMode === true;
  const suppressAnimated =
    opts.suppressAnimationDecision === true ||
    opts.suppressAnimatedAds === true ||
    lowBandwidth;
  if (!suppressAnimated || !ad.isProgrammatic) return ad;

  if (ad.companion && ad.companion.imageUrl) {
    const url = ad.companion.imageUrl.toLowerCase();
    if (url.endsWith(".gif") || url.includes("animated") || url.includes("video")) {
      ad.companion = undefined;
      return ad;
    }
  }
  if (lowBandwidth && ad.companion && ad.companion.videoUrl) {
    delete ad.companion.videoUrl;
  }
  return ad;
}
