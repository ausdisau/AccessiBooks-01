"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AdminHealthDashboard = lazy(() => import("@/components/admin-health").then((m) => ({ default: m.AdminHealthDashboard })));
const ChurnDashboard = lazy(() => import("@/components/churn-dashboard").then((m) => ({ default: m.ChurnDashboard })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="health-panel" role="region" aria-label="Admin Health" data-testid="panel-health" className="space-y-8">
        <AdminHealthDashboard />
        <ChurnDashboard />
      </div>
    </Suspense>
  );
}
