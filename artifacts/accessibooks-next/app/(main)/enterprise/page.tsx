"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const EnterprisePage = lazy(() => import("@/page-views/enterprise"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="enterprise-panel" role="region" aria-label="Enterprise" data-testid="panel-enterprise">
        <EnterprisePage />
      </div>
    </Suspense>
  );
}
