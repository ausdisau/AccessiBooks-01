"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const FamilyPlan = lazy(() => import("@/components/family-plan").then((m) => ({ default: m.FamilyPlan })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="family-panel" role="region" aria-label="Family Plan" data-testid="panel-family">
        <FamilyPlan />
      </div>
    </Suspense>
  );
}
