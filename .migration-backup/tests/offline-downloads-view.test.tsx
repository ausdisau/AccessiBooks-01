/**
 * Storage & Downloads UI render tests (Task #66).
 *
 * Covers the "Storage panel render assertion" axis flagged by the
 * code-review rejection. We render the pure presentational view with
 * react-dom/server (no jsdom required) and assert that:
 *
 *   1. The total storage usage line is present.
 *   2. Per-item metadata (size, saved date, last-played fallback) is
 *      rendered for every download.
 *   3. The "Not available offline" licensing note is rendered
 *      unconditionally (both populated and empty states).
 *   4. Loans are listed for non-premium users (Premium gate is removed).
 *
 * Run with: npx tsx tests/offline-downloads-view.test.tsx
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { OfflineDownloadsView, formatBytes, type OfflineDownloadsViewProps } from "../client/src/components/offline-downloads";

function render(props: OfflineDownloadsViewProps): string {
  return renderToString(React.createElement(OfflineDownloadsView, props));
}

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
function assertContains(haystack: string, needle: string, msg: string): void {
  if (!haystack.includes(needle)) {
    throw new AssertError(`${msg}: missing "${needle}"`);
  }
}
function assertNotContains(haystack: string, needle: string, msg: string): void {
  if (haystack.includes(needle)) {
    throw new AssertError(`${msg}: unexpectedly contained "${needle}"`);
  }
}

console.log("=== Offline Downloads View Render Tests ===");

test("populated panel renders storage total + per-item metadata", () => {
  const html = render({
      isPremium: true,
      downloads: [
        {
          bookId: "book-1",
          title: "Test Book",
          author: "Test Author",
          coverImage: "",
          sizeBytes: 5_242_880,
          downloadedAt: "2026-05-01T10:00:00Z",
          lastPlayedAt: "2026-05-10T10:00:00Z",
        },
      ],
      activeDownloads: [],
      failedDownloads: [],
      storageUsed: 5_242_880,
      storageEstimate: 1_073_741_824,
    });
  assertContains(html, "storage-usage-total", "storage usage section rendered");
  assertContains(html, formatBytes(5_242_880), "per-item size formatted");
  assertContains(html, "Last played", "last-played label rendered");
  assertContains(html, "offline-play-book-1", "play button rendered");
  assertContains(html, "offline-meta-book-1", "meta line testid present");
});

test("download with no lastPlayedAt shows 'Not yet played' fallback", () => {
  const html = render({
      isPremium: true,
      downloads: [
        {
          bookId: "book-2",
          title: "Fresh",
          author: "X",
          coverImage: "",
          sizeBytes: 1024,
          downloadedAt: "2026-05-11T00:00:00Z",
        },
      ],
      activeDownloads: [],
      failedDownloads: [],
      storageUsed: 1024,
      storageEstimate: 0,
    });
  assertContains(html, "Not yet played", "fallback text rendered");
});

test("undownloadable note ALWAYS renders — populated state", () => {
  const html = render({
      isPremium: true,
      downloads: [
        {
          bookId: "b",
          title: "t",
          author: "a",
          coverImage: "",
          sizeBytes: 1,
          downloadedAt: "2026-05-01",
        },
      ],
      activeDownloads: [],
      failedDownloads: [],
      storageUsed: 1,
      storageEstimate: 0,
    });
  assertContains(html, "undownloadable-note", "note testid present");
  assertContains(html, "Not available offline", "note heading present");
});

test("undownloadable note ALWAYS renders — empty state", () => {
  const html = render({
      isPremium: true,
      downloads: [],
      activeDownloads: [],
      failedDownloads: [],
      storageUsed: 0,
      storageEstimate: 0,
    });
  assertContains(html, "undownloadable-note", "note testid present in empty state");
  assertContains(html, "Not available offline", "note heading present in empty state");
});

test("non-premium user with loan downloads sees the list (no premium-gate dead end)", () => {
  const html = render({
      isPremium: false,
      downloads: [
        {
          bookId: "loan-1",
          title: "Borrowed Title",
          author: "Author",
          coverImage: "",
          sizeBytes: 2048,
          downloadedAt: "2026-05-05T12:00:00Z",
          loanId: "loan-abc",
        },
      ],
      activeDownloads: [],
      failedDownloads: [],
      storageUsed: 2048,
      storageEstimate: 0,
    });
  assertContains(html, "Borrowed Title", "loan title rendered for non-premium user");
  assertContains(html, "offline-play-loan-1", "loan play button rendered");
  assertContains(html, "Loan", "loan badge in metadata");
  // No premium-gate dead end:
  assertNotContains(html, "Premium unlocks downloads", "no upsell when loans exist");
});

test("non-premium user with no loans sees a small upsell card", () => {
  const html = render({
      isPremium: false,
      downloads: [],
      activeDownloads: [],
      failedDownloads: [],
      storageUsed: 0,
      storageEstimate: 0,
    });
  assertContains(html, "Premium unlocks downloads", "compact upsell rendered");
  // Even with the upsell, the storage panel + undownloadable note must remain visible:
  assertContains(html, "storage-usage-total", "storage section still rendered");
  assertContains(html, "undownloadable-note", "note still rendered");
});

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
