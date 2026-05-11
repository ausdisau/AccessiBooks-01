import { useEffect, useState } from "react";
import type { ReadingPageProps } from "./flipbook-types";
import { FONT_FAMILY_STACK } from "./flipbook-typography";
import { buildHighlightSegments } from "./book-search";

export function ReadingPage({
  page,
  flipDirection,
  reducedMotion,
  typography,
  highlightMatches,
  contentRef,
  readAlong,
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

  const segments = buildHighlightSegments(page.content, highlightMatches);
  const matchCount = highlightMatches.length;
  const readAlongActive =
    !!readAlong?.enabled && !!readAlong.activeSegmentId;

  return (
    <article
      className="relative h-full w-full"
      aria-label={`Page ${page.pageNumber}`}
      data-testid={`flipbook-page-${page.pageNumber}`}
      data-chapter-id={page.chapterId ?? undefined}
      data-readalong={readAlong?.enabled ? "on" : undefined}
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
        {page.chapterTitle && (
          <p
            className="text-xs uppercase tracking-wider mb-3"
            style={{ color: "var(--fb-muted)" }}
            data-testid="flipbook-page-chapter-title"
          >
            {page.chapterTitle}
          </p>
        )}
        {page.image && (
          <figure className="mb-4">
            <img
              src={page.image.src}
              alt={page.image.alt}
              width={page.image.width}
              height={page.image.height}
              className="rounded max-w-full h-auto mx-auto"
              data-testid="flipbook-page-image"
            />
            {page.image.caption && (
              <figcaption
                className="text-xs text-center mt-2"
                style={{ color: "var(--fb-muted)" }}
              >
                {page.image.caption}
              </figcaption>
            )}
          </figure>
        )}
        <div
          ref={contentRef}
          className="max-w-none whitespace-pre-wrap"
          style={textStyle}
          data-testid="flipbook-page-content"
        >
          {segments.map((seg, i) =>
            seg.isMatch ? (
              <mark
                key={i}
                className="flipbook-search-match rounded px-0.5"
                aria-label={`Search match: ${seg.text}`}
                data-testid="flipbook-search-highlight"
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>
        {readAlongActive && (
          <p className="sr-only" data-testid="flipbook-readalong-active">
            Read-along active.
          </p>
        )}
        {matchCount > 0 && (
          <p className="sr-only" data-testid="flipbook-page-match-count">
            {matchCount} search match{matchCount === 1 ? "" : "es"} on this page.
          </p>
        )}
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
