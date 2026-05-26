"use client";
import { Suspense, lazy, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
const SlotDetailPage = lazy(() => import("@/page-views/ad-platform/slot-detail"));
export default function Page() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/ad-platform");
  }, [isAuthenticated, isLoading, router]);
  if (isLoading) return <div className="min-h-screen bg-[#0a0f1e]" />;
  if (!isAuthenticated) return null;
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0f1e]" />}>
      <SlotDetailPage />
    </Suspense>
  );
}
