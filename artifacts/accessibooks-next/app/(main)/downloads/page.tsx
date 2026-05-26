"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const OfflineDownloads = lazy(() => import("@/components/offline-downloads").then((m) => ({ default: m.OfflineDownloads })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="downloads-panel" role="region" aria-label="Downloads" data-testid="panel-downloads">
        <OfflineDownloads />
      </div>
    </Suspense>
  );
}
