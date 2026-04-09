import { useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import type { Book } from "@shared/schema";

type EbookFormat = "text" | "pdf" | "epub" | "unknown";

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

async function detectEbookFormat(bookId: string, contentUrl: string | null | undefined): Promise<EbookFormat> {
  const urlLower = (contentUrl || "").toLowerCase();
  if (urlLower.endsWith(".pdf")) return "pdf";
  if (urlLower.endsWith(".epub")) return "epub";
  if (!urlLower) return "text";
  try {
    const response = await fetch(`/api/ebook/${bookId}/content`, { method: "HEAD" });
    const ct = response.headers.get("content-type") || "";
    if (ct.includes("application/pdf")) return "pdf";
    if (ct.includes("application/epub") || ct.includes("application/zip")) return "epub";
    return "text";
  } catch {
    return "text";
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

    if (book.contentType === "ebook" || book.contentType === "magazine") {
      queryClient.prefetchQuery({
        queryKey: ["ebook-format", book.id],
        queryFn: () => detectEbookFormat(book.id, book.contentUrl),
        staleTime: 60 * 60 * 1000,
      });
    }

    fetch(`/api/books/${book.id}/prewarm`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [book.id, book.contentType, book.contentUrl]);

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
