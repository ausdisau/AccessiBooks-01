import { useContinueListening } from "@/hooks/use-listening-history";
import { Book } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Clock } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface ContinueListeningProps {
  onSelectBook: (book: Book) => void;
  books: Book[];
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m left`;
  }
  return `${mins}m left`;
}

function formatProgress(current: number, total: number | null): number {
  if (!total || total === 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

export function ContinueListening({ onSelectBook, books }: ContinueListeningProps) {
  const { data: continueItems = [], isLoading } = useContinueListening(10);

  if (isLoading) {
    return (
      <section className="mb-10" aria-label="Continue Listening">
        <h2 className="font-serif text-2xl font-bold mb-6 px-1">Continue Listening</h2>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-64 h-24 bg-card animate-pulse rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (continueItems.length === 0) {
    return null;
  }

  const handlePlay = (item: typeof continueItems[0]) => {
    const matchingBook = books.find(b => b.id === item.bookId);
    if (matchingBook) {
      onSelectBook(matchingBook);
    }
  };

  return (
    <section className="mb-10" aria-label="Continue Listening">
      <h2 className="font-serif text-2xl font-bold mb-6 px-1">Continue Listening</h2>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4 px-1">
          {continueItems.map((item) => {
            const progress = formatProgress(item.currentTime, item.totalDuration);
            const timeLeft = item.totalDuration 
              ? formatTime(item.totalDuration - item.currentTime)
              : "";
            
            return (
              <Card 
                key={item.id} 
                className="flex-shrink-0 w-72 bg-card/60 border-none shadow-md cursor-pointer hover:bg-card/90 transition-all duration-300 group rounded-xl overflow-hidden"
                onClick={() => handlePlay(item)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlePlay(item); } }}
                tabIndex={0}
                role="button"
                aria-label={`Continue ${item.bookTitle}${item.bookAuthor ? ` by ${item.bookAuthor}` : ""}. ${progress}% complete`}
              >
                <CardContent className="p-0">
                  <div className="flex h-24">
                    <div className="relative w-24 h-24 flex-shrink-0 overflow-hidden">
                      {item.bookCover ? (
                        <img
                          src={item.bookCover}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-secondary text-muted-foreground">
                          <Clock className="h-8 w-8" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="bg-primary rounded-full p-2 shadow-lg">
                          <Play className="h-5 w-5 text-primary-foreground fill-current" />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                      <h3 className="font-bold text-sm truncate leading-tight group-hover:text-primary transition-colors" title={item.bookTitle}>
                        {item.bookTitle}
                      </h3>
                      {item.bookAuthor && (
                        <p className="text-xs text-muted-foreground truncate font-medium mt-0.5">
                          {item.bookAuthor}
                        </p>
                      )}
                      <div className="mt-auto">
                        <div className="flex justify-between items-center mb-1.5">
                          {timeLeft && (
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                              {timeLeft}
                            </p>
                          )}
                          <span className="text-[10px] font-bold text-primary">{progress}%</span>
                        </div>
                        <div
                          className="h-1 bg-secondary rounded-full overflow-hidden"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Listening progress: ${progress}%`}
                        >
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}
