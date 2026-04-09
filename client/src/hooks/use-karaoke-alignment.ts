import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

interface WordAlignment {
  word: string;
  startMs: number;
  endMs: number;
  wordIndex: number;
}

interface AlignmentData {
  available: boolean;
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

  const activeWordIndex = useMemo(() => {
    if (!data?.available || !data.words.length) return null;
    const t = currentTimeMs;

    let lo = 0;
    let hi = data.words.length - 1;
    let result = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const w = data.words[mid];
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
    return data.words[result].wordIndex;
  }, [data, currentTimeMs]);

  return {
    isAvailable: data?.available ?? false,
    isLoading,
    activeWordIndex,
    totalAlignedWords: data?.words.length ?? 0,
  };
}
