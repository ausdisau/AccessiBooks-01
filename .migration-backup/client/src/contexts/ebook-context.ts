import { createContext, useContext } from "react";
import type { Book } from "@shared/schema";

export type ReadingLocation =
  | { kind: "page"; value: number }
  | { kind: "cfi"; value: string }
  | { kind: "opaque"; value: string };

export interface Bookmark {
  id: string;
  location: ReadingLocation;
  label?: string;
  createdAt: string;
}

export interface EbookContextValue {
  currentBook: Book | null;
  location: ReadingLocation | null;
  totalLocations: number;
  bookmarks: Bookmark[];
  fontSize: number;
  setCurrentBook: (
    book: Book | null,
    opts?: { totalLocations?: number; initialLocation?: ReadingLocation },
  ) => void;
  setLocation: (loc: ReadingLocation) => void;
  setTotalLocations: (n: number) => void;
  setFontSize: (size: number) => void;
  addBookmark: (loc: ReadingLocation, label?: string) => void;
  removeBookmark: (id: string) => void;
  toggleBookmarkAt: (loc: ReadingLocation) => void;
  hasBookmarkAt: (loc: ReadingLocation) => boolean;
  saveProgress: () => void;
}

export const EbookContext = createContext<EbookContextValue | null>(null);

export function useEbookContext(): EbookContextValue {
  const ctx = useContext(EbookContext);
  if (!ctx) {
    throw new Error("useEbookContext must be used within EbookProvider");
  }
  return ctx;
}

export function locationsEqual(a: ReadingLocation | null, b: ReadingLocation | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.value === b.value;
}
