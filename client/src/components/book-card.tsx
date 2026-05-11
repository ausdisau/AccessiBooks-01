import { Book, TITLE_PRICING } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, BookOpen, Headphones, Newspaper, BookOpenIcon, ShoppingCart, Check as CheckIcon, GraduationCap } from "lucide-react";
import { BookCover } from "@/components/book-cover";
import { usePurchaseCheckout } from "@/hooks/use-purchases";
import { useSubscription } from "@/hooks/use-subscription";
import { BookAccessibilityRatings } from "@/components/book-accessibility-ratings";
import { BookA11yBadges } from "@/components/book-a11y-badges";
import { Separator } from "@/components/ui/separator";
import { useBookPrefetch } from "@/hooks/use-book-prefetch";

interface BookCardProps {
  book: Book;
  onPlayBook: (book: Book) => void;
  onListenBook?: (book: Book) => void;
  onReadBook?: (book: Book) => void;
  compact?: boolean;
  owned?: boolean;
}

const contentTypeConfig = {
  audiobook: { icon: Headphones, label: "Audiobook", color: "bg-blue-500" },
  ebook: { icon: BookOpen, label: "Ebook", color: "bg-green-500" },
  magazine: { icon: Newspaper, label: "Magazine", color: "bg-purple-500" },
};

const READING_LEVEL_CONFIG: Record<number, { label: string; color: string; ariaLabel: string }> = {
  1: { label: "Very Easy", color: "bg-green-500", ariaLabel: "Reading level: Very Easy" },
  2: { label: "Easy", color: "bg-teal-500", ariaLabel: "Reading level: Easy" },
  3: { label: "Moderate", color: "bg-amber-500", ariaLabel: "Reading level: Moderate" },
  4: { label: "Advanced", color: "bg-red-500", ariaLabel: "Reading level: Advanced" },
};

const sourceLabels: Record<string, string> = {
  librivox: "LibriVox",
  openlibrary: "Open Library",
  googlebooks: "Google Books",
  itunes: "iTunes",
  gutenberg: "Gutenberg",
  loyalbooks: "Loyal Books",
  standardebooks: "Std. Ebooks",
  feedbooks: "Feedbooks",
  openstax: "OpenStax",
  wikipedia: "Wikipedia",
  podcast: "Podcast",
  bbc: "BBC",
  "spotify-podcast": "Spotify",
  spotify: "Spotify",
  community: "Community",
  local: "",
};

export function BookCard({ book, onPlayBook, onListenBook, onReadBook, compact = false, owned = false }: BookCardProps) {
  const { purchaseTitle, isPurchasing } = usePurchaseCheckout();
  const { discountRate } = useSubscription();
  const { onMouseEnter, onMouseLeave, onFocus } = useBookPrefetch(book);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const contentType = (book.contentType as keyof typeof contentTypeConfig) || "audiobook";
  const typeConfig = contentTypeConfig[contentType] || contentTypeConfig.audiobook;
  const TypeIcon = typeConfig.icon;
  const isEbookOrMagazine = contentType === "ebook" || contentType === "magazine";

  const pricing = TITLE_PRICING[contentType as keyof typeof TITLE_PRICING] || TITLE_PRICING.default;
  const finalPrice = discountRate > 0 ? Math.round(pricing.base * (1 - discountRate)) : pricing.base;
  const priceLabel = `$${(finalPrice / 100).toFixed(2)}`;

  const handleListen = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (onListenBook) {
      onListenBook(book);
    } else {
      onPlayBook({ ...book, contentType: "audiobook" });
    }
  };

  const handleRead = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (onReadBook) {
      onReadBook(book);
    } else {
      onPlayBook({ ...book, contentType: "ebook" });
    }
  };

  if (compact) {
    return (
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer group"
        data-testid={`card-book-${book.id}`}
        onClick={() => onPlayBook(book)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlayBook(book); } }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        tabIndex={0}
        role="button"
        aria-label={`${isEbookOrMagazine ? "Read" : "Play"} ${book.title} by ${book.author}. ${typeConfig.label}`}
        onFocus={onFocus}
      >
        <CardContent className="p-2.5 sm:p-3">
          <div className="relative">
            <BookCover
              bookId={book.id}
              coverImage={book.coverImage}
              title={book.title}
              contentType={contentType}
              className="w-full h-28 sm:h-32 object-cover rounded-md mb-2"
              iconSize="h-8 w-8"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity rounded-md flex flex-col items-center justify-center gap-2 mb-2">
              <button
                type="button"
                aria-label={`Listen to ${book.title}`}
                onClick={handleListen}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleListen(e); } }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-gray-900 text-xs font-semibold hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Play className="h-3 w-3 fill-gray-900" aria-hidden="true" />
                Listen
              </button>
              <button
                type="button"
                aria-label={`Read ${book.title}`}
                onClick={handleRead}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRead(e); } }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 text-gray-900 text-xs font-medium hover:bg-white/95 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
              >
                <BookOpenIcon className="h-3 w-3" aria-hidden="true" />
                Read
              </button>
            </div>

            <Badge
              className={`absolute top-2 left-2 text-xs px-1.5 py-0.5 ${typeConfig.color} text-white`}
              aria-label={typeConfig.label}
            >
              <TypeIcon className="h-3 w-3 mr-1" aria-hidden="true" />
              {typeConfig.label}
            </Badge>
            {book.readingLevel && READING_LEVEL_CONFIG[book.readingLevel] && (
              <Badge
                className={`absolute top-2 right-2 text-xs px-1.5 py-0.5 ${READING_LEVEL_CONFIG[book.readingLevel].color} text-white`}
                aria-label={READING_LEVEL_CONFIG[book.readingLevel].ariaLabel}
              >
                <GraduationCap className="h-3 w-3 mr-1" aria-hidden="true" />
                {READING_LEVEL_CONFIG[book.readingLevel].label}
              </Badge>
            )}
          </div>

          <h3 className="text-sm font-medium line-clamp-2" data-testid={`text-title-${book.id}`}>
            {book.title}
          </h3>
          <p className="text-xs text-muted-foreground truncate" data-testid={`text-author-${book.id}`}>
            {book.author}
          </p>
          {sourceLabels[book.source] && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sourceLabels[book.source]}</p>
          )}
          <div className="mt-1.5">
            <BookA11yBadges book={book} showEmpty={false} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="hover:shadow-lg transition-shadow focus-within:ring-2 focus-within:ring-ring"
      data-testid={`card-book-${book.id}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="relative mb-4 group/cover">
          <BookCover
            bookId={book.id}
            coverImage={book.coverImage}
            title={book.title}
            contentType={contentType}
            className="w-full h-40 sm:h-48 object-cover rounded-md"
            iconSize="h-12 w-12"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/cover:opacity-100 transition-opacity rounded-md flex flex-col items-center justify-center gap-2">
            <button
              type="button"
              aria-label={`Listen to ${book.title}`}
              onClick={handleListen}
              onFocus={onFocus}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/95 text-gray-900 text-sm font-semibold hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-white"
            >
              <Play className="h-4 w-4 fill-gray-900" aria-hidden="true" />
              Listen
            </button>
            <button
              type="button"
              aria-label={`Read ${book.title}`}
              onClick={handleRead}
              onFocus={onFocus}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/80 text-gray-900 text-sm font-medium hover:bg-white/95 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
            >
              <BookOpenIcon className="h-4 w-4" aria-hidden="true" />
              Read
            </button>
          </div>

          <Badge
            className={`absolute top-2 left-2 ${typeConfig.color} text-white`}
            aria-label={typeConfig.label}
          >
            <TypeIcon className="h-3 w-3 mr-1" aria-hidden="true" />
            {typeConfig.label}
          </Badge>
          {book.readingLevel && READING_LEVEL_CONFIG[book.readingLevel] && (
            <Badge
              className={`absolute top-2 right-2 ${READING_LEVEL_CONFIG[book.readingLevel].color} text-white`}
              aria-label={READING_LEVEL_CONFIG[book.readingLevel].ariaLabel}
            >
              <GraduationCap className="h-3 w-3 mr-1" aria-hidden="true" />
              {READING_LEVEL_CONFIG[book.readingLevel].label}
            </Badge>
          )}
        </div>

        <h3 className="text-base sm:text-lg font-semibold mb-2" data-testid={`text-title-${book.id}`}>
          {book.title}
        </h3>
        <p className="text-muted-foreground mb-2" data-testid={`text-author-${book.id}`}>
          by {book.author}
        </p>
        <p className="text-sm text-muted-foreground mb-1" data-testid={`text-duration-${book.id}`}>
          {isEbookOrMagazine
            ? (book.pageCount ? `${book.pageCount} pages` : typeConfig.label)
            : formatDuration(book.duration)
          }
        </p>
        {sourceLabels[book.source] && (
          <p className="text-xs text-muted-foreground/70 mb-3">via {sourceLabels[book.source]}</p>
        )}

        <div className="mb-3">
          <BookA11yBadges book={book} />
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleListen}
              onFocus={onFocus}
              data-testid={`button-listen-${book.id}`}
              aria-label={`Listen to ${book.title}`}
            >
              <Play className="h-4 w-4 mr-2 fill-current" aria-hidden="true" />
              Listen
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleRead}
              onFocus={onFocus}
              data-testid={`button-read-${book.id}`}
              aria-label={`Read ${book.title}`}
            >
              <BookOpenIcon className="h-4 w-4 mr-2" aria-hidden="true" />
              Read
            </Button>
          </div>

          {owned ? (
            <div className="flex items-center justify-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckIcon className="h-3 w-3" />
              <span>Owned — Ad-free</span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={(e) => {
                e.stopPropagation();
                purchaseTitle({ bookId: book.id, bookTitle: book.title, contentType });
              }}
              disabled={isPurchasing}
              data-testid={`button-buy-${book.id}`}
            >
              <ShoppingCart className="h-3 w-3 mr-1" />
              Buy for {priceLabel}
              {discountRate > 0 && (
                <span className="ml-1 text-green-600 dark:text-green-400">({Math.round(discountRate * 100)}% off)</span>
              )}
            </Button>
          )}
        </div>

        <Separator className="my-4" />
        <BookAccessibilityRatings bookId={book.id} bookTitle={book.title} />
      </CardContent>
    </Card>
  );
}
