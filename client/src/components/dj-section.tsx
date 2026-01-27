import { useDJRecommendations } from "@/hooks/use-playlists";
import { Book, DJRecommendation } from "@shared/schema";
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
    default:
      return Sparkles;
  }
};

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
    <section className="space-y-6" aria-label="DJ Recommendations">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
        <h2 className="text-2xl font-bold">For You</h2>
      </div>
      
      <div className="space-y-8">
        {recommendations.map((rec) => {
          const Icon = getIconForType(rec.type);
          return (
            <div key={rec.id} className="space-y-4">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <div>
                  <h3 className="text-lg font-semibold">{rec.title}</h3>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {rec.books.map((book) => (
                  <Card 
                    key={book.id}
                    className="hover:shadow-lg transition-shadow cursor-pointer group"
                    onClick={() => onPlayBook(book)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onPlayBook(book)}
                    role="button"
                    aria-label={`Play ${book.title} by ${book.author}`}
                  >
                    <CardContent className="p-3">
                      <div className="relative">
                        {book.coverImage ? (
                          <img
                            src={book.coverImage}
                            alt={`${book.title} cover`}
                            className="w-full h-32 object-cover rounded-md mb-2"
                          />
                        ) : (
                          <div className="w-full h-32 bg-gradient-to-br from-primary/20 to-primary/40 rounded-md mb-2 flex items-center justify-center">
                            <Play className="h-8 w-8 text-primary" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                          <Play className="h-10 w-10 text-white fill-white" />
                        </div>
                      </div>
                      
                      <h4 className="text-sm font-medium line-clamp-2">{book.title}</h4>
                      <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
