import { useListeningHistory } from "@/hooks/use-listening-history";
import { Book } from "@shared/schema";
import { BookCard } from "@/components/book-card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Sparkles } from "lucide-react";

interface ForYouSectionProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
}

export function ForYouSection({ books, onSelectBook }: ForYouSectionProps) {
  const { data: history = [] } = useListeningHistory(20);

  const listenedGenres = history.reduce((acc, item) => {
    const book = books.find(b => b.id === item.bookId);
    if (book?.genre) {
      const normalizedGenre = book.genre.toLowerCase();
      acc[normalizedGenre] = (acc[normalizedGenre] || 0) + item.playCount;
    }
    return acc;
  }, {} as Record<string, number>);

  const listenedBookIds = new Set(history.map(h => h.bookId));

  let recommendations: Book[] = [];

  if (Object.keys(listenedGenres).length > 0) {
    const sortedGenres = Object.entries(listenedGenres)
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre);

    recommendations = books
      .filter(book => !listenedBookIds.has(book.id))
      .filter(book => {
        if (!book.genre) return false;
        const bookGenre = book.genre.toLowerCase();
        return sortedGenres.some(g => bookGenre.includes(g));
      })
      .slice(0, 10);
  }

  if (recommendations.length < 5) {
    const newBooks = books
      .filter(book => !listenedBookIds.has(book.id) && !recommendations.find(r => r.id === book.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 10 - recommendations.length);
    
    recommendations = [...recommendations, ...newBooks];
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <section className="mb-8" aria-label="Recommended For You" data-testid="for-you-section">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">For You</h2>
      </div>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4">
          {recommendations.map((book) => (
            <div key={book.id} className="flex-shrink-0 w-56">
              <BookCard 
                book={book} 
                onPlayBook={onSelectBook}
                compact
              />
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}
