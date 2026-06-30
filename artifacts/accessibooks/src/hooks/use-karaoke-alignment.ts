import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

interface WordAlignment {
  word: string;
  startMs: number;
  endMs: number;
  wordIndex: number;
}

interface AlignmentData {
  available: boolean;
  // "exact" = real per-word marks from the timing source; "estimated" = words
  // interpolated within a real sentence window; "none" = no timing at all.
  precision?: "exact" | "estimated" | "none";
  words: WordAlignment[];
}

export function useKaraokeAlignment(bookId: string | null, currentTimeMs: number) {
  const { data, isLoading } = useQuery<AlignmentData>({
    queryKey: ["/api/books", bookId, "word-alignment"],
    queryFn: async () => {
      if (!bookId) return { available: false, words: [] };
      const res = await fetch(`/api/books/${bookId}/word-alignment`);
      if (!res.ok) return { available: false, words: [] };
      return res.json();
    },
    enabled: !!bookId,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  // Map global word index -> start time (ms) so callers can seek the audio to a
  // tapped word (read-along tap-to-seek).
  const startMsByIndex = useMemo(() => {
    const m = new Map<number, number>();
    if (data?.words) {
      for (const w of data.words) m.set(w.wordIndex, w.startMs);
    }
    return m;
  }, [data]);

  const getWordStartMs = useCallback(
    (wordIndex: number): number | null => {
      const v = startMsByIndex.get(wordIndex);
      return v === undefined ? null : v;
    },
    [startMsByIndex],
  );

  const activeWordIndex = useMemo(() => {
    // Word-level karaoke only when timing is exact — never highlight individual
    // words from interpolated ("estimated") timing.
    if (data?.precision !== "exact" || !data.words.length) return null;
    const t = currentTimeMs;
    const words = data.words;

    let lo = 0;
    let hi = words.length - 1;
    let result = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const w = words[mid];
      if (w.startMs <= t && w.endMs > t) {
        result = mid;
        break;
      } else if (w.startMs > t) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
        result = mid;
      }
    }

    if (result < 0) return null;
    const candidate = words[result];
    // If time is past the last word's end, nothing is active
    if (t >= candidate.endMs && result === words.length - 1) return null;
    return candidate.wordIndex;
  }, [data, currentTimeMs]);

  return {
    // Word-level read-along (highlight + tap-to-seek) is only offered when the
    // source provides exact per-word timing; estimated timing drives sentence-
    // level read-along elsewhere (InteractiveTranscript), not word karaoke.
    isAvailable: data?.precision === "exact",
    isLoading,
    activeWordIndex,
    totalAlignedWords: data?.words.length ?? 0,
    getWordStartMs,
  };
}
