/**
 * Unit tests for Low-Bandwidth & Text-Only Mode (Task #66).
 *
 * These tests import the actual production code paths:
 *   - `computeStreamQuality` + `appendStreamQualityParams` from the
 *     client `stream-quality` helper used by `AudioContext`.
 *   - `applyLowBandwidthSuppression` from `server/adMediation.ts` —
 *     the same helper invoked inside the GET /api/ads/request handler.
 *
 * Run with: npx tsx tests/low-bandwidth-mode.test.ts
 */

import {
  computeStreamQuality,
  appendStreamQualityParams,
} from "../client/src/contexts/stream-quality";
import { applyLowBandwidthSuppression } from "../server/adSuppression";

class AssertError extends Error {}
let pass = 0;
let fail = 0;
function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const r = fn();
    if (r && typeof (r as Promise<void>).then === "function") {
      (r as Promise<void>).then(
        () => { console.log(`  PASS  ${name}`); pass++; },
        (err: unknown) => {
          console.log(`  FAIL  ${name}`);
          console.log(`        ${err instanceof Error ? err.message : String(err)}`);
          fail++;
        },
      );
    } else {
      console.log(`  PASS  ${name}`);
      pass++;
    }
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
function assertContains(haystack: string, needle: string, msg: string): void {
  if (!haystack.includes(needle)) {
    throw new AssertError(`${msg}: "${haystack}" does not contain "${needle}"`);
  }
}

console.log("=== Low-Bandwidth & Text-Only Mode Test Results ===");

// ─── (1) Audio quality clamp — production helper ───────────────────────
test("free user, no low-bandwidth → SD/128", () => {
  const q = computeStreamQuality("free", false);
  assertEq(q.bitrate, 128, "bitrate");
  assertEq(q.tier, "sd", "tier");
});

test("plus user, no low-bandwidth → HD/192", () => {
  const q = computeStreamQuality("plus", false);
  assertEq(q.bitrate, 192, "bitrate");
  assertEq(q.tier, "hd", "tier");
});

test("premium user, no low-bandwidth → UHQ/320", () => {
  const q = computeStreamQuality("premium", false);
  assertEq(q.bitrate, 320, "bitrate");
  assertEq(q.tier, "uhq", "tier");
});

test("premium user WITH low-bandwidth is clamped to SD/128", () => {
  const q = computeStreamQuality("premium", true);
  assertEq(q.bitrate, 128, "bitrate");
  assertEq(q.tier, "sd", "tier");
  assertContains(q.label, "Low-Bandwidth", "label flags low-bandwidth");
});

test("plus user WITH low-bandwidth is clamped to SD/128", () => {
  const q = computeStreamQuality("plus", true);
  assertEq(q.bitrate, 128, "bitrate");
  assertEq(q.tier, "sd", "tier");
});

test("institutional user WITH low-bandwidth is clamped to SD/128", () => {
  const q = computeStreamQuality("institutional", true);
  assertEq(q.bitrate, 128, "bitrate");
});

test("appendStreamQualityParams adds q + br to a clean URL", () => {
  const url = appendStreamQualityParams("/api/stream/abc", computeStreamQuality("premium", true));
  assertContains(url, "q=sd", "tier param");
  assertContains(url, "br=128", "bitrate param");
});

test("appendStreamQualityParams uses & when URL already has a query", () => {
  const url = appendStreamQualityParams("/api/stream/abc?token=xyz", computeStreamQuality("free", false));
  assertContains(url, "?token=xyz&q=sd", "param chain");
});

// ─── (2) Ad mediation companion suppression — production helper ────────
test("low-bandwidth strips .gif companion image", () => {
  const ad: { isProgrammatic: true; companion?: { imageUrl?: string; videoUrl?: string } } = {
    isProgrammatic: true,
    companion: { imageUrl: "https://cdn/banner.gif" },
  };
  applyLowBandwidthSuppression(ad, { lowBandwidthMode: true });
  assertEq(ad.companion, undefined, "companion cleared");
});

test("low-bandwidth strips videoUrl from companion", () => {
  const ad: { isProgrammatic: true; companion?: { imageUrl?: string; videoUrl?: string } } = {
    isProgrammatic: true,
    companion: { imageUrl: "https://cdn/banner.png", videoUrl: "https://cdn/spot.mp4" },
  };
  applyLowBandwidthSuppression(ad, { lowBandwidthMode: true });
  assertEq(ad.companion?.videoUrl as unknown, undefined, "videoUrl deleted");
  assertEq(ad.companion?.imageUrl, "https://cdn/banner.png", "static imageUrl preserved");
});

test("low-bandwidth preserves static .png companion image", () => {
  const ad: { isProgrammatic: true; companion?: { imageUrl?: string; videoUrl?: string } } = {
    isProgrammatic: true,
    companion: { imageUrl: "https://cdn/banner.png" },
  };
  applyLowBandwidthSuppression(ad, { lowBandwidthMode: true });
  assertEq(ad.companion?.imageUrl, "https://cdn/banner.png", "static image preserved");
});

test("suppressAnimatedAds-only does NOT strip videoUrl (low-bandwidth scoped)", () => {
  const ad: { isProgrammatic: true; companion?: { imageUrl?: string; videoUrl?: string } } = {
    isProgrammatic: true,
    companion: { imageUrl: "https://cdn/banner.png", videoUrl: "https://cdn/spot.mp4" },
  };
  applyLowBandwidthSuppression(ad, { suppressAnimatedAds: true, lowBandwidthMode: false });
  assertEq(ad.companion?.videoUrl, "https://cdn/spot.mp4", "videoUrl kept under static-only");
});

test("no flags: companion left intact", () => {
  const ad: { isProgrammatic: true; companion?: { imageUrl?: string; videoUrl?: string } } = {
    isProgrammatic: true,
    companion: { imageUrl: "https://cdn/banner.gif", videoUrl: "https://cdn/spot.mp4" },
  };
  applyLowBandwidthSuppression(ad, {});
  assertEq(ad.companion?.imageUrl, "https://cdn/banner.gif", "gif preserved");
  assertEq(ad.companion?.videoUrl, "https://cdn/spot.mp4", "video preserved");
});

test("non-programmatic (house) ad is never modified", () => {
  const ad: { isProgrammatic: false; companion?: { imageUrl?: string; videoUrl?: string } } = {
    isProgrammatic: false,
    companion: { imageUrl: "https://cdn/banner.gif", videoUrl: "https://cdn/spot.mp4" },
  };
  applyLowBandwidthSuppression(ad, { lowBandwidthMode: true });
  assertEq(ad.companion?.imageUrl, "https://cdn/banner.gif", "house gif preserved");
  assertEq(ad.companion?.videoUrl, "https://cdn/spot.mp4", "house video preserved");
});

setTimeout(() => {
  console.log(`${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}, 100);
