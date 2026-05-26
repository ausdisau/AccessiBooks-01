"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const MyActivityPage = lazy(() => import("@/page-views/my-activity"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="activity-panel" role="region" aria-label="My Activity" data-testid="panel-activity">
        <MyActivityPage />
      </div>
    </Suspense>
  );
}
