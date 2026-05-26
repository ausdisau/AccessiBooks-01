"use client";
import { Suspense, lazy } from "react";
const AdPlatformLanding = lazy(() => import("@/page-views/ad-platform/landing"));
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e]" />}>
      <AdPlatformLanding />
    </Suspense>
  );
}
