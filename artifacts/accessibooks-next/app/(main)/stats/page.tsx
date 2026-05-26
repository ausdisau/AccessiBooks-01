"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const GamificationDashboard = lazy(() => import("@/components/gamification-dashboard").then((m) => ({ default: m.GamificationDashboard })));
const YearInReview = lazy(() => import("@/components/year-in-review").then((m) => ({ default: m.YearInReview })));
const ReferralSection = lazy(() => import("@/components/referral-section").then((m) => ({ default: m.ReferralSection })));
const AchievementsPage = lazy(() => import("@/components/completion-certificate").then((m) => ({ default: m.AchievementsPage })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="stats-panel" role="region" aria-label="Statistics" data-testid="panel-stats" className="space-y-8">
        <GamificationDashboard />
        <AchievementsPage />
        <YearInReview />
        <ReferralSection />
      </div>
    </Suspense>
  );
}
