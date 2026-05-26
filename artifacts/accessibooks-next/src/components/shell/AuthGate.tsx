"use client";

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LandingPage } from "@/components/LandingHelpers";
import { GuestShell } from "./GuestShell";
import { MainShell } from "./MainShell";
import { WelcomeBonusModal } from "@/components/welcome-bonus-modal";
import { OnboardingFlow } from "@/components/onboarding-flow";

const AdvertiserDashboard = lazy(() => import("@/page-views/ad-platform/advertiser-dashboard"));
const PublisherDashboard = lazy(() => import("@/page-views/ad-platform/publisher-dashboard"));
const AdminPlatformDashboard = lazy(() => import("@/page-views/ad-platform/admin-dashboard"));

/**
 * Owns the visitor / authenticated / ad-role branching that used to live in
 * the monolithic App() in App.tsx. Wraps every `(main)` route — standalone
 * routes (clip view, hands-free sign-in, ad-platform marketing, etc.) live
 * outside the (main) route group so they bypass this gate.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const [guestMode, setGuestMode] = useState(false);
  const [showWelcomeBonus, setShowWelcomeBonus] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    setGuestMode(false);
    const hasSeenWelcome = localStorage.getItem("accessibooks_welcome_shown");
    if (!hasSeenWelcome) {
      setShowWelcomeBonus(true);
      localStorage.setItem("accessibooks_welcome_shown", "true");
    }
  }, [isAuthenticated]);

  const handleWelcomeBonusClose = (open: boolean) => {
    setShowWelcomeBonus(open);
    if (!open) {
      const hasOnboarded = localStorage.getItem("accessibooks_onboarding_done");
      if (!hasOnboarded) setShowOnboarding(true);
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

  if (!isAuthenticated) {
    if (guestMode) return <GuestShell onExitGuest={() => setGuestMode(false)} />;
    return <LandingPage onBrowseAsGuest={() => setGuestMode(true)} />;
  }

  const adRole = user?.role;
  if (adRole === "advertiser" || adRole === "publisher" || adRole === "admin") {
    // Ad-platform users always see their dashboard; standalone routes like
    // /advertiser, /publisher, /admin, and /demo-slot live outside the (main)
    // group so they render via their own page.tsx without this gate.
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}>
        <AdRoleRedirect role={adRole as "advertiser" | "publisher" | "admin"} router={router} />
        {adRole === "advertiser" && <AdvertiserDashboard />}
        {adRole === "publisher" && <PublisherDashboard />}
        {adRole === "admin" && <AdminPlatformDashboard />}
      </Suspense>
    );
  }

  return (
    <>
      <MainShell>{children}</MainShell>
      <WelcomeBonusModal open={showWelcomeBonus} onOpenChange={handleWelcomeBonusClose} />
      <OnboardingFlow open={showOnboarding} onOpenChange={setShowOnboarding} onComplete={handleOnboardingComplete} />
    </>
  );
}

function AdRoleRedirect({ role, router }: { role: "advertiser" | "publisher" | "admin"; router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    const targetByRole = { advertiser: "/advertiser", publisher: "/publisher", admin: "/admin" } as const;
    const target = targetByRole[role];
    if (typeof window !== "undefined" && window.location.pathname !== target) {
      router.replace(target);
    }
  }, [role, router]);
  return null;
}
