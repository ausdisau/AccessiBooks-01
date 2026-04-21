import { useRef, useState, useEffect, useCallback } from "react";
import { audioAdService, type AdResponse } from "@/services/audio-ad-service";

export interface TranscriptSegment {
  start: number;
  end: number;
  text?: string;
}

export interface AdDecisionState {
  pending: boolean;
  type: "pre-roll" | "mid-roll" | null;
}

/**
 * Canonical hook interface.
 * NOTE: `onPlayBookCalled` and `onChapterBoundary` return the ad payload **inline**
 * as `{ type: "show-ad"; ad }` (not a string-only union).  This eliminates the React
 * async-state-read race where `currentAd` could still be null between the await and
 * the next render.  Callers must read `result.ad` directly from the returned value
 * rather than reading it from AudioContext's `adState.currentAd` after the await.
 */
interface UsePlaybackAdHooksOptions {
  tier: "free" | "plus" | "premium" | "institutional";
  currentTime: number;
  transcriptSegments: TranscriptSegment[] | null;
  adFlagsEnabled?: { preRoll: boolean; midRoll: boolean };
}

const AD_REQUEST_TIMEOUT_MS = 3000;

/** Fetch a single ad with a 3-second hard timeout. Returns null on 204/error/timeout. */
async function fetchAdWithTimeout(
  placement: "audio-preroll" | "audio-midroll",
): Promise<AdResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AD_REQUEST_TIMEOUT_MS);

  try {
    const type = placement === "audio-preroll" ? "preroll" : "midroll";
    const res = await fetch(`/api/ads/request?type=${type}&placement=${placement}`, {
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 204) return null;
    if (!res.ok) return null;
    return (await res.json()) as AdResponse;
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as Error).name !== "AbortError") {
      console.warn("[AdHook] ad request failed, continuing playback:", err);
    } else {
      console.warn("[AdHook] ad request timed out (>3 s), continuing playback");
    }
    return null;
  }
}

/** Poll the server once for an active ad-light-listening reward grant. */
async function fetchRewardStatus(): Promise<boolean> {
  try {
    const res = await fetch("/api/ads/reward/status", { credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json();
    // Support both { active: boolean } and { rewards: Array<{ rewardType, active }> }
    if (typeof data.active === "boolean") return data.active;
    if (Array.isArray(data.rewards)) {
      return (data.rewards as Array<{ rewardType: string; active: boolean }>).some(
        (r) => r.rewardType === "ad_light_listening" && r.active,
      );
    }
    return false;
  } catch {
    return false;
  }
}

export function usePlaybackAdHooks({
  tier,
  currentTime,
  transcriptSegments,
  adFlagsEnabled = { preRoll: true, midRoll: true },
}: UsePlaybackAdHooksOptions) {
  const [adDecision, setAdDecision] = useState<AdDecisionState>({
    pending: false,
    type: null,
  });

  const [rewardActive, setRewardActive] = useState(false);
  const rewardActiveRef = useRef(false);

  // Poll reward status once on mount (fire-and-forget)
  useEffect(() => {
    let cancelled = false;
    fetchRewardStatus().then((active) => {
      if (cancelled) return;
      rewardActiveRef.current = active;
      setRewardActive(active);
    });
    return () => { cancelled = true; };
  }, []);

  // HOOK: pre-roll eligibility — ad-aware playback hook consulted here
  const isPreRollEligible = useCallback((): boolean => {
    if (tier !== "free") return false;
    if (!adFlagsEnabled.preRoll) return false;
    if (rewardActiveRef.current) return false;
    return audioAdService.shouldShowPreRoll(false);
  }, [tier, adFlagsEnabled.preRoll]);

  const isMidRollEligible = useCallback(
    (_chapterIndex?: number): boolean => {
      if (tier !== "free") return false;
      if (!adFlagsEnabled.midRoll) return false;
      if (rewardActiveRef.current) return false;
      return audioAdService.shouldShowMidRoll(false);
    },
    [tier, adFlagsEnabled.midRoll],
  );

  /**
   * HOOK: pre-roll served — ad overlay shown, book playback deferred.
   * Returns the ad payload directly to avoid async state-read races.
   */
  const onPlayBookCalled = useCallback(async (): Promise<
    "play" | { type: "show-ad"; ad: AdResponse }
  > => {
    if (!isPreRollEligible()) return "play";

    setAdDecision({ pending: true, type: "pre-roll" });

    const ad = await fetchAdWithTimeout("audio-preroll");

    if (!ad) {
      setAdDecision({ pending: false, type: null });
      return "play";
    }

    setAdDecision({ pending: false, type: "pre-roll" });
    // Return ad inline — caller should not read from adDecision state (render delay)
    return { type: "show-ad", ad };
  }, [isPreRollEligible]);

  /**
   * HOOK: chapter-boundary — mid-roll eligibility checked here, sentence guard applied.
   * Returns the ad payload directly to avoid async state-read races.
   */
  const onChapterBoundary = useCallback(
    async (
      prevIndex: number,
      newIndex: number,
    ): Promise<"continue" | `defer-to:${number}` | { type: "show-ad"; ad: AdResponse }> => {
      if (newIndex !== prevIndex + 1) return "continue";
      if (!isMidRollEligible(newIndex)) return "continue";

      // Sentence boundary guard
      if (transcriptSegments && transcriptSegments.length > 0) {
        const seg = transcriptSegments.find(
          (s) => currentTime >= s.start && currentTime < s.end,
        );
        if (seg && seg.end - currentTime > 0.5) {
          return `defer-to:${seg.end}`;
        }
      }

      setAdDecision({ pending: true, type: "mid-roll" });

      const ad = await fetchAdWithTimeout("audio-midroll");

      if (!ad) {
        setAdDecision({ pending: false, type: null });
        return "continue";
      }

      setAdDecision({ pending: false, type: "mid-roll" });
      return { type: "show-ad", ad };
    },
    [isMidRollEligible, transcriptSegments, currentTime],
  );

  // HOOK: ad-resolved — impression recorded, deferred playback resumed
  const onAdResolved = useCallback(
    (outcome: "completed" | "skipped" | "failed") => {
      setAdDecision({ pending: false, type: null });

      if (outcome === "completed") {
        fetchRewardStatus().then((active) => {
          rewardActiveRef.current = active;
          setRewardActive(active);
        });
      }
    },
    [],
  );

  return {
    isPreRollEligible,
    isMidRollEligible,
    onPlayBookCalled,
    onChapterBoundary,
    onAdResolved,
    adDecision,
    rewardActive,
  };
}
