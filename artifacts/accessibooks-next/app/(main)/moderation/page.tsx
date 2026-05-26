"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AdminModerationPage = lazy(() => import("@/page-views/admin-moderation"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="moderation-panel" role="region" aria-label="Moderation" data-testid="panel-moderation">
        <AdminModerationPage />
      </div>
    </Suspense>
  );
}
