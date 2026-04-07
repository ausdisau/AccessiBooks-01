import { useState, useEffect, lazy, Suspense, useMemo, useCallback, memo } from "react";
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
import { Book } from "@shared/schema";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useAccessibility } from "@/hooks/use-accessibility";
import { useContentAccess } from "@/hooks/use-content-access";
import { PremiumUpgradeModal } from "@/components/premium-upgrade-modal";
import { PremiumPreviewPlayer } from "@/components/premium-preview-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Book as BookIcon, Play, LogOut, User, Loader2, Mail, Lock, Eye, EyeOff, Crown, Settings, Headphones, Accessibility, BookOpen, Star, Bookmark, Volume2, Menu, X, ChevronRight, Home, CreditCard, Phone, Shield, Users, Clock, TrendingUp, Gift, Upload, Radio, Search, MessageCircle } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { AudioProvider, useAudioContext } from "@/contexts/AudioContext";
import { AudioAdOverlay } from "@/components/audio-ad-overlay";
import { MiniPlayer } from "@/components/mini-player";
import { PremiumBadge } from "@/components/premium-badge";
import { SubscriptionCard } from "@/components/subscription-card";
import { AccessibilityWidget } from "@/components/accessibility-widget";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SocialFeed } from "@/components/social-feed";
import { LandingCarousel } from "@/components/book-carousel";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { SignUpPrompt } from "@/components/sign-up-prompt";
import { KeyboardShortcutsOverlay } from "@/components/keyboard-shortcuts-overlay";
import { WelcomeBonusModal } from "@/components/welcome-bonus-modal";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { ShareButton } from "@/components/share-button";
import { NotificationCenter } from "@/components/notification-center";
import { Footer } from "@/components/footer";
import { useCuratedPlaylists } from "@/hooks/use-playlists";
import { useSubscription } from "@/hooks/use-subscription";
import { EngagementUpsell, hasShownUpsell } from "@/components/engagement-upsell";
import { TrialNudge } from "@/components/trial-nudge";
import { localStorageService } from "@/lib/storage";
import { Music2, BookOpen as BookOpenIcon, Trophy, ListMusic, Megaphone, Wallet, BarChart3, Download as DownloadIcon, Heart, Building2, Activity, LibraryBig } from "lucide-react";

const EbookReader = lazy(() => import('@/components/ebook-reader').then(m => ({ default: m.EbookReader })));
const AuthorPage = lazy(() => import('@/components/author-page').then(m => ({ default: m.AuthorPage })));
const GamificationDashboard = lazy(() => import('@/components/gamification-dashboard').then(m => ({ default: m.GamificationDashboard })));
const YearInReview = lazy(() => import('./components/year-in-review').then(m => ({ default: m.YearInReview })));
const ReferralSection = lazy(() => import('@/components/referral-section').then(m => ({ default: m.ReferralSection })));
const ReferralsPage = lazy(() => import('@/pages/referrals').then(m => ({ default: m.ReferralsPage })));
const AuthorDashboard = lazy(() => import('@/components/author-dashboard').then(m => ({ default: m.AuthorDashboard })));
const ListeningParty = lazy(() => import('@/components/listening-party').then(m => ({ default: m.ListeningParty })));
const StreamingQueue = lazy(() => import('@/components/streaming-queue').then(m => ({ default: m.StreamingQueue })));
const AdvertiserDashboard = lazy(() => import('@/components/advertiser-dashboard').then(m => ({ default: m.AdvertiserDashboard })));
const BillingDashboard = lazy(() => import('@/components/billing-dashboard').then(m => ({ default: m.BillingDashboard })));
const UsageDashboard = lazy(() => import('@/components/usage-dashboard').then(m => ({ default: m.UsageDashboard })));
const OfflineDownloads = lazy(() => import('@/components/offline-downloads').then(m => ({ default: m.OfflineDownloads })));
const MyLoans = lazy(() => import('@/components/my-loans'));
const BattlePassComponent = lazy(() => import('@/components/battle-pass').then(m => ({ default: m.BattlePassComponent })));
const EnterprisePage = lazy(() => import('@/pages/enterprise'));
const AdminModerationPage = lazy(() => import('@/pages/admin-moderation'));
const SocialHub = lazy(() => import('@/components/social-hub').then(m => ({ default: m.SocialHub })));
const FamilyPlan = lazy(() => import('@/components/family-plan').then(m => ({ default: m.FamilyPlan })));
const AdminHealthDashboard = lazy(() => import('@/components/admin-health').then(m => ({ default: m.AdminHealthDashboard })));
const ChurnDashboard = lazy(() => import('@/components/churn-dashboard').then(m => ({ default: m.ChurnDashboard })));
const TrustPage = lazy(() => import('@/pages/trust'));
const InstitutionalPage = lazy(() => import('@/pages/institutional'));
const MoatDashboard = lazy(() => import('@/pages/moat-dashboard'));

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
      { path: "/loans", label: "My Loans", icon: <LibraryBig className="h-5 w-5" /> },
      { path: "/downloads", label: "Downloads", icon: <DownloadIcon className="h-5 w-5" /> },
    ],
  },
  {
    label: "Discover",
    items: [
      { path: "/feed", label: "Feed", icon: <Star className="h-5 w-5" /> },
      { path: "/queue", label: "Live Queue", icon: <ListMusic className="h-5 w-5" /> },
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
          className="p-2"
        >
          <Menu className="h-6 w-6" />
        </Button>
        <AccessiBooksLogo />
        <Button variant="ghost" size="sm" onClick={() => setMobileSearchOpen(!mobileSearchOpen)} className="p-2 md:hidden" aria-label="Search">
          {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <SearchAutocomplete onSelectBook={() => navigate("/player")} />
      </div>

      <div className="flex items-center space-x-2 ml-auto shrink-0">
        <AccessibilityControls />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setChatOpen(true)}
          aria-label="Open AI chat assistant"
          data-testid="button-ai-chat"
          className="p-2 relative"
          title="AI Assistant"
        >
          <MessageCircle className="h-5 w-5" />
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
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <SubscriptionCard />
              </DialogContent>
            </Dialog>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              aria-label="Sign out"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
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
    </>
  );
}

function AppSidebar({ mode, onCloseDrawer }: {
  mode: SidebarMode;
  onCloseDrawer: () => void;
}) {
  const [location] = useLocation();

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
              {item.label}
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
            <Tooltip key={item.path} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={item.path}
                  className={`flex items-center justify-center w-11 h-11 rounded-md transition-colors mb-0.5 ${
                    isActive(item.path)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label={item.label}
                  data-testid={`menu-${item.path.replace("/", "") || "library"}`}
                >
                  {item.icon}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {item.label}
              </TooltipContent>
            </Tooltip>
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
            mode === "full" ? "w-60" : "w-12"
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
  
  const auth0LoginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/auth0/login", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Auth0 Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });
  
  const auth0RegisterMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const response = await apiRequest("POST", "/api/auth/auth0/register", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account created",
        description: "Please sign in with Auth0",
      });
      setIsRegistering(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Auth0 Registration failed",
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
  
  const handleAuth0Submit = () => {
    if (!formData.email || !formData.password) {
      toast({
        title: "Missing credentials",
        description: "Please enter email and password to use Auth0",
        variant: "destructive",
      });
      return;
    }
    if (isRegistering) {
      auth0RegisterMutation.mutate(formData);
    } else {
      auth0LoginMutation.mutate({ email: formData.email, password: formData.password });
    }
  };

  const [showEmailForm, setShowEmailForm] = useState(false);
  const hasSocialProviders = providers?.google || providers?.facebook || providers?.microsoft;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) setShowEmailForm(false); onOpenChange(val); }}>
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
              {isRegistering ? "Create Account" : "Welcome Back"}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {isRegistering 
                ? "Join thousands of audiobook lovers"
                : "Sign in to continue listening"
              }
            </p>
          </div>
          
          {hasSocialProviders && (
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
            </div>
          )}
          
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
              
              <div className="text-center mt-4">
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
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => setShowEmailForm(true)}
              data-testid="button-show-email-form"
            >
              <Mail className="mr-2 h-4 w-4" />
              Sign in with email instead
            </Button>
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

// Landing page for logged-out users
function LandingPage({ onBrowseAsGuest }: { onBrowseAsGuest?: () => void }) {
  const { toggleHighContrast } = useAccessibility();
  const [loginOpen, setLoginOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  
  const { data: platformStats } = useQuery<{ totalBooks: number; totalUsers: number; totalListeningMinutes: number }>({
    queryKey: ["/api/platform/stats"],
  });

  const { data: featuredBook } = useQuery<Book>({
    queryKey: ["/api/books/featured"],
  });

  const { data: trendingBooks = [] } = useQuery<Book[]>({
    queryKey: ["/api/books/trending"],
  });

  const { data: publicReviews = [] } = useQuery<any[]>({
    queryKey: ["/api/reviews/public"],
  });

  const openLogin = () => {
    setIsRegistering(false);
    setLoginOpen(true);
  };
  
  const openRegister = () => {
    setIsRegistering(true);
    setLoginOpen(true);
  };
  
  useKeyboardShortcuts({
    onHighContrast: toggleHighContrast,
  });
  
  const features = [
    {
      icon: Headphones,
      title: "Multi-Source Library",
      description: "Access audiobooks from iTunes, LibriVox, Open Library, and Google Books - all in one place"
    },
    {
      icon: Accessibility,
      title: "Built for Everyone",
      description: "High contrast mode, dyslexia-friendly fonts, and full keyboard navigation support"
    },
    {
      icon: Bookmark,
      title: "Smart Bookmarks",
      description: "Save your place with custom bookmarks and automatic progress tracking"
    },
    {
      icon: Volume2,
      title: "Advanced Playback",
      description: "Variable speed controls, sleep timer, and seamless chapter navigation"
    },
    {
      icon: BookOpen,
      title: "90+ Free Books",
      description: "Thousands of public domain classics from LibriVox, completely free"
    },
    {
      icon: Star,
      title: "Premium Experience",
      description: "Ad-free listening, unlimited bookmarks, and priority support for just $9.99/month"
    }
  ];

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      {/* Navigation */}
      <nav className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="w-full px-4 md:px-8 py-4 flex justify-between items-center">
          <AccessiBooksLogo onClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
          
          {/* Search Field with Autocomplete */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <SearchAutocomplete onSelectBook={() => onBrowseAsGuest ? onBrowseAsGuest() : openRegister()} />
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            <AccessibilityControls />
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
            <Button variant="ghost" onClick={openLogin} data-testid="nav-sign-in">
              Sign In
            </Button>
            <Button onClick={openRegister} data-testid="nav-get-started">
              Get Started
            </Button>
          </div>
          
          {/* Mobile Menu Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            data-testid="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        
        {/* Collapsible Menu - Works on all screen sizes */}
        <div 
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            mobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="w-full px-4 md:px-8 py-4 space-y-4 border-t">
            <div className="flex justify-center">
              <AccessibilityControls />
            </div>
            <div className="space-y-2">
              <Button 
                variant="ghost" 
                className="w-full justify-start" 
                onClick={() => { openLogin(); setMobileMenuOpen(false); }}
                data-testid="mobile-nav-sign-in"
              >
                <User className="mr-2 h-4 w-4" /> Sign In
              </Button>
              <Button 
                className="w-full justify-start" 
                onClick={() => { openRegister(); setMobileMenuOpen(false); }}
                data-testid="mobile-nav-get-started"
              >
                <Headphones className="mr-2 h-4 w-4" /> Get Started Free
              </Button>
            </div>
            <Separator />
            <div className="space-y-1">
              <button 
                className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
                onClick={() => { openRegister(); setMobileMenuOpen(false); }}
              >
                <BookOpen className="h-4 w-4" /> Browse Library
              </button>
              <button 
                className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
                onClick={() => { openRegister(); setMobileMenuOpen(false); }}
              >
                <Crown className="h-4 w-4" /> Premium Plans
              </button>
              <a 
                href="https://ausdis.au" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
              >
                <Phone className="h-4 w-4" /> Contact Us
              </a>
            </div>
          </div>
        </div>
      </nav>
      
      {/* Hero Section */}
      <section className="w-full px-4 md:px-8 lg:px-16 py-16 md:py-24" aria-labelledby="hero-heading">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h1 id="hero-heading" className="text-4xl md:text-6xl font-bold tracking-tight">
            Audiobooks for <span className="text-primary">Everyone</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            The most accessible audiobook player, designed with care for readers of all abilities
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" className="text-lg px-8" onClick={openRegister} data-testid="hero-get-started">
              <Headphones className="mr-2 h-5 w-5" />
              Start Listening Free
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8" onClick={openLogin} data-testid="hero-sign-in">
              Sign In
            </Button>
          </div>
          {onBrowseAsGuest && (
            <button 
              onClick={onBrowseAsGuest}
              className="text-sm text-primary hover:underline cursor-pointer"
              data-testid="browse-as-guest"
            >
              or browse the library without an account
            </button>
          )}
          <p className="text-sm text-muted-foreground">
            No credit card required. Access {platformStats?.totalBooks || "90"}+ free audiobooks instantly.
          </p>
        </div>
      </section>

      {/* Social Proof Stats */}
      {platformStats && (
        <section className="w-full px-4 md:px-8 lg:px-16 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <span className="text-2xl md:text-3xl font-bold">{platformStats.totalBooks.toLocaleString()}+</span>
                </div>
                <p className="text-sm text-muted-foreground">Books Available</p>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-2xl md:text-3xl font-bold">{platformStats.totalUsers.toLocaleString()}</span>
                </div>
                <p className="text-sm text-muted-foreground">Active Readers</p>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Clock className="h-5 w-5 text-primary" />
                  <span className="text-2xl md:text-3xl font-bold">{Math.round(platformStats.totalListeningMinutes / 60).toLocaleString()}</span>
                </div>
                <p className="text-sm text-muted-foreground">Hours Listened</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Book of the Day */}
      {featuredBook && (
        <section className="w-full px-4 md:px-8 lg:px-16 py-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Star className="h-6 w-6 text-yellow-500" />
              Book of the Day
            </h2>
            <Card className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer" onClick={onBrowseAsGuest}>
              <CardContent className="p-6 flex gap-6">
                {featuredBook.coverImage ? (
                  <img src={featuredBook.coverImage} alt="" className="w-24 h-36 object-cover rounded-lg flex-shrink-0" loading="lazy" decoding="async" />
                ) : (
                  <div className="w-24 h-36 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold line-clamp-1">{featuredBook.title}</h3>
                  <p className="text-muted-foreground mb-2">by {featuredBook.author}</p>
                  {featuredBook.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{featuredBook.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      <Headphones className="h-3 w-3" />
                      {featuredBook.contentType || "Audiobook"}
                    </span>
                    {featuredBook.genre && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        {featuredBook.genre}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Trending Books */}
      {trendingBooks.length > 0 && (
        <section className="w-full px-4 md:px-8 lg:px-16 py-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Trending Now
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {trendingBooks.slice(0, 5).map((book) => (
                <div key={book.id} className="group cursor-pointer" onClick={onBrowseAsGuest}>
                  <div className="aspect-[2/3] rounded-lg overflow-hidden mb-2 bg-muted">
                    {book.coverImage ? (
                      <img src={book.coverImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="font-medium text-sm line-clamp-1">{book.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{book.author}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      
      {/* Book Carousel */}
      <LandingCarousel />
      
      {/* Curated Collections */}
      <CuratedCollectionsPreview />

      {/* User Testimonials / Recent Reviews */}
      {publicReviews.length > 0 && (
        <section className="w-full px-4 md:px-8 lg:px-16 py-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">What Our Readers Say</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {publicReviews.slice(0, 4).map((review: any, idx: number) => (
                <Card key={idx} className="border">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex text-yellow-500">
                        {[...Array(review.rating || 5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-current" />
                        ))}
                      </div>
                    </div>
                    {review.title && <p className="font-medium text-sm mb-1">{review.title}</p>}
                    <p className="text-sm text-muted-foreground line-clamp-3">{review.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      - {review.userName || "A Reader"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}
      
      {/* Features Grid */}
      <section className="w-full px-4 md:px-8 lg:px-16 py-16" aria-labelledby="features-heading">
        <div className="text-center mb-12">
          <h2 id="features-heading" className="text-3xl font-bold mb-4">Why AccessiBooks?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            We believe everyone deserves access to great literature. Our platform is built from the ground up with accessibility in mind.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <Card key={index} className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      
      {/* Community Section - Public Challenges & Leaderboard */}
      <PublicCommunitySection onJoin={openRegister} />
      
      {/* CTA Section */}
      <section className="w-full px-4 md:px-8 lg:px-16 py-16" aria-labelledby="cta-heading">
        <Card className="max-w-4xl mx-auto bg-primary text-primary-foreground">
          <CardContent className="py-12 text-center">
            <h2 id="cta-heading" className="text-3xl font-bold mb-4">Ready to Start Listening?</h2>
            <p className="text-lg opacity-90 mb-6 max-w-xl mx-auto">
              Join our community of audiobook lovers and discover your next favorite story.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                variant="secondary" 
                className="text-lg px-8"
                onClick={openRegister}
                data-testid="cta-get-started"
              >
                <Gift className="mr-2 h-5 w-5" />
                Create Free Account
              </Button>
            </div>
            <p className="text-sm opacity-75 mt-4">Get 250 XP welcome bonus + 7-day premium trial</p>
          </CardContent>
        </Card>
      </section>
      
      <Footer />
      
      {/* Login Modal */}
      <LoginModal 
        open={loginOpen} 
        onOpenChange={setLoginOpen}
        isRegistering={isRegistering}
        setIsRegistering={setIsRegistering}
      />
      <AiChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
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
  const { toggleHighContrast } = useAccessibility();
  const { currentBook, playBook, togglePlayPause, toggleMute, skip, changeSpeed, nextChapter, prevChapter, onTrackEndCallback } = useAudioContext();
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
      return next;
    });
  }, []);
  const { 
    checkAccess, 
    showUpgradeModal, 
    blockedContent, 
    dismissUpgradeModal, 
    handleUpgrade, 
    isUpgrading,
    showPreview,
    previewBook,
    dismissPreview,
    handlePreviewUpgrade,
  } = useContentAccess();
  const { isPremium, upgradeToPremium } = useSubscription();
  const [engagementUpsell, setEngagementUpsell] = useState<{ type: "book_complete" | "streak_milestone" | "listening_milestone"; detail: string; open: boolean }>({ type: "book_complete", detail: "", open: false });

  useEffect(() => {
    if (isPremium) return;
    const audioCtx = onTrackEndCallback;
    audioCtx.current = () => {
      if (isPremium) return;
      const title = currentBook?.title || "a book";
      const triggerId = `book_complete_${title.replace(/\s+/g, "_").toLowerCase()}`;
      if (!hasShownUpsell(triggerId)) {
        setEngagementUpsell({ type: "book_complete", detail: title, open: true });
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
    onSkipBackward: () => skip(-30),
    onSkipForward: () => skip(30),
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
  });

  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    document.addEventListener("accessibooks:open-shortcuts", handler);
    return () => document.removeEventListener("accessibooks:open-shortcuts", handler);
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
                    className="text-muted-foreground hover:text-primary transition-colors flex items-center"
                  >
                    <Home className="h-4 w-4" />
                    <span className="sr-only">Home</span>
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
                  <div id="library-panel" role="region" data-testid="panel-library">
                    <Library onSelectBook={handleSelectBook} />
                  </div>
                </Route>
                <Route path="/player">
                  <div id="player-panel" role="region" data-testid="panel-player">
                    <Player book={selectedBook || currentBook} onBackToLibrary={handleBackToLibrary} onViewAuthor={handleViewAuthor} />
                  </div>
                </Route>
                <Route path="/reader">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="reader-panel" role="region" data-testid="panel-reader">
                      {selectedBook ? <EbookReader book={selectedBook} onBack={handleBackToLibrary} /> : <Library onSelectBook={handleSelectBook} />}
                    </div>
                  </Suspense>
                </Route>
                <Route path="/author/:name">
                  {(params) => (
                    <Suspense fallback={<LoadingSpinner />}>
                      <div id="author-panel" role="region" data-testid="panel-author">
                        <AuthorPage authorName={decodeURIComponent(params.name)} onBack={handleBackToLibrary} />
                      </div>
                    </Suspense>
                  )}
                </Route>
                <Route path="/feed">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="feed-panel" role="region" data-testid="panel-feed">
                      <SocialFeed />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/stats">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="stats-panel" role="region" data-testid="panel-stats" className="space-y-8">
                      <GamificationDashboard />
                      <BattlePassComponent />
                      <YearInReview />
                      <ReferralSection />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/usage">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="usage-panel" role="region" data-testid="panel-usage">
                      <UsageDashboard isPremium={isPremium} onUpgrade={() => upgradeToPremium("monthly")} />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/publish">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="publish-panel" role="region" data-testid="panel-publish">
                      <AuthorDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/party">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="party-panel" role="region" data-testid="panel-party">
                      <ListeningParty book={selectedBook || currentBook} onBack={handleBackToLibrary} />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/queue">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="queue-panel" role="region" data-testid="panel-queue">
                      <StreamingQueue onBack={handleBackToLibrary} />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/advertise">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="advertise-panel" role="region" data-testid="panel-advertise">
                      <AdvertiserDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/billing">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="billing-panel" role="region" data-testid="panel-billing">
                      <BillingDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/downloads">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="downloads-panel" role="region" data-testid="panel-downloads">
                      <OfflineDownloads />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/loans">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="loans-panel" role="region" data-testid="panel-loans">
                      <MyLoans onSelectBook={handleSelectBook} />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/referrals">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="referrals-panel" role="region" data-testid="panel-referrals">
                      <ReferralsPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/social">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="social-panel" role="region" data-testid="panel-social">
                      <SocialHub />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/family">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="family-panel" role="region" data-testid="panel-family">
                      <FamilyPlan />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/enterprise">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="enterprise-panel" role="region" data-testid="panel-enterprise">
                      <EnterprisePage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/moderation">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="moderation-panel" role="region" data-testid="panel-moderation">
                      <AdminModerationPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/health">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="health-panel" role="region" data-testid="panel-health" className="space-y-8">
                      <AdminHealthDashboard />
                      <ChurnDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/trust">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="trust-panel" role="region" data-testid="panel-trust">
                      <TrustPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/institutional">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="institutional-panel" role="region" data-testid="panel-institutional">
                      <InstitutionalPage />
                    </div>
                  </Suspense>
                </Route>
                <Route path="/moat-metrics">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div id="moat-metrics-panel" role="region" data-testid="panel-moat-metrics">
                      <MoatDashboard />
                    </div>
                  </Suspense>
                </Route>
                <Route>
                  <div id="library-panel" role="region" data-testid="panel-library">
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
      />

      <EngagementUpsell
        type={engagementUpsell.type}
        detail={engagementUpsell.detail}
        open={engagementUpsell.open}
        onOpenChange={(open) => setEngagementUpsell(prev => ({ ...prev, open }))}
        onUpgrade={(plan) => { setEngagementUpsell(prev => ({ ...prev, open: false })); upgradeToPremium(plan || "monthly"); }}
      />

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
  const { toggleHighContrast } = useAccessibility();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useKeyboardShortcuts({
    onHighContrast: toggleHighContrast,
    onOpenShortcuts: () => setShortcutsOpen(true),
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
  const { isAuthenticated, isLoading } = useAuth();
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

  return (
    <TooltipProvider>
      <Router>
        <AudioProvider>
          <AudioAdManager />
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
          <AccessibilityWidget />
          <Toaster />
        </AudioProvider>
      </Router>
    </TooltipProvider>
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

function AppWrapper() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

export default AppWrapper;