import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RewardType } from "@shared/rewardConfig";

export interface RewardOffer {
  eligible: true;
  rewardType: RewardType;
  label: string;
  durationMinutes: number;
  adPlacementId: string;
}

export interface RewardOfferIneligible {
  eligible: false;
  reason: string;
}

export interface ActiveReward {
  type: RewardType;
  label: string;
  expiresAt: string;
  remainingMinutes: number;
}

interface RewardStatusResponse {
  rewards: ActiveReward[];
}

interface CompleteRewardResponse {
  granted: boolean;
  reward?: { label: string; expiresAt: string };
  error?: string;
}

export function useRewardedAd(rewardType?: RewardType) {
  const offerQuery = useQuery<RewardOffer | RewardOfferIneligible>({
    queryKey: ["/api/ads/reward/offer", rewardType ?? "ad_light_listening"],
    queryFn: async () => {
      const url = rewardType
        ? `/api/ads/reward/offer?rewardType=${rewardType}`
        : "/api/ads/reward/offer";
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return { eligible: false, reason: "server_error" } as RewardOfferIneligible;
      return r.json();
    },
    retry: false,
    staleTime: 60 * 1000,
  });

  const statusQuery = useQuery<RewardStatusResponse>({
    queryKey: ["/api/ads/reward/status"],
    queryFn: async () => {
      const r = await fetch("/api/ads/reward/status", { credentials: "include" });
      if (!r.ok) return { rewards: [] };
      return r.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const startMutation = useMutation({
    mutationFn: async ({
      rewardType: rt,
      bookId,
    }: {
      rewardType: RewardType;
      bookId?: string;
    }): Promise<{ ok: boolean; impressionId?: string; reason?: string }> => {
      const r = await apiRequest("POST", "/api/ads/reward/start", { rewardType: rt, bookId });
      return r.json();
    },
  });

  const ackMutation = useMutation({
    mutationFn: async ({ impressionId }: { impressionId: string }) => {
      const r = await apiRequest("POST", "/api/ads/reward/ack", { impressionId });
      return r.json();
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({
      impressionId,
      rewardType: rt,
    }: {
      impressionId: string;
      rewardType: RewardType;
    }): Promise<CompleteRewardResponse> => {
      const r = await apiRequest("POST", "/api/ads/reward/complete", {
        impressionId,
        rewardType: rt,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/reward/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/reward/offer"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  const offer = offerQuery.data;
  const isEligible = offer?.eligible === true;

  return {
    offer: isEligible ? (offer as RewardOffer) : null,
    isEligible,
    ineligibleReason: !isEligible ? (offer as RewardOfferIneligible | undefined)?.reason : undefined,
    isLoadingOffer: offerQuery.isLoading,
    activeRewards: statusQuery.data?.rewards ?? [],
    isLoadingRewards: statusQuery.isLoading,
    startSession: startMutation.mutateAsync,
    ackSession: ackMutation.mutateAsync,
    completeReward: completeMutation.mutateAsync,
    isCompleting: completeMutation.isPending,
    completionResult: completeMutation.data,
  };
}
