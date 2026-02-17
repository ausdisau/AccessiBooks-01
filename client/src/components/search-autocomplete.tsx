import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Loader2, Headphones, BookText, Newspaper } from "lucide-react";
import type { Book } from "@shared/schema";

interface SearchAutocompleteProps {
  onSelectBook?: (book: Book) => void;
  placeholder?: string;
}

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const contentTypeIcon = (type?: string | null) => {
  switch (type) {
    case "audiobook":
      return <Headphones className="h-3 w-3" aria-hidden="true" />;
    case "ebook":
      return <BookText className="h-3 w-3" aria-hidden="true" />;
    case "magazine":
      return <Newspaper className="h-3 w-3" aria-hidden="true" />;
    default:
      return <BookOpen className="h-3 w-3" aria-hidden="true" />;
  }
};

const contentTypeLabel = (type?: string | null) => {
  switch (type) {
    case "audiobook": return "Audiobook";
    case "ebook": return "Ebook";
    case "magazine": return "Magazine";
    default: return "Book";
  }
};

export function SearchAutocomplete({ onSelectBook, placeholder = "Search audiobooks..." }: SearchAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  const { data: results = [], isFetching } = useQuery<Book[]>({
    queryKey: ["/api/books/search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const displayResults = results.slice(0, 10);
  const showDropdown = isOpen && query.length >= 2 && (displayResults.length > 0 || isFetching);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback((book: Book) => {
    setQuery(book.title);
    setIsOpen(false);
    onSelectBook?.(book);
  }, [onSelectBook]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < displayResults.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : displayResults.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && displayResults[highlightedIndex]) {
          handleSelect(displayResults[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-full pl-10 pr-4 bg-muted/50 border-muted-foreground/20 focus:bg-background"
          aria-label="Search audiobooks"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          role="combobox"
        />
        {isFetching && query.length >= 2 ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-lg z-50 overflow-hidden max-h-[400px] overflow-y-auto"
          role="listbox"
        >
          {isFetching && displayResults.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Searching across multiple sources...
            </div>
          ) : displayResults.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found for "{query}"
            </div>
          ) : (
            displayResults.map((book, index) => (
              <button
                key={book.id}
                onClick={() => handleSelect(book)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                  index === highlightedIndex
                    ? "bg-primary/10"
                    : "hover:bg-muted/50"
                }`}
                role="option"
                aria-selected={index === highlightedIndex}
              >
                {book.coverImage ? (
                  <img
                    src={book.coverImage}
                    alt=""
                    className="w-10 h-14 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-1">{book.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{book.author}</p>
                </div>
                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                  {contentTypeIcon(book.contentType)}
                  {contentTypeLabel(book.contentType)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
