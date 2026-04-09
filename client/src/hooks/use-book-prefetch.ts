import { useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import type { Book } from "@shared/schema";

const PREFETCH_DELAY_MS = 350;

async function silentFetch(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useBookPrefetch(book: Book) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: [`/api/books/${book.id}`],
      queryFn: () => silentFetch(`/api/books/${book.id}`),
      staleTime: 5 * 60 * 1000,
    });

    if (!book.contentType || book.contentType === "audiobook") {
      queryClient.prefetchQuery({
        queryKey: [`/api/books/${book.id}/stream-url`],
        queryFn: () => silentFetch(`/api/books/${book.id}/stream-url`),
        staleTime: 10 * 60 * 1000,
      });
    }

    fetch(`/api/books/${book.id}/prewarm`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [book.id, book.contentType]);

  const onMouseEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(prefetch, PREFETCH_DELAY_MS);
  }, [prefetch]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onFocus = useCallback(() => {
    prefetch();
  }, [prefetch]);

  return { onMouseEnter, onMouseLeave, onFocus };
}
