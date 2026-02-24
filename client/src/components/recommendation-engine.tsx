import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, BookOpen, ChevronRight, ChevronLeft } from "lucide-react";
import { BookCover } from "@/components/book-cover";
import type { Book } from "@shared/schema";

interface OnboardingPreferences {
  genres?: string[];
  [key: string]: unknown;
}

function getPreferences(): OnboardingPreferences | null {
  try {
    const raw = localStorage.getItem("accessibooks-onboarding-preferences");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function RecommendationEngine({ onSelectBook }: { onSelectBook?: (book: Book) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const preferences = useMemo(() => getPreferences(), []);
  const userGenres = preferences?.genres || [];

  // Try to fetch from API first, fall back to localStorage strategy
  const { data: apiRecommendations, isLoading: isApiLoading, isError: isApiError } = useQuery<Book[]>({
    queryKey: ["/api/recommendations"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch recommendations from API");
      return res.json();
    },
    retry: false,
  });

  // Fallback: fetch books if API fails or returns empty
  const { data: booksResponse, isLoading: isBooksLoading } = useQuery<{ data: Book[] }>({
    queryKey: ["/api/books", "recommendations"],
    queryFn: async () => {
      const res = await fetch("/api/books?limit=200");
      if (!res.ok) throw new Error("Failed to fetch books");
      return res.json();
    },
    enabled: (isApiError || !apiRecommendations || apiRecommendations.length === 0) && !isApiLoading,
  });
  const books = booksResponse?.data;

  const { recommended, matchedGenre } = useMemo(() => {
    // Use API recommendations if available and not empty
    if (apiRecommendations && apiRecommendations.length > 0) {
      const genre = userGenres.length > 0 ? userGenres[0] : "";
      return { recommended: apiRecommendations, matchedGenre: genre };
    }

    // Fallback to client-side filtering of books
    if (!books || books.length === 0) return { recommended: [], matchedGenre: "" };

    if (userGenres.length > 0) {
      for (const genre of userGenres) {
        const matches = books.filter(
          (book) => book.genre && book.genre.toLowerCase().includes(genre.toLowerCase())
        );
        if (matches.length >= 3) {
          return { recommended: shuffleArray(matches).slice(0, 8), matchedGenre: genre };
        }
      }
      const allMatches = books.filter((book) =>
        userGenres.some(
          (g) => book.genre && book.genre.toLowerCase().includes(g.toLowerCase())
        )
      );
      if (allMatches.length > 0) {
        return {
          recommended: shuffleArray(allMatches).slice(0, 8),
          matchedGenre: userGenres[0],
        };
      }
    }

    return { recommended: shuffleArray(books).slice(0, 8), matchedGenre: "" };
  }, [apiRecommendations, books, userGenres]);

  const isLoading = isApiLoading || isBooksLoading;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 300;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  if (isLoading) {
    return (
      <section className="w-full py-6" aria-label="Recommended for you">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 className="text-xl font-bold">Recommended For You</h2>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-48">
              <Skeleton className="w-full h-64 rounded-xl mb-2" />
              <Skeleton className="h-4 w-3/4 mb-1" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (recommended.length === 0) return null;

  return (
    <section className="w-full py-6" aria-label="Recommended for you">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Recommended For You</h2>
            {matchedGenre ? (
              <p className="text-xs text-muted-foreground">
                Based on your interest in <span className="font-medium text-amber-600 dark:text-amber-400">{matchedGenre}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Popular picks you might enjoy</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            onClick={() => scroll("left")}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            onClick={() => scroll("right")}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin scroll-smooth"
        role="list"
      >
        {recommended.map((book) => (
          <Card
            key={book.id}
            className="flex-shrink-0 w-48 group cursor-pointer hover:shadow-lg transition-all duration-200 border-amber-200/30 hover:border-amber-400/50 bg-gradient-to-br from-card to-amber-50/5 dark:to-amber-950/10"
            onClick={() => onSelectBook?.(book)}
            role="listitem"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelectBook?.(book)}
            aria-label={`${book.title} by ${book.author}`}
          >
            <CardContent className="p-3">
              <div className="relative mb-3">
                <BookCover
                  bookId={book.id}
                  coverImage={book.coverImage}
                  title={book.title}
                  contentType={book.contentType as "audiobook" | "ebook" | "magazine"}
                  className="w-full h-56 object-cover rounded-lg"
                  iconSize="h-10 w-10"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
              </div>
              <h3 className="text-sm font-semibold line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-tight">
                {book.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{book.author}</p>
              {book.genre && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 mt-2 bg-amber-100/50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                >
                  {book.genre}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
