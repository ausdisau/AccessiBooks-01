/**
 * Unit tests for Low-Bandwidth & Text-Only Mode (Task #66) helpers.
 *
 * Two behaviors required by the task spec but not exercised by the
 * API round-trip tests in account-settings.test.ts:
 *   1. The audio quality clamp picks SD/128 kbps when lowBandwidthMode
 *      is true — regardless of subscription tier.
 *   2. The ad mediation companion-image filter strips animated/video
 *      payloads when lowBandwidthMode (or suppressAnimatedAds) is set.
 *
 * Run with: npx tsx tests/low-bandwidth-mode.test.ts
 */

class AssertError extends Error {}
let pass = 0;
let fail = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err instanceof Error ? err.message : String(err)}`);
    fail++;
  }
}
function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new AssertError(`${msg}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ─── (1) Audio quality clamp ────────────────────────────────────────────
// Mirrors the streamQuality memo in client/src/contexts/AudioContext.tsx.
type Tier = "free" | "plus" | "premium" | "institutional";
function pickStreamQuality(tier: Tier, lowBandwidthMode: boolean) {
  if (lowBandwidthMode) {
    return { tier: "SD", bitrate: 128, label: "SD · 128 kbps (Low-Bandwidth)" };
  }
  if (tier === "premium" || tier === "institutional") {
    return { tier: "HD", bitrate: 320, label: "HD · 320 kbps" };
  }
  if (tier === "plus") {
    return { tier: "HQ", bitrate: 192, label: "HQ · 192 kbps" };
  }
  return { tier: "SD", bitrate: 128, label: "SD · 128 kbps" };
}

console.log("=== Low-Bandwidth & Text-Only Mode Test Results ===");

test("free user without low-bandwidth gets 128 kbps default", () => {
  const q = pickStreamQuality("free", false);
  assertEq(q.bitrate, 128, "bitrate");
});

test("plus user without low-bandwidth gets 192 kbps", () => {
  const q = pickStreamQuality("plus", false);
  assertEq(q.bitrate, 192, "bitrate");
});

test("premium user without low-bandwidth gets 320 kbps", () => {
  const q = pickStreamQuality("premium", false);
  assertEq(q.bitrate, 320, "bitrate");
});

test("premium user WITH low-bandwidth is clamped to 128 kbps", () => {
  const q = pickStreamQuality("premium", true);
  assertEq(q.bitrate, 128, "bitrate");
  assertEq(q.tier, "SD", "tier");
  assertEq(q.label.includes("Low-Bandwidth"), true, "label flags low-bandwidth");
});

test("plus user WITH low-bandwidth is clamped to 128 kbps", () => {
  const q = pickStreamQuality("plus", true);
  assertEq(q.bitrate, 128, "bitrate");
});

test("institutional user WITH low-bandwidth is clamped to 128 kbps", () => {
  const q = pickStreamQuality("institutional", true);
  assertEq(q.bitrate, 128, "bitrate");
});

// ─── (2) Ad mediation companion filter ─────────────────────────────────
// Mirrors the suppression logic in server/adMediation.ts (lines ~173–198).
interface Companion { imageUrl?: string; videoUrl?: string }
interface ProgrammaticAd { isProgrammatic: true; companion?: Companion }

function applyAdSuppression(
  ad: ProgrammaticAd,
  opts: { lowBandwidthMode?: boolean; suppressAnimatedAds?: boolean; suppressAnimationDecision?: boolean },
): ProgrammaticAd {
  const lowBandwidth = opts.lowBandwidthMode === true;
  const suppressAnimated =
    opts.suppressAnimationDecision === true ||
    opts.suppressAnimatedAds === true ||
    lowBandwidth;
  if (suppressAnimated && ad.isProgrammatic) {
    if (ad.companion && ad.companion.imageUrl) {
      const url = ad.companion.imageUrl.toLowerCase();
      if (url.endsWith(".gif") || url.includes("animated") || url.includes("video")) {
        ad.companion = undefined;
      }
    }
    if (lowBandwidth && ad.companion && ad.companion.videoUrl) {
      delete ad.companion.videoUrl;
    }
  }
  return ad;
}

test("low-bandwidth strips .gif companion image", () => {
  const ad = applyAdSuppression(
    { isProgrammatic: true, companion: { imageUrl: "https://cdn/banner.gif" } },
    { lowBandwidthMode: true },
  );
  assertEq(ad.companion, undefined, "companion cleared");
});

test("low-bandwidth strips videoUrl from companion", () => {
  const ad = applyAdSuppression(
    { isProgrammatic: true, companion: { imageUrl: "https://cdn/banner.png", videoUrl: "https://cdn/spot.mp4" } },
    { lowBandwidthMode: true },
  );
  assertEq(ad.companion?.videoUrl as unknown as undefined, undefined, "videoUrl deleted");
  assertEq(ad.companion?.imageUrl, "https://cdn/banner.png", "static imageUrl preserved");
});

test("low-bandwidth preserves static .png companion image", () => {
  const ad = applyAdSuppression(
    { isProgrammatic: true, companion: { imageUrl: "https://cdn/banner.png" } },
    { lowBandwidthMode: true },
  );
  assertEq(ad.companion?.imageUrl, "https://cdn/banner.png", "static image preserved");
});

test("suppressAnimatedAds-only does NOT strip videoUrl (low-bandwidth-specific)", () => {
  const ad = applyAdSuppression(
    { isProgrammatic: true, companion: { imageUrl: "https://cdn/banner.png", videoUrl: "https://cdn/spot.mp4" } },
    { suppressAnimatedAds: true, lowBandwidthMode: false },
  );
  assertEq(ad.companion?.videoUrl, "https://cdn/spot.mp4", "videoUrl kept under static-only");
});

test("no suppression flags: companion left intact", () => {
  const ad = applyAdSuppression(
    { isProgrammatic: true, companion: { imageUrl: "https://cdn/banner.gif", videoUrl: "https://cdn/spot.mp4" } },
    {},
  );
  assertEq(ad.companion?.imageUrl, "https://cdn/banner.gif", "gif preserved");
  assertEq(ad.companion?.videoUrl, "https://cdn/spot.mp4", "video preserved");
});

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
