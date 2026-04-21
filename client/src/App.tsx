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
import { AudioProvider, useAudioContext } from "@/contexts/AudioContext";
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
import { useCuratedPlaylists } from "@/hooks/use-playlists";
import { useSubscription } from "@/hooks/use-subscription";
import { EngagementUpsell, hasShownUpsell } from "@/components/engagement-upsell";
import { CompletionModal, type CompletionData } from "@/components/completion-certificate";
import { TrialNudge } from "@/components/trial-nudge";
import { localStorageService } from "@/lib/storage";
import type { AccessibilitySettings } from "@/lib/storage";
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
const BattlePassComponent = lazy(() => import('@/components/battle-pass').then(m => ({ default: m.BattlePassComponent })));
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
const WordBankPage = lazy(() => import('@/pages/word-bank').then(m => ({ default: m.WordBankPage })));
const AchievementsPage = lazy(() => import('@/components/completion-certificate').then(m => ({ default: m.AchievementsPage })));
const AccountSettingsPage = lazy(() => import('@/pages/account-settings').then(m => ({ default: m.AccountSettingsPage })));
const AdminAnalyticsPage = lazy(() => import('@/pages/admin-analytics'));

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

const sidebarNavGroups: { label: string; items: { path: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: "Browse",
    items: [
      { path: "/", label: "Library", icon: <BookIcon className="h-5 w-5" /> },
      { path: "/player", label: "Player", icon: <Play className="h-5 w-5" /> },
      { path: "/loans", label: "Loans", icon: <LibraryBig className="h-5 w-5" /> },
      { path: "/downloads", label: "Downloads", icon: <DownloadIcon className="h-5 w-5" /> },
      { path: "/word-bank", label: "Word Bank", icon: <GraduationCap className="h-5 w-5" /> },
      { path: "/achievements", label: "Achievements", icon: <Trophy className="h-5 w-5" /> },
    ],
  },
  {
    label: "Discover",
    items: [
      { path: "/feed", label: "Feed", icon: <Star className="h-5 w-5" /> },
      { path: "/accessible-picks", label: "Picks", icon: <HeartHandshake className="h-5 w-5" /> },
      { path: "/queue", label: "Queue", icon: <ListMusic className="h-5 w-5" /> },
      { path: "/party", label: "Party", icon: <Radio className="h-5 w-5" /> },
      { path: "/social", label: "Social", icon: <Users className="h-5 w-5" /> },
    ],
  },
  {
    label: "Create",
    items: [
      { path: "/publish", label: "Publish", icon: <Upload className="h-5 w-5" /> },
      { path: "/advertise", label: "Advertise", icon: <Megaphone className="h-5 w-5" /> },
    ],
  },
  {
    label: "Account",
    items: [
      { path: "/settings", label: "Settings", icon: <Settings2 className="h-5 w-5" /> },
      { path: "/pricing", label: "Plans", icon: <Crown className="h-5 w-5" /> },
      { path: "/stats", label: "Stats", icon: <Trophy className="h-5 w-5" /> },
      { path: "/usage", label: "Usage", icon: <BarChart3 className="h-5 w-5" /> },
      { path: "/billing", label: "Billing", icon: <Wallet className="h-5 w-5" /> },
      { path: "/referrals", label: "Referrals", icon: <Gift className="h-5 w-5" /> },
      { path: "/family", label: "Family", icon: <Heart className="h-5 w-5" /> },
      { path: "/enterprise", label: "Enterprise", icon: <Building2 className="h-5 w-5" /> },
    ],
  },
  {
    label: "Admin",
    items: [
      { path: "/moderation", label: "Moderation", icon: <Shield className="h-5 w-5" /> },
      { path: "/health", label: "Health", icon: <Activity className="h-5 w-5" /> },
      { path: "/analytics", label: "Analytics", icon: <BarChart3 className="h-5 w-5" /> },
    ],
  },
];

type SidebarMode = "full" | "rail" | "hidden";

function AppHeader({ sidebarMode, onToggleSidebar }: { 
  sidebarMode: SidebarMode; 
  onToggleSidebar: () => void; 
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  useEffect(() => {
    if (!mobileSearchOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSearchOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileSearchOpen]);

  return (
    <>
    <header className="bg-card border-b border-border h-16 flex items-center px-4 sm:px-6 sticky top-0 z-30" role="banner">
      <div className="flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          data-testid="hamburger-menu-btn"
          className="p-2 flex items-center gap-1.5"
        >
          <Menu className="h-6 w-6" />
          <span className="text-sm font-medium">Menu</span>
        </Button>
        {/* Library spatial anchor — top-left (mirrors Focus Shell top-left Library button) */}
        <Link
          href="/"
          aria-label="Go to Library"
          className="shrink-0 flex items-center gap-1.5 rounded-lg px-1 py-0.5 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AccessiBooksLogo />
        </Link>
        <Button variant="ghost" size="sm" onClick={() => setMobileSearchOpen(!mobileSearchOpen)} className="p-2 md:hidden flex items-center gap-1" aria-label="Search">
          {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          <span className="text-xs font-medium">{mobileSearchOpen ? "Close" : "Search"}</span>
        </Button>
      </div>

      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <SearchAutocomplete onSelectBook={() => navigate("/player")} inputTestId="main-search-input" />
      </div>

      <div className="flex items-center space-x-2 ml-auto shrink-0">
        <AccessibilityControls />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDonateOpen(true)}
          aria-label="Donate to Australian Disability Ltd"
          data-testid="button-donate"
          className="hidden sm:flex items-center gap-1 p-2 relative text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950"
          title="Donate"
        >
          <Gift className="h-4 w-4" />
          <span className="text-xs font-medium">Donate</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCoachOpen(true)}
          aria-label="Open Accessibility Coach"
          data-testid="button-accessibility-coach"
          className="hidden sm:flex items-center gap-1 p-2 relative text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
          title="Accessibility Coach"
        >
          <HeartHandshake className="h-4 w-4" />
          <span className="text-xs font-medium">Coach</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setChatOpen(true)}
          aria-label="Open AI chat assistant"
          data-testid="button-ai-chat"
          className="hidden sm:flex items-center gap-1 p-2 relative"
          title="AI Assistant"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="text-xs font-medium">Chat</span>
        </Button>
        
        {user && (
          <div className="flex items-center space-x-2 pl-2 border-l border-border">
            <PremiumBadge showUpgrade />
            <NotificationCenter />
            
            <div className="hidden sm:flex items-center space-x-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium" data-testid="text-username">
                {user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user.email || "User"
                }
              </span>
            </div>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Subscription settings"
                  data-testid="button-subscription"
                  className="flex items-center gap-1"
                >
                  <Settings className="h-4 w-4" />
                  <span className="text-xs font-medium">Plan</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <SubscriptionCard />
              </DialogContent>
            </Dialog>
            <Link
              href="/pricing"
              className="hidden sm:flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="View all plans and pricing"
            >
              <Crown className="h-4 w-4" />
              Plans
            </Link>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              aria-label="Sign out"
              data-testid="button-logout"
              className="flex items-center gap-1"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-xs font-medium">Sign out</span>
            </Button>
          </div>
        )}
      </div>
    </header>
    {mobileSearchOpen && (
      <div
        className="md:hidden fixed top-16 left-0 right-0 z-30 bg-card border-b border-border p-3 shadow-lg animate-in slide-in-from-top duration-200"
        role="search"
        aria-label="Search audiobooks"
      >
        <SearchAutocomplete onSelectBook={() => { navigate("/player"); setMobileSearchOpen(false); }} />
      </div>
    )}
    <AiChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    <AccessibilityCoachPanel isOpen={coachOpen} onClose={() => setCoachOpen(false)} />

    <Dialog open={donateOpen} onOpenChange={setDonateOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <Gift className="h-5 w-5" />
          Support Australian Disability Ltd
        </DialogTitle>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Australian Disability Ltd</strong> is a registered charity dedicated to improving the lives of people with disabilities across Australia. AccessiBooks is proudly operated by Australian Disability Ltd to make literature accessible to everyone.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your donation helps us expand our audiobook library, improve accessibility features, and reach more people who need them. Every contribution makes a difference.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <a
              href="https://www.australiandisability.org.au/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full rounded-md bg-rose-500 hover:bg-rose-600 text-white font-semibold px-4 py-2.5 text-sm transition-colors"
            >
              <Gift className="h-4 w-4" />
              Donate Now
            </a>
            <Button variant="outline" size="sm" onClick={() => setDonateOpen(false)} className="w-full">
              Maybe Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function AppSidebar({ mode, onCloseDrawer }: {
  mode: SidebarMode;
  onCloseDrawer: () => void;
}) {
  const [location] = useLocation();
  const { user } = useAuth();
  const tier = ((user as any)?.subscriptionTier ?? "free") as "free" | "plus" | "premium";

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "";
    return location === path || location.startsWith(path + "/");
  };

  const makeFullNav = (onLinkClick?: () => void) => (
    <nav className="flex flex-col h-full overflow-y-auto py-4 px-3" aria-label="Main navigation">
      {sidebarNavGroups.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
            {group.label}
          </p>
          {group.items.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              onClick={onLinkClick}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              data-testid={`menu-${item.path.replace("/", "") || "library"}`}
            >
              {item.icon}
              <span className="flex-1 truncate">{item.label}</span>
              {item.path === "/settings" && <PlanBadge tier={tier} className="text-[10px] px-1.5 py-0" />}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const railNav = (
    <nav className="flex flex-col h-full overflow-y-auto py-4 items-center" aria-label="Main navigation">
      {sidebarNavGroups.map((group) => (
        <div key={group.label} className="mb-2 w-full flex flex-col items-center">
          {group.items.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center justify-center w-14 py-1.5 rounded-md transition-colors mb-0.5 gap-0.5 ${
                isActive(item.path)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              aria-label={item.label}
              aria-current={isActive(item.path) ? "page" : undefined}
              data-testid={`menu-${item.path.replace("/", "") || "library"}`}
            >
              {item.icon}
              <span className="text-[9px] font-medium leading-none tracking-tight truncate max-w-[48px] text-center">
                {item.label}
              </span>
            </Link>
          ))}
          <div className="w-8 h-px bg-border my-1.5" />
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Persistent sidebar — visible on md+ only, hidden on mobile */}
      {mode !== "hidden" && (
        <aside
          className={`hidden md:flex flex-col shrink-0 bg-card border-r border-border h-[calc(100vh-4rem)] sticky top-16 transition-all duration-200 ${
            mode === "full" ? "w-60" : "w-16"
          }`}
        >
          {mode === "full" ? makeFullNav() : railNav}
        </aside>
      )}

      {/* Slide-in drawer — used on all screen sizes when hidden */}
      {mode === "hidden" && (
        <>
          <div
            className="fixed inset-0 top-16 bg-black/40 z-40"
            onClick={onCloseDrawer}
            aria-hidden="true"
          />
          <aside className="fixed left-0 top-16 bottom-0 w-64 bg-card border-r border-border z-50 shadow-xl animate-in slide-in-from-left duration-200">
            {makeFullNav(onCloseDrawer)}
          </aside>
        </>
      )}
    </>
  );
}

// Auth providers available (Passport.js)
interface AuthProviders {
  local: boolean;
  google: boolean;
  facebook: boolean;
  microsoft: boolean;
  auth0: boolean;
}

// Login Modal Component
function LoginModal({ 
  open, 
  onOpenChange, 
  isRegistering, 
  setIsRegistering 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  isRegistering: boolean;
  setIsRegistering: (val: boolean) => void;
}) {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicDevLink, setMagicDevLink] = useState<string | null>(null);

  const magicLinkMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/auth/magic-link/request", { email });
      return response.json() as Promise<{ message: string; emailSent?: boolean; devLink?: string }>;
    },
    onSuccess: (data) => {
      if (data.emailSent === false && data.devLink) {
        setMagicDevLink(data.devLink);
      }
      setMagicLinkSent(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Could not send magic link",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });
  
  const { data: providers } = useQuery<AuthProviders>({
    queryKey: ["/api/auth/providers"],
    retry: false,
  });
  
  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });
  
  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message || "Could not create account",
        variant: "destructive",
      });
    },
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      registerMutation.mutate(formData);
    } else {
      loginMutation.mutate({ email: formData.email, password: formData.password });
    }
  };

  const [showEmailForm, setShowEmailForm] = useState(false);
  const hasSocialProviders =
    providers?.google || providers?.facebook || providers?.microsoft || providers?.auth0;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) { setShowEmailForm(false); setMagicLinkMode(false); setMagicLinkSent(false); setMagicLinkEmail(""); setMagicDevLink(null); } onOpenChange(val); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {isRegistering ? "Create Account" : "Sign In"}
        </DialogTitle>
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Headphones className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">
              {magicLinkMode
                ? (magicLinkSent
                    ? (magicDevLink ? "Sign In Link Ready" : "Check Your Inbox")
                    : "Magic Link Sign In")
                : (isRegistering ? "Create Account" : "Welcome Back")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {magicLinkMode
                ? (magicLinkSent
                    ? (magicDevLink
                        ? "No email service is configured. Use the link below to sign in."
                        : `We sent a sign-in link to ${magicLinkEmail}`)
                    : "Enter your email and we'll send you a sign-in link")
                : (isRegistering ? "Join thousands of audiobook lovers" : "Sign in to continue listening")
              }
            </p>
          </div>
          
          {!magicLinkMode && hasSocialProviders && (
            <div className="space-y-3 mb-4">
              {providers?.google && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 text-base font-medium border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => window.location.href = "/api/auth/google"}
                  data-testid="button-google-auth"
                >
                  <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </Button>
              )}
              
              {providers?.facebook && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 text-base font-medium border-2 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                  onClick={() => window.location.href = "/api/auth/facebook"}
                  data-testid="button-facebook-auth"
                >
                  <SiFacebook className="mr-3 h-5 w-5 text-[#1877F2]" />
                  Continue with Facebook
                </Button>
              )}
              
              {providers?.microsoft && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 text-base font-medium border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => window.location.href = "/api/auth/microsoft"}
                  data-testid="button-microsoft-auth"
                >
                  <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                  Continue with Microsoft
                </Button>
              )}

              {providers?.auth0 && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 text-base font-medium border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => (window.location.href = "/api/auth/auth0")}
                  data-testid="button-auth0-auth"
                >
                  <Lock className="mr-3 h-5 w-5 text-[#EB5424]" />
                  Continue with Auth0
                </Button>
              )}
            </div>
          )}
          
          {/* Magic link mode */}
          {magicLinkMode ? (
            magicLinkSent ? (
              <div className="text-center space-y-4">
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${magicDevLink ? "bg-amber-100 dark:bg-amber-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                  <Mail className={`h-8 w-8 ${magicDevLink ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`} />
                </div>
                {magicDevLink ? (
                  <>
                    <a
                      href={magicDevLink}
                      className="block w-full"
                    >
                      <Button className="w-full" size="lg">
                        <Zap className="mr-2 h-4 w-4" />
                        Click here to sign in
                      </Button>
                    </a>
                    <p className="text-xs text-muted-foreground border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-md p-2">
                      To send real emails, add a <strong>RESEND_API_KEY</strong> in your secrets. This link is only shown when no email service is configured.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The link expires in 15 minutes. Check your spam folder if you don't see it.
                  </p>
                )}
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setMagicLinkSent(false); setMagicLinkEmail(""); setMagicDevLink(null); }}
                >
                  {magicDevLink ? "Try a different email" : "Send to a different email"}
                </Button>
                <Button
                  variant="link"
                  className="w-full text-muted-foreground"
                  onClick={() => { setMagicLinkMode(false); setMagicLinkSent(false); setMagicLinkEmail(""); setMagicDevLink(null); }}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                <form
                  onSubmit={(e) => { e.preventDefault(); if (magicLinkEmail) magicLinkMutation.mutate(magicLinkEmail); }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="magic-email"
                        type="email"
                        placeholder="you@example.com"
                        className="pl-10"
                        value={magicLinkEmail}
                        onChange={(e) => setMagicLinkEmail(e.target.value)}
                        required
                        autoFocus
                        data-testid="input-magic-link-email"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={magicLinkMutation.isPending || !magicLinkEmail}
                    data-testid="button-send-magic-link"
                  >
                    {magicLinkMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Send Magic Link
                  </Button>
                </form>
                <div className="text-center mt-3">
                  <Button
                    variant="link"
                    className="text-muted-foreground text-sm"
                    onClick={() => setMagicLinkMode(false)}
                  >
                    Back to sign in
                  </Button>
                </div>
              </>
            )
          ) : (
            <>
              {hasSocialProviders && (
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or use email
                    </span>
                  </div>
                </div>
              )}

              {!hasSocialProviders || showEmailForm ? (
                <>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {isRegistering && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            placeholder="John"
                            value={formData.firstName}
                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                            data-testid="input-first-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            placeholder="Doe"
                            value={formData.lastName}
                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                            data-testid="input-last-name"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          className="pl-10"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          data-testid="input-email"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="pl-10 pr-10"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          required
                          data-testid="input-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={loginMutation.isPending || registerMutation.isPending}
                      data-testid="button-submit-auth"
                    >
                      {(loginMutation.isPending || registerMutation.isPending) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {isRegistering ? "Create Account" : "Sign In"}
                    </Button>
                  </form>

                  {!isRegistering && (
                    <Button
                      variant="ghost"
                      className="w-full mt-2 text-muted-foreground hover:text-foreground"
                      onClick={() => { setMagicLinkMode(true); setMagicLinkEmail(formData.email); }}
                      data-testid="button-magic-link"
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      Sign in with a magic link instead
                    </Button>
                  )}

                  <div className="text-center mt-2">
                    <Button
                      variant="link"
                      onClick={() => setIsRegistering(!isRegistering)}
                      data-testid="button-toggle-auth-mode"
                    >
                      {isRegistering
                        ? "Already have an account? Sign in"
                        : "Don't have an account? Create one"
                      }
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowEmailForm(true)}
                    data-testid="button-show-email-form"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Sign in with email & password
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setMagicLinkMode(true)}
                    data-testid="button-magic-link"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Send me a magic link
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  classics: "📚",
  mystery: "🔍",
  sleep: "🌙",
  motivation: "💪",
  adventure: "🗺️",
  romance: "💕",
  scifi: "🚀",
  history: "📜",
};

function CuratedCollectionsPreview() {
  const { data: playlists, isLoading } = useCuratedPlaylists();
  
  if (isLoading || !playlists || playlists.length === 0) {
    return null;
  }

  return (
    <section className="w-full px-4 md:px-8 lg:px-16 py-12" aria-labelledby="curated-collections-heading">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Music2 className="h-6 w-6 text-primary" aria-hidden="true" />
          <h2 id="curated-collections-heading" className="text-2xl font-bold">Curated Collections</h2>
        </div>
        <p className="text-muted-foreground">Hand-picked audiobook collections for every mood and interest</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
        {playlists.slice(0, 6).map((playlist) => {
          const emoji = playlist.category ? CATEGORY_ICONS[playlist.category] || "📖" : "📖";
          return (
            <Card 
              key={playlist.id}
              className="hover:shadow-lg transition-shadow cursor-pointer group"
              role="article"
              aria-label={`${playlist.name} - ${playlist.description || 'Curated collection'}`}
            >
              <CardContent className="p-4 text-center">
                <div className="w-full h-20 bg-gradient-to-br from-primary/20 via-primary/30 to-primary/50 rounded-lg mb-3 flex items-center justify-center">
                  <span className="text-3xl" role="img" aria-hidden="true">{emoji}</span>
                </div>
                <h3 className="font-semibold text-sm line-clamp-1">{playlist.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <BookOpenIcon className="h-3 w-3" aria-hidden="true" />
                  {playlist.itemCount} {playlist.itemCount === 1 ? 'book' : 'books'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function PublicCommunitySection({ onJoin }: { onJoin: () => void }) {
  const { data: challenges = [], isLoading: challengesLoading } = useQuery<any[]>({
    queryKey: ["/api/gamification/challenges"],
  });

  const { data: leaderboard = [], isLoading: leaderboardLoading } = useQuery<any[]>({
    queryKey: ["/api/gamification/leaderboard?period=alltime"],
  });

  const isLoading = challengesLoading || leaderboardLoading;
  if (isLoading) return null;
  if (challenges.length === 0 && leaderboard.length === 0) return null;

  return (
    <section className="w-full px-4 md:px-8 lg:px-16 py-12">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold mb-2 text-center">Join Our Community</h2>
        <p className="text-muted-foreground text-center mb-8">Compete with readers worldwide and earn achievements</p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {challenges.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Active Challenges
              </h3>
              <div className="space-y-3">
                {challenges.slice(0, 3).map((challenge: any) => (
                  <Card key={challenge.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{challenge.badgeIcon}</span>
                        <div>
                          <p className="font-medium text-sm">{challenge.title}</p>
                          <p className="text-xs text-muted-foreground">{challenge.description}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={onJoin}>Join</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {leaderboard.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                Top Readers
              </h3>
              <Card>
                <CardContent className="p-0">
                  {leaderboard.slice(0, 5).map((entry: any, idx: number) => (
                    <div key={entry.userId} className={`flex items-center justify-between p-3 ${idx < leaderboard.length - 1 ? "border-b" : ""}`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? "bg-yellow-500 text-white" :
                          idx === 1 ? "bg-gray-300 text-gray-700" :
                          idx === 2 ? "bg-amber-600 text-white" :
                          "bg-muted text-muted-foreground"
                        }`}>{idx + 1}</span>
                        <div>
                          <p className="font-medium text-sm">{entry.firstName || "Reader"} {entry.lastName ? entry.lastName[0] + "." : ""}</p>
                          <p className="text-xs text-muted-foreground">Level {entry.level} - {entry.totalXp} XP</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{entry.booksCompleted} books</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button variant="link" className="mt-2 w-full" onClick={onJoin}>
                Sign up to join the leaderboard
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Landing page for logged-out users — branded shell that hosts the LoginModal
function LandingPage({ onBrowseAsGuest }: { onBrowseAsGuest?: () => void }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const openLogin = () => {
    setIsRegistering(false);
    setLoginOpen(true);
  };
  const openRegister = () => {
    setIsRegistering(true);
    setLoginOpen(true);
  };

  return (
    <>
      <BrandLandingPage
        onOpenLogin={openLogin}
        onOpenRegister={openRegister}
        onBrowseAsGuest={onBrowseAsGuest}
      />
      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        isRegistering={isRegistering}
        setIsRegistering={setIsRegistering}
      />
    </>
  );
}


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

  // Apply reduceDistractionMode class from server preferences
  const { data: a11yPrefs } = useQuery<{ profile: Record<string, unknown> }>({
    queryKey: ["/api/a11y/preferences"],
  });
  useEffect(() => {
    const reduce = !!(a11yPrefs?.profile?.reduceDistractionMode);
    document.documentElement.classList.toggle("reduce-distraction", reduce);
  }, [a11yPrefs?.profile?.reduceDistractionMode]);

  const skipForwardSec = Number(a11yPrefs?.profile?.preferredSkipForward ?? 30);
  const skipBackSec = Number(a11yPrefs?.profile?.preferredSkipBack ?? 30);

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
      handler: () => skip(skipForwardSec),
      description: `Skip forward ${skipForwardSec}s`,
    },
    {
      patterns: ["skip back", "skip backward", "go back", "rewind"],
      handler: () => skip(-skipBackSec),
      description: `Skip back ${skipBackSec}s`,
    },
    {
      patterns: ["next chapter", "next"],
      handler: () => nextChapter(),
      description: "Next chapter",
    },
    {
      patterns: ["previous chapter", "previous", "last chapter", "go back chapter"],
      handler: () => prevChapter(),
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
  ], [isPlaying, togglePlayPause, skip, nextChapter, prevChapter, changeSpeed, toggleMute, toggleHighContrast, toggleDarkMode, navigate]);

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
            setSidebarMode(prev => {
              if (prev === "full") return "rail";
              if (prev === "rail") return "hidden";
              return isLg ? "full" : "rail";
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
            className="flex-1 overflow-y-auto"
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
                      <BattlePassComponent />
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
                      <ListeningParty book={selectedBook || currentBook} onBack={handleBackToLibrary} />
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
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      localStorage.setItem("accessibooks_referral_code", refCode);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const authStatus = params.get("auth");
    if (authStatus === "failed") {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => {
        toast({
          title: "Sign-in failed",
          description: "We couldn't sign you in with that account. Please try again or use a different method.",
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
        <Router>
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
      <Router>
        <AudioProvider>
          <AudioAdManager />
          <Switch>
            <Route path="/demo-slot">
              <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e]" />}>
                <DemoSlotPage />
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
          <AccessibilityWidget />
          <ColourOverlayRenderer />
          <SwitchAccessScanner />
          <FocusModeExitButton />
          <FocusShell />
          <Toaster />
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
