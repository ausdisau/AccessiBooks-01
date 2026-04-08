import { Book, TITLE_PRICING, TIER_DISCOUNTS, type SubscriptionTier } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, BookOpen, Headphones, Newspaper, BookOpenIcon, ShoppingCart, Check as CheckIcon } from "lucide-react";
import { BookCover } from "@/components/book-cover";
import { usePurchaseCheckout } from "@/hooks/use-purchases";
import { useSubscription } from "@/hooks/use-subscription";
import { BookAccessibilityRatings } from "@/components/book-accessibility-ratings";
import { Separator } from "@/components/ui/separator";

interface BookCardProps {
  book: Book;
  onPlayBook: (book: Book) => void;
  compact?: boolean;
  owned?: boolean;
}

const contentTypeConfig = {
  audiobook: { icon: Headphones, label: "Audiobook", color: "bg-blue-500" },
  ebook: { icon: BookOpen, label: "Ebook", color: "bg-green-500" },
  magazine: { icon: Newspaper, label: "Magazine", color: "bg-purple-500" },
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

export function BookCard({ book, onPlayBook, compact = false, owned = false }: BookCardProps) {
  const { purchaseTitle, isPurchasing } = usePurchaseCheckout();
  const { tier, discountRate } = useSubscription();

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

  if (compact) {
    return (
      <Card 
        className="hover:shadow-lg transition-shadow cursor-pointer group" 
        data-testid={`card-book-${book.id}`}
        onClick={() => onPlayBook(book)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlayBook(book); } }}
        tabIndex={0}
        role="button"
        aria-label={`${isEbookOrMagazine ? "Read" : "Play"} ${book.title} by ${book.author}. ${typeConfig.label}`}
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
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
              {isEbookOrMagazine ? (
                <BookOpenIcon className="h-10 w-10 text-white" />
              ) : (
                <Play className="h-10 w-10 text-white fill-white" />
              )}
            </div>
            
            {/* Content type badge */}
            <Badge 
              className={`absolute top-2 left-2 text-xs px-1.5 py-0.5 ${typeConfig.color} text-white`}
              aria-label={typeConfig.label}
            >
              <TypeIcon className="h-3 w-3 mr-1" aria-hidden="true" />
              {typeConfig.label}
            </Badge>
            
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
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow focus-within:ring-2 focus-within:ring-ring" data-testid={`card-book-${book.id}`}>
      <CardContent className="p-4 sm:p-6">
        <div className="relative mb-4">
          <BookCover
            bookId={book.id}
            coverImage={book.coverImage}
            title={book.title}
            contentType={contentType}
            className="w-full h-40 sm:h-48 object-cover rounded-md"
            iconSize="h-12 w-12"
          />
          
          {/* Content type badge */}
          <Badge 
            className={`absolute top-2 left-2 ${typeConfig.color} text-white`}
            aria-label={typeConfig.label}
          >
            <TypeIcon className="h-3 w-3 mr-1" aria-hidden="true" />
            {typeConfig.label}
          </Badge>
          
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
        
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => onPlayBook(book)}
            data-testid={`button-play-${book.id}`}
          >
            {isEbookOrMagazine ? (
              <>
                <BookOpenIcon className="h-4 w-4 mr-2" aria-hidden="true" />
                Read Now
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" aria-hidden="true" />
                Play Book
              </>
            )}
          </Button>

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
