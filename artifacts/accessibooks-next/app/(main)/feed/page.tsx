"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const SocialFeed = lazy(() => import("@/components/social-feed").then((m) => ({ default: m.SocialFeed })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="feed-panel" role="region" aria-label="Social Feed" data-testid="panel-feed">
        <SocialFeed />
      </div>
    </Suspense>
  );
}
