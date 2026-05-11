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
import { SearchResultsPanel } from "./SearchResultsPanel";
import { searchPages, type SearchSummary } from "./book-search";
import { useTts } from "./use-tts";
import type { TtsEvent } from "./tts-service";
import type { FlipbookPage, FlipbookReaderProps } from "./flipbook-types";
import {
  applyPreset,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type FlipbookFontFamily,
  type FlipbookPreset,
  type FlipbookSettings,
  type FlipbookTheme,
  type FlipbookTypography,
} from "./flipbook-typography";

const DEMO_PARAGRAPHS = [
  "Welcome to the AccessiBooks flipbook reader. Stage 3 adds built-in text-to-speech and search inside the book.",
  "Use the Read Aloud button in the toolbar to listen to the current page, or select any passage first to read just that selection. Adjust the voice, speaking rate, pitch, and volume from the settings panel.",
  "Type at least two characters in the search field to scan every page. The results list shows match counts per page and the first matching snippet — choose any result to jump there. Matches on the open page are highlighted accessibly in every theme.",
  "Open the Settings panel from the toolbar to choose a preset like Dyslexia Support or Low Vision, switch theme between Light, Sepia, Dark, and High Contrast, or fine-tune typography with the live sliders.",
  "Every change applies instantly across pages and persists for this book the next time you open it.",
  "Use the previous and next buttons in the toolbar, swipe on touch devices, or press the Left and Right arrow keys to turn pages. Page Up and Page Down work too, and Home or End jump to the first or last page.",
  "Settings, annotations, and the keyboard shortcut help are all available from the toolbar. They open and close with proper focus and screen reader support.",
  "When you have set the operating system to reduce motion, the page-flip animation gracefully degrades to a quick fade so the reader stays comfortable.",
];

function buildDemoPages(title: string): FlipbookPage[] {
  return Array.from({ length: 12 }, (_, i) => {
    const para = DEMO_PARAGRAPHS[i % DEMO_PARAGRAPHS.length];
    return {
      id: `demo-${i + 1}`,
      pageNumber: i + 1,
      content: `${title} — sample chapter\n\n${para}\n\nThis is page ${i + 1} of the demo content. Real book data and an EPUB-ready architecture arrive in Stage 6.`,
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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [flipDirection, setFlipDirection] = useState<"none" | "next" | "prev">("none");
  const [liveMessage, setLiveMessage] = useState(`Page 1 of ${totalPages}`);
  const [settings, setSettings] = useState<FlipbookSettings>(() => loadSettings(book.id));

  // Debounce the search query so we don't run a full-book scan on every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  // Open the results panel as soon as the user starts typing.
  useEffect(() => {
    if (searchQuery.trim().length >= 2) setSearchOpen(true);
  }, [searchQuery]);

  // Resync settings when the book changes (parent may reuse the component instance).
  useEffect(() => {
    setSettings(loadSettings(book.id));
  }, [book.id]);

  const persist = useCallback(
    (next: FlipbookSettings) => {
      saveSettings(book.id, next);
      return next;
    },
    [book.id],
  );

  const handleTypographyChange = useCallback(
    (patch: Partial<FlipbookTypography>) => {
      setSettings((prev) =>
        persist({
          ...prev,
          typography: { ...prev.typography, ...patch },
          activePreset: "none",
        }),
      );
    },
    [persist],
  );

  const handleFontFamilyChange = useCallback(
    (font: FlipbookFontFamily) => {
      setSettings((prev) =>
        persist({
          ...prev,
          typography: { ...prev.typography, fontFamily: font },
          activePreset: "none",
        }),
      );
    },
    [persist],
  );

  const handleThemeChange = useCallback(
    (theme: FlipbookTheme) => {
      setSettings((prev) => persist({ ...prev, theme, activePreset: "none" }));
    },
    [persist],
  );

  const handlePresetChange = useCallback(
    (preset: FlipbookPreset) => {
      setSettings(() => persist(applyPreset(preset)));
    },
    [persist],
  );

  const handleResetDefaults = useCallback(() => {
    setSettings(() => persist({ ...DEFAULT_SETTINGS }));
  }, [persist]);

  const pageRef = useRef<HTMLDivElement>(null);
  const pageContentRef = useRef<HTMLDivElement | null>(null);
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

  // Search summary recomputed only when query or pages change.
  const searchSummary = useMemo<SearchSummary>(
    () => searchPages(pages, debouncedQuery),
    [pages, debouncedQuery],
  );
  const isSearching = searchQuery !== debouncedQuery && searchQuery.trim().length >= 2;

  // Announce search outcome (only when results land for a stable query).
  useEffect(() => {
    if (isSearching) return;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) return;
    if (searchSummary.totalMatches === 0) {
      setLiveMessage(`No matches found for ${trimmed}.`);
    } else {
      setLiveMessage(
        `${searchSummary.totalMatches} match${searchSummary.totalMatches === 1 ? "" : "es"} on ${searchSummary.pages.length} page${searchSummary.pages.length === 1 ? "" : "s"}.`,
      );
    }
  }, [debouncedQuery, isSearching, searchSummary]);

  const currentMatches = useMemo(
    () =>
      searchSummary.pages.find((p) => p.pageNumber === currentPage)?.matches ?? [],
    [searchSummary, currentPage],
  );

  const handleJumpToSearchResult = useCallback(
    (page: number) => {
      goToPage(page);
      const result = searchSummary.pages.find((p) => p.pageNumber === page);
      const count = result?.matchCount ?? 0;
      setLiveMessage(
        `Jumped to page ${page}, ${count} match${count === 1 ? "" : "es"} on this page.`,
      );
    },
    [goToPage, searchSummary],
  );

  // ── TTS ────────────────────────────────────────────────────────────────────
  const tts = useTts();

  // Translate provider events into live-region announcements.
  useEffect(() => {
    const ev: TtsEvent | null = tts.lastEvent;
    if (!ev) return;
    switch (ev.type) {
      case "start":
        setLiveMessage("Read aloud started.");
        break;
      case "pause":
        setLiveMessage("Read aloud paused.");
        break;
      case "resume":
        setLiveMessage("Read aloud resumed.");
        break;
      case "end":
        setLiveMessage("Read aloud finished.");
        break;
      case "stop":
        setLiveMessage("Read aloud stopped.");
        break;
      case "error":
        setLiveMessage(`Read aloud error: ${ev.message}`);
        break;
    }
  }, [tts.lastEvent]);

  const getSelectedTextFromPage = useCallback((): string => {
    if (typeof window === "undefined") return "";
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return "";
    const container = pageContentRef.current;
    if (!container) return "";
    // Only use the selection if it lives inside the current page content.
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      if (
        container.contains(range.startContainer) &&
        container.contains(range.endContainer)
      ) {
        return sel.toString();
      }
    }
    return "";
  }, []);

  const handleReadAloud = useCallback(() => {
    if (!tts.supported) {
      setLiveMessage("Text-to-speech is not supported in this browser.");
      return;
    }
    const selection = getSelectedTextFromPage().trim();
    const pageText = pages[currentPage - 1]?.content ?? "";
    const target = selection.length > 0 ? selection : pageText;
    if (!target.trim()) {
      setLiveMessage("There is no text to read on this page.");
      return;
    }
    tts.speak(target);
  }, [tts, getSelectedTextFromPage, pages, currentPage]);

  // Cancel speech whenever the page changes — reading aloud always
  // refers to the page that was visible when the user pressed the button.
  useEffect(() => {
    if (tts.state === "speaking" || tts.state === "paused") {
      tts.stop();
    }
    // We intentionally only react to currentPage changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

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
          target.isContentEditable ||
          target.closest('[role="slider"]') ||
          target.closest("[data-flipbook-panel]")
        ) {
          // Still allow Esc handling to reach panel-close logic below.
          if (e.key !== "Escape") return;
        }
      }
      if (shortcutsOpen) return;
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
        if (searchOpen) {
          e.preventDefault();
          setSearchOpen(false);
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
  }, [
    goNext,
    goPrev,
    goToPage,
    totalPages,
    settingsOpen,
    annotationsOpen,
    shortcutsOpen,
    searchOpen,
    closeSettings,
    closeAnnotations,
  ]);

  // Focus the reading page after a flip so screen reader users land on new content
  useEffect(() => {
    if (flipDirection === "none") return;
    const focusDelay = reducedMotion ? 60 : 200;
    const resetDelay = reducedMotion ? 220 : 420;
    const focusId = window.setTimeout(() => {
      pageRef.current?.focus();
    }, focusDelay);
    const resetId = window.setTimeout(() => {
      setFlipDirection("none");
    }, resetDelay);
    return () => {
      window.clearTimeout(focusId);
      window.clearTimeout(resetId);
    };
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
  const themeClass = `flipbook-theme-${settings.theme}`;

  return (
    <div
      className={`${themeClass} flex flex-col h-[calc(100vh-4rem)] min-h-[600px]`}
      style={{ background: "var(--fb-bg)", color: "var(--fb-fg)" }}
      data-testid="flipbook-reader"
      data-theme={settings.theme}
    >
      <header
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ background: "var(--fb-surface)", borderColor: "var(--fb-border)" }}
      >
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
        <span className="text-xs hidden sm:inline" style={{ color: "var(--fb-muted)" }}>
          Flipbook view
        </span>
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
        ttsSupported={tts.supported}
        ttsState={tts.state}
        onReadAloud={handleReadAloud}
        onPauseTts={tts.pause}
        onResumeTts={tts.resume}
        onStopTts={tts.stop}
      />

      {searchOpen && (
        <SearchResultsPanel
          summary={searchSummary}
          query={searchQuery}
          currentPage={currentPage}
          isSearching={isSearching}
          onJumpToPage={handleJumpToSearchResult}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <PageNavigator
        currentPage={currentPage}
        totalPages={totalPages}
        onJumpTo={(p) => goToPage(p)}
        onPrev={goPrev}
        onNext={goNext}
      />

      <div className="flex-1 flex min-h-0">
        <main
          className="flex-1 relative flex items-stretch justify-center p-4 sm:p-6"
          style={{ background: "var(--fb-bg)" }}
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
                typography={settings.typography}
                highlightMatches={currentMatches}
                contentRef={pageContentRef}
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

        <ReaderSettingsPanel
          open={settingsOpen}
          onClose={closeSettings}
          settings={settings}
          onTypographyChange={handleTypographyChange}
          onFontFamilyChange={handleFontFamilyChange}
          onThemeChange={handleThemeChange}
          onPresetChange={handlePresetChange}
          onResetDefaults={handleResetDefaults}
          ttsSupported={tts.supported}
          ttsVoices={tts.voices}
          ttsPrefs={tts.prefs}
          onTtsPrefsChange={tts.setPrefs}
        />
        <AnnotationPanel
          open={annotationsOpen}
          onClose={closeAnnotations}
          bookId={String(book.id)}
          currentPage={currentPage}
          getSelectedText={getSelectedTextFromPage}
          onAnnounce={setLiveMessage}
        />
      </div>

      <KeyboardShortcutHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <LiveStatusRegion message={liveMessage} />
    </div>
  );
}
