/**
 * Stage 6 — Read-along placeholder.
 *
 * Architecture is in place so a future audiobook timing feed can light up
 * phrases as audio plays. Today the hook stays gated off because the demo
 * provider, real text-only books, and browser SpeechSynthesis do not emit
 * per-segment timing we can trust.
 *
 * Activation contract (deliberately conservative):
 * - At least one page must carry segments WITH `startMs`/`endMs`.
 * - The book content envelope must opt in via `hasReadAlongTiming: true`.
 *
 * Until then the hook returns `enabled: false` and the renderer simply
 * skips its highlight overlay — keeping browser SpeechSynthesis as the
 * active read-aloud mode without faking precise timing.
 */

import { useMemo } from "react";
import type { FlipbookBookContent, FlipbookPage, TranscriptSegment } from "./flipbook-content-types";

export interface ReadAlongState {
  enabled: boolean;
  /** Segment id currently being spoken/played, or null when idle. */
  activeSegmentId: string | null;
  /** Segments for the current page (may be empty). */
  segments: TranscriptSegment[];
}

function pageHasTiming(page: FlipbookPage | undefined): boolean {
  if (!page?.segments?.length) return false;
  return page.segments.some(
    (s) => typeof s.startMs === "number" && typeof s.endMs === "number",
  );
}

/**
 * Returns the read-along state for the visible page. Today it always
 * resolves to `enabled: false` unless the provider explicitly opted in
 * AND the current page actually has timing data.
 *
 * The `currentTimeMs` parameter is reserved for the future audiobook
 * integration; passing `undefined` is fine while the feature is gated.
 */
export function useReadAlong(
  content: FlipbookBookContent | null,
  currentPage: number,
  currentTimeMs?: number,
): ReadAlongState {
  return useMemo(() => {
    const page = content?.pages.find((p) => p.pageNumber === currentPage);
    const segments = page?.segments ?? [];
    const enabled = !!content?.hasReadAlongTiming && pageHasTiming(page);

    if (!enabled || typeof currentTimeMs !== "number") {
      return { enabled, activeSegmentId: null, segments };
    }

    const active = segments.find(
      (s) =>
        typeof s.startMs === "number" &&
        typeof s.endMs === "number" &&
        currentTimeMs >= s.startMs &&
        currentTimeMs < s.endMs,
    );
    return { enabled, activeSegmentId: active?.id ?? null, segments };
  }, [content, currentPage, currentTimeMs]);
}
