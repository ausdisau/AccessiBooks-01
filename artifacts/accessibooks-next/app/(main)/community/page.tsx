"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const CommunityPage = lazy(() => import("@/page-views/community"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="community-panel" role="region" aria-label="Community Bulletin" data-testid="panel-community">
        <CommunityPage />
      </div>
    </Suspense>
  );
}
