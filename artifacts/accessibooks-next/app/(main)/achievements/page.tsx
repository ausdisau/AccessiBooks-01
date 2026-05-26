"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AchievementsPage = lazy(() => import("@/components/completion-certificate").then((m) => ({ default: m.AchievementsPage })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="achievements-panel" role="region" aria-label="Achievements" data-testid="panel-achievements">
        <AchievementsPage />
      </div>
    </Suspense>
  );
}
