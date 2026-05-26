"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const InstitutionalPage = lazy(() => import("@/page-views/institutional"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="institutional-panel" role="region" aria-label="Institutional" data-testid="panel-institutional">
        <InstitutionalPage />
      </div>
    </Suspense>
  );
}
