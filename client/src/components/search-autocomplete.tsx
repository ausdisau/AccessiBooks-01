import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { BookOpen, Search } from "lucide-react";
import type { Book } from "@shared/schema";

interface SearchAutocompleteProps {
  onSelectBook?: (book: Book) => void;
  placeholder?: string;
}

export function SearchAutocomplete({ onSelectBook, placeholder = "Search audiobooks..." }: SearchAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: books = [] } = useQuery<Book[]>({
    queryKey: ["/api/books"],
  });

  const filteredBooks = query.length >= 2
    ? books.filter(book =>
        book.title.toLowerCase().includes(query.toLowerCase()) ||
        book.author.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  const showDropdown = isOpen && query.length >= 2 && filteredBooks.length > 0;

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

  const handleSelect = (book: Book) => {
    setQuery(book.title);
    setIsOpen(false);
    onSelectBook?.(book);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredBooks.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredBooks.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredBooks[highlightedIndex]) {
          handleSelect(filteredBooks[highlightedIndex]);
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
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-full pl-10 pr-4 bg-muted/50 border-muted-foreground/20 focus:bg-background"
          aria-label="Search audiobooks"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          role="combobox"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-lg z-50 overflow-hidden"
          role="listbox"
        >
          {filteredBooks.map((book, index) => (
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
                  className="w-10 h-14 object-cover rounded"
                />
              ) : (
                <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-1">{book.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{book.author}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
