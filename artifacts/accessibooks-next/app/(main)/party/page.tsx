"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useAudioContext } from "@/contexts/audio-context";
const ListeningParty = lazy(() => import("@/components/listening-party").then((m) => ({ default: m.ListeningParty })));
export default function Page() {
  const { selectedBook, handleBackToLibrary } = useSelection();
  const { currentBook } = useAudioContext();
  const eventId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("event") : null;
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="party-panel" role="region" aria-label="Listening Party" data-testid="panel-party">
        <ListeningParty book={selectedBook || currentBook} onBack={handleBackToLibrary} eventId={eventId} />
      </div>
    </Suspense>
  );
}
