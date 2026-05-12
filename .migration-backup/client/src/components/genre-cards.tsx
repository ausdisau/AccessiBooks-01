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
    <section className="mb-10" aria-label="Browse by Genre" data-testid="genre-cards">
      <h2 className="font-serif text-2xl font-bold mb-6 px-1">Browse by Genre</h2>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4">
          <div 
            className={`flex-shrink-0 w-40 h-28 cursor-pointer transition-all duration-300 rounded-xl overflow-hidden relative group shadow-md ${
              selectedGenre === null 
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105" 
                : "hover:scale-105"
            }`}
            onClick={() => onGenreSelect("")}
          >
            <div className={`absolute inset-0 bg-gradient-to-br from-gray-600 to-gray-900 flex flex-col items-start justify-between p-4`}>
              <p className="text-white font-bold text-lg leading-tight z-10">All Books</p>
              <div className="self-end opacity-40 group-hover:opacity-60 transition-opacity">
                <BookOpen className="h-10 w-10 text-white transform rotate-12" />
              </div>
            </div>
          </div>
          
          {availableGenres.map(([key, config]) => {
            const Icon = config.icon;
            const isSelected = selectedGenre?.toLowerCase() === key;
            
            return (
              <div 
                key={key}
                className={`flex-shrink-0 w-40 h-28 cursor-pointer transition-all duration-300 rounded-xl overflow-hidden relative group shadow-md ${
                  isSelected 
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105" 
                    : "hover:scale-105"
                }`}
                onClick={() => onGenreSelect(key)}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} flex flex-col items-start justify-between p-4`}>
                  <p className="text-white font-bold text-lg leading-tight z-10">{config.label}</p>
                  <div className="self-end opacity-40 group-hover:opacity-60 transition-opacity">
                    <Icon className="h-10 w-10 text-white transform rotate-12" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}
