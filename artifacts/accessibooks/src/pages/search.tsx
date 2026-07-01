import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Book } from "@shared/schema";
import { BookCard } from "@/components/book-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search as SearchIcon, Loader2, X } from "lucide-react";

interface SearchPageProps {
  onSelectBook: (book: Book) => void;
}

// Accessibility tags map 1:1 to the `accessibilityTags` facet on the search
// API (all requested tags must match). "Interactive transcript" is expressed
// here as a tag because the catalogue stores it alongside the other tags.
const A11Y_TAGS: { value: string; label: string }[] = [
  { value: "interactive-transcript", label: "Interactive transcript" },
  { value: "captioned", label: "Captioned" },
  { value: "audio-described", label: "Audio described" },
  { value: "dyslexia-friendly", label: "Dyslexia friendly" },
  { value: "large-print", label: "Large print" },
  { value: "braille", label: "Braille" },
];

const LANGUAGES: { value: string; label: string }[] = [
  { value: "english", label: "English" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "spanish", label: "Spanish" },
  { value: "italian", label: "Italian" },
  { value: "dutch", label: "Dutch" },
  { value: "portuguese", label: "Portuguese" },
  { value: "latin", label: "Latin" },
];

const NARRATION_TYPES: { value: string; label: string }[] = [
  { value: "human", label: "Human narration" },
  { value: "ai", label: "Synthetic (AI)" },
];

const LENGTHS: { value: string; label: string }[] = [
  { value: "short", label: "Short (under 5h)" },
  { value: "medium", label: "Medium (5–15h)" },
  { value: "long", label: "Long (over 15h)" },
];

const GENRES: { value: string; label: string }[] = [
  { value: "fiction", label: "Fiction" },
  { value: "non-fiction", label: "Non-fiction" },
  { value: "mystery", label: "Mystery" },
  { value: "romance", label: "Romance" },
  { value: "science fiction", label: "Science fiction" },
  { value: "fantasy", label: "Fantasy" },
  { value: "history", label: "History" },
  { value: "children", label: "Children" },
  { value: "poetry", label: "Poetry" },
];

const ALL_LABEL: Record<string, string> = {
  language: "Any language",
  narrationType: "Any narration",
  genre: "Any genre",
  chapterLength: "Any length",
};

// Human-readable label for an active filter chip.
function chipLabel(key: string, value: string): string {
  switch (key) {
    case "transcriptAvailable":
      return "Has transcript";
    case "language":
      return LANGUAGES.find((l) => l.value === value)?.label ?? value;
    case "narrationType":
      return NARRATION_TYPES.find((n) => n.value === value)?.label ?? value;
    case "genre":
      return GENRES.find((g) => g.value === value)?.label ?? value;
    case "chapterLength":
      return LENGTHS.find((l) => l.value === value)?.label ?? value;
    default:
      return A11Y_TAGS.find((t) => t.value === value)?.label ?? value;
  }
}

export default function SearchPage({ onSelectBook }: SearchPageProps) {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);

  const q = params.get("q") ?? "";
  const transcriptAvailable = params.get("transcriptAvailable") === "true";
  const language = params.get("language") ?? "";
  const narrationType = params.get("narrationType") ?? "";
  const genre = params.get("genre") ?? "";
  const chapterLength = params.get("chapterLength") ?? "";
  const tags = useMemo(
    () => (params.get("accessibilityTags")?.split(",").filter(Boolean)) ?? [],
    [params],
  );

  // Local, debounced state for the free-text input so typing stays responsive
  // and doesn't push a history entry per keystroke.
  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    setQInput(q);
  }, [q]);

  const writeParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchString);
      mutate(next);
      const qs = next.toString();
      navigate(qs ? `/search?${qs}` : "/search", { replace: true });
    },
    [searchString, navigate],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      if (qInput === q) return;
      writeParams((p) => {
        const trimmed = qInput.trim();
        if (trimmed) p.set("q", trimmed);
        else p.delete("q");
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [qInput, q, writeParams]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      writeParams((p) => {
        if (value === null || value === "") p.delete(key);
        else p.set(key, value);
      });
    },
    [writeParams],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      writeParams((p) => {
        const current = (p.get("accessibilityTags")?.split(",").filter(Boolean)) ?? [];
        const next = current.includes(tag)
          ? current.filter((t) => t !== tag)
          : [...current, tag];
        if (next.length) p.set("accessibilityTags", next.join(","));
        else p.delete("accessibilityTags");
      });
    },
    [writeParams],
  );

  const clearAll = useCallback(() => {
    writeParams((p) => {
      const term = p.get("q");
      // Keep the search term, drop every filter.
      Array.from(p.keys()).forEach((k) => p.delete(k));
      if (term) p.set("q", term);
    });
  }, [writeParams]);

  const activeFilters: { key: string; value: string }[] = [
    ...(transcriptAvailable ? [{ key: "transcriptAvailable", value: "true" }] : []),
    ...(language ? [{ key: "language", value: language }] : []),
    ...(narrationType ? [{ key: "narrationType", value: narrationType }] : []),
    ...(genre ? [{ key: "genre", value: genre }] : []),
    ...(chapterLength ? [{ key: "chapterLength", value: chapterLength }] : []),
    ...tags.map((t) => ({ key: "accessibilityTags", value: t })),
  ];

  const removeFilter = useCallback(
    (key: string, value: string) => {
      if (key === "accessibilityTags") toggleTag(value);
      else setParam(key, null);
    },
    [toggleTag, setParam],
  );

  const hasQuery = q.trim().length > 0;

  const apiUrl = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("q", q.trim());
    if (transcriptAvailable) sp.set("transcriptAvailable", "true");
    if (language) sp.set("language", language);
    if (narrationType) sp.set("narrationType", narrationType);
    if (genre) sp.set("genre", genre);
    if (chapterLength) sp.set("chapterLength", chapterLength);
    if (tags.length) sp.set("accessibilityTags", tags.join(","));
    return `/api/books/search?${sp.toString()}`;
  }, [q, transcriptAvailable, language, narrationType, genre, chapterLength, tags]);

  const { data, isLoading, isError } = useQuery<Book[]>({
    queryKey: [apiUrl],
    queryFn: async () => {
      const res = await fetch(apiUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    enabled: hasQuery,
  });

  const results = data ?? [];
  const resultCount = results.length;

  // Announce loading and result counts to assistive technology.
  const statusMessage = !hasQuery
    ? ""
    : isLoading
      ? "Searching…"
      : isError
        ? "Something went wrong while searching. Please try again."
        : `${resultCount} ${resultCount === 1 ? "result" : "results"} found.`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">Search the catalogue</h1>
      <p className="text-muted-foreground mb-6">
        Search by title, author, narrator, or description, then narrow results by
        accessibility features.
      </p>

      <form
        role="search"
        aria-label="Search the catalogue"
        onSubmit={(e) => {
          e.preventDefault();
          writeParams((p) => {
            const trimmed = qInput.trim();
            if (trimmed) p.set("q", trimmed);
            else p.delete("q");
          });
        }}
        className="relative mb-6"
      >
        <Label htmlFor="catalogue-search" className="sr-only">
          Search term
        </Label>
        <SearchIcon
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="catalogue-search"
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search audiobooks, ebooks, and magazines…"
          className="pl-10"
          autoComplete="off"
          data-testid="input-search"
        />
      </form>

      <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
        <aside aria-label="Filters" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Filters
            </h2>
            {activeFilters.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                data-testid="button-clear-filters"
              >
                Clear all
              </Button>
            )}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="filter-transcript"
              checked={transcriptAvailable}
              onCheckedChange={(checked) =>
                setParam("transcriptAvailable", checked ? "true" : null)
              }
              data-testid="checkbox-transcript"
            />
            <Label htmlFor="filter-transcript" className="leading-tight cursor-pointer">
              Transcript available
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filter-language">Language</Label>
            <Select
              value={language || "__all"}
              onValueChange={(v) => setParam("language", v === "__all" ? null : v)}
            >
              <SelectTrigger id="filter-language" data-testid="select-language">
                <SelectValue placeholder={ALL_LABEL.language} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{ALL_LABEL.language}</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filter-narration">Narration</Label>
            <Select
              value={narrationType || "__all"}
              onValueChange={(v) => setParam("narrationType", v === "__all" ? null : v)}
            >
              <SelectTrigger id="filter-narration" data-testid="select-narration">
                <SelectValue placeholder={ALL_LABEL.narrationType} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{ALL_LABEL.narrationType}</SelectItem>
                {NARRATION_TYPES.map((n) => (
                  <SelectItem key={n.value} value={n.value}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filter-genre">Genre</Label>
            <Select
              value={genre || "__all"}
              onValueChange={(v) => setParam("genre", v === "__all" ? null : v)}
            >
              <SelectTrigger id="filter-genre" data-testid="select-genre">
                <SelectValue placeholder={ALL_LABEL.genre} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{ALL_LABEL.genre}</SelectItem>
                {GENRES.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filter-length">Length (audiobooks)</Label>
            <Select
              value={chapterLength || "__all"}
              onValueChange={(v) => setParam("chapterLength", v === "__all" ? null : v)}
            >
              <SelectTrigger id="filter-length" data-testid="select-length">
                <SelectValue placeholder={ALL_LABEL.chapterLength} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{ALL_LABEL.chapterLength}</SelectItem>
                {LENGTHS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">Accessibility features</legend>
            {A11Y_TAGS.map((t) => (
              <div key={t.value} className="flex items-start gap-2">
                <Checkbox
                  id={`filter-tag-${t.value}`}
                  checked={tags.includes(t.value)}
                  onCheckedChange={() => toggleTag(t.value)}
                  data-testid={`checkbox-tag-${t.value}`}
                />
                <Label
                  htmlFor={`filter-tag-${t.value}`}
                  className="leading-tight cursor-pointer"
                >
                  {t.label}
                </Label>
              </div>
            ))}
          </fieldset>
        </aside>

        <section aria-label="Search results">
          {/* Accessible live region: announces loading and result counts. */}
          <p className="sr-only" role="status" aria-live="polite" data-testid="text-search-status">
            {statusMessage}
          </p>

          {activeFilters.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {activeFilters.map((f) => (
                <Badge
                  key={`${f.key}-${f.value}`}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {chipLabel(f.key, f.value)}
                  <button
                    type="button"
                    onClick={() => removeFilter(f.key, f.value)}
                    aria-label={`Remove filter: ${chipLabel(f.key, f.value)}`}
                    className="rounded-full hover:bg-muted-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {!hasQuery ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              <SearchIcon className="mx-auto h-8 w-8 mb-3" aria-hidden="true" />
              <p className="font-medium">Start typing to search the catalogue.</p>
              <p className="text-sm mt-1">
                You can search by title, author, narrator, or description.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" aria-hidden="true" />
              <span>Searching…</span>
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/40 p-10 text-center">
              <p className="font-medium">Something went wrong while searching.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please adjust your search and try again.
              </p>
            </div>
          ) : resultCount === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              <p className="font-medium">No results for “{q}”.</p>
              <p className="text-sm mt-1">
                Try a different search term or remove some filters.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {resultCount} {resultCount === 1 ? "result" : "results"} for “{q}”
              </p>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
                role="list"
                aria-label="Search results"
                data-testid="grid-search-results"
              >
                {results.map((book) => (
                  <div role="listitem" key={book.id}>
                    <BookCard book={book} onPlayBook={onSelectBook} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
