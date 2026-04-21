import { useRef, useState, useEffect, useCallback } from "react";
import { audioAdService, type AdResponse } from "@/services/audio-ad-service";
import type { Chapter } from "@shared/schema";

export interface TranscriptSegment {
  start: number;
  end: number;
  text?: string;
}

export interface AdDecisionState {
  pending: boolean;
  type: "pre-roll" | "mid-roll" | null;
  ad: AdResponse | null;
}

interface UsePlaybackAdHooksOptions {
  tier: "free" | "plus" | "premium" | "institutional";
  currentTime: number;
  currentChapterIndex: number;
  chapters: Chapter[];
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

    if (res.status === 204) return null; // server says no fill
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

/** Poll the server once for an active ad-light-listening reward. */
async function fetchRewardStatus(): Promise<boolean> {
  try {
    const res = await fetch("/api/ads/rewarded/status", { credentials: "include" });
    if (!res.ok) return false;
    const data: { active: boolean } = await res.json();
    return data.active;
  } catch {
    return false;
  }
}

export function usePlaybackAdHooks({
  tier,
  currentTime,
  currentChapterIndex,
  chapters,
  transcriptSegments,
  adFlagsEnabled = { preRoll: true, midRoll: true },
}: UsePlaybackAdHooksOptions) {
  const [adDecision, setAdDecision] = useState<AdDecisionState>({
    pending: false,
    type: null,
    ad: null,
  });
  const [rewardActive, setRewardActive] = useState(false);

  // Keep adDecision in a ref so async callbacks always see the latest value
  // without stale closure issues.
  const adDecisionRef = useRef(adDecision);
  adDecisionRef.current = adDecision;

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
    if (tier !== "free") return false; // synchronous tier check — no ref lag
    if (!adFlagsEnabled.preRoll) return false;
    if (rewardActiveRef.current) return false;
    return audioAdService.shouldShowPreRoll(false); // cooldown check
  }, [tier, adFlagsEnabled.preRoll]);

  const isMidRollEligible = useCallback((): boolean => {
    if (tier !== "free") return false;
    if (!adFlagsEnabled.midRoll) return false;
    if (rewardActiveRef.current) return false;
    return audioAdService.shouldShowMidRoll(false); // cooldown check
  }, [tier, adFlagsEnabled.midRoll]);

  // HOOK: pre-roll served — ad overlay shown, book playback deferred
  const onPlayBookCalled = useCallback(async (): Promise<"play" | "show-ad"> => {
    if (!isPreRollEligible()) return "play";

    setAdDecision({ pending: true, type: "pre-roll", ad: null });

    const ad = await fetchAdWithTimeout("audio-preroll");

    if (!ad) {
      setAdDecision({ pending: false, type: null, ad: null });
      return "play";
    }

    setAdDecision({ pending: false, type: "pre-roll", ad });
    return "show-ad";
  }, [isPreRollEligible]);

  // HOOK: chapter-boundary — mid-roll eligibility checked here, sentence guard applied
  const onChapterBoundary = useCallback(
    async (
      prevIndex: number,
      newIndex: number,
    ): Promise<"continue" | "show-ad" | `defer-to:${number}`> => {
      // Only react to forward sequential chapter advances (not seeks)
      if (newIndex !== prevIndex + 1) return "continue";
      if (!isMidRollEligible()) return "continue";

      // Sentence boundary guard: if the current playhead is inside a transcript
      // segment and >0.5 s remain in that segment, defer until it ends.
      if (transcriptSegments && transcriptSegments.length > 0) {
        const seg = transcriptSegments.find(
          (s) => currentTime >= s.start && currentTime < s.end,
        );
        if (seg && seg.end - currentTime > 0.5) {
          return `defer-to:${seg.end}`;
        }
      }

      setAdDecision({ pending: true, type: "mid-roll", ad: null });

      const ad = await fetchAdWithTimeout("audio-midroll");

      if (!ad) {
        setAdDecision({ pending: false, type: null, ad: null });
        return "continue";
      }

      setAdDecision({ pending: false, type: "mid-roll", ad });
      return "show-ad";
    },
    [isMidRollEligible, transcriptSegments, currentTime],
  );

  // HOOK: ad-resolved — impression recorded, deferred playback resumed
  const onAdResolved = useCallback(
    (outcome: "completed" | "skipped" | "failed") => {
      setAdDecision({ pending: false, type: null, ad: null });

      // Re-poll reward window after a completed view so the next book/chapter
      // boundary check has up-to-date bypass information.
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
