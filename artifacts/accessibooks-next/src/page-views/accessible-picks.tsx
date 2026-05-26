import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, Star, BookOpen, Headphones, Newspaper } from "lucide-react";
import { DISABILITY_TYPES, type DisabilityType } from "@shared/schema";
import type { Book } from "@shared/schema";
import { BookCover } from "@/components/book-cover";
import { AccessibilityRatingModal } from "@/components/accessibility-rating-modal";
import { useAuth } from "@/hooks/useAuth";

const DISABILITY_LABELS: Record<DisabilityType, string> = {
  dyslexia: "Dyslexia",
  "low-vision": "Low Vision",
  motor: "Motor",
  hearing: "Hearing",
  cognitive: "Cognitive",
  other: "Other",
};

const DISABILITY_DESCRIPTIONS: Record<DisabilityType, string> = {
  dyslexia: "Reading & font accessibility",
  "low-vision": "Contrast, size & visual aids",
  motor: "Navigation & voice control",
  hearing: "Captions & transcripts",
  cognitive: "Simplicity & pacing",
  other: "General accessibility",
};

interface EnrichedBook extends Book {
  accessibilityScore: number;
  accessibilityReviewCount: number;
  certifiedTypes: string[];
  isCertified: boolean;
}

interface AccessiblePicksResponse {
  books: EnrichedBook[];
  total: number;
  page: number;
  certifiedBookIds: string[];
}

function AccessibleBookCard({
  book,
  selectedDisability,
  onRate,
}: {
  book: EnrichedBook;
  selectedDisability: string | null;
  onRate: (book: EnrichedBook) => void;
}) {
  const contentType = book.contentType || "audiobook";
  const TypeIcon = contentType === "ebook" ? BookOpen : contentType === "magazine" ? Newspaper : Headphones;

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex gap-4 hover:shadow-md transition-shadow">
      <div className="relative flex-shrink-0 w-20 h-28">
        <BookCover
          bookId={book.id}
          coverImage={book.coverImage}
          title={book.title}
          contentType={contentType}
          className="w-full h-full object-cover rounded-lg"
          iconSize="h-8 w-8"
        />
        {book.isCertified && (
          <div className="absolute -top-1.5 -right-1.5 bg-emerald-500 rounded-full p-0.5" title="AccessiBooks Certified">
            <Award className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{book.title}</h3>
            <p className="text-xs text-muted-foreground">by {book.author}</p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0 gap-1">
            <TypeIcon className="h-3 w-3" />
            {contentType}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`h-3.5 w-3.5 ${s <= Math.round(book.accessibilityScore) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
              />
            ))}
          </div>
          <span className="text-sm font-medium">{book.accessibilityScore.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">({book.accessibilityReviewCount} ratings)</span>
        </div>

        {book.certifiedTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {book.certifiedTypes.map((dtype) => (
              <Badge
                key={dtype}
                className="text-[10px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
              >
                <Award className="h-2.5 w-2.5 mr-0.5" />
                {DISABILITY_LABELS[dtype as DisabilityType] || dtype}
              </Badge>
            ))}
          </div>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
          onClick={() => onRate(book)}
        >
          <Award className="h-3 w-3 mr-1" />
          Rate Accessibility
        </Button>
      </div>
    </div>
  );
}

export default function AccessiblePicksPage() {
  const [selectedDisability, setSelectedDisability] = useState<DisabilityType | null>(null);
  const [ratingBook, setRatingBook] = useState<EnrichedBook | null>(null);
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery<AccessiblePicksResponse>({
    queryKey: ["/api/accessible-picks", selectedDisability],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "30" });
      if (selectedDisability) params.set("disabilityType", selectedDisability);
      return fetch(`/api/accessible-picks?${params}`).then(r => r.json());
    },
  });

  const books = data?.books ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Award className="h-6 w-6 text-emerald-600" />
          <h1 className="text-2xl font-bold">Accessible Picks</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Books rated and certified by readers with specific disabilities. Find what works for your needs.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter by disability type</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedDisability(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-colors ${
              selectedDisability === null
                ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "border-border text-muted-foreground hover:border-emerald-200 hover:text-foreground"
            }`}
          >
            All Types
          </button>
          {DISABILITY_TYPES.map((dtype) => (
            <button
              key={dtype}
              onClick={() => setSelectedDisability(dtype)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-colors ${
                selectedDisability === dtype
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-border text-muted-foreground hover:border-emerald-200 hover:text-foreground"
              }`}
              title={DISABILITY_DESCRIPTIONS[dtype]}
            >
              {DISABILITY_LABELS[dtype]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading..." : `${total} rated book${total !== 1 ? "s" : ""}${selectedDisability ? ` for ${DISABILITY_LABELS[selectedDisability]}` : ""}`}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Award className="h-3.5 w-3.5 text-emerald-600" />
          <span>= AccessiBooks Certified (≥5 ratings, avg ≥4.0)</span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 flex gap-4">
              <Skeleton className="w-20 h-28 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Award className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <div>
            <p className="text-lg font-medium text-muted-foreground">No rated books yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedDisability
                ? `No books have been rated for ${DISABILITY_LABELS[selectedDisability]} yet.`
                : "Be the first to rate a book's accessibility!"}
            </p>
          </div>
          {!isAuthenticated && (
            <p className="text-sm text-muted-foreground">Sign in to submit accessibility ratings and help build this community.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {books.map((book) => (
            <AccessibleBookCard
              key={book.id}
              book={book}
              selectedDisability={selectedDisability}
              onRate={setRatingBook}
            />
          ))}
        </div>
      )}

      {ratingBook && (
        <AccessibilityRatingModal
          isOpen={true}
          onClose={() => setRatingBook(null)}
          bookId={ratingBook.id}
          bookTitle={ratingBook.title}
        />
      )}
    </div>
  );
}
