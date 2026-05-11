import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PageNavigatorProps } from "./flipbook-types";

export function PageNavigator({ currentPage, totalPages, onJumpTo }: PageNavigatorProps) {
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
      className="flex flex-col gap-3 p-3 border-b border-border bg-muted/40"
      data-testid="flipbook-navigator"
    >
      <form onSubmit={handleJump} className="flex items-center gap-2">
        <label htmlFor="flipbook-jump" className="text-xs font-medium text-muted-foreground">
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
        <ul role="list" className="flex flex-wrap gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const active = p === currentPage;
            return (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onJumpTo(p)}
                  aria-label={`Go to page ${p}`}
                  aria-current={active ? "page" : undefined}
                  className={`min-w-[2.25rem] h-9 px-2 rounded-md text-sm font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border"
                  }`}
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
