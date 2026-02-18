import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SubscriptionStatus {
  subscriptionTier: "free" | "premium";
  subscriptionEndDate: string | null;
  stripeSubscriptionId: string | null;
  isPremium: boolean;
}

export function useSubscription() {
  const { data: status, isLoading, error } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
    retry: false,
  });

  const upgradeMutation = useMutation({
    mutationFn: async (plan?: "monthly" | "annual") => {
      const queryParam = plan ? `?plan=${plan}` : "";
      const response = await apiRequest("POST", `/api/subscription/create-checkout${queryParam}`);
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

  return {
    isPremium: status?.isPremium ?? false,
    tier: status?.subscriptionTier ?? "free",
    subscriptionTier: status?.subscriptionTier ?? "free",
    subscription: status ? {
      subscriptionEndDate: status.subscriptionEndDate,
      stripeSubscriptionId: status.stripeSubscriptionId,
    } : null,
    isLoading,
    error,
    upgradeToPremium: upgradeMutation.mutate,
    isUpgrading: upgradeMutation.isPending,
    cancelSubscription: cancelMutation.mutate,
    isCancelling: cancelMutation.isPending,
  };
}
