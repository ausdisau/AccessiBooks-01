import { useEffect, useState } from "react";
import type { ReadingPageProps } from "./flipbook-types";

export function ReadingPage({ page, flipDirection, reducedMotion }: ReadingPageProps) {
  const [phase, setPhase] = useState<"idle" | "flipping">("idle");

  useEffect(() => {
    if (flipDirection === "none") return;
    setPhase("flipping");
    const id = window.setTimeout(() => setPhase("idle"), reducedMotion ? 120 : 380);
    return () => window.clearTimeout(id);
  }, [page.id, flipDirection, reducedMotion]);

  const animationClass = (() => {
    if (phase !== "flipping") return "opacity-100";
    if (reducedMotion) return "opacity-0";
    return flipDirection === "next"
      ? "flipbook-page-flip-next"
      : "flipbook-page-flip-prev";
  })();

  return (
    <article
      className="relative h-full w-full"
      aria-label={`Page ${page.pageNumber}`}
      data-testid={`flipbook-page-${page.pageNumber}`}
    >
      <div
        key={page.id}
        className={`h-full w-full bg-card text-card-foreground rounded-lg shadow-md border border-border p-8 sm:p-12 overflow-y-auto transition-opacity duration-150 ${animationClass}`}
        style={{ transformOrigin: flipDirection === "next" ? "left center" : "right center" }}
      >
        <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
          {page.content}
        </div>
        <div className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground text-center">
          Page {page.pageNumber}
        </div>
      </div>
    </article>
  );
}
