"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useAccessibility } from "@/hooks/use-accessibility";
import { useContentAccess } from "@/hooks/use-content-access";
import { useSubscription } from "@/hooks/use-subscription";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useToast } from "@/hooks/use-toast";
import { useAudioContext } from "@/contexts/audio-context";
import { applySensoryClass } from "@/contexts/sensory-audio";
import { localStorageService } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { Footer } from "@/components/footer";
import { MiniPlayer } from "@/components/mini-player";
import { TrialNudge } from "@/components/trial-nudge";
import { hasShownUpsell } from "@/components/engagement-upsell";
import { type CompletionData } from "@/components/completion-certificate";
import { ChevronRight, Home } from "lucide-react";
import { sidebarNavGroups, type SidebarMode } from "@/components/sidebar-nav-config";
import { SelectionProvider, useSelection } from "@/contexts/SelectionContext";
import { useAuthenticatedBootstrap } from "./AuthEffects";
import { useShellVoiceControl } from "./useShellVoiceControl";
import { AppModals } from "./AppModals";

function useBreakpoint(breakpoint: number) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return matches;
}

/**
 * Authenticated user chrome — the wrapper around every `(main)` route.
 * Owns the header, sidebar, breadcrumb, footer, mini-player, plus the
 * shared SelectionContext that lets routes like /player, /reader, /party,
 * and /author read the currently-selected book without prop drilling.
 *
 * Keeps modal state and freemium triggers that previously lived in
 * App.tsx's MainApp component; route content is rendered via `{children}`.
 */
export function MainShell({ children }: { children: ReactNode }) {
  return (
    <SelectionProvider>
      <ShellInner>{children}</ShellInner>
    </SelectionProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const { isAuthenticated } = useAuth();
  const { handleBackToLibrary, handleExpandPlayer, handleSelectBook } = useSelection();
  const { settings: a11ySettings, toggleHighContrast, toggleDarkMode } = useAccessibility();
  const { toast } = useToast();

  useAuthenticatedBootstrap(isAuthenticated);

  // ── Server accessibility preferences ─────────────────────────────────
  const { data: a11yPrefs } = useQuery<{ profile: Record<string, unknown> }>({
    queryKey: ["/api/a11y/preferences"],
  });

  useEffect(() => {
    const reduce = !!a11yPrefs?.profile?.reduceDistractionMode;
    document.documentElement.classList.toggle("reduce-distraction", reduce);
  }, [a11yPrefs?.profile?.reduceDistractionMode]);

  const sensoryMode = !!a11yPrefs?.profile?.sensoryMode;
  useEffect(() => {
    applySensoryClass(document.documentElement, sensoryMode);
  }, [sensoryMode]);

  const sensoryAutoToastShown = useRef(false);
  const sensoryMutation = useMutation({
    mutationFn: (profile: Record<string, unknown>) =>
      apiRequest("PUT", "/api/a11y/preferences", { profile }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/a11y/preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/summary"] });
    },
  });
  useEffect(() => {
    if (!a11yPrefs) return;
    if (sensoryAutoToastShown.current) return;
    if (!isAuthenticated) return;
    const chosen = !!a11yPrefs.profile?.sensoryModeChosen;
    if (chosen) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    sensoryAutoToastShown.current = true;
    sensoryMutation.mutate({ sensoryMode: true, sensoryModeChosen: true });
    toast({
      title: "Low Sensory Mode is on",
      description: "We softened motion and audio peaks based on your system settings. You can change this in Settings.",
      duration: 8000,
    });
  }, [a11yPrefs, isAuthenticated, sensoryMutation, toast]);

  const skipForwardSec = Number(a11yPrefs?.profile?.preferredSkipForward ?? 30);
  const skipBackSec = Number(a11yPrefs?.profile?.preferredSkipBack ?? 30);

  // ── Hub-as-home redirect (once per session) ─────────────────────────
  const router = useRouter();
  useEffect(() => {
    if (!a11yPrefs) return;
    const hubAsHome = a11yPrefs.profile?.hubAsHome !== false;
    const onceKey = "accessibooks-hub-home-redirected";
    if (hubAsHome && pathname === "/" && !sessionStorage.getItem(onceKey)) {
      sessionStorage.setItem(onceKey, "1");
      router.replace("/hub");
    }
  }, [a11yPrefs, pathname, router]);

  // ── Audio + freemium glue ───────────────────────────────────────────
  const {
    currentBook,
    isPlaying,
    togglePlayPause,
    toggleMute,
    skip,
    changeSpeed,
    nextChapter,
    prevChapter,
    onTrackEndCallback,
    adState,
    adLoading,
  } = useAudioContext();
  const {
    showUpgradeModal,
    blockedContent,
    upgradeLimitType,
    dismissUpgradeModal,
    handleUpgrade,
    triggerUpgradeModal,
    isUpgrading,
    showPreview,
    previewBook,
    dismissPreview,
    handlePreviewUpgrade,
  } = useContentAccess();
  const { isPremium, upgradeToPremium } = useSubscription();
  const [engagementUpsell, setEngagementUpsell] = useState<{
    type: "book_complete" | "streak_milestone" | "listening_milestone";
    detail: string;
    open: boolean;
  }>({ type: "book_complete", detail: "", open: false });
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusModeState] = useState(() => !!localStorageService.getSettings().focusMode);

  const toggleFocusMode = useCallback(() => {
    setFocusModeState((prev) => {
      const next = !prev;
      const s = localStorageService.getSettings();
      localStorageService.saveSettings({ ...s, focusMode: next });
      document.documentElement.classList.toggle("focus-mode", next);
      document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as CompletionData;
      if (detail?.bookId) setCompletionData(detail);
    };
    document.addEventListener("accessibooks:book-completed", handler);
    return () => document.removeEventListener("accessibooks:book-completed", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { limitType } = (e as CustomEvent).detail as { limitType: "skip" | "device" | "loan" };
      if (!isPremium) {
        triggerUpgradeModal(limitType, null);
        fetch("/api/notifications/limit-hit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ limitType }),
        }).catch(() => {});
      }
    };
    document.addEventListener("accessibooks:limit-reached", handler);
    return () => document.removeEventListener("accessibooks:limit-reached", handler);
  }, [isPremium, triggerUpgradeModal]);

  useEffect(() => {
    const audioCtx = onTrackEndCallback;
    audioCtx.current = () => {
      if (currentBook) {
        setCompletionData({
          bookId: currentBook.id,
          bookTitle: currentBook.title,
          bookAuthor: currentBook.author,
          bookCover: currentBook.coverImage ?? null,
          contentType: "audiobook",
        });
      }
      if (!isPremium) {
        const title = currentBook?.title || "a book";
        const triggerId = `book_complete_${title.replace(/\s+/g, "_").toLowerCase()}`;
        if (!hasShownUpsell(triggerId)) {
          setEngagementUpsell({ type: "book_complete", detail: title, open: true });
        }
      }
    };
    return () => {
      audioCtx.current = null;
    };
  }, [isPremium, currentBook, onTrackEndCallback]);

  useEffect(() => {
    if (isPremium) return;
    const streak = parseInt(localStorage.getItem("accessibooks_streak") || "0", 10);
    for (const m of [3, 7, 14, 30]) {
      if (streak >= m) {
        const triggerId = `streak_milestone_${m}`;
        if (!hasShownUpsell(triggerId)) {
          setEngagementUpsell({ type: "streak_milestone", detail: String(m), open: true });
          break;
        }
      }
    }
  }, [isPremium]);

  useEffect(() => {
    if (isPremium) return;
    const stats = localStorageService.getStats();
    const completed = stats.booksCompleted || 0;
    const milestones = [5, 10, 25, 50];
    for (let i = milestones.length - 1; i >= 0; i--) {
      const m = milestones[i];
      if (completed >= m) {
        const triggerId = `listening_milestone_${m}`;
        if (!hasShownUpsell(triggerId)) {
          setEngagementUpsell({ type: "listening_milestone", detail: String(m), open: true });
          break;
        }
      }
    }
  }, [isPremium]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  useKeyboardShortcuts({
    onHighContrast: toggleHighContrast,
    onPlayPause: togglePlayPause,
    onSkipBackward: () => skip(-skipBackSec),
    onSkipForward: () => skip(skipForwardSec),
    onSpeedUp: () => changeSpeed(0.25),
    onSpeedDown: () => changeSpeed(-0.25),
    onMute: toggleMute,
    onNextChapter: nextChapter,
    onPrevChapter: prevChapter,
    onBookmark: () => document.dispatchEvent(new CustomEvent("accessibooks:add-bookmark")),
    onOpenShortcuts: () => setShortcutsOpen(true),
    onToggleCaptions: () => document.dispatchEvent(new CustomEvent("accessibooks:toggle-captions")),
    onOpenAccessibility: () => document.dispatchEvent(new CustomEvent("accessibooks:open-accessibility")),
    onToggleTranscript: () => document.dispatchEvent(new CustomEvent("accessibooks:toggle-transcript")),
    onToggleFocusMode: toggleFocusMode,
    isAdLocked: adState.isAdPlaying || adLoading,
  });

  // ── Voice control ───────────────────────────────────────────────────
  const voiceControl = useShellVoiceControl({
    isPlaying,
    togglePlayPause,
    skip,
    nextChapter,
    prevChapter,
    changeSpeed,
    toggleMute,
    toggleHighContrast,
    toggleDarkMode,
    skipForwardSec,
    skipBackSec,
    adLocked: adState.isAdPlaying || adLoading,
    sensoryMutate: (p) => sensoryMutation.mutate(p),
  });

  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    document.addEventListener("accessibooks:open-shortcuts", handler);
    return () => document.removeEventListener("accessibooks:open-shortcuts", handler);
  }, []);

  useEffect(() => {
    const handler = () => setFocusModeState(!!localStorageService.getSettings().focusMode);
    document.addEventListener("accessibooks:settings-changed", handler);
    return () => document.removeEventListener("accessibooks:settings-changed", handler);
  }, []);

  // ── Responsive sidebar mode ─────────────────────────────────────────
  const isMd = useBreakpoint(768);
  const isLg = useBreakpoint(1024);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("full");
  useEffect(() => {
    setSidebarMode(isLg ? "full" : isMd ? "rail" : "full");
  }, [isMd, isLg]);

  const hasMiniPlayer = currentBook !== null;
  const isAtHome = pathname === "/" || pathname === "";
  const currentNavItem = sidebarNavGroups
    .flatMap((g) => g.items)
    .find((i) => (i.path === "/" ? isAtHome : pathname === i.path || pathname.startsWith(i.path + "/")));
  const currentLabel = currentNavItem?.label || "Library";

  return (
    <div className={`min-h-screen bg-background text-foreground flex flex-col${focusMode ? " focus-mode" : ""}`}>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <AppHeader
        sidebarMode={sidebarMode}
        onToggleSidebar={() => {
          if (!isMd) {
            setSidebarMode((prev) => (prev === "hidden" ? "full" : "hidden"));
          } else {
            setSidebarMode((prev) => (prev === "full" ? "rail" : prev === "rail" ? "hidden" : "full"));
          }
        }}
      />

      <div className="flex flex-1 min-h-0">
        <AppSidebar
          mode={sidebarMode}
          onCloseDrawer={() => setSidebarMode(isMd ? "rail" : "full")}
        />

        <div className={`flex-1 flex flex-col min-w-0 ${hasMiniPlayer ? "pb-20" : ""}`}>
          <nav className="bg-muted/50 border-b shrink-0" aria-label="Breadcrumb">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
              <ol className="flex items-center space-x-2 text-sm">
                <li>
                  <button
                    onClick={handleBackToLibrary}
                    className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    <span className="text-xs font-medium">Home</span>
                  </button>
                </li>
                <li className="flex items-center">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </li>
                <li>
                  <button
                    onClick={handleBackToLibrary}
                    className={`${isAtHome ? "text-foreground font-medium" : "text-muted-foreground hover:text-primary"} transition-colors`}
                    aria-current={isAtHome ? "page" : undefined}
                  >
                    Library
                  </button>
                </li>
                {!isAtHome && (
                  <>
                    <li className="flex items-center">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </li>
                    <li>
                      <span
                        className="text-foreground font-medium truncate max-w-[200px] inline-block"
                        aria-current="page"
                      >
                        {currentLabel}
                      </span>
                    </li>
                  </>
                )}
              </ol>
            </div>
          </nav>

          <main className="flex-1" id="main-content" role="main">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <TrialNudge
                listeningHours={localStorageService.getStats().totalSecondsListened / 3600}
                isPremium={isPremium}
                onStartTrial={() => upgradeToPremium("monthly")}
              />
              {children}
            </div>
          </main>

          <Footer />
        </div>
      </div>

      <div id="a11y-announcements" className="sr-live-region" aria-live="polite" aria-atomic="true" role="status" />

      <MiniPlayer onExpand={handleExpandPlayer} />

      <AppModals
        showPreview={showPreview}
        previewBook={previewBook}
        dismissPreview={dismissPreview}
        handlePreviewUpgrade={handlePreviewUpgrade}
        showUpgradeModal={showUpgradeModal}
        dismissUpgradeModal={dismissUpgradeModal}
        blockedContent={blockedContent}
        handleUpgrade={handleUpgrade}
        isUpgrading={isUpgrading}
        upgradeLimitType={upgradeLimitType}
        engagementUpsell={engagementUpsell}
        setEngagementUpsell={setEngagementUpsell}
        upgradeToPremium={upgradeToPremium}
        completionData={completionData}
        setCompletionData={setCompletionData}
        onSelectBookFromCompletion={handleSelectBook}
        voiceControlEnabled={!!a11ySettings.voiceControlEnabled}
        voiceControl={voiceControl}
        shortcutsOpen={shortcutsOpen}
        setShortcutsOpen={setShortcutsOpen}
      />
    </div>
  );
}
