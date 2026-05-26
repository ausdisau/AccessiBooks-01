import { useState, useEffect, useRef, lazy, Suspense, useMemo, useCallback, memo } from "react";
import { Route, Switch, Link, useLocation, useRoute, Router } from "wouter";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AccessibilityControls } from "@/components/accessibility-controls";
import { AccessiBooksLogo } from "@/components/accessibooks-logo";
import { useAuth } from "@/hooks/useAuth";
import { Library } from "@/pages/library";
import { Player } from "@/pages/player";
import { PricingPage } from "@/pages/pricing";
import { Book } from "@shared/schema";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useAccessibility } from "@/hooks/use-accessibility";
import { useVoiceControl, type VoiceCommand } from "@/hooks/use-voice-control";
import { VoiceControlButton } from "@/components/voice-control-button";
import { useContentAccess } from "@/hooks/use-content-access";
import { PremiumUpgradeModal } from "@/components/premium-upgrade-modal";
import { PremiumPreviewPlayer } from "@/components/premium-preview-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Book as BookIcon, Play, Pause, LogOut, User, Loader2, Mail, Lock, Eye, EyeOff, Crown, Settings, Settings2, Headphones, Accessibility, BookOpen, Star, Bookmark, Volume2, Menu, X, ChevronRight, Home, CreditCard, Phone, Shield, Users, Clock, TrendingUp, Gift, Upload, Radio, Search, MessageCircle, Focus, Zap, HeartHandshake } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { AudioProvider } from "@/contexts/AudioContext";
import { useAudioContext } from "@/contexts/audio-context";
import { EbookProvider } from "@/contexts/EbookProvider";
import { AudioAdOverlay } from "@/components/audio-ad-overlay";
import { MiniPlayer } from "@/components/mini-player";
import { PremiumBadge } from "@/components/premium-badge";
import { PlanBadge } from "@/components/plan-badge";
import { SubscriptionCard } from "@/components/subscription-card";
import { AccessibilityWidget } from "@/components/accessibility-widget";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SocialFeed } from "@/components/social-feed";
import { LandingCarousel } from "@/components/book-carousel";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { AccessibilityCoachPanel } from "@/components/accessibility-coach-panel";
import { SignUpPrompt } from "@/components/sign-up-prompt";
import { KeyboardShortcutsOverlay } from "@/components/keyboard-shortcuts-overlay";
import { WelcomeBonusModal } from "@/components/welcome-bonus-modal";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { ShareButton } from "@/components/share-button";
import { NotificationCenter } from "@/components/notification-center";
import { Footer } from "@/components/footer";
import { BrandLandingPage } from "@/pages/landing";
import HandsFreeSignIn from "@/pages/hands-free-sign-in";
import { useCuratedPlaylists } from "@/hooks/use-playlists";
import { useSubscription } from "@/hooks/use-subscription";
import { EngagementUpsell, hasShownUpsell } from "@/components/engagement-upsell";
import { CompletionModal, type CompletionData } from "@/components/completion-certificate";
import { TrialNudge } from "@/components/trial-nudge";
import { localStorageService } from "@/lib/storage";
import type { AccessibilitySettings } from "@/lib/storage";
import { applySensoryClass } from "@/contexts/sensory-audio";
import { Music2, BookOpen as BookOpenIcon, Trophy, ListMusic, Megaphone, Wallet, BarChart3, Download as DownloadIcon, Heart, Building2, Activity, LibraryBig, GraduationCap } from "lucide-react";

const EbookReader = lazy(() => import('@/components/ebook-reader').then(m => ({ default: m.EbookReader })));
const AuthorPage = lazy(() => import('@/components/author-page').then(m => ({ default: m.AuthorPage })));
const GamificationDashboard = lazy(() => import('@/components/gamification-dashboard').then(m => ({ default: m.GamificationDashboard })));
const YearInReview = lazy(() => import('./components/year-in-review').then(m => ({ default: m.YearInReview })));
const ReferralSection = lazy(() => import('@/components/referral-section').then(m => ({ default: m.ReferralSection })));
const ReferralsPage = lazy(() => import('@/pages/referrals').then(m => ({ default: m.ReferralsPage })));
const AuthorDashboard = lazy(() => import('@/components/author-dashboard').then(m => ({ default: m.AuthorDashboard })));
const ListeningParty = lazy(() => import('@/components/listening-party').then(m => ({ default: m.ListeningParty })));
const StreamingQueue = lazy(() => import('@/components/streaming-queue').then(m => ({ default: m.StreamingQueue })));
const AudioAdvertiserDashboard = lazy(() => import('@/components/advertiser-dashboard').then(m => ({ default: m.AdvertiserDashboard })));
const BillingDashboard = lazy(() => import('@/components/billing-dashboard').then(m => ({ default: m.BillingDashboard })));
const UsageDashboard = lazy(() => import('@/components/usage-dashboard').then(m => ({ default: m.UsageDashboard })));
const OfflineDownloads = lazy(() => import('@/components/offline-downloads').then(m => ({ default: m.OfflineDownloads })));
const MyLoans = lazy(() => import('@/components/my-loans'));
const EnterprisePage = lazy(() => import('@/pages/enterprise'));
const AdminModerationPage = lazy(() => import('@/pages/admin-moderation'));
const AdminRevenuePage = lazy(() => import('@/pages/admin-revenue'));
const SocialHub = lazy(() => import('@/components/social-hub').then(m => ({ default: m.SocialHub })));
const FamilyPlan = lazy(() => import('@/components/family-plan').then(m => ({ default: m.FamilyPlan })));
const AdminHealthDashboard = lazy(() => import('@/components/admin-health').then(m => ({ default: m.AdminHealthDashboard })));
const ChurnDashboard = lazy(() => import('@/components/churn-dashboard').then(m => ({ default: m.ChurnDashboard })));
const TrustPage = lazy(() => import('@/pages/trust'));
const InstitutionalPage = lazy(() => import('@/pages/institutional'));
const MoatDashboard = lazy(() => import('@/pages/moat-dashboard'));
const AccessiblePicksPage = lazy(() => import('@/pages/accessible-picks'));
const AdPlatformLanding = lazy(() => import('@/pages/ad-platform/landing'));
const AdvertiserDashboard = lazy(() => import('@/pages/ad-platform/advertiser-dashboard'));
const PublisherDashboard = lazy(() => import('@/pages/ad-platform/publisher-dashboard'));
const AdminPlatformDashboard = lazy(() => import('@/pages/ad-platform/admin-dashboard'));
const SlotDetailPage = lazy(() => import('@/pages/ad-platform/slot-detail'));
const DemoSlotPage = lazy(() => import('@/pages/ad-platform/demo-slot'));
const ClipViewPage = lazy(() => import('@/pages/clip-view'));
const WordBankPage = lazy(() => import('@/pages/word-bank').then(m => ({ default: m.WordBankPage })));
const AchievementsPage = lazy(() => import('@/components/completion-certificate').then(m => ({ default: m.AchievementsPage })));
// Engagement & monetization system (Task #64)
const HubPage = lazy(() => import('@/pages/hub'));
const CommunityPage = lazy(() => import('@/pages/community'));
const EventsPage = lazy(() => import('@/pages/events'));
const AccountSettingsPage = lazy(() => import('@/pages/account-settings').then(m => ({ default: m.AccountSettingsPage })));
const MyActivityPage = lazy(() => import('@/pages/my-activity'));
const AdminAnalyticsPage = lazy(() => import('@/pages/admin-analytics'));
const AdminEntitlementsPage = lazy(() => import('@/pages/admin-entitlements'));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}


// Extracted to standalone modules (see Next.js App Router port)
import { sidebarNavGroups, type SidebarMode } from "@/components/sidebar-nav-config";
import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { LoginModal } from "@/components/LoginModal";
import { LandingPage } from "@/components/LandingHelpers";


function useBreakpoint(breakpoint: number) {
  const [matches, setMatches] = useState(() => window.innerWidth >= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return matches;
}

function MainApp() {
  const [location, navigate] = useLocation();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const isMd = useBreakpoint(768);
  const isLg = useBreakpoint(1024);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    if (window.innerWidth >= 1024) return "full";
    if (window.innerWidth >= 768) return "rail";
    return "full";
  });
  const { settings: a11ySettings, toggleHighContrast, toggleDarkMode } = useAccessibility();
  const { isAuthenticated: mainAppIsAuthenticated } = useAuth();

  // Apply reduceDistractionMode class from server preferences
  const { data: a11yPrefs } = useQuery<{ profile: Record<string, unknown> }>({
    queryKey: ["/api/a11y/preferences"],
  });
  useEffect(() => {
    const reduce = !!(a11yPrefs?.profile?.reduceDistractionMode);
    document.documentElement.classList.toggle("reduce-distraction", reduce);
  }, [a11yPrefs?.profile?.reduceDistractionMode]);

  // ─── Sensory Regulation Mode (Task #65) ────────────────────────────
  // Toggles the .sensory-mode class on <html> from server preferences,
  // and on first load (when the user has not explicitly chosen yet)
  // mirrors the OS-level prefers-reduced-motion setting with a
  // dismissible toast notice.
  const sensoryMode = !!a11yPrefs?.profile?.sensoryMode;
  useEffect(() => {
    // applySensoryClass lives in a separate module so it can be unit-tested
    // against a mocked HTMLElement (see tests/sensory-mode.test.ts).
    applySensoryClass(document.documentElement, sensoryMode);
  }, [sensoryMode]);

  const sensoryAutoToastShown = useRef(false);
  const { toast: sensoryToast } = useToast();
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
    // Only persist for authenticated users — guests would hit a 401 from
    // PUT /api/a11y/preferences and the toast would feel like a broken
    // experience. They still get the OS-level reduced-motion respect from
    // the existing CSS @media rules.
    if (!mainAppIsAuthenticated) return;
    const chosen = !!a11yPrefs.profile?.sensoryModeChosen;
    if (chosen) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReduced) return;
    sensoryAutoToastShown.current = true;
    // Auto-enable + persist; the user can disable from Settings.
    sensoryMutation.mutate({ sensoryMode: true, sensoryModeChosen: true });
    sensoryToast({
      title: "Low Sensory Mode is on",
      description:
        "We softened motion and audio peaks based on your system settings. You can change this in Settings.",
      duration: 8000,
    });
  }, [a11yPrefs, mainAppIsAuthenticated, sensoryMutation, sensoryToast]);

  const skipForwardSec = Number(a11yPrefs?.profile?.preferredSkipForward ?? 30);
  const skipBackSec = Number(a11yPrefs?.profile?.preferredSkipBack ?? 30);

  // Hub-as-home (Task #64): when the user opts in (default for new accounts),
  // the root path lands on the engagement Hub. Disable via Settings → Calm Mode.
  useEffect(() => {
    if (!a11yPrefs) return;
    const hubAsHome = a11yPrefs.profile?.hubAsHome !== false;
    const onceKey = "accessibooks-hub-home-redirected";
    if (hubAsHome && location === "/" && !sessionStorage.getItem(onceKey)) {
      sessionStorage.setItem(onceKey, "1");
      navigate("/hub");
    }
  }, [a11yPrefs, location, navigate]);

  const { currentBook, isPlaying, playBook, togglePlayPause, toggleMute, skip, changeSpeed, nextChapter, prevChapter, onTrackEndCallback, adState, adLoading } = useAudioContext();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusModeState] = useState(() => !!localStorageService.getSettings().focusMode);
  const { toast } = useToast();

  const toggleFocusMode = useCallback(() => {
    setFocusModeState((prev) => {
      const next = !prev;
      const s = localStorageService.getSettings();
      const updated = { ...s, focusMode: next };
      localStorageService.saveSettings(updated);
      document.documentElement.classList.toggle("focus-mode", next);
      document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
      return next;
    });
  }, []);
  const { 
    checkAccess, 
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
  const [engagementUpsell, setEngagementUpsell] = useState<{ type: "book_complete" | "streak_milestone" | "listening_milestone"; detail: string; open: boolean }>({ type: "book_complete", detail: "", open: false });
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);

  // Listen for book completion events dispatched by ebook reader
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as CompletionData;
      if (detail?.bookId) setCompletionData(detail);
    };
    document.addEventListener("accessibooks:book-completed", handler);
    return () => document.removeEventListener("accessibooks:book-completed", handler);
  }, []);

  // Listen for freemium limit events (skip/device/loan) and show contextual upgrade modal
  useEffect(() => {
    const handler = (e: Event) => {
      const { limitType } = (e as CustomEvent).detail as { limitType: "skip" | "device" | "loan" };
      if (!isPremium) {
        triggerUpgradeModal(limitType, null);
        // Fire-and-forget triggered upgrade email; server enforces 24h dedup,
        // free-tier-only, and silently no-ops on missing email/SMTP.
        fetch("/api/notifications/limit-hit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ limitType }),
        }).catch(() => { /* non-blocking */ });
      }
    };
    document.addEventListener("accessibooks:limit-reached", handler);
    return () => document.removeEventListener("accessibooks:limit-reached", handler);
  }, [isPremium, triggerUpgradeModal]);

  // Fire completion + optional upsell when audiobook track ends
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
    return () => { audioCtx.current = null; };
  }, [isPremium, currentBook]);

  useEffect(() => {
    if (isPremium) return;
    const streak = parseInt(localStorage.getItem("accessibooks_streak") || "0", 10);
    const milestones = [3, 7, 14, 30];
    for (const m of milestones) {
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
    const listeningMilestones = [5, 10, 25, 50];
    for (let i = listeningMilestones.length - 1; i >= 0; i--) {
      const m = listeningMilestones[i];
      if (completed >= m) {
        const triggerId = `listening_milestone_${m}`;
        if (!hasShownUpsell(triggerId)) {
          setEngagementUpsell({ type: "listening_milestone", detail: String(m), open: true });
          break;
        }
      }
    }
  }, [isPremium]);

  const handleSelectBook = useCallback((book: Book) => {
    if (!checkAccess(book)) {
      return;
    }
    setSelectedBook(book);
    
    const contentType = book.contentType || "audiobook";
    if (contentType === "ebook" || contentType === "magazine") {
      navigate("/reader");
    } else {
      playBook(book);
      navigate("/player");
      const shortcutTipShown = localStorage.getItem("accessibooks_shortcut_tip_shown");
      if (!shortcutTipShown) {
        localStorage.setItem("accessibooks_shortcut_tip_shown", "true");
        setTimeout(() => {
          toast({
            title: "Tip: Press ? for shortcuts",
            description: "Press ? anywhere to see keyboard shortcuts.",
            duration: 6000,
          });
        }, 1500);
      }
    }
  }, [checkAccess, playBook, navigate, toast]);

  const handleBackToLibrary = useCallback(() => {
    navigate("/");
  }, [navigate]);
  
  const handleExpandPlayer = useCallback(() => {
    if (currentBook) {
      setSelectedBook(currentBook);
      navigate("/player");
    }
  }, [currentBook, navigate]);

  const handleViewAuthor = useCallback((authorName: string) => {
    navigate(`/author/${encodeURIComponent(authorName)}`);
  }, [navigate]);

  const handleViewFeed = useCallback(() => {
    navigate("/feed");
  }, [navigate]);

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

  const stopListeningRef = useRef<() => void>(() => {});

  // Audible confirmation for voice intents (Task #68). Pairs the visible
  // toast with a short spoken acknowledgement via the Web Speech API so
  // hands-free / low-vision users get immediate feedback that the command
  // was understood. Silently no-ops when speech synthesis is unavailable.
  const speakConfirmation = useCallback((message: string) => {
    try {
      const synth =
        typeof window !== "undefined" && "speechSynthesis" in window
          ? window.speechSynthesis
          : null;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(message);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      synth.speak(u);
    } catch {
      // Speech synthesis is best-effort; the toast still confirms visually.
    }
  }, []);

  const voiceCommands = useMemo<VoiceCommand[]>(() => [
    {
      patterns: ["stop", "stop listening", "cancel", "never mind"],
      handler: () => stopListeningRef.current(),
      description: "Stop listening",
    },
    {
      patterns: ["play", "resume", "start"],
      handler: () => { if (!isPlaying) togglePlayPause(); },
      description: "Play / resume audio",
    },
    {
      patterns: ["pause", "stop playing"],
      handler: () => { if (isPlaying) togglePlayPause(); },
      description: "Pause audio",
    },
    {
      patterns: ["skip forward", "forward", "skip ahead", "fast forward"],
      handler: () => {
        if (adState.isAdPlaying || adLoading) return;
        skip(skipForwardSec);
      },
      description: `Skip forward ${skipForwardSec}s`,
    },
    {
      patterns: ["skip back", "skip backward", "go back", "rewind"],
      handler: () => {
        if (adState.isAdPlaying || adLoading) return;
        skip(-skipBackSec);
      },
      description: `Skip back ${skipBackSec}s`,
    },
    {
      patterns: ["next chapter", "next"],
      handler: () => {
        if (adState.isAdPlaying || adLoading) return;
        nextChapter();
      },
      description: "Next chapter",
    },
    {
      patterns: ["previous chapter", "previous", "last chapter", "go back chapter"],
      handler: () => {
        if (adState.isAdPlaying || adLoading) return;
        prevChapter();
      },
      description: "Previous chapter",
    },
    {
      patterns: ["speed up", "faster", "increase speed"],
      handler: () => changeSpeed(0.25),
      description: "Increase playback speed",
    },
    {
      patterns: ["slow down", "slower", "decrease speed", "speed down"],
      handler: () => changeSpeed(-0.25),
      description: "Decrease playback speed",
    },
    {
      patterns: ["mute", "silence", "quiet"],
      handler: () => toggleMute(),
      description: "Mute / unmute",
    },
    {
      patterns: ["bookmark", "add bookmark", "save position"],
      handler: () => document.dispatchEvent(new CustomEvent("accessibooks:add-bookmark")),
      description: "Add bookmark",
    },
    {
      patterns: ["toggle captions", "captions", "subtitles"],
      handler: () => document.dispatchEvent(new CustomEvent("accessibooks:toggle-captions")),
      description: "Toggle captions",
    },
    {
      patterns: ["high contrast", "contrast"],
      handler: () => toggleHighContrast(),
      description: "Toggle high contrast",
    },
    {
      patterns: ["dark mode", "dark theme", "night mode"],
      handler: () => toggleDarkMode(),
      description: "Toggle dark mode",
    },
    {
      patterns: ["go to library", "go home", "library", "home"],
      handler: () => navigate("/"),
      description: "Navigate to library",
    },
    {
      patterns: ["go to player", "player", "open player"],
      handler: () => navigate("/player"),
      description: "Navigate to player",
    },
    {
      patterns: [/^search\s+(.+)$/],
      handler: (arg?: string) => {
        if (arg) {
          const searchInput = document.querySelector<HTMLInputElement>('[data-testid="main-search-input"]');
          if (searchInput) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            nativeInputValueSetter?.call(searchInput, arg);
            searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            searchInput.focus();
          }
        }
      },
      description: "Search for a book by name",
    },
    {
      patterns: ["explain this", "explain this passage", "what does this mean", "what's happening"],
      handler: () => {
        document.dispatchEvent(
          new CustomEvent("accessibooks:open-coach", {
            detail: { message: "Explain what I'm currently listening to in simple terms." },
          }),
        );
        toast({
          title: "Asking the coach",
          description: "Opening your Accessibility Coach to explain this passage.",
          duration: 2500,
        });
        speakConfirmation("Asking your coach to explain this passage.");
      },
      description: "Ask the coach to explain the current passage",
    },
    {
      patterns: ["find easier books", "easier books", "find easy books", "show me easier books"],
      handler: () => {
        // Navigate to the library and surface the Easy Read shelf, which is
        // backed by /api/books/easy-read (reading levels 1 & 2). We use a
        // hash + a short delayed scroll so the shelf has time to mount.
        navigate("/");
        const focusShelf = () => {
          const el = document.getElementById("easy-read-shelf");
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            (el as HTMLElement).focus({ preventScroll: true });
            return true;
          }
          return false;
        };
        if (!focusShelf()) {
          let attempts = 0;
          const interval = window.setInterval(() => {
            attempts += 1;
            if (focusShelf() || attempts > 20) window.clearInterval(interval);
          }, 150);
        }
        toast({
          title: "Showing easier books",
          description: "Jumped to the Easy Read catalog — reading levels 1 & 2.",
          duration: 2500,
        });
        speakConfirmation("Showing easier books from the Easy Read catalog.");
      },
      description: "Show easier books from the Easy Read catalog",
    },
    {
      patterns: [
        "enable low sensory mode",
        "low sensory mode",
        "enable sensory mode",
        "turn on low sensory mode",
        "turn on sensory mode",
      ],
      handler: () => {
        sensoryMutation.mutate({ sensoryMode: true, sensoryModeChosen: true });
        toast({
          title: "Low Sensory Mode is on",
          description: "Softened motion and audio peaks. Disable any time from Settings.",
          duration: 3000,
        });
        speakConfirmation("Low Sensory Mode is on.");
      },
      description: "Turn on Low Sensory Mode",
    },
  ], [isPlaying, togglePlayPause, skip, nextChapter, prevChapter, changeSpeed, toggleMute, toggleHighContrast, toggleDarkMode, navigate, sensoryMutation, toast, speakConfirmation, adState.isAdPlaying, adLoading, skipForwardSec, skipBackSec]);

  const voiceControl = useVoiceControl({
    commands: voiceCommands,
    onNoMatch: (transcript) => {
      toast({
        title: "Command not understood",
        description: `Heard: "${transcript}" — try "play", "pause", "search [title]", or "go to library"`,
        duration: 3000,
      });
    },
  });

  useEffect(() => {
    stopListeningRef.current = voiceControl.stopListening;
  }, [voiceControl.stopListening]);

  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    document.addEventListener("accessibooks:open-shortcuts", handler);
    return () => document.removeEventListener("accessibooks:open-shortcuts", handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      setFocusModeState(!!localStorageService.getSettings().focusMode);
    };
    document.addEventListener("accessibooks:settings-changed", handler);
    return () => document.removeEventListener("accessibooks:settings-changed", handler);
  }, []);

  const hasMiniPlayer = currentBook !== null;

  const isAtHome = location === "/" || location === "";
  const currentNavItem = sidebarNavGroups.flatMap(g => g.items).find(i => {
    if (i.path === "/") return isAtHome;
    return location === i.path || location.startsWith(i.path + "/");
  });
  const currentLabel = currentNavItem?.label || "Library";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <AppHeader 
        sidebarMode={sidebarMode}
        onToggleSidebar={() => {
          if (!isMd) {
            setSidebarMode(prev => prev === "hidden" ? "full" : "hidden");
          } else {
            // Tablet/desktop: full strict 3-state cycle full → rail → hidden → full
            setSidebarMode(prev => {
              if (prev === "full") return "rail";
              if (prev === "rail") return "hidden";
              return "full";
            });
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
                      <span className="text-foreground font-medium truncate max-w-[200px] inline-block" aria-current="page">
                        {(location === "/player" || location === "/reader") && selectedBook
                          ? selectedBook.title
                          : currentLabel}
                      </span>
                    </li>
                  </>
                )}
              </ol>
            </div>
          </nav>

          <main 
            id="main-content" 
            className="flex-1 overflow-y-auto app-shell-bg"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <TrialNudge
                listeningHours={localStorageService.getStats().totalSecondsListened / 3600}
                isPremium={isPremium}
                onStartTrial={() => upgradeToPremium("monthly")}
              />
              <Switch>
                <Route path="/">
                  <div id="library-panel" role="region" aria-label="Library" data-testid="panel-library">
                    <Library onSelectBook={handleSelectBook} />
                  </div>
                </Route>
                <Route path="/player">
                  <div id="player-panel" role="region" aria-label="Player" data-testid="panel-player">
                    <Player book={selectedBook || currentBook} onBackToLibrary={handleBackToLibrary} onViewAuthor={handleViewAuthor} />
                  </div>
                </Route>
                <Route path="/reader">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="reader-panel" role="region" aria-label="Reader" data-testid="panel-reader">
                      {selectedBook ? <EbookReader book={selectedBook} onBack={handleBackToLibrary} /> : <Library onSelectBook={handleSelectBook} />}
                    </div>
                  </Suspense>
                </Route>
                <Route path="/author/:name">
                  {(params) => (
                    <Suspense fallback={<LoadingSpinner />}>
                      <div id="author-panel" role="region" aria-label="Author" data-testid="panel-author">
                        <AuthorPage authorName={decodeURIComponent(params.name)} onBack={handleBackToLibrary} />
                      </div>
                    </Suspense>
                  )}
                </Route>
                <Route path="/feed">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="feed-panel" role="region" aria-label="Social Feed" data-testid="panel-feed">
                      <SocialFeed />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/stats">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="stats-panel" role="region" aria-label="Statistics" data-testid="panel-stats" className="space-y-8">
                      <GamificationDashboard />
                      <AchievementsPage />
                      <YearInReview />
                      <ReferralSection />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/usage">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="usage-panel" role="region" aria-label="Usage" data-testid="panel-usage">
                      <UsageDashboard isPremium={isPremium} onUpgrade={() => upgradeToPremium("monthly")} />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/publish">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="publish-panel" role="region" aria-label="Publish" data-testid="panel-publish">
                      <AuthorDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/party">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="party-panel" role="region" aria-label="Listening Party" data-testid="panel-party">
                      <ListeningParty
                        book={selectedBook || currentBook}
                        onBack={handleBackToLibrary}
                        eventId={typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("event") : null}
                      />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/queue">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="queue-panel" role="region" aria-label="Queue" data-testid="panel-queue">
                      <StreamingQueue onBack={handleBackToLibrary} />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/advertise">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="advertise-panel" role="region" aria-label="Advertise" data-testid="panel-advertise">
                      <AudioAdvertiserDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/pricing">
                  <div id="pricing-panel" role="region" aria-label="Pricing" data-testid="panel-pricing">
                    <PricingPage />
                  </div>
                </Route>
                <Route path="/billing">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="billing-panel" role="region" aria-label="Billing" data-testid="panel-billing">
                      <BillingDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/downloads">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="downloads-panel" role="region" aria-label="Downloads" data-testid="panel-downloads">
                      <OfflineDownloads />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/loans">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="loans-panel" role="region" aria-label="Loans" data-testid="panel-loans">
                      <MyLoans onSelectBook={handleSelectBook} />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/referrals">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="referrals-panel" role="region" aria-label="Referrals" data-testid="panel-referrals">
                      <ReferralsPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/social">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="social-panel" role="region" aria-label="Social Hub" data-testid="panel-social">
                      <SocialHub />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/family">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="family-panel" role="region" aria-label="Family Plan" data-testid="panel-family">
                      <FamilyPlan />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/enterprise">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="enterprise-panel" role="region" aria-label="Enterprise" data-testid="panel-enterprise">
                      <EnterprisePage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/moderation">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="moderation-panel" role="region" aria-label="Moderation" data-testid="panel-moderation">
                      <AdminModerationPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/admin/revenue">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="admin-revenue-panel" role="region" aria-label="Admin Revenue" data-testid="panel-admin-revenue">
                      <AdminRevenuePage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/health">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="health-panel" role="region" aria-label="Admin Health" data-testid="panel-health" className="space-y-8">
                      <AdminHealthDashboard />
                      <ChurnDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/analytics">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="analytics-panel" role="region" aria-label="Analytics Dashboard" data-testid="panel-analytics">
                      <AdminAnalyticsPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/admin/entitlements">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="admin-entitlements-panel" role="region" aria-label="Tier Entitlements" data-testid="panel-admin-entitlements">
                      <AdminEntitlementsPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/trust">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="trust-panel" role="region" aria-label="Trust & Safety" data-testid="panel-trust">
                      <TrustPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/institutional">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="institutional-panel" role="region" aria-label="Institutional" data-testid="panel-institutional">
                      <InstitutionalPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/moat-metrics">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="moat-metrics-panel" role="region" aria-label="Moat Metrics" data-testid="panel-moat-metrics">
                      <MoatDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/accessible-picks">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="accessible-picks-panel" role="region" aria-label="Accessible Picks" data-testid="panel-accessible-picks">
                      <AccessiblePicksPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/word-bank">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="word-bank-panel" role="region" aria-label="Word Bank" data-testid="panel-word-bank">
                      <WordBankPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/achievements">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="achievements-panel" role="region" aria-label="Achievements" data-testid="panel-achievements">
                      <AchievementsPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/settings">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="settings-panel" role="region" aria-label="Account Settings" data-testid="panel-settings">
                      <AccountSettingsPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/activity">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="activity-panel" role="region" aria-label="My Activity" data-testid="panel-activity">
                      <MyActivityPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/hub">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="hub-panel" role="region" aria-label="Engagement Hub" data-testid="panel-hub">
                      <HubPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/community">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="community-panel" role="region" aria-label="Community Bulletin" data-testid="panel-community">
                      <CommunityPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/events/:id">
                  {(params) => (
                    <Suspense fallback={<LoadingSpinner />}>
                      <div id="events-panel" role="region" aria-label="Live Event" data-testid="panel-events">
                        <EventsPage focusEventId={params.id} />
                      </div>
                    </Suspense>
                  )}
                </Route>
                <Route path="/events">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="events-panel" role="region" aria-label="Live Events" data-testid="panel-events">
                      <EventsPage />
                    </div>
                  </Suspense>
                </Route>
                <Route>
                  <div id="library-panel" role="region" aria-label="Library" data-testid="panel-library">
                    <Library onSelectBook={handleSelectBook} />
                  </div>
                </Route>
              </Switch>
            </div>
          </main>

          <Footer />
        </div>
      </div>

      <div id="a11y-announcements" className="sr-live-region" aria-live="polite" aria-atomic="true" role="status" />
      
      <MiniPlayer onExpand={handleExpandPlayer} />

      {showPreview && previewBook && (
        <PremiumPreviewPlayer
          book={previewBook}
          onUpgrade={handlePreviewUpgrade}
          onDismiss={dismissPreview}
        />
      )}

      <PremiumUpgradeModal
        open={showUpgradeModal}
        onOpenChange={dismissUpgradeModal}
        book={blockedContent}
        onUpgrade={handleUpgrade}
        isUpgrading={isUpgrading}
        limitType={upgradeLimitType}
      />

      <EngagementUpsell
        type={engagementUpsell.type}
        detail={engagementUpsell.detail}
        open={engagementUpsell.open}
        onOpenChange={(open) => setEngagementUpsell(prev => ({ ...prev, open }))}
        onUpgrade={(plan) => { setEngagementUpsell(prev => ({ ...prev, open: false })); upgradeToPremium(plan || "monthly"); }}
      />

      <CompletionModal
        data={completionData}
        onClose={() => setCompletionData(null)}
        onSelectBook={async (bookId) => {
          setCompletionData(null);
          const cached = (queryClient.getQueryData<{ data: Book[] }>(["/api/books"])?.data ?? []).find(b => b.id === bookId);
          if (cached) {
            handleSelectBook(cached);
          } else {
            try {
              const res = await fetch(`/api/books/${bookId}`);
              if (res.ok) {
                const book: Book = await res.json();
                handleSelectBook(book);
              }
            } catch {
            }
          }
        }}
      />

      {a11ySettings.voiceControlEnabled && voiceControl.isSupported && (
        <VoiceControlButton voiceControl={voiceControl} />
      )}

      <KeyboardShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function GuestBrowseApp({ onExitGuest }: { onExitGuest: () => void }) {
  const [signUpPromptOpen, setSignUpPromptOpen] = useState(false);
  const [signUpAction, setSignUpAction] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const { toggleHighContrast } = useAccessibility();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const toggleFocusMode = useCallback(() => {
    const s = localStorageService.getSettings();
    const next = !s.focusMode;
    localStorageService.saveSettings({ ...s, focusMode: next });
    document.documentElement.classList.toggle("focus-mode", next);
    document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
  }, []);

  useKeyboardShortcuts({
    onHighContrast: toggleHighContrast,
    onOpenShortcuts: () => setShortcutsOpen(true),
    onToggleFocusMode: toggleFocusMode,
  });

  const promptSignUp = (action: string) => {
    setSignUpAction(action);
    setSignUpPromptOpen(true);
  };

  const handleGuestSelectBook = (book: Book) => {
    promptSignUp("listen to books and save your progress");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <header className="bg-card border-b border-border" role="banner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <AccessiBooksLogo />
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <SearchAutocomplete onSelectBook={handleGuestSelectBook} />
            </div>
            <div className="flex items-center space-x-4">
              <AccessibilityControls />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCoachOpen(true)}
                aria-label="Open Accessibility Coach"
                data-testid="button-accessibility-coach"
                className="p-2 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                title="Accessibility Coach"
              >
                <HeartHandshake className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChatOpen(true)}
                aria-label="Open AI chat assistant"
                data-testid="button-ai-chat"
                className="p-2"
                title="AI Assistant"
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
              <Button variant="ghost" onClick={() => { setIsRegistering(false); setLoginOpen(true); }}>
                Sign In
              </Button>
              <Button onClick={() => { setIsRegistering(true); setLoginOpen(true); }}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>
      <AiChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      <AccessibilityCoachPanel isOpen={coachOpen} onClose={() => setCoachOpen(false)} />

      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Gift className="h-4 w-4 text-primary" />
            <span>Sign up today and get <strong>250 XP bonus</strong>, a welcome badge, and a <strong>7-day free premium trial</strong>!</span>
          </div>
          <Button size="sm" onClick={() => { setIsRegistering(true); setLoginOpen(true); }}>
            Claim Now
          </Button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" id="main-content">
        <Library onSelectBook={handleGuestSelectBook} />
      </main>

      <Footer />

      <SignUpPrompt
        open={signUpPromptOpen}
        onOpenChange={setSignUpPromptOpen}
        action={signUpAction}
        onSignUp={() => { setSignUpPromptOpen(false); setIsRegistering(true); setLoginOpen(true); }}
        onSignIn={() => { setSignUpPromptOpen(false); setIsRegistering(false); setLoginOpen(true); }}
      />

      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        isRegistering={isRegistering}
        setIsRegistering={setIsRegistering}
      />

      <KeyboardShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function App() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { toast } = useToast();
  const [guestMode, setGuestMode] = useState(false);
  const [showWelcomeBonus, setShowWelcomeBonus] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // JWT pickup from `#token=...` happens in main.tsx before mount; no
    // duplicate call here.
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      localStorage.setItem("accessibooks_referral_code", refCode);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const authStatus = params.get("auth");
    if (authStatus === "failed") {
      const reason = params.get("reason");
      window.history.replaceState({}, "", window.location.pathname);
      const messageByReason: Record<string, { title: string; description: string }> = {
        access_denied: {
          title: "Sign-in canceled",
          description: "You canceled the sign-in. No problem — try again whenever you're ready.",
        },
        consent_required: {
          title: "Permission needed",
          description: "We need your permission to sign you in. Please try again and approve the request.",
        },
        login_required: {
          title: "Please sign in again",
          description: "Your session with the sign-in provider expired. Please try signing in again.",
        },
        interaction_required: {
          title: "Extra step needed",
          description: "Your sign-in provider needs an extra step. Please try again in a new window.",
        },
        invalid_grant: {
          title: "Sign-in link expired",
          description: "Your sign-in attempt expired or was already used. Please try again.",
        },
        invalid_request: {
          title: "Sign-in request was invalid",
          description: "Something was off with that sign-in request. Please try again.",
        },
        server_error: {
          title: "Sign-in provider error",
          description: "The sign-in provider had a problem on their end. Please try again in a moment.",
        },
        temporarily_unavailable: {
          title: "Sign-in temporarily unavailable",
          description: "The sign-in provider is briefly unavailable. Please try again in a minute.",
        },
        no_profile: {
          title: "Sign-in incomplete",
          description: "We didn't receive your profile from the sign-in provider. Please try again.",
        },
        session_error: {
          title: "Couldn't start your session",
          description: "We signed you in, but couldn't save your session. Please try again.",
        },
      };
      const fallback = {
        title: "Sign-in failed",
        description: "We couldn't sign you in with that account. Please try again or use a different method.",
      };
      const msg = (reason && messageByReason[reason]) || fallback;
      setTimeout(() => {
        toast({ ...msg, variant: "destructive" });
      }, 300);
    }
    if (authStatus === "unavailable") {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => {
        toast({
          title: "Sign-in temporarily unavailable",
          description: "That sign-in option is misconfigured. Please use email or another method while we sort it out.",
          variant: "destructive",
        });
      }, 300);
    }
    const magicStatus = params.get("magic");
    if (magicStatus) {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => {
        if (magicStatus === "success") {
          toast({ title: "Welcome back!", description: "You've been signed in via magic link." });
        } else if (magicStatus === "expired") {
          toast({ title: "Link expired", description: "Your sign-in link has expired. Please request a new one.", variant: "destructive" });
        } else if (magicStatus === "invalid" || magicStatus === "error") {
          toast({ title: "Invalid link", description: "This sign-in link is not valid. Please request a new one.", variant: "destructive" });
        }
      }, 300);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setGuestMode(false);
      const hasSeenWelcome = localStorage.getItem("accessibooks_welcome_shown");
      if (!hasSeenWelcome) {
        setShowWelcomeBonus(true);
        localStorage.setItem("accessibooks_welcome_shown", "true");
      }
      const savedRefCode = localStorage.getItem("accessibooks_referral_code");
      if (savedRefCode) {
        apiRequest("POST", "/api/referral/apply", { code: savedRefCode })
          .catch(() => {})
          .finally(() => localStorage.removeItem("accessibooks_referral_code"));
      }
    }
  }, [isAuthenticated]);

  const handleWelcomeBonusClose = (open: boolean) => {
    setShowWelcomeBonus(open);
    if (!open) {
      const hasOnboarded = localStorage.getItem("accessibooks_onboarding_done");
      if (!hasOnboarded) {
        setShowOnboarding(true);
      }
    }
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem("accessibooks_onboarding_done", "true");
    setShowOnboarding(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading AccessiBooks...</p>
        </div>
      </div>
    );
  }

  // Ad platform role-based routing
  const adRole = user?.role;

  if (isAuthenticated && (adRole === "advertiser" || adRole === "publisher" || adRole === "admin")) {
    return (
      <TooltipProvider>
        <Router base={(process.env.NEXT_PUBLIC_BASE_PATH||"").replace(/\/$/, "")}>
          <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}>
            <Switch>
              <Route path="/demo-slot">
                <DemoSlotPage />
              </Route>
              {adRole === "advertiser" && (
                <Route path="/advertiser">
                  <AdvertiserDashboard />
                </Route>
              )}
              {adRole === "publisher" && (
                <Route path="/publisher">
                  <PublisherDashboard />
                </Route>
              )}
              {adRole === "admin" && (
                <Route path="/admin">
                  <AdminPlatformDashboard />
                </Route>
              )}
              <Route>
                {adRole === "advertiser" && <AdvertiserDashboard />}
                {adRole === "publisher" && <PublisherDashboard />}
                {adRole === "admin" && <AdminPlatformDashboard />}
              </Route>
            </Switch>
          </Suspense>
          <Toaster />
        </Router>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Router base={(process.env.NEXT_PUBLIC_BASE_PATH||"").replace(/\/$/, "")}>
        <AudioProvider>
          <EbookProvider>
          <AudioAdManager />
          {/* Render the AccessibilityWidget early in DOM order so its
              floating toggle is one of the very first focusable controls
              (visual position is unaffected — the button is position:fixed). */}
          <AccessibilityWidget />
          <Switch>
            <Route path="/demo-slot">
              <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e]" />}>
                <DemoSlotPage />
              </Suspense>
            </Route>
            <Route path="/clip/:token">
              <Suspense fallback={<div className="min-h-screen" />}>
                <ClipViewPage />
              </Suspense>
            </Route>
            <Route path="/ad-platform">
              <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e]" />}>
                <AdPlatformLanding />
              </Suspense>
            </Route>
            <Route path="/ad-platform/slots/:id">
              {() => (
                <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e]" />}>
                  <AuthGatedRoute redirectTo="/ad-platform">
                    <SlotDetailPage />
                  </AuthGatedRoute>
                </Suspense>
              )}
            </Route>
            <Route path="/auth/hands-free">
              <HandsFreeSignIn />
            </Route>
            <Route>
              {isAuthenticated ? (
                <>
                  <MainApp />
                  <WelcomeBonusModal open={showWelcomeBonus} onOpenChange={handleWelcomeBonusClose} />
                  <OnboardingFlow open={showOnboarding} onOpenChange={setShowOnboarding} onComplete={handleOnboardingComplete} />
                </>
              ) : guestMode ? (
                <GuestBrowseApp onExitGuest={() => setGuestMode(false)} />
              ) : (
                <LandingPage onBrowseAsGuest={() => setGuestMode(true)} />
              )}
            </Route>
          </Switch>
          <ColourOverlayRenderer />
          <SwitchAccessScanner />
          <FocusModeExitButton />
          <FocusShell />
          <Toaster />
          </EbookProvider>
        </AudioProvider>
      </Router>
    </TooltipProvider>
  );
}

function AuthGatedRoute({ children, redirectTo }: { children: React.ReactNode; redirectTo: string }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate(redirectTo);
  }, [isAuthenticated, isLoading, redirectTo, navigate]);
  if (isLoading) return <div className="min-h-screen bg-[#0a0f1e]" />;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function FocusModeExitButton() {
  const [focusMode, setFocusModeState] = useState(() => !!localStorageService.getSettings().focusMode);
  const [focusShell, setFocusShellState] = useState(() => !!localStorageService.getSettings().focusShell);

  useEffect(() => {
    const syncState = () => {
      const s = localStorageService.getSettings();
      setFocusModeState(!!s.focusMode);
      setFocusShellState(!!s.focusShell);
    };
    document.addEventListener("accessibooks:settings-changed", syncState);
    return () => {
      document.removeEventListener("accessibooks:settings-changed", syncState);
    };
  }, []);

  if (!focusMode || focusShell) return null;

  const exitFocusMode = () => {
    const s = localStorageService.getSettings();
    const updated = { ...s, focusMode: false };
    localStorageService.saveSettings(updated);
    document.documentElement.classList.remove("focus-mode");
    document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
    setFocusModeState(false);
  };

  return (
    <button
      onClick={exitFocusMode}
      aria-label="Exit Focus Mode"
      data-testid="exit-focus-mode-btn"
      style={{
        position: "fixed",
        bottom: "80px",
        right: "16px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 14px",
        borderRadius: "9999px",
        fontSize: "13px",
        fontWeight: 500,
        cursor: "pointer",
        border: "none",
        opacity: 0.75,
      }}
      className="bg-primary text-primary-foreground shadow-lg hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Focus className="h-4 w-4" aria-hidden="true" />
      Exit Focus Mode
    </button>
  );
}

function FocusShell() {
  const [active, setActive] = useState(() => !!localStorageService.getSettings().focusShell);
  const [, navigate] = useLocation();
  const { currentBook, isPlaying, togglePlayPause } = useAudioContext();
  const { isAuthenticated } = useAuth();

  const saveMutation = useMutation({
    mutationFn: async (settings: AccessibilitySettings) => {
      await apiRequest("PUT", "/api/a11y/preferences", { profile: settings });
    },
  });

  useEffect(() => {
    const sync = () => setActive(!!localStorageService.getSettings().focusShell);
    document.addEventListener("accessibooks:settings-changed", sync);
    return () => document.removeEventListener("accessibooks:settings-changed", sync);
  }, []);

  useEffect(() => {
    if (!active) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitShell(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [active]);

  const exitShell = (openA11y = false) => {
    const s = localStorageService.getSettings();
    const updated = { ...s, focusShell: false };
    localStorageService.saveSettings(updated);
    document.dispatchEvent(new CustomEvent("accessibooks:settings-changed"));
    setActive(false);
    if (isAuthenticated) {
      saveMutation.mutate(updated);
    }
    if (openA11y) {
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("accessibooks:open-accessibility"));
      }, 80);
    }
  };

  const goLibrary = () => {
    navigate("/");
  };

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col"
      style={{ zIndex: 9998 }}
      role="dialog"
      aria-label="Focus Shell — simplified reading mode"
      aria-modal="true"
    >
      {/* Spatial anchor: Library button — top-left */}
      <button
        onClick={goLibrary}
        className="absolute top-4 left-4 flex items-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-base font-semibold shadow-lg hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Go to Library"
        style={{ minWidth: 140 }}
      >
        <BookOpen className="h-6 w-6 flex-shrink-0" aria-hidden="true" />
        <span>Library</span>
      </button>

      {/* Exit button — top-right */}
      <button
        onClick={() => exitShell(false)}
        className="absolute top-4 right-4 flex items-center gap-2 px-3 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium shadow hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Exit Focus Shell"
      >
        <X className="h-5 w-5" aria-hidden="true" />
        <span>Exit</span>
      </button>

      {/* Centre: book cover + title */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-20">
        {currentBook ? (
          <>
            {currentBook.coverImage ? (
              <img
                src={currentBook.coverImage}
                alt={`Cover for ${currentBook.title}`}
                className="w-52 h-52 sm:w-64 sm:h-64 object-cover rounded-2xl shadow-2xl"
              />
            ) : (
              <div className="w-52 h-52 sm:w-64 sm:h-64 rounded-2xl bg-muted flex items-center justify-center shadow-2xl">
                <BookOpen className="h-20 w-20 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
            <div className="text-center max-w-sm">
              <p className="text-2xl sm:text-3xl font-bold text-foreground leading-snug">
                {currentBook.title}
              </p>
              {currentBook.author && (
                <p className="text-base text-muted-foreground mt-1">{currentBook.author}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="w-52 h-52 rounded-2xl bg-muted flex items-center justify-center shadow-xl">
              <BookOpen className="h-20 w-20 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-xl font-semibold text-muted-foreground">No book playing</p>
            <p className="text-sm text-muted-foreground">Go to Library to pick a book</p>
          </>
        )}
      </div>

      {/* Spatial anchor: Play/Pause — bottom-center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <button
          onClick={() => togglePlayPause()}
          className="flex flex-col items-center justify-center w-28 h-28 rounded-full bg-primary text-primary-foreground shadow-2xl hover:bg-primary/90 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-4"
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!currentBook}
        >
          {isPlaying ? (
            <Pause className="h-12 w-12" aria-hidden="true" />
          ) : (
            <Play className="h-12 w-12 ml-1" aria-hidden="true" />
          )}
        </button>
        <span className="text-sm font-semibold text-muted-foreground mt-1">
          {isPlaying ? "Pause" : "Play"}
        </span>
      </div>

      {/* Spatial anchor: Help/accessibility — bottom-right */}
      <button
        onClick={() => exitShell(true)}
        className="absolute bottom-8 right-6 flex flex-col items-center gap-1 px-4 py-3 rounded-2xl bg-muted text-muted-foreground text-sm font-medium shadow hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open Accessibility Help"
        style={{ minWidth: 90 }}
      >
        <Accessibility className="h-7 w-7" aria-hidden="true" />
        <span>Help</span>
      </button>

    </div>
  );
}

function AudioAdManager() {
  const { adState, onAdComplete, onAdUpgrade } = useAudioContext();

  if (!adState.isAdPlaying || !adState.currentAd || !adState.adType) {
    return null;
  }

  return (
    <AudioAdOverlay
      ad={adState.currentAd}
      adType={adState.adType}
      onComplete={onAdComplete}
      onUpgrade={onAdUpgrade}
    />
  );
}

function ColourOverlayRenderer() {
  const [overlay, setOverlay] = useState(() => {
    const s = localStorageService.getSettings();
    return { color: s.colourOverlay ?? "", opacity: s.colourOverlayOpacity ?? 0.15 };
  });

  useEffect(() => {
    const sync = () => {
      const s = localStorageService.getSettings();
      setOverlay({ color: s.colourOverlay ?? "", opacity: s.colourOverlayOpacity ?? 0.15 });
    };
    document.addEventListener("accessibooks:settings-changed", sync);
    return () => document.removeEventListener("accessibooks:settings-changed", sync);
  }, []);

  if (!overlay.color) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        background: overlay.color,
        opacity: overlay.opacity,
        pointerEvents: "none",
        zIndex: 9990,
        mixBlendMode: "multiply",
      }}
    />
  );
}

function SwitchAccessScanner() {
  const [enabled, setEnabled] = useState(() => !!localStorageService.getSettings().switchAccessMode);
  const [focusShellActive, setFocusShellActive] = useState(() => !!localStorageService.getSettings().focusShell);
  const [scanIndex, setScanIndex] = useState(-1);
  const scanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elementsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const sync = () => {
      const s = localStorageService.getSettings();
      setEnabled(!!s.switchAccessMode);
      setFocusShellActive(!!s.focusShell);
    };
    document.addEventListener("accessibooks:settings-changed", sync);
    return () => document.removeEventListener("accessibooks:settings-changed", sync);
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (scanRef.current) clearInterval(scanRef.current);
      elementsRef.current.forEach(el => el.classList.remove("switch-access-focus"));
      setScanIndex(-1);
      return;
    }

    const SCAN_INTERVAL = 1200;
    const SELECTOR = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const startScan = () => {
      elementsRef.current = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)).filter(
        el => el.offsetParent !== null && !el.closest('[aria-hidden="true"]')
      );
      setScanIndex(0);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (scanRef.current) {
          clearInterval(scanRef.current);
          scanRef.current = null;
          setScanIndex(-1);
        }
        startScan();
        scanRef.current = setInterval(() => {
          setScanIndex(prev => {
            const next = prev + 1;
            if (next >= elementsRef.current.length) {
              clearInterval(scanRef.current!);
              scanRef.current = null;
              return -1;
            }
            return next;
          });
        }, SCAN_INTERVAL);
      } else if (e.code === "Enter" && scanIndex >= 0) {
        e.preventDefault();
        if (scanRef.current) { clearInterval(scanRef.current); scanRef.current = null; }
        const target = elementsRef.current[scanIndex];
        target?.click();
        setScanIndex(-1);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (scanRef.current) clearInterval(scanRef.current);
    };
  }, [enabled, scanIndex]);

  useEffect(() => {
    elementsRef.current.forEach((el, i) => {
      if (i === scanIndex) {
        el.classList.add("switch-access-focus");
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        el.classList.remove("switch-access-focus");
      }
    });
  }, [scanIndex]);

  if (!enabled || focusShellActive) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Switch access scanning active. Press Space to start scanning, Enter to select."
      style={{
        position: "fixed",
        bottom: 128,
        left: 16,
        zIndex: 9995,
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
        padding: "4px 10px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        pointerEvents: "none",
        opacity: 0.9,
      }}
    >
      {scanIndex >= 0 ? `Scanning ${scanIndex + 1}/${elementsRef.current.length}` : "Switch Access: Space to scan"}
    </div>
  );
}

function AppWrapper() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

export default AppWrapper;
