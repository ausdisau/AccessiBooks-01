import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";
import type { SearchSummary } from "./book-search";

export interface SearchResultsPanelProps {
  summary: SearchSummary;
  query: string;
  currentPage: number;
  isSearching: boolean;
  onJumpToPage: (page: number) => void;
  onClose: () => void;
}

export function SearchResultsPanel({
  summary,
  query,
  currentPage,
  isSearching,
  onJumpToPage,
  onClose,
}: SearchResultsPanelProps) {
  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const noMatches = hasQuery && summary.totalMatches === 0;

  return (
    <section
      id="flipbook-search-panel"
      role="region"
      aria-label="Search results"
      data-flipbook-panel="search"
      className="border-b"
      style={{ background: "var(--fb-surface)", borderColor: "var(--fb-border)" }}
      data-testid="flipbook-search-panel"
    >
      <header className="flex items-center justify-between px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fb-muted)" }}>
          {hasQuery
            ? `${summary.totalMatches} match${summary.totalMatches === 1 ? "" : "es"} on ${summary.pages.length} page${summary.pages.length === 1 ? "" : "s"}`
            : "Type at least 2 characters to search"}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close search results"
          data-testid="flipbook-search-close"
          className="h-7 w-7"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      {isSearching && (
        <p className="px-3 pb-2 text-xs" style={{ color: "var(--fb-muted)" }}>
          Searching…
        </p>
      )}

      {noMatches && !isSearching && (
        <p className="px-3 pb-3 text-sm" data-testid="flipbook-search-empty">
          No matches for “{trimmed}”.
        </p>
      )}

      {summary.pages.length > 0 && (
        <ScrollArea className="max-h-48">
          <ul role="list" className="px-3 pb-3 space-y-1.5">
            {summary.pages.map((p) => {
              const active = p.pageNumber === currentPage;
              return (
                <li key={p.pageId}>
                  <button
                    type="button"
                    onClick={() => onJumpToPage(p.pageNumber)}
                    aria-label={`Go to page ${p.pageNumber}, ${p.matchCount} match${p.matchCount === 1 ? "" : "es"}`}
                    aria-current={active ? "page" : undefined}
                    className="w-full text-left rounded-md border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      background: active ? "var(--fb-accent)" : "var(--fb-page-bg)",
                      color: active ? "var(--fb-on-accent)" : "var(--fb-fg)",
                      borderColor: active ? "var(--fb-accent)" : "var(--fb-border)",
                    }}
                    data-testid={`flipbook-search-result-${p.pageNumber}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Page {p.pageNumber}</span>
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: active ? "var(--fb-on-accent)" : "var(--fb-muted)" }}
                      >
                        {p.matchCount}
                      </span>
                    </div>
                    <p
                      className="text-xs mt-1 line-clamp-2"
                      style={{ color: active ? "var(--fb-on-accent)" : "var(--fb-muted)" }}
                    >
                      {p.snippet}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}
