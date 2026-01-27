import { Book } from "@shared/schema";
import { AudioPlayer } from "@/components/audio-player";
import { BookReviews } from "@/components/book-reviews";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User } from "lucide-react";

interface PlayerProps {
  book: Book | null;
  onBackToLibrary: () => void;
  onViewAuthor?: (authorName: string) => void;
}

export function Player({ book, onBackToLibrary, onViewAuthor }: PlayerProps) {
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
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={onBackToLibrary}
          data-testid="button-back-to-library"
        >
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Back to Library
        </Button>
        
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
