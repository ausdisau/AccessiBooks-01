"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AdminRevenuePage = lazy(() => import("@/page-views/admin-revenue"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="admin-revenue-panel" role="region" aria-label="Admin Revenue" data-testid="panel-admin-revenue">
        <AdminRevenuePage />
      </div>
    </Suspense>
  );
}
