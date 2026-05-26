"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const TrustPage = lazy(() => import("@/page-views/trust"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="trust-panel" role="region" aria-label="Trust & Safety" data-testid="panel-trust">
        <TrustPage />
      </div>
    </Suspense>
  );
}
