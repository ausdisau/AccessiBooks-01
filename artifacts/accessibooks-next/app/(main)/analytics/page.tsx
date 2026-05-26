"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AdminAnalyticsPage = lazy(() => import("@/page-views/admin-analytics"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="analytics-panel" role="region" aria-label="Analytics Dashboard" data-testid="panel-analytics">
        <AdminAnalyticsPage />
      </div>
    </Suspense>
  );
}
