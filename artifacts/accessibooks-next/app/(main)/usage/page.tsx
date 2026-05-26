"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
const UsageDashboard = lazy(() => import("@/components/usage-dashboard").then((m) => ({ default: m.UsageDashboard })));
export default function Page() {
  const { isPremium, upgradeToPremium } = useSubscription();
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="usage-panel" role="region" aria-label="Usage" data-testid="panel-usage">
        <UsageDashboard isPremium={isPremium} onUpgrade={() => upgradeToPremium("monthly")} />
      </div>
    </Suspense>
  );
}
