/**
 * Stream-quality selection (Task #66).
 *
 * Extracted from AudioContext so the bitrate/quality decision can be
 * unit-tested directly and shared by any code that builds a stream URL.
 *
 * The clamp rule is hard: when `lowBandwidthMode` is set, we always
 * return SD/128 kbps regardless of the user's subscription tier.
 */

export type StreamQualityTier = "uhq" | "hd" | "sd";

export interface StreamQualityInfo {
  quality: "low" | "mid" | "high" | "ultra";
  bitrate: number;
  label: string;
  tier: StreamQualityTier;
}

export type SubscriptionTier = "free" | "plus" | "premium" | "institutional" | string | undefined;

export function computeStreamQuality(
  subscriptionTier: SubscriptionTier,
  lowBandwidthMode: boolean,
): StreamQualityInfo {
  if (lowBandwidthMode) {
    return { quality: "low", bitrate: 128, label: "SD · 128 kbps (Low-Bandwidth)", tier: "sd" };
  }
  if (subscriptionTier === "premium" || subscriptionTier === "institutional") {
    return { quality: "ultra", bitrate: 320, label: "UHQ · 320 kbps", tier: "uhq" };
  }
  if (subscriptionTier === "plus") {
    return { quality: "mid", bitrate: 192, label: "HD · 192 kbps", tier: "hd" };
  }
  return { quality: "low", bitrate: 128, label: "SD · 128 kbps", tier: "sd" };
}

/**
 * Append the chosen quality tier + bitrate to a stream URL so the request
 * line carries the user's preference. The server can use these as hints
 * to pick a variant (or simply log them); even without multi-bitrate
 * encodes, this guarantees that a low-bandwidth user's request is
 * provably distinct from a premium user's request.
 */
export function appendStreamQualityParams(url: string, q: StreamQualityInfo): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}q=${encodeURIComponent(q.tier)}&br=${q.bitrate}`;
}
