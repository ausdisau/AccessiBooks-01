"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AudioAdvertiserDashboard = lazy(() => import("@/components/advertiser-dashboard").then((m) => ({ default: m.AdvertiserDashboard })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="advertise-panel" role="region" aria-label="Advertise" data-testid="panel-advertise">
        <AudioAdvertiserDashboard />
      </div>
    </Suspense>
  );
}
