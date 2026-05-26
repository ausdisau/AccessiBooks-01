"use client";
import { Suspense, lazy } from "react";
const DemoSlotPage = lazy(() => import("@/page-views/ad-platform/demo-slot"));
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e]" />}>
      <DemoSlotPage />
    </Suspense>
  );
}
