import { useQuery } from "@tanstack/react-query";

const STALE_TIME = 5 * 60 * 1000;

function buildUrl(base: string, from: string, to: string) {
  return `${base}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

export function useSubscriptionAnalytics(from: string, to: string) {
  return useQuery<{
    totalFree: number;
    totalPlus: number;
    totalPremium: number;
    newSignupsThisPeriod: number;
    upgradesThisPeriod: number;
    cancellationsThisPeriod: number;
    estimatedMRRCents: number;
  }>({
    queryKey: ["/api/admin/analytics/subscriptions", from, to],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/admin/analytics/subscriptions", from, to));
      if (!res.ok) throw new Error("Failed to fetch subscription analytics");
      return res.json();
    },
    staleTime: STALE_TIME,
  });
}

export function useAdAnalytics(from: string, to: string) {
  return useQuery<{
    impressionsServed: number;
    completionRate: number;
    clickRate: number;
    rewardedCompletions: number;
    estimatedAdRevenueCents: number;
    fillRate: number;
  }>({
    queryKey: ["/api/admin/analytics/ads", from, to],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/admin/analytics/ads", from, to));
      if (!res.ok) throw new Error("Failed to fetch ad analytics");
      return res.json();
    },
    staleTime: STALE_TIME,
  });
}

export function useListeningAnalytics(from: string, to: string) {
  return useQuery<{
    totalMinutesByTier: Record<string, number>;
    totalMinutes: number;
    topTitlesByTier: Record<string, Array<{ titleId: string; title: string | null; plays: number }>>;
    averageSessionMinutes: number;
    totalSessions: number;
  }>({
    queryKey: ["/api/admin/analytics/listening", from, to],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/admin/analytics/listening", from, to));
      if (!res.ok) throw new Error("Failed to fetch listening analytics");
      return res.json();
    },
    staleTime: STALE_TIME,
  });
}

export function useFunnelAnalytics(from: string, to: string) {
  return useQuery<{
    funnel: Array<{ step: string; count: number; dropoffRate: number }>;
    signupToUpgradeRate: number;
    upgradeToRetainRate: number;
    cancellationsCount: number;
  }>({
    queryKey: ["/api/admin/analytics/funnel", from, to],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/admin/analytics/funnel", from, to));
      if (!res.ok) throw new Error("Failed to fetch funnel analytics");
      return res.json();
    },
    staleTime: STALE_TIME,
  });
}

export function useAccessibilityAnalytics() {
  return useQuery<Array<{
    featureKey: string;
    featureName: string;
    enabledCount: number;
    percentage: number;
  }>>({
    queryKey: ["/api/admin/analytics/accessibility"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/accessibility");
      if (!res.ok) throw new Error("Failed to fetch accessibility analytics");
      return res.json();
    },
    staleTime: STALE_TIME,
  });
}
