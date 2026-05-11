import { useEffect, useState } from "react";
import type { ReadingPageProps } from "./flipbook-types";
import { FONT_FAMILY_STACK } from "./flipbook-typography";

export function ReadingPage({
  page,
  flipDirection,
  reducedMotion,
  typography,
}: ReadingPageProps) {
  const [phase, setPhase] = useState<"idle" | "flipping">("idle");

  useEffect(() => {
    if (flipDirection === "none") return;
    setPhase("flipping");
    const id = window.setTimeout(() => setPhase("idle"), reducedMotion ? 120 : 380);
    return () => window.clearTimeout(id);
  }, [page.id, flipDirection, reducedMotion]);

  const animationClass = (() => {
    if (phase !== "flipping") return "opacity-100";
    if (reducedMotion) return "flipbook-page-fade";
    return flipDirection === "next"
      ? "flipbook-page-flip-next"
      : "flipbook-page-flip-prev";
  })();

  const textStyle: React.CSSProperties = {
    fontFamily: FONT_FAMILY_STACK[typography.fontFamily],
    fontSize: `${typography.fontSize}px`,
    lineHeight: typography.lineHeight,
    letterSpacing: `${typography.letterSpacing}em`,
    wordSpacing: `${typography.wordSpacing}em`,
  };

  return (
    <article
      className="relative h-full w-full"
      aria-label={`Page ${page.pageNumber}`}
      data-testid={`flipbook-page-${page.pageNumber}`}
    >
      <div
        key={page.id}
        className={`h-full w-full rounded-lg shadow-md p-8 sm:p-12 overflow-y-auto transition-opacity duration-150 ${animationClass}`}
        style={{
          background: "var(--fb-page-bg)",
          color: "var(--fb-page-fg)",
          border: "1px solid var(--fb-border)",
          transformOrigin: flipDirection === "next" ? "left center" : "right center",
        }}
      >
        <div className="max-w-none whitespace-pre-wrap" style={textStyle}>
          {page.content}
        </div>
        <div
          className="mt-8 pt-4 text-xs text-center"
          style={{
            borderTop: "1px solid var(--fb-border)",
            color: "var(--fb-muted)",
          }}
        >
          Page {page.pageNumber}
        </div>
      </div>
    </article>
  );
}
