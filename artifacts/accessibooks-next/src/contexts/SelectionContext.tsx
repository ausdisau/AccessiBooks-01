"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Book } from "@shared/schema";
import { useAudioContext } from "@/contexts/audio-context";
import { useContentAccess } from "@/hooks/use-content-access";
import { useToast } from "@/hooks/use-toast";

/**
 * Cross-route book selection state. In the legacy single-file App.tsx this
 * lived as `selectedBook` useState plus `handleSelectBook` / `handleViewAuthor`
 * helpers on the MainApp component. Since the Next.js App Router splits each
 * route into its own page.tsx, we hoist this state into a context provided by
 * the shared shell layout so pages like /player, /reader, /party, and /author
 * can read the same selection without prop drilling.
 */
type SelectionContextValue = {
  selectedBook: Book | null;
  setSelectedBook: (book: Book | null) => void;
  handleSelectBook: (book: Book) => void;
  handleBackToLibrary: () => void;
  handleViewAuthor: (authorName: string) => void;
  handleExpandPlayer: () => void;
  handleViewFeed: () => void;
};

const Ctx = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const { currentBook, playBook } = useAudioContext();
  const { checkAccess } = useContentAccess();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const handleSelectBook = useCallback(
    (book: Book) => {
      if (!checkAccess(book)) return;
      setSelectedBook(book);
      const contentType = book.contentType || "audiobook";
      if (contentType === "ebook" || contentType === "magazine") {
        router.push("/reader");
      } else {
        playBook(book);
        router.push("/player");
        const shortcutTipShown = localStorage.getItem(
          "accessibooks_shortcut_tip_shown",
        );
        if (!shortcutTipShown) {
          localStorage.setItem("accessibooks_shortcut_tip_shown", "true");
          setTimeout(() => {
            toast({
              title: "Tip: Press ? for shortcuts",
              description: "Press ? anywhere to see keyboard shortcuts.",
              duration: 6000,
            });
          }, 1500);
        }
      }
    },
    [checkAccess, playBook, router, toast],
  );

  const handleBackToLibrary = useCallback(() => router.push("/"), [router]);

  // Admin analytics top-title rows (and any other in-app surface) can request
  // opening a book's detail view by id via this event.
  useEffect(() => {
    const handler = (e: Event) => {
      const bookId = (e as CustomEvent<{ bookId?: string }>).detail?.bookId;
      if (!bookId) return;
      (async () => {
        try {
          const res = await fetch(`/api/books/${encodeURIComponent(bookId)}`);
          if (res.ok) {
            const book: Book = await res.json();
            handleSelectBook(book);
          }
        } catch {
          // Book fetch failed — stay on the current view.
        }
      })();
    };
    document.addEventListener("accessibooks:open-book", handler);
    return () => document.removeEventListener("accessibooks:open-book", handler);
  }, [handleSelectBook]);

  const handleExpandPlayer = useCallback(() => {
    if (currentBook) {
      setSelectedBook(currentBook);
      router.push("/player");
    }
  }, [currentBook, router]);

  const handleViewAuthor = useCallback(
    (authorName: string) => {
      router.push(`/author/${encodeURIComponent(authorName)}`);
    },
    [router],
  );

  const handleViewFeed = useCallback(() => router.push("/feed"), [router]);

  const value = useMemo(
    () => ({
      selectedBook,
      setSelectedBook,
      handleSelectBook,
      handleBackToLibrary,
      handleViewAuthor,
      handleExpandPlayer,
      handleViewFeed,
    }),
    [
      selectedBook,
      handleSelectBook,
      handleBackToLibrary,
      handleViewAuthor,
      handleExpandPlayer,
      handleViewFeed,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelection(): SelectionContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Safe fallback for routes rendered outside the main shell (e.g. /clip):
    // returning a no-op shape avoids crashes if a component is reused there.
    return {
      selectedBook: null,
      setSelectedBook: () => {},
      handleSelectBook: () => {},
      handleBackToLibrary: () => {},
      handleViewAuthor: () => {},
      handleExpandPlayer: () => {},
      handleViewFeed: () => {},
    };
  }
  return v;
}
