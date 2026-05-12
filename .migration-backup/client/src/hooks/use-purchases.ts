import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TITLE_PRICING, TIER_DISCOUNTS, type SubscriptionTier } from "@shared/schema";

interface Purchase {
  id: string;
  userId: string;
  bookId: string;
  bookTitle: string;
  amountCents: number;
  currency: string;
  stripePaymentId: string | null;
  status: string;
  purchasedAt: string;
}

interface PurchaseCheckResult {
  owned: boolean;
  purchase: Purchase | null;
}

export function usePurchases() {
  const { data, isLoading } = useQuery<{ purchases: Purchase[] }>({
    queryKey: ["/api/purchases"],
    retry: false,
  });

  return {
    purchases: data?.purchases ?? [],
    isLoading,
    ownedBookIds: new Set((data?.purchases ?? []).map(p => p.bookId)),
  };
}

export function useBookPurchase(bookId: string) {
  const { data, isLoading } = useQuery<PurchaseCheckResult>({
    queryKey: ["/api/purchases", bookId],
    retry: false,
    enabled: !!bookId,
  });

  return {
    owned: data?.owned ?? false,
    purchase: data?.purchase ?? null,
    isLoading,
  };
}

export function usePurchaseCheckout() {
  const mutation = useMutation({
    mutationFn: async ({ bookId, bookTitle, contentType }: { bookId: string; bookTitle: string; contentType?: string }) => {
      const response = await apiRequest("POST", "/api/purchase/checkout", {
        bookId,
        bookTitle,
        contentType: contentType || "default",
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
    },
  });

  return {
    purchaseTitle: mutation.mutate,
    isPurchasing: mutation.isPending,
  };
}

export function getDiscountedPrice(baseCents: number, tier: SubscriptionTier): { finalCents: number; discount: number; saved: number } {
  const discount = TIER_DISCOUNTS[tier] || 0;
  const finalCents = Math.round(baseCents * (1 - discount));
  return { finalCents, discount, saved: baseCents - finalCents };
}

export function getTitlePrice(contentType: string): number {
  const pricing = TITLE_PRICING[contentType as keyof typeof TITLE_PRICING] || TITLE_PRICING.default;
  return pricing.base;
}
