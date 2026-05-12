import { useState, useEffect } from "react";
import { Bookmark } from "@shared/schema";
import { localStorageService } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";

const MAX_FREE_BOOKMARKS = 5;

export function useBookmarks(bookId: string, isPremium: boolean = false) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (bookId) {
      const stored = localStorageService.getBookmarks(bookId);
      setBookmarks(stored);
    }
  }, [bookId]);

  const isAtLimit = !isPremium && bookmarks.length >= MAX_FREE_BOOKMARKS;

  const addBookmark = (name: string, time: number) => {
    if (!isPremium && bookmarks.length >= MAX_FREE_BOOKMARKS) {
      toast({
        title: "Bookmark limit reached",
        description: `Free users can save up to ${MAX_FREE_BOOKMARKS} bookmarks per book. Upgrade to Premium for unlimited bookmarks.`,
        variant: "destructive",
      });
      return;
    }

    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      bookId,
      name,
      time,
      createdAt: new Date().toISOString(),
    };

    localStorageService.addBookmark(bookmark);
    setBookmarks(prev => [...prev, bookmark]);
  };

  const removeBookmark = (bookmarkId: string) => {
    localStorageService.removeBookmark(bookmarkId);
    setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
  };

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    isAtLimit,
    maxBookmarks: MAX_FREE_BOOKMARKS,
  };
}
