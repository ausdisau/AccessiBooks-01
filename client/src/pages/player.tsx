import { useEffect } from "react";
import { Book } from "@shared/schema";
import { AudioPlayer } from "@/components/audio-player";
import { BookReviews } from "@/components/book-reviews";
import { ShareButton } from "@/components/share-button";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User } from "lucide-react";
import { AudioAdInterstitial, useAudioAds } from "@/components/audio-ad-interstitial";
import { useAudioContext } from "@/contexts/AudioContext";

interface PlayerProps {
  book: Book | null;
  onBackToLibrary: () => void;
  onViewAuthor?: (authorName: string) => void;
}

export function Player({ book, onBackToLibrary, onViewAuthor }: PlayerProps) {
  const { booksPlayed, incrementBooksPlayed, onAdComplete } = useAudioAds();
  const { onTrackEndCallback, onChapterEndCallback } = useAudioContext();

  useEffect(() => {
    onTrackEndCallback.current = incrementBooksPlayed;
    onChapterEndCallback.current = incrementBooksPlayed;
    return () => {
      onTrackEndCallback.current = null;
      onChapterEndCallback.current = null;
    };
  }, [incrementBooksPlayed, onTrackEndCallback, onChapterEndCallback]);

  if (!book) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg mb-4" data-testid="text-no-book">
          No book selected. Please select a book from the library.
        </p>
        <Button onClick={onBackToLibrary} data-testid="button-back-to-library">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="sr-only">{book.title}</h1>
      <AudioAdInterstitial 
        booksPlayed={booksPlayed}
        onAdComplete={onAdComplete}
        onSkip={onAdComplete}
      />
      
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={onBackToLibrary}
          data-testid="button-back-to-library"
        >
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Back to Library
        </Button>
        
        <div className="flex items-center gap-2">
          {book.author && onViewAuthor && (
            <Button 
              variant="ghost"
              onClick={() => onViewAuthor(book.author)}
              data-testid="button-view-author"
            >
              <User className="h-4 w-4 mr-2" aria-hidden="true" />
              About {book.author}
            </Button>
          )}
          <ShareButton book={book} variant="button" />
        </div>
      </div>
      
      <AudioPlayer book={book} />
      
      <BookReviews 
        bookId={book.id} 
        title={book.title} 
        author={book.author}
        onViewAuthor={onViewAuthor}
      />
    </div>
  );
}
