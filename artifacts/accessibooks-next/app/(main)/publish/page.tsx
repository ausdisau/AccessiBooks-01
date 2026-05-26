"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AuthorDashboard = lazy(() => import("@/components/author-dashboard").then((m) => ({ default: m.AuthorDashboard })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="publish-panel" role="region" aria-label="Publish" data-testid="panel-publish">
        <AuthorDashboard />
      </div>
    </Suspense>
  );
}
