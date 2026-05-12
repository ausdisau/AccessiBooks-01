import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SubscriptionTier } from "@shared/schema";

interface TierFeatures {
  skipLimit: number;
  audioQuality: number;
  maxDevices: number;
  adsEnabled: boolean;
  offlineEnabled: boolean;
  ttsDaily: number;
  bookmarkLimit: number;
}

interface SubscriptionStatus {
  subscriptionTier: SubscriptionTier;
  subscriptionEndDate: string | null;
  stripeSubscriptionId: string | null;
  isPremium: boolean;
  isPlus: boolean;
  isPaid: boolean;
  features: TierFeatures;
  discountRate: number;
}

export function useSubscription() {
  const { data: status, isLoading, error } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
    retry: false,
  });

  const upgradeMutation = useMutation({
    mutationFn: async ({ tier = "premium", plan = "monthly" }: { tier?: "plus" | "premium"; plan?: "monthly" | "annual" }) => {
      const response = await apiRequest("POST", `/api/subscription/create-checkout?tier=${tier}&plan=${plan}`);
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/cancel");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
    },
  });

  const tier = status?.subscriptionTier ?? "free";

  return {
    isPremium: status?.isPremium ?? false,
    isPlus: status?.isPlus ?? false,
    isPaid: status?.isPaid ?? false,
    tier,
    subscriptionTier: tier,
    features: status?.features ?? null,
    discountRate: status?.discountRate ?? 0,
    subscription: status ? {
      subscriptionEndDate: status.subscriptionEndDate,
      stripeSubscriptionId: status.stripeSubscriptionId,
    } : null,
    isLoading,
    error,
    upgradeToPremium: (planOrTierObj: "monthly" | "annual" | { tier?: "plus" | "premium"; plan?: "monthly" | "annual" }) => {
      if (typeof planOrTierObj === "string") {
        upgradeMutation.mutate({ tier: "premium", plan: planOrTierObj });
      } else {
        upgradeMutation.mutate(planOrTierObj);
      }
    },
    upgradeToTier: (tier: "plus" | "premium", plan: "monthly" | "annual" = "monthly") => {
      upgradeMutation.mutate({ tier, plan });
    },
    isUpgrading: upgradeMutation.isPending,
    cancelSubscription: cancelMutation.mutate,
    isCancelling: cancelMutation.isPending,
  };
}
