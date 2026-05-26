"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AdminEntitlementsPage = lazy(() => import("@/page-views/admin-entitlements"));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="admin-entitlements-panel" role="region" aria-label="Tier Entitlements" data-testid="panel-admin-entitlements">
        <AdminEntitlementsPage />
      </div>
    </Suspense>
  );
}
