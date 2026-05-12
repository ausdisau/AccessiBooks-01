import { useDJRecommendations } from "@/hooks/use-playlists";
import { Book, DJRecommendation } from "@shared/schema";
import { BookCard } from "@/components/book-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, Sparkles, Sun, Moon, Compass, Music } from "lucide-react";

interface DJSectionProps {
  onPlayBook: (book: Book) => void;
}

const getIconForType = (type: DJRecommendation["type"]) => {
  switch (type) {
    case "continue":
      return Play;
    case "time-based":
      const hour = new Date().getHours();
      return hour >= 22 || hour < 6 ? Moon : Sun;
    case "similar":
      return Music;
    case "genre":
      return Compass;
    case "mood":
      return Sparkles;
    case "agent":
      return Sparkles;
    default:
      return Sparkles;
  }
};

function getRationale(rec: DJRecommendation, bookId: string): string | undefined {
  return rec.items?.find((i) => i.bookId === bookId)?.rationale;
}

export function DJSection({ onPlayBook }: DJSectionProps) {
  const { data: recommendations, isLoading } = useDJRecommendations();

  if (isLoading) {
    return (
      <section className="space-y-6" aria-label="DJ Recommendations loading">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">For You</h2>
        </div>
        <div className="space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <Skeleton key={j} className="h-48 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <section className="space-y-10" aria-label="DJ Recommendations">
      <div className="flex items-center gap-3 px-1">
        <Sparkles className="h-8 w-8 text-primary animate-pulse" aria-hidden="true" />
        <h2 className="font-serif text-3xl font-bold">AccessiDJ</h2>
      </div>
      
      <div className="space-y-12">
        {recommendations.map((rec) => {
          const Icon = getIconForType(rec.type);
          return (
            <div key={rec.id} className="space-y-6">
              <div className="flex items-start gap-4 px-1">
                <div className="p-2 rounded-lg bg-secondary/50 mt-1">
                  <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-serif text-2xl font-bold">{rec.title}</h3>
                    {rec.source === "agent" && (
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        AI Pick
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground font-medium mt-1">{rec.intro || rec.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 px-1">
                {rec.books.map((book) => {
                  const rationale = getRationale(rec, book.id);
                  return (
                    <div key={book.id} className="group flex flex-col gap-3">
                      <BookCard book={book} onPlayBook={onPlayBook} compact />
                      {rationale && (
                        <p className="text-[11px] leading-relaxed text-muted-foreground italic line-clamp-2 px-1 font-medium group-hover:text-foreground transition-colors" title={rationale}>
                          "{rationale}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
