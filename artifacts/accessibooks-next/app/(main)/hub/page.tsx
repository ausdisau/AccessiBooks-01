"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const HubPage = lazy(() => import("@/page-views/hub"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="hub-panel" role="region" aria-label="Engagement Hub" data-testid="panel-hub">
        <HubPage />
      </div>
    </Suspense>
  );
}
