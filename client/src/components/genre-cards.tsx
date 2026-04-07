import { Book } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  BookOpen, 
  Wand2, 
  Heart, 
  Skull, 
  Rocket, 
  History, 
  GraduationCap,
  Music,
  Briefcase,
  Baby
} from "lucide-react";

interface GenreCardsProps {
  books: Book[];
  onGenreSelect: (genre: string) => void;
  selectedGenre: string | null;
}

const GENRE_CONFIGS: Record<string, { 
  icon: React.ElementType; 
  gradient: string;
  label: string;
}> = {
  "fiction": { 
    icon: BookOpen, 
    gradient: "from-blue-500 to-blue-700",
    label: "Fiction"
  },
  "fantasy": { 
    icon: Wand2, 
    gradient: "from-purple-500 to-purple-700",
    label: "Fantasy"
  },
  "romance": { 
    icon: Heart, 
    gradient: "from-pink-500 to-rose-600",
    label: "Romance"
  },
  "mystery": { 
    icon: Skull, 
    gradient: "from-slate-600 to-slate-800",
    label: "Mystery"
  },
  "science fiction": { 
    icon: Rocket, 
    gradient: "from-cyan-500 to-teal-600",
    label: "Sci-Fi"
  },
  "historical": { 
    icon: History, 
    gradient: "from-amber-600 to-orange-700",
    label: "Historical"
  },
  "non-fiction": { 
    icon: GraduationCap, 
    gradient: "from-green-500 to-emerald-600",
    label: "Non-Fiction"
  },
  "biography": { 
    icon: Briefcase, 
    gradient: "from-indigo-500 to-indigo-700",
    label: "Biography"
  },
  "poetry": { 
    icon: Music, 
    gradient: "from-rose-400 to-pink-600",
    label: "Poetry"
  },
  "children": { 
    icon: Baby, 
    gradient: "from-yellow-400 to-orange-500",
    label: "Children"
  },
};

export function GenreCards({ books, onGenreSelect, selectedGenre }: GenreCardsProps) {
  const genreCounts = books.reduce((acc, book) => {
    if (book.genre) {
      const normalizedGenre = book.genre.toLowerCase();
      for (const key of Object.keys(GENRE_CONFIGS)) {
        if (normalizedGenre.includes(key)) {
          acc[key] = (acc[key] || 0) + 1;
          break;
        }
      }
    }
    return acc;
  }, {} as Record<string, number>);

  const availableGenres = Object.entries(GENRE_CONFIGS)
    .filter(([key]) => genreCounts[key] && genreCounts[key] > 0)
    .sort((a, b) => (genreCounts[b[0]] || 0) - (genreCounts[a[0]] || 0));

  if (availableGenres.length === 0) {
    return null;
  }

  return (
    <section className="mb-8" aria-label="Browse by Genre" data-testid="genre-cards">
      <h2 className="text-xl font-semibold mb-4">Browse by Genre</h2>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-3 pb-4">
          <Card 
            className={`flex-shrink-0 w-32 cursor-pointer transition-all ${
              selectedGenre === null 
                ? "ring-2 ring-primary" 
                : "hover:scale-105"
            }`}
            onClick={() => onGenreSelect("")}
          >
            <CardContent className="p-0">
              <div className={`h-20 bg-gradient-to-br from-gray-500 to-gray-700 rounded-t-lg flex items-center justify-center`}>
                <BookOpen className="h-8 w-8 text-white" />
              </div>
              <div className="p-2 text-center">
                <p className="text-sm font-medium">All Books</p>
                <p className="text-xs text-muted-foreground">{books.length}</p>
              </div>
            </CardContent>
          </Card>
          
          {availableGenres.map(([key, config]) => {
            const Icon = config.icon;
            const count = genreCounts[key] || 0;
            const isSelected = selectedGenre?.toLowerCase() === key;
            
            return (
              <Card 
                key={key}
                className={`flex-shrink-0 w-32 cursor-pointer transition-all ${
                  isSelected 
                    ? "ring-2 ring-primary" 
                    : "hover:scale-105"
                }`}
                onClick={() => onGenreSelect(key)}
              >
                <CardContent className="p-0">
                  <div className={`h-20 bg-gradient-to-br ${config.gradient} rounded-t-lg flex items-center justify-center`}>
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <div className="p-2 text-center">
                    <p className="text-sm font-medium">{config.label}</p>
                    <p className="text-xs text-muted-foreground">{count} books</p>
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
