import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Home as HomeIcon } from "lucide-react";
import { ReaderToolbar } from "./ReaderToolbar";
import { ReaderSettingsPanel } from "./ReaderSettingsPanel";
import { PageNavigator } from "./PageNavigator";
import { ReadingPage } from "./ReadingPage";
import { AnnotationPanel } from "./AnnotationPanel";
import { KeyboardShortcutHelp } from "./KeyboardShortcutHelp";
import { LiveStatusRegion } from "./LiveStatusRegion";
import type { FlipbookPage, FlipbookReaderProps } from "./flipbook-types";

const DEMO_PARAGRAPHS = [
  "Welcome to the AccessiBooks flipbook reader. This Stage 1 shell focuses on the core navigation, layout, and accessibility scaffolding that every later stage will build on.",
  "Use the previous and next buttons in the toolbar, swipe on touch devices, or press the Left and Right arrow keys to turn pages. Page Up and Page Down work too, and Home or End jump to the first or last page.",
  "Settings, annotations, and the keyboard shortcut help are all available from the toolbar. They open and close with proper focus and screen reader support, even though their content arrives in later stages.",
  "Page changes are announced through an off-screen live region so screen reader users always know which page they are on after a flip.",
  "When you have set the operating system to reduce motion, the page-flip animation gracefully degrades to a quick fade so the reader stays comfortable.",
  "Stage 2 will add typography controls, theming, and reading presets. Stage 3 brings text-to-speech and in-book search behaviour, and Stage 4 introduces written and voice annotations.",
];

function buildDemoPages(title: string): FlipbookPage[] {
  return Array.from({ length: 12 }, (_, i) => {
    const para = DEMO_PARAGRAPHS[i % DEMO_PARAGRAPHS.length];
    return {
      id: `demo-${i + 1}`,
      pageNumber: i + 1,
      content: `${title} — sample chapter\n\n${para}\n\nThis is page ${i + 1} of the Stage 1 demo content. Real book data and an EPUB-ready architecture arrive in Stage 6.`,
    };
  });
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

export function FlipbookReader({ book, onBack }: FlipbookReaderProps) {
  const reducedMotion = usePrefersReducedMotion();
  const pages = useMemo(() => buildDemoPages(book.title), [book.title]);
  const totalPages = pages.length;

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [flipDirection, setFlipDirection] = useState<"none" | "next" | "prev">("none");
  const [liveMessage, setLiveMessage] = useState(`Page 1 of ${totalPages}`);

  const pageRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const annotationsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    window.setTimeout(() => settingsTriggerRef.current?.focus(), 0);
  }, []);
  const closeAnnotations = useCallback(() => {
    setAnnotationsOpen(false);
    window.setTimeout(() => annotationsTriggerRef.current?.focus(), 0);
  }, []);

  const goToPage = useCallback(
    (target: number, direction: "next" | "prev" | "none" = "none") => {
      const clamped = Math.max(1, Math.min(totalPages, target));
      setCurrentPage((prev) => {
        if (clamped === prev) return prev;
        const dir =
          direction !== "none" ? direction : clamped > prev ? "next" : "prev";
        setFlipDirection(dir);
        setLiveMessage(`Page ${clamped} of ${totalPages}`);
        return clamped;
      });
    },
    [totalPages],
  );

  const goNext = useCallback(() => goToPage(currentPage + 1, "next"), [currentPage, goToPage]);
  const goPrev = useCallback(() => goToPage(currentPage - 1, "prev"), [currentPage, goToPage]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key === "Escape") {
        if (settingsOpen) {
          e.preventDefault();
          closeSettings();
          return;
        }
        if (annotationsOpen) {
          e.preventDefault();
          closeAnnotations();
          return;
        }
      }
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          goPrev();
          break;
        case "Home":
          e.preventDefault();
          goToPage(1, "prev");
          break;
        case "End":
          e.preventDefault();
          goToPage(totalPages, "next");
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, goToPage, totalPages, settingsOpen, annotationsOpen, closeSettings, closeAnnotations]);

  // Focus the reading page after a flip so screen reader users land on new content
  useEffect(() => {
    if (flipDirection === "none") return;
    const id = window.setTimeout(() => {
      pageRef.current?.focus();
    }, reducedMotion ? 60 : 200);
    return () => window.clearTimeout(id);
  }, [currentPage, flipDirection, reducedMotion]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  const currentPageData = pages[currentPage - 1];

  return (
    <div
      className="flex flex-col h-[calc(100vh-4rem)] min-h-[600px] bg-background"
      data-testid="flipbook-reader"
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back to library"
          data-testid="flipbook-btn-back"
        >
          <HomeIcon className="h-4 w-4 mr-1" aria-hidden="true" />
          Back
        </Button>
        <h1 className="text-sm font-semibold truncate max-w-[60%]" data-testid="flipbook-title">
          {book.title}
        </h1>
        <span className="text-xs text-muted-foreground hidden sm:inline">Flipbook view</span>
      </header>

      <ReaderToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={goPrev}
        onNext={goNext}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        onToggleAnnotations={() => setAnnotationsOpen((v) => !v)}
        onToggleShortcuts={() => setShortcutsOpen(true)}
        settingsOpen={settingsOpen}
        annotationsOpen={annotationsOpen}
        shortcutsOpen={shortcutsOpen}
        settingsButtonRef={settingsTriggerRef}
        annotationsButtonRef={annotationsTriggerRef}
      />

      <PageNavigator
        currentPage={currentPage}
        totalPages={totalPages}
        onJumpTo={(p) => goToPage(p)}
      />

      <div className="flex-1 flex min-h-0">
        <main
          className="flex-1 relative flex items-stretch justify-center p-4 sm:p-6 bg-muted/30"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrev}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 opacity-70 hover:opacity-100"
            data-testid="flipbook-edge-prev"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </Button>

          <div
            ref={pageRef}
            tabIndex={-1}
            className="w-full max-w-3xl outline-none"
            data-testid="flipbook-page-container"
          >
            {currentPageData && (
              <ReadingPage
                page={currentPageData}
                flipDirection={flipDirection}
                reducedMotion={reducedMotion}
              />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={goNext}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 opacity-70 hover:opacity-100"
            data-testid="flipbook-edge-next"
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </Button>
        </main>

        <ReaderSettingsPanel open={settingsOpen} onClose={closeSettings} />
        <AnnotationPanel open={annotationsOpen} onClose={closeAnnotations} />
      </div>

      <KeyboardShortcutHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <LiveStatusRegion message={liveMessage} />
    </div>
  );
}
