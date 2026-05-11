import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PageNavigatorProps } from "./flipbook-types";

const PAGE_WINDOW_THRESHOLD = 30;
const PAGE_WINDOW_RADIUS = 5;

function buildPageWindow(current: number, total: number): number[] {
  if (total <= PAGE_WINDOW_THRESHOLD) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let i = current - PAGE_WINDOW_RADIUS; i <= current + PAGE_WINDOW_RADIUS; i++) {
    if (i >= 1 && i <= total) set.add(i);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function PageNavigator({
  currentPage,
  totalPages,
  onJumpTo,
  onPrev,
  onNext,
}: PageNavigatorProps) {
  const [jumpValue, setJumpValue] = useState("");

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jumpValue, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      onJumpTo(n);
      setJumpValue("");
    }
  };

  return (
    <nav
      aria-label="Page navigator"
      className="flex flex-col gap-3 p-3 border-b"
      style={{ background: "var(--fb-surface)", borderColor: "var(--fb-border)" }}
      data-testid="flipbook-navigator"
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onPrev}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          data-testid="flipbook-nav-prev"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Prev
        </Button>
        <span
          className="text-sm font-medium tabular-nums"
          aria-live="off"
          data-testid="flipbook-nav-count"
        >
          Page {currentPage} of {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          data-testid="flipbook-nav-next"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <form onSubmit={handleJump} className="flex items-center gap-2">
        <label htmlFor="flipbook-jump" className="text-xs font-medium" style={{ color: "var(--fb-muted)" }}>
          Jump to
        </label>
        <Input
          id="flipbook-jump"
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          placeholder={`1–${totalPages}`}
          className="h-8 w-24"
          data-testid="flipbook-jump-input"
        />
        <Button type="submit" size="sm" variant="secondary" data-testid="flipbook-jump-go">
          Go
        </Button>
      </form>

      <ScrollArea className="max-h-32">
        <ul role="list" className="flex flex-wrap gap-1.5" aria-label="Quick page jump">
          {buildPageWindow(currentPage, totalPages).map((p) => {
            const active = p === currentPage;
            return (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onJumpTo(p)}
                  aria-label={`Go to page ${p}`}
                  aria-current={active ? "page" : undefined}
                  className="min-w-[2.25rem] h-9 px-2 rounded-md text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    background: active ? "var(--fb-accent)" : "var(--fb-page-bg)",
                    color: active ? "var(--fb-on-accent)" : "var(--fb-fg)",
                    borderColor: active ? "var(--fb-accent)" : "var(--fb-border)",
                  }}
                  data-testid={`flipbook-jump-page-${p}`}
                >
                  {p}
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </nav>
  );
}
