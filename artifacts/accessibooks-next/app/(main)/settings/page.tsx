"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const AccountSettingsPage = lazy(() => import("@/page-views/account-settings").then((m) => ({ default: m.AccountSettingsPage })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="settings-panel" role="region" aria-label="Account Settings" data-testid="panel-settings">
        <AccountSettingsPage />
      </div>
    </Suspense>
  );
}
