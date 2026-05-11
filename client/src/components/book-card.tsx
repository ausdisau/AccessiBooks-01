import { Book, TITLE_PRICING } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, BookOpen, Headphones, Newspaper, BookOpenIcon, ShoppingCart, Check as CheckIcon, GraduationCap, Clock } from "lucide-react";
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
        className="hover:shadow-lg transition-shadow cursor-pointer group bg-transparent border-none dark:bg-transparent"
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
        <CardContent className="p-0">
          <div className="relative aspect-square mb-3">
            <BookCover
              bookId={book.id}
              coverImage={book.coverImage}
              title={book.title}
              contentType={contentType}
              className="w-full h-full object-cover rounded-md shadow-md group-hover:shadow-xl transition-shadow"
              iconSize="h-10 w-10"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity rounded-md flex flex-col items-center justify-center gap-2">
              <button
                type="button"
                aria-label={`Listen to ${book.title}`}
                onClick={handleListen}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleListen(e); } }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Listen
              </button>
              <button
                type="button"
                aria-label={`Read ${book.title}`}
                onClick={handleRead}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRead(e); } }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/90 text-black text-xs font-bold hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-white"
              >
                <BookOpenIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Read
              </button>
            </div>

            <Badge
              className={`absolute top-2 left-2 text-[10px] px-1.5 py-0 ${typeConfig.color} text-white border-none`}
              aria-label={typeConfig.label}
            >
              <TypeIcon className="h-3 w-3 mr-1" aria-hidden="true" />
              {typeConfig.label}
            </Badge>
          </div>

          <div className="px-1">
            <h3 className="text-sm font-bold line-clamp-2 leading-tight mb-1" data-testid={`text-title-${book.id}`}>
              {book.title}
            </h3>
            <p className="text-xs text-muted-foreground truncate font-medium" data-testid={`text-author-${book.id}`}>
              {book.author}
            </p>
            <div className="mt-2">
              <BookA11yBadges book={book} showEmpty={false} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="overflow-hidden border-none bg-card/40 hover:bg-card/60 transition-all duration-300 group shadow-lg"
      data-testid={`card-book-${book.id}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="relative aspect-[3/4] group/cover overflow-hidden">
        <BookCover
          bookId={book.id}
          coverImage={book.coverImage}
          title={book.title}
          contentType={contentType}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          iconSize="h-16 w-16"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
          <button
            type="button"
            aria-label={`Listen to ${book.title}`}
            onClick={handleListen}
            onFocus={onFocus}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-white"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            Listen Now
          </button>
          <button
            type="button"
            aria-label={`Read ${book.title}`}
            onClick={handleRead}
            onFocus={onFocus}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/90 text-black text-sm font-bold hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-white"
          >
            <BookOpenIcon className="h-4 w-4" aria-hidden="true" />
            Read Ebook
          </button>
        </div>

        <Badge
          className={`absolute top-3 left-3 px-2 py-0.5 border-none font-bold text-[10px] tracking-wider uppercase ${typeConfig.color} text-white`}
          aria-label={typeConfig.label}
        >
          {typeConfig.label}
        </Badge>
        
        {owned && (
          <div className="absolute top-3 right-3 bg-green-500 text-white p-1 rounded-full shadow-md">
            <CheckIcon className="h-4 w-4" />
          </div>
        )}
      </div>

      <CardContent className="p-5">
        <div className="mb-4">
          <h3 className="text-xl font-bold mb-1 line-clamp-2 leading-tight group-hover:text-primary transition-colors" data-testid={`text-title-${book.id}`}>
            {book.title}
          </h3>
          <p className="text-muted-foreground font-medium" data-testid={`text-author-${book.id}`}>
            by {book.author}
          </p>
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4 font-medium">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            <span>
              {isEbookOrMagazine
                ? (book.pageCount ? `${book.pageCount} pages` : typeConfig.label)
                : formatDuration(book.duration)
              }
            </span>
          </div>
          {sourceLabels[book.source] && (
            <div className="flex items-center gap-1.5 border-l pl-3">
              <span>{sourceLabels[book.source]}</span>
            </div>
          )}
        </div>

        <div className="mb-5 flex flex-wrap gap-1">
          <BookA11yBadges book={book} />
        </div>

        <div className="space-y-3">
          {!owned && (
            <Button
              variant="outline"
              className="w-full font-bold border-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300"
              onClick={(e) => {
                e.stopPropagation();
                purchaseTitle({ bookId: book.id, bookTitle: book.title, contentType });
              }}
              disabled={isPurchasing}
              data-testid={`button-buy-${book.id}`}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Buy for {priceLabel}
              {discountRate > 0 && (
                <span className="ml-2 text-primary">(Save {Math.round(discountRate * 100)}%)</span>
              )}
            </Button>
          )}
          
          <BookAccessibilityRatings bookId={book.id} bookTitle={book.title} />
        </div>
      </CardContent>
    </Card>
  );
}
