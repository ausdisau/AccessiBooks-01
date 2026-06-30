import { useQuery } from "@tanstack/react-query";

export type AiAddonFeatureKey =
  | "ai_narration"
  | "comprehension_companion"
  | "ai_translation";

export interface AiAddonStatus {
  feature: AiAddonFeatureKey;
  label: string;
  description: string;
  tier: string;
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  allowed: boolean;
  upgradeRequired: boolean;
}

export interface AiAddonsResponse {
  tier: string;
  addons: AiAddonStatus[];
}

export function useAiAddons(enabled = true) {
  const query = useQuery<AiAddonsResponse>({
    queryKey: ["/api/ai-addons/status"],
    retry: false,
    enabled,
  });

  const addonsByFeature = (query.data?.addons ?? []).reduce(
    (acc, addon) => {
      acc[addon.feature] = addon;
      return acc;
    },
    {} as Record<AiAddonFeatureKey, AiAddonStatus | undefined>,
  );

  return {
    tier: query.data?.tier ?? "free",
    addons: query.data?.addons ?? [],
    addonsByFeature,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
