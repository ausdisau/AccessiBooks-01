"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
/**
 * Stub: AuthGate short-circuits and renders the ad-platform dashboard for
 * users whose role matches (advertiser/publisher/admin) BEFORE this page
 * mounts. Regular authenticated users would otherwise see blank content
 * inside MainShell, so we bounce them back to the library.
 */
export default function Page() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return null;
}
