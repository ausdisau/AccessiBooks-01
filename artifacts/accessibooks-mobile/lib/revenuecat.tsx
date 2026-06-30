import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import React, { createContext, useContext, useEffect } from "react";
import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";

import { fetchMe, syncRevenueCatEntitlements } from "./api";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

// RevenueCat entitlement identifiers (lookup_key). Keep these in sync with the
// seed script (scripts/src/seedRevenueCat.ts). Ordered weakest -> strongest.
export const REVENUECAT_ENTITLEMENTS = ["plus", "premium"] as const;
export type SubscriptionTier = "free" | "plus" | "premium";

function getRevenueCatApiKey(): string {
  if (
    !REVENUECAT_TEST_API_KEY ||
    !REVENUECAT_IOS_API_KEY ||
    !REVENUECAT_ANDROID_API_KEY
  ) {
    throw new Error("RevenueCat public API keys are not configured");
  }

  if (
    __DEV__ ||
    Platform.OS === "web" ||
    Constants.executionEnvironment === "storeClient"
  ) {
    return REVENUECAT_TEST_API_KEY;
  }
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

let configured = false;

export function initializeRevenueCat() {
  const apiKey = getRevenueCatApiKey();
  Purchases.setLogLevel(
    __DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN,
  );
  Purchases.configure({ apiKey });
  configured = true;
  if (__DEV__) console.log("Configured RevenueCat");
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

export function tierFromCustomerInfo(
  info: CustomerInfo | undefined,
): SubscriptionTier {
  const active = info?.entitlements.active ?? {};
  if (active["premium"]) return "premium";
  if (active["plus"]) return "plus";
  return "free";
}

function useSubscriptionContext() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 60_000,
  });
  const userId = meQuery.data?.id ?? null;

  // Link the RevenueCat customer to our server user id so purchases and the
  // server-side sync share the same app_user_id. No-ops when RC isn't
  // configured or the call is already in the desired state.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    (async () => {
      try {
        if (userId) {
          await Purchases.logIn(userId);
        } else {
          await Purchases.logOut();
        }
        if (!cancelled) {
          queryClient.invalidateQueries({
            queryKey: ["revenuecat", "customer-info"],
          });
        }
      } catch {
        /* RC unavailable / already logged in/out — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, queryClient]);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: async () => Purchases.getCustomerInfo(),
    enabled: configured,
    staleTime: 60_000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => Purchases.getOfferings(),
    enabled: configured,
    staleTime: 300_000,
  });

  // After a purchase/restore, reconcile the server account so subscriptionTier
  // (used to gate entitlements across web + mobile) reflects the new state.
  const syncServer = async () => {
    await syncRevenueCatEntitlements();
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    await customerInfoQuery.refetch();
  };

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: syncServer,
  });

  const restoreMutation = useMutation({
    mutationFn: async () => Purchases.restorePurchases(),
    onSuccess: syncServer,
  });

  const tier = tierFromCustomerInfo(customerInfoQuery.data);

  return {
    configured,
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    tier,
    isSubscribed: tier !== "free",
    isLoading:
      configured && (customerInfoQuery.isLoading || offeringsQuery.isLoading),
    error: offeringsQuery.error ?? customerInfoQuery.error ?? null,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    refresh: async () => {
      await Promise.all([
        customerInfoQuery.refetch(),
        offeringsQuery.refetch(),
      ]);
    },
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
