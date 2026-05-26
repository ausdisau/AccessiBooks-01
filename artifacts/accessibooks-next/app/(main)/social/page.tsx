"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const SocialHub = lazy(() => import("@/components/social-hub").then((m) => ({ default: m.SocialHub })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="social-panel" role="region" aria-label="Social Hub" data-testid="panel-social">
        <SocialHub />
      </div>
    </Suspense>
  );
}
