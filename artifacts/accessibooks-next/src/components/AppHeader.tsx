import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { AccessibilityControls } from "@/components/accessibility-controls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { AccessibilityCoachPanel } from "@/components/accessibility-coach-panel";
import { NotificationCenter } from "@/components/notification-center";
import { PremiumBadge } from "@/components/premium-badge";
import { SubscriptionCard } from "@/components/subscription-card";
import { Menu, X, Search, MessageCircle, Gift, HeartHandshake, User, LogOut, Settings } from "lucide-react";
import { sidebarNavGroups, type SidebarMode } from "@/components/sidebar-nav-config";


export function AppHeader({ sidebarMode, onToggleSidebar }: { 
  sidebarMode: SidebarMode; 
  onToggleSidebar: () => void; 
}) {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachSeed, setCoachSeed] = useState<string | undefined>(undefined);
  const [donateOpen, setDonateOpen] = useState(false);

  // Derive page title from location
  const getPageTitle = (path: string) => {
    if (path === "/" || path === "") return "Library";
    const found = sidebarNavGroups.flatMap(g => g.items).find(i => i.path === path || (path !== "/" && i.path !== "/" && path.startsWith(i.path)));
    return found ? found.label : "";
  };
  const pageTitle = getPageTitle(location);

  // Voice intents in MainApp (Task #68) dispatch this event with an
  // optional seeded message. We capture the message into state so the
  // coach panel can auto-send it as soon as it finishes initializing,
  // avoiding the race where the panel's own listener isn't mounted yet.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) setCoachSeed(detail.message);
      setCoachOpen(true);
    };
    document.addEventListener("accessibooks:open-coach", handler);
    return () => document.removeEventListener("accessibooks:open-coach", handler);
  }, []);

  const handleLogout = () => {
    // Drop the bearer token before navigating, otherwise the session cookie
    // gets destroyed server-side but the JWT survives in localStorage and
    // continues to authenticate subsequent requests.
    void import("@/lib/authToken").then(({ clearAuthToken }) => {
      clearAuthToken();
      window.location.href = "/api/logout";
    });
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
    <header className="bg-card/95 backdrop-blur-md border-b border-border h-14 flex items-center px-4 sm:px-6 sticky top-0 z-30" role="banner">
      <div className="flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          data-testid="hamburger-menu-btn"
          className="h-9 w-9"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {/* Page title in header */}
        <h1 className="text-sm font-semibold ml-2 hidden sm:block truncate max-w-[200px]">
          {pageTitle}
        </h1>
        <Button variant="ghost" size="sm" onClick={() => setMobileSearchOpen(!mobileSearchOpen)} className="p-2 md:hidden flex items-center gap-1" aria-label="Search">
          {mobileSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
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
              {user.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover border border-border"
                  data-testid="img-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium" data-testid="text-username">
                {user.firstName && user.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user.firstName || user.email || "User"
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
    <AccessibilityCoachPanel
      isOpen={coachOpen}
      onClose={() => setCoachOpen(false)}
      seedMessage={coachSeed}
      onSeedConsumed={() => setCoachSeed(undefined)}
    />

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
