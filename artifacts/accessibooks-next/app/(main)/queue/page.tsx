"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
const StreamingQueue = lazy(() => import("@/components/streaming-queue").then((m) => ({ default: m.StreamingQueue })));
export default function Page() {
  const { handleBackToLibrary } = useSelection();
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="queue-panel" role="region" aria-label="Queue" data-testid="panel-queue">
        <StreamingQueue onBack={handleBackToLibrary} />
      </div>
    </Suspense>
  );
}
