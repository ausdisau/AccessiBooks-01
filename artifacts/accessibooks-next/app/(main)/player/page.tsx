"use client";
import { Player } from "@/page-views/player";
import { useSelection } from "@/contexts/SelectionContext";
import { useAudioContext } from "@/contexts/audio-context";
export default function Page() {
  const { selectedBook, handleBackToLibrary, handleViewAuthor } = useSelection();
  const { currentBook } = useAudioContext();
  return (
    <div id="player-panel" role="region" aria-label="Player" data-testid="panel-player">
      <Player book={selectedBook || currentBook} onBackToLibrary={handleBackToLibrary} onViewAuthor={handleViewAuthor} />
    </div>
  );
}
