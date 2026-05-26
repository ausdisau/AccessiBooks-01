"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const MoatDashboard = lazy(() => import("@/page-views/moat-dashboard"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="moat-metrics-panel" role="region" aria-label="Moat Metrics" data-testid="panel-moat-metrics">
        <MoatDashboard />
      </div>
    </Suspense>
  );
}
