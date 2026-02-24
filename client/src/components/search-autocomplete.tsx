import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Search, Loader2, Headphones, BookText, Newspaper, Clock, Filter, X, ChevronDown } from "lucide-react";
import type { Book } from "@shared/schema";

interface SearchAutocompleteProps {
  onSelectBook?: (book: Book) => void;
  placeholder?: string;
}

const GENRES = ["Fiction", "Mystery", "Sci-Fi", "Romance", "History", "Biography", "Self-Help", "Fantasy", "Thriller", "Science", "Technology", "Business"];
const FORMATS = ["audiobook", "ebook", "magazine"];
const LANGUAGES = ["English", "Spanish", "French", "German", "Chinese", "Japanese"];
const RECENT_SEARCHES_KEY = "accessibooks-recent-searches";

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
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [openFilterType, setOpenFilterType] = useState<"genre" | "format" | "language" | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch {
        setRecentSearches([]);
      }
    }
  }, []);

  const debouncedQuery = useDebounce(query, 300);

  // Build query params for API
  const buildSearchParams = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.append("q", debouncedQuery);
    if (selectedGenre) params.append("genre", selectedGenre);
    if (selectedFormat) params.append("contentType", selectedFormat);
    if (selectedLanguage) params.append("language", selectedLanguage);
    return params.toString();
  }, [debouncedQuery, selectedGenre, selectedFormat, selectedLanguage]);

  const { data: results = [], isFetching } = useQuery<Book[]>({
    queryKey: ["/api/books/search", debouncedQuery, selectedGenre, selectedFormat, selectedLanguage],
    queryFn: async () => {
      const params = buildSearchParams();
      const url = `/api/books/search${params ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const displayResults = results.slice(0, 10);
  const showDropdown = isOpen && (displayResults.length > 0 || isFetching || (query.length === 0 && recentSearches.length > 0));
  const showRecentSearches = isOpen && query.length === 0 && recentSearches.length > 0;

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
    
    // Save to recent searches
    const newRecent = [book.title, ...recentSearches.filter(s => s !== book.title)].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newRecent));
    
    onSelectBook?.(book);
  }, [onSelectBook, recentSearches]);

  const handleRecentSearchClick = useCallback((searchTerm: string) => {
    setQuery(searchTerm);
    setIsOpen(true);
    setHighlightedIndex(-1);
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

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
            setOpenFilterType(null);
          }}
          onFocus={() => {
            setIsOpen(true);
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

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2 mt-3">
        {/* Genre Filter */}
        <div className="relative">
          <Button
            variant={selectedGenre ? "default" : "outline"}
            size="sm"
            onClick={() => setOpenFilterType(openFilterType === "genre" ? null : "genre")}
            className="h-auto py-1 px-2 text-xs gap-1"
          >
            <Filter className="h-3 w-3" />
            {selectedGenre || "Genre"}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {openFilterType === "genre" && (
            <div className="absolute top-full left-0 mt-1 bg-background border rounded-lg shadow-lg z-50 w-48 max-h-48 overflow-y-auto">
              {GENRES.map((genre) => (
                <button
                  key={genre}
                  onClick={() => {
                    setSelectedGenre(selectedGenre === genre ? null : genre);
                    setOpenFilterType(null);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${
                    selectedGenre === genre ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Format Filter */}
        <div className="relative">
          <Button
            variant={selectedFormat ? "default" : "outline"}
            size="sm"
            onClick={() => setOpenFilterType(openFilterType === "format" ? null : "format")}
            className="h-auto py-1 px-2 text-xs gap-1"
          >
            <Filter className="h-3 w-3" />
            {selectedFormat ? (selectedFormat === "audiobook" ? "Audiobook" : selectedFormat === "ebook" ? "Ebook" : "Magazine") : "Format"}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {openFilterType === "format" && (
            <div className="absolute top-full left-0 mt-1 bg-background border rounded-lg shadow-lg z-50 w-40 max-h-48 overflow-y-auto">
              {FORMATS.map((format) => (
                <button
                  key={format}
                  onClick={() => {
                    setSelectedFormat(selectedFormat === format ? null : format);
                    setOpenFilterType(null);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${
                    selectedFormat === format ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  {format === "audiobook" ? "Audiobook" : format === "ebook" ? "Ebook" : "Magazine"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Language Filter */}
        <div className="relative">
          <Button
            variant={selectedLanguage ? "default" : "outline"}
            size="sm"
            onClick={() => setOpenFilterType(openFilterType === "language" ? null : "language")}
            className="h-auto py-1 px-2 text-xs gap-1"
          >
            <Filter className="h-3 w-3" />
            {selectedLanguage || "Language"}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {openFilterType === "language" && (
            <div className="absolute top-full left-0 mt-1 bg-background border rounded-lg shadow-lg z-50 w-40 max-h-48 overflow-y-auto">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    setSelectedLanguage(selectedLanguage === lang ? null : lang);
                    setOpenFilterType(null);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${
                    selectedLanguage === lang ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dropdown Results */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-lg z-50 overflow-hidden max-h-[400px] overflow-y-auto"
          role="listbox"
        >
          {/* Recent Searches Section */}
          {showRecentSearches && (
            <>
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Recent Searches</p>
                </div>
                <button
                  onClick={clearRecentSearches}
                  className="p-1 hover:bg-muted/50 rounded transition-colors"
                  aria-label="Clear recent searches"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
              <div>
                {recentSearches.map((searchTerm) => (
                  <button
                    key={searchTerm}
                    onClick={() => handleRecentSearchClick(searchTerm)}
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2"
                  >
                    <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    {searchTerm}
                  </button>
                ))}
              </div>
              <div className="border-t" />
            </>
          )}

          {/* Search Results Section */}
          {isFetching && displayResults.length === 0 && query.length >= 2 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Searching across multiple sources...
            </div>
          ) : displayResults.length === 0 && query.length >= 2 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found for "{query}"
            </div>
          ) : query.length >= 2 ? (
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
          ) : null}
        </div>
      )}
    </div>
  );
}
