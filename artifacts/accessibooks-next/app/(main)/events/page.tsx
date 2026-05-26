"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const EventsPage = lazy(() => import("@/page-views/events"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="events-panel" role="region" aria-label="Live Events" data-testid="panel-events">
        <EventsPage />
      </div>
    </Suspense>
  );
}
