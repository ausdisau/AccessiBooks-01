"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { Library } from "@/page-views/library";
import { useSelection } from "@/contexts/SelectionContext";
const EbookReader = lazy(() => import("@/components/ebook-reader").then((m) => ({ default: m.EbookReader })));
export default function Page() {
  const { selectedBook, handleSelectBook, handleBackToLibrary } = useSelection();
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="reader-panel" role="region" aria-label="Reader" data-testid="panel-reader">
        {selectedBook ? <EbookReader book={selectedBook} onBack={handleBackToLibrary} /> : <Library onSelectBook={handleSelectBook} />}
      </div>
    </Suspense>
  );
}
