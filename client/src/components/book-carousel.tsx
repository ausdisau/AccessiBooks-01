import { useRef, useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Play, BookOpen } from "lucide-react";

interface BookCarouselProps {
  title: string;
  books: Book[];
  onBookSelect: (book: Book) => void;
  icon?: typeof BookOpen;
}

export function BookCarousel({ title, books, onBookSelect, icon: Icon = BookOpen }: BookCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 300;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" && index < books.length - 1) {
      e.preventDefault();
      setFocusedIndex(index + 1);
      const items = scrollRef.current?.querySelectorAll("[data-carousel-item]");
      (items?.[index + 1] as HTMLElement)?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      setFocusedIndex(index - 1);
      const items = scrollRef.current?.querySelectorAll("[data-carousel-item]");
      (items?.[index - 1] as HTMLElement)?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onBookSelect(books[index]);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
      const items = scrollRef.current?.querySelectorAll("[data-carousel-item]");
      (items?.[0] as HTMLElement)?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIndex(books.length - 1);
      const items = scrollRef.current?.querySelectorAll("[data-carousel-item]");
      (items?.[books.length - 1] as HTMLElement)?.focus();
    }
  };

  if (books.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Icon className="h-5 w-5" aria-hidden="true" />
          {title}
        </h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("left")}
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("right")}
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        role="list"
        aria-label={`${title} - ${books.length} books`}
      >
        {books.map((book, index) => (
          <div
            key={book.id}
            data-carousel-item
            role="listitem"
            tabIndex={index === focusedIndex || (focusedIndex === -1 && index === 0) ? 0 : -1}
            className="flex-shrink-0 w-36 md:w-44 cursor-pointer group snap-start carousel-item"
            onClick={() => onBookSelect(book)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onFocus={() => setFocusedIndex(index)}
            aria-label={`${book.title} by ${book.author}. ${book.contentType || "Audiobook"}`}
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden shadow-md group-hover:shadow-xl transition-shadow">
              {book.coverImage ? (
                <img
                  src={book.coverImage}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full bg-secondary flex items-center justify-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-primary rounded-full p-3 shadow-lg">
                    <Play className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2">
              <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                {book.title}
              </h4>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {book.author}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface GenreCarouselProps {
  genres: { name: string; count: number; color: string }[];
  onGenreSelect: (genre: string) => void;
  selectedGenre?: string;
}

export function GenreCarousel({ genres, onGenreSelect, selectedGenre }: GenreCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 200;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <nav className="space-y-3" aria-label="Browse by genre">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Browse by Genre</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("left")}
            aria-label="Scroll genres left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("right")}
            aria-label="Scroll genres right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        role="list"
      >
        <Button
          variant={!selectedGenre ? "default" : "outline"}
          onClick={() => onGenreSelect("")}
          className="flex-shrink-0"
        >
          All
        </Button>
        {genres.map((genre) => (
          <Button
            key={genre.name}
            variant={selectedGenre === genre.name ? "default" : "outline"}
            onClick={() => onGenreSelect(genre.name)}
            className="flex-shrink-0 gap-2"
            style={{
              borderColor: selectedGenre !== genre.name ? genre.color : undefined,
            }}
          >
            {genre.name}
            <span className="text-xs opacity-70">({genre.count})</span>
          </Button>
        ))}
      </div>
    </nav>
  );
}

export function LandingCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  const { data: booksResponse } = useQuery<{ data: Book[] }>({
    queryKey: ["/api/books", "carousel"],
    queryFn: async () => {
      const res = await fetch("/api/books?limit=20");
      if (!res.ok) throw new Error("Failed to fetch books");
      return res.json();
    },
  });
  const books = booksResponse?.data || [];

  const displayBooks = books.slice(0, 20);
  const duplicatedBooks = [...displayBooks, ...displayBooks];

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || displayBooks.length === 0 || prefersReducedMotion) return;

    let animationId: number;
    let scrollPosition = 0;
    const scrollSpeed = 0.5;

    const animate = () => {
      if (!isPaused && scrollContainer) {
        scrollPosition += scrollSpeed;
        
        const singleSetWidth = scrollContainer.scrollWidth / 2;
        if (scrollPosition >= singleSetWidth) {
          scrollPosition = 0;
        }
        
        scrollContainer.scrollLeft = scrollPosition;
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [displayBooks.length, isPaused, prefersReducedMotion]);

  if (displayBooks.length === 0) {
    return (
      <section className="py-12 overflow-hidden">
        <div className="flex gap-4 justify-center">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-32 md:w-40 aspect-[2/3] rounded-lg bg-secondary/50 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 overflow-hidden" aria-label="Featured audiobooks">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Discover Great Audiobooks</h2>
        <p className="text-muted-foreground">Thousands of titles waiting for you</p>
      </div>
      
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-hidden cursor-pointer"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
        role="region"
        aria-label="Scrolling book covers"
      >
        {duplicatedBooks.map((book, index) => (
          <div
            key={`${book.id}-${index}`}
            className="flex-shrink-0 w-32 md:w-40 transition-transform duration-300 hover:scale-105"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden shadow-lg bg-gradient-to-br from-primary/20 to-secondary/20">
              {book.coverImage ? (
                <img
                  src={book.coverImage}
                  alt={`${book.title} by ${book.author}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2 text-center bg-secondary">
                  <BookOpen className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-white text-xs font-medium line-clamp-2">{book.title}</p>
                  <p className="text-white/80 text-xs line-clamp-1">{book.author}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <p className="text-center text-sm text-muted-foreground mt-4">
        Hover to pause • Sign up to start listening
      </p>
    </section>
  );
}
