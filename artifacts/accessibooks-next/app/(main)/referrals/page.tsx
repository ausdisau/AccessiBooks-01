"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const ReferralsPage = lazy(() => import("@/page-views/referrals").then((m) => ({ default: m.ReferralsPage })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="referrals-panel" role="region" aria-label="Referrals" data-testid="panel-referrals">
        <ReferralsPage />
      </div>
    </Suspense>
  );
}
