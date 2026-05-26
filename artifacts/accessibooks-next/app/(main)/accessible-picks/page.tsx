"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AccessiblePicksPage = lazy(() => import("@/page-views/accessible-picks"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="accessible-picks-panel" role="region" aria-label="Accessible Picks" data-testid="panel-accessible-picks">
        <AccessiblePicksPage />
      </div>
    </Suspense>
  );
}
