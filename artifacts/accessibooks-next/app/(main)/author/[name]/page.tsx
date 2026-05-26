"use client";
import { Suspense, lazy } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
const AuthorPage = lazy(() => import("@/components/author-page").then((m) => ({ default: m.AuthorPage })));
export default function Page() {
  const params = useParams<{ name: string }>();
  const { handleBackToLibrary } = useSelection();
  const name = decodeURIComponent(params?.name || "");
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="author-panel" role="region" aria-label="Author" data-testid="panel-author">
        <AuthorPage authorName={name} onBack={handleBackToLibrary} />
      </div>
    </Suspense>
  );
}
