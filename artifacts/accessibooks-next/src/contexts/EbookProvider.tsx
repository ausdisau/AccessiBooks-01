import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "@shared/schema";
import { localStorageService } from "@/lib/storage";
import {
  EbookContext,
  type Bookmark,
  type EbookContextValue,
  type ReadingLocation,
  locationsEqual,
} from "@/contexts/ebook-context";

const DEFAULT_FONT_SIZE = 18;

function bookmarksKey(bookId: string) {
  return `ebook-bookmarks-${bookId}`;
}
function fontSizeKey(bookId: string) {
  return `ebook-fontsize-${bookId}`;
}
function legacySettingsKey(bookId: string) {
  return `ebook-settings-${bookId}`;
}

function loadBookmarksFromStorage(bookId: string): Bookmark[] {
  try {
    const raw = localStorage.getItem(bookmarksKey(bookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === "number")) {
      // Legacy format: number[] of pages
      return (parsed as number[]).map((page) => ({
        id: `legacy-${page}`,
        location: { kind: "page", value: page },
        createdAt: new Date(0).toISOString(),
      }));
    }
    if (Array.isArray(parsed)) return parsed as Bookmark[];
    return [];
  } catch {
    return [];
  }
}

function persistBookmarks(bookId: string, bookmarks: Bookmark[]) {
  try {
    // Persist in legacy number[] form when all are page bookmarks so existing
    // surfaces relying on that shape keep working until they migrate.
    const allPage = bookmarks.length > 0 && bookmarks.every((b) => b.location.kind === "page");
    if (allPage) {
      const pages = bookmarks
        .map((b) => (b.location.kind === "page" ? (b.location.value as number) : 0))
        .sort((a, b) => a - b);
      localStorage.setItem(bookmarksKey(bookId), JSON.stringify(pages));
    } else {
      localStorage.setItem(bookmarksKey(bookId), JSON.stringify(bookmarks));
    }
  } catch {}
}

function loadFontSizeFromStorage(bookId: string): number {
  try {
    // Prefer the provider-owned key (cannot be clobbered by component settings writes).
    const ownRaw = localStorage.getItem(fontSizeKey(bookId));
    if (ownRaw) {
      const fs = Number(JSON.parse(ownRaw));
      if (Number.isFinite(fs) && fs > 0) return fs;
    }
    // Fall back to legacy ebook-settings-* one-time so existing users don't lose their value.
    const raw = localStorage.getItem(legacySettingsKey(bookId));
    if (!raw) return DEFAULT_FONT_SIZE;
    const parsed = JSON.parse(raw);
    const fs = Number(parsed?.fontSize);
    return Number.isFinite(fs) && fs > 0 ? fs : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

function persistFontSize(bookId: string, fontSize: number) {
  try {
    localStorage.setItem(fontSizeKey(bookId), JSON.stringify(fontSize));
  } catch {}
}

function loadInitialLocationFromStorage(bookId: string): ReadingLocation | null {
  const progress = localStorageService.getProgress(bookId);
  if (progress?.currentTime && progress.currentTime > 0) {
    return { kind: "page", value: Math.max(1, Math.floor(progress.currentTime)) };
  }
  return null;
}

export function EbookProvider({ children }: { children: ReactNode }) {
  const [currentBook, setCurrentBookState] = useState<Book | null>(null);
  const [location, setLocationState] = useState<ReadingLocation | null>(null);
  const [totalLocations, setTotalLocationsState] = useState<number>(0);
  const [bookmarks, setBookmarksState] = useState<Bookmark[]>([]);
  const [fontSize, setFontSizeState] = useState<number>(DEFAULT_FONT_SIZE);

  const currentBookIdRef = useRef<string | null>(null);

  const setCurrentBook = useCallback(
    (
      book: Book | null,
      opts?: { totalLocations?: number; initialLocation?: ReadingLocation },
    ) => {
      setCurrentBookState(book);
      currentBookIdRef.current = book?.id ?? null;
      if (!book) {
        setLocationState(null);
        setTotalLocationsState(0);
        setBookmarksState([]);
        setFontSizeState(DEFAULT_FONT_SIZE);
        return;
      }
      setBookmarksState(loadBookmarksFromStorage(book.id));
      setFontSizeState(loadFontSizeFromStorage(book.id));
      setTotalLocationsState(opts?.totalLocations ?? 0);
      setLocationState(opts?.initialLocation ?? loadInitialLocationFromStorage(book.id));
    },
    [],
  );

  const setLocation = useCallback((loc: ReadingLocation) => {
    setLocationState(loc);
  }, []);

  const setTotalLocations = useCallback((n: number) => {
    setTotalLocationsState(Math.max(0, Math.floor(n)));
  }, []);

  const setFontSize = useCallback((size: number) => {
    setFontSizeState(size);
    const id = currentBookIdRef.current;
    if (id) persistFontSize(id, size);
  }, []);

  const addBookmark = useCallback((loc: ReadingLocation, label?: string) => {
    const id = currentBookIdRef.current;
    if (!id) return;
    setBookmarksState((prev) => {
      if (prev.some((b) => locationsEqual(b.location, loc))) return prev;
      const next: Bookmark[] = [
        ...prev,
        {
          id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          location: loc,
          label,
          createdAt: new Date().toISOString(),
        },
      ];
      // Sort page bookmarks ascending for stable display
      next.sort((a, b) => {
        if (a.location.kind === "page" && b.location.kind === "page") {
          return (a.location.value as number) - (b.location.value as number);
        }
        return 0;
      });
      persistBookmarks(id, next);
      return next;
    });
  }, []);

  const removeBookmark = useCallback((bookmarkId: string) => {
    const id = currentBookIdRef.current;
    if (!id) return;
    setBookmarksState((prev) => {
      const next = prev.filter((b) => b.id !== bookmarkId);
      persistBookmarks(id, next);
      return next;
    });
  }, []);

  const toggleBookmarkAt = useCallback((loc: ReadingLocation) => {
    const id = currentBookIdRef.current;
    if (!id) return;
    setBookmarksState((prev) => {
      const existing = prev.find((b) => locationsEqual(b.location, loc));
      const next = existing
        ? prev.filter((b) => b.id !== existing.id)
        : [
            ...prev,
            {
              id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              location: loc,
              createdAt: new Date().toISOString(),
            },
          ];
      next.sort((a, b) => {
        if (a.location.kind === "page" && b.location.kind === "page") {
          return (a.location.value as number) - (b.location.value as number);
        }
        return 0;
      });
      persistBookmarks(id, next);
      return next;
    });
  }, []);

  const hasBookmarkAt = useCallback(
    (loc: ReadingLocation): boolean => {
      return bookmarks.some((b) => locationsEqual(b.location, loc));
    },
    [bookmarks],
  );

  const saveProgress = useCallback(() => {
    const book = currentBook;
    const loc = location;
    if (!book || !loc) return;
    if (loc.kind === "page") {
      localStorageService.saveProgress({
        bookId: book.id,
        currentTime: loc.value as number,
        lastPlayed: new Date().toISOString(),
      });
    } else {
      // Non-page locations are persisted by the calling reader (e.g. epub CFI).
      // The provider only owns canonical state, not format-specific persistence.
    }
  }, [currentBook, location]);

  // Auto-save when location changes (for page-based readers).
  useEffect(() => {
    if (!currentBook || !location || location.kind !== "page") return;
    saveProgress();
  }, [currentBook, location, saveProgress]);

  const value = useMemo<EbookContextValue>(
    () => ({
      currentBook,
      location,
      totalLocations,
      bookmarks,
      fontSize,
      setCurrentBook,
      setLocation,
      setTotalLocations,
      setFontSize,
      addBookmark,
      removeBookmark,
      toggleBookmarkAt,
      hasBookmarkAt,
      saveProgress,
    }),
    [
      currentBook,
      location,
      totalLocations,
      bookmarks,
      fontSize,
      setCurrentBook,
      setLocation,
      setTotalLocations,
      setFontSize,
      addBookmark,
      removeBookmark,
      toggleBookmarkAt,
      hasBookmarkAt,
      saveProgress,
    ],
  );

  return <EbookContext.Provider value={value}>{children}</EbookContext.Provider>;
}
