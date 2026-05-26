"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const BillingDashboard = lazy(() => import("@/components/billing-dashboard").then((m) => ({ default: m.BillingDashboard })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="billing-panel" role="region" aria-label="Billing" data-testid="panel-billing">
        <BillingDashboard />
      </div>
    </Suspense>
  );
}
