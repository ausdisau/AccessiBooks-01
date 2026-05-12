import { useQuery } from "@tanstack/react-query";
import { useListeningHistory } from "@/hooks/use-listening-history";
import { Book, DJRecommendation } from "@shared/schema";
import { BookCard } from "@/components/book-card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Sparkles } from "lucide-react";

interface ForYouSectionProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
}

interface FlatRec {
  bookId: string;
  rationale?: string;
  setIntro?: string;
  setTitle?: string;
}

function pickHeuristic(books: Book[], history: { bookId: string; playCount: number }[]): FlatRec[] {
  const listenedGenres = history.reduce((acc, item) => {
    const book = books.find((b) => b.id === item.bookId);
    if (book?.genre) {
      const g = book.genre.toLowerCase();
      acc[g] = (acc[g] || 0) + item.playCount;
    }
    return acc;
  }, {} as Record<string, number>);

  const listenedBookIds = new Set(history.map((h) => h.bookId));
  let result: FlatRec[] = [];
  if (Object.keys(listenedGenres).length > 0) {
    const sortedGenres = Object.entries(listenedGenres).sort((a, b) => b[1] - a[1]).map(([g]) => g);
    result = books
      .filter((b) => !listenedBookIds.has(b.id))
      .filter((b) => b.genre && sortedGenres.some((g) => b.genre!.toLowerCase().includes(g)))
      .slice(0, 10)
      .map((b) => ({ bookId: b.id }));
  }
  if (result.length < 5) {
    const seen = new Set<string>([...Array.from(listenedBookIds), ...result.map((r) => r.bookId)]);
    const fillers = books
      .filter((b) => !seen.has(b.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 10 - result.length)
      .map((b) => ({ bookId: b.id }));
    result = [...result, ...fillers];
  }
  return result;
}

export function ForYouSection({ books, onSelectBook }: ForYouSectionProps) {
  const { data: history = [] } = useListeningHistory(20);
  // Pull from /api/dj/recommendations — this is where the agent returns
  // structured DJ sets (intro + per-title rationale). /api/recommendations
  // returns a flat book list and would never carry agent set metadata.
  const { data: agentRecs } = useQuery<DJRecommendation[]>({
    queryKey: ["/api/dj/recommendations"],
    staleTime: 60_000,
  });

  // Prefer the agent's first set when available — it carries an intro and per-title rationales.
  const agentFirstSet = agentRecs?.find((r) => r.source === "agent" && r.books.length > 0);

  let recommendations: FlatRec[] = [];
  let intro: string | undefined;
  let titleSuffix: string | undefined;

  if (agentFirstSet) {
    intro = agentFirstSet.intro || agentFirstSet.description;
    titleSuffix = agentFirstSet.title;
    recommendations = agentFirstSet.books.map((b) => ({
      bookId: b.id,
      rationale: agentFirstSet.items?.find((i) => i.bookId === b.id)?.rationale,
      setIntro: intro,
      setTitle: agentFirstSet.title,
    }));
  } else {
    recommendations = pickHeuristic(books, history);
  }

  if (recommendations.length === 0) return null;

  // Resolve each rec to a Book. Prefer the agent's own book payload when
  // present (it includes any title regardless of the parent's paginated
  // `books` slice); otherwise fall back to the local catalog map.
  const bookById = new Map(books.map((b) => [b.id, b]));
  const agentBookById = new Map<string, Book>(
    (agentFirstSet?.books ?? []).map((b) => [b.id, b]),
  );
  const resolveBook = (id: string): Book | undefined =>
    agentBookById.get(id) ?? bookById.get(id);

  return (
    <section className="mb-12" aria-label="Recommended For You" data-testid="for-you-section">
      <div className="flex items-end justify-between mb-6 px-1">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h2 className="font-serif text-2xl font-bold">Made For You</h2>
            {agentFirstSet && (
              <span className="text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-2">
                AccessiDJ pick
              </span>
            )}
          </div>
          {intro && <p className="text-sm text-muted-foreground font-medium" data-testid="for-you-intro">{intro}</p>}
        </div>
      </div>
      
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-6 pb-4 px-1">
          {recommendations.map((rec) => {
            const book = resolveBook(rec.bookId);
            if (!book) return null;
            return (
              <div key={book.id} className="flex-shrink-0 w-44 group">
                <BookCard book={book} onPlayBook={onSelectBook} compact />
                {rec.rationale && (
                  <div className="mt-3 px-1">
                    <p
                      className="text-[11px] leading-relaxed text-muted-foreground italic line-clamp-2 whitespace-normal font-medium group-hover:text-foreground transition-colors"
                      title={rec.rationale}
                      data-testid={`for-you-rationale-${book.id}`}
                    >
                      "{rec.rationale}"
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}
