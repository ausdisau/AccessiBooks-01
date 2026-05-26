"use client";
import { Library } from "@/page-views/library";
import { useSelection } from "@/contexts/SelectionContext";
export default function Page() {
  const { handleSelectBook } = useSelection();
  return (
    <div id="library-panel" role="region" aria-label="Library" data-testid="panel-library">
      <Library onSelectBook={handleSelectBook} />
    </div>
  );
}
