"use client";
import { Suspense, lazy } from "react";
const ClipViewPage = lazy(() => import("@/page-views/clip-view"));
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ClipViewPage />
    </Suspense>
  );
}
