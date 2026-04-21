import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard, Download, ExternalLink, Crown, Star, DollarSign, Receipt,
  Clock, ArrowUpRight, ChevronLeft, ChevronRight, FileText, Gift,
  Check, SkipForward, Smartphone, BookOpen, Wifi, Headphones, Volume2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { TIER_FEATURES, TIER_PRICING } from "@shared/schema";
import { useSubscription } from "@/hooks/use-subscription";
import { GiftCards } from "./gift-cards";
import { PremiumBadge } from "./premium-badge";

function formatCents(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    completed: { variant: "default", label: "Completed" },
    pending: { variant: "secondary", label: "Pending" },
    failed: { variant: "destructive", label: "Failed" },
    refunded: { variant: "outline", label: "Refunded" },
  };
  const cfg = map[status] || { variant: "outline" as const, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    subscription: "Subscription",
    subscription_renewal: "Renewal",
    subscription_cancelled: "Cancellation",
    donation: "Donation",
    ad_spend: "Ad Spend",
  };
  return <span className="text-xs text-muted-foreground">{map[type] || type}</span>;
}

interface SubscriptionStatus {
  subscriptionTier: "free" | "plus" | "premium";
  subscriptionEndDate: string | null;
  stripeSubscriptionId: string | null;
  isPremium: boolean;
  isPlus: boolean;
  isPaid: boolean;
  features: typeof TIER_FEATURES["free"];
  pricing: typeof TIER_PRICING;
  discountRate: number;
}

interface SkipStatus {
  unlimited: boolean;
  remaining: number;
  resetIn: number;
  total?: number;
}

const PLAN_COMPARISON = [
  { label: "Ad-free listening", free: false, plus: true, premium: true, icon: Headphones },
  { label: "Audio quality", free: "128kbps", plus: "192kbps", premium: "320kbps HD", icon: Volume2 },
  { label: "Skips per hour", free: "6", plus: "Unlimited", premium: "Unlimited", icon: SkipForward },
  { label: "Devices", free: "2", plus: "3", premium: "5", icon: Smartphone },
  { label: "Offline downloads", free: false, plus: false, premium: true, icon: Wifi },
  { label: "Purchase discount", free: "None", plus: "10%", premium: "20%", icon: DollarSign },
  { label: "TTS (daily credits)", free: "None", plus: "10", premium: "Unlimited", icon: Headphones },
] as const;

function PlanBadge({ tier }: { tier: string }) {
  if (tier === "premium") {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500 gap-1"><Crown className="h-3 w-3" aria-hidden="true" /> Premium</Badge>;
  }
  if (tier === "plus") {
    return <Badge className="bg-blue-500 text-white hover:bg-blue-500 gap-1"><Star className="h-3 w-3" aria-hidden="true" /> Plus</Badge>;
  }
  return <Badge variant="outline" className="gap-1"><Headphones className="h-3 w-3" aria-hidden="true" /> Free</Badge>;
}

function UsageMeters({ tier, skipStatus }: { tier: "free" | "plus" | "premium"; skipStatus: SkipStatus | undefined }) {
  const features = TIER_FEATURES[tier];

  const skipUsed = skipStatus && !skipStatus.unlimited ? (6 - Math.max(0, skipStatus.remaining)) : 0;
  const skipTotal = 6;
  const skipPct = tier === "free" ? Math.min(100, (skipUsed / skipTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Usage This Period</h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <SkipForward className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Skips
            </span>
            <span className="text-muted-foreground tabular-nums">
              {skipStatus?.unlimited ? "Unlimited" : `${skipUsed} / ${skipTotal}`}
            </span>
          </div>
          {!skipStatus?.unlimited && (
            <Progress
              value={skipPct}
              className="h-2"
              aria-label={`Skips used: ${skipUsed} of ${skipTotal}`}
            />
          )}
          {skipStatus?.unlimited && (
            <div className="h-2 rounded-full bg-green-500/30 flex items-center px-1">
              <div className="h-1 w-full bg-green-500 rounded-full" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Devices
            </span>
            <span className="text-muted-foreground tabular-nums">
              Up to {features.maxDevices}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${(1 / features.maxDevices) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Volume2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Audio Quality
            </span>
            <span className="text-muted-foreground tabular-nums">
              {features.audioQuality}kbps
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${(features.audioQuality / 320) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanComparisonTable({ currentTier, onUpgrade }: { currentTier: "free" | "plus" | "premium"; onUpgrade: (tier: "plus" | "premium") => void }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Plan Comparison</h3>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[400px] text-sm" role="table" aria-label="Subscription plan comparison">
          <caption className="sr-only">Comparison of Free, Plus, and Premium subscription plans</caption>
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-[40%]">Feature</th>
              <th className={`text-center py-2 px-2 font-medium ${currentTier === "free" ? "text-foreground" : "text-muted-foreground"}`} scope="col">
                <div className="flex flex-col items-center gap-1">
                  <span>Free</span>
                  {currentTier === "free" && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Current</Badge>}
                </div>
              </th>
              <th className={`text-center py-2 px-2 font-medium ${currentTier === "plus" ? "text-blue-500" : "text-muted-foreground"}`} scope="col">
                <div className="flex flex-col items-center gap-1">
                  <span>Plus</span>
                  {currentTier === "plus"
                    ? <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0 hover:bg-blue-500">Current</Badge>
                    : <span className="text-[10px] text-muted-foreground">{TIER_PRICING.plus.monthlyDisplay}/mo</span>
                  }
                </div>
              </th>
              <th className={`text-center py-2 px-2 font-medium ${currentTier === "premium" ? "text-amber-500" : "text-muted-foreground"}`} scope="col">
                <div className="flex flex-col items-center gap-1">
                  <span>Premium</span>
                  {currentTier === "premium"
                    ? <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 hover:bg-amber-500">Current</Badge>
                    : <span className="text-[10px] text-muted-foreground">{TIER_PRICING.premium.monthlyDisplay}/mo</span>
                  }
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON.map((row, i) => (
              <tr
                key={row.label}
                className={`border-t border-border ${i % 2 === 0 ? "bg-muted/20" : ""}`}
              >
                <td className="py-2.5 pr-4 font-medium text-foreground">
                  <span className="flex items-center gap-1.5">
                    <row.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    {row.label}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-center text-muted-foreground">
                  {typeof row.free === "boolean"
                    ? row.free
                      ? <Check className="h-4 w-4 text-green-500 mx-auto" aria-label="Included" />
                      : <span className="text-muted-foreground/40" aria-label="Not included">—</span>
                    : row.free
                  }
                </td>
                <td className="py-2.5 px-2 text-center text-muted-foreground">
                  {typeof row.plus === "boolean"
                    ? row.plus
                      ? <Check className="h-4 w-4 text-green-500 mx-auto" aria-label="Included" />
                      : <span className="text-muted-foreground/40" aria-label="Not included">—</span>
                    : row.plus
                  }
                </td>
                <td className="py-2.5 px-2 text-center text-muted-foreground">
                  {typeof row.premium === "boolean"
                    ? row.premium
                      ? <Check className="h-4 w-4 text-green-500 mx-auto" aria-label="Included" />
                      : <span className="text-muted-foreground/40" aria-label="Not included">—</span>
                    : row.premium
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {currentTier !== "premium" && (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          {currentTier === "free" && (
            <Button
              onClick={() => onUpgrade("plus")}
              variant="outline"
              className="flex-1 border-blue-500 text-blue-500 hover:bg-blue-500/10"
            >
              <Star className="h-4 w-4 mr-2" aria-hidden="true" />
              Upgrade to Plus — {TIER_PRICING.plus.monthlyDisplay}/mo
            </Button>
          )}
          <Button
            onClick={() => onUpgrade("premium")}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Crown className="h-4 w-4 mr-2" aria-hidden="true" />
            {currentTier === "plus" ? "Upgrade to Premium" : "Go Premium"} — {TIER_PRICING.premium.monthlyDisplay}/mo
          </Button>
        </div>
      )}
    </div>
  );
}

export function BillingDashboard() {
  const [txPage, setTxPage] = useState(0);
  const pageSize = 10;

  const { upgradeToTier, cancelSubscription, isUpgrading, isCancelling } = useSubscription();

  const { data: subscriptionStatus, isLoading: statusLoading } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
  });

  const { data: skipStatus } = useQuery<SkipStatus>({
    queryKey: ["/api/monetization/skip-status"],
  });

  const { data: txData, isLoading: txLoading } = useQuery<any>({
    queryKey: ["/api/billing/transactions", txPage],
    queryFn: () =>
      fetch(`/api/billing/transactions?limit=${pageSize}&offset=${txPage * pageSize}`, {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery<any>({
    queryKey: ["/api/billing/invoices"],
  });

  const portalMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/billing/create-portal-session"),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    },
  });

  const transactions = txData?.transactions || [];
  const totalTx = txData?.total || 0;
  const totalPages = Math.ceil(totalTx / pageSize);
  const invoices = invoiceData?.invoices || [];

  const currentTier = subscriptionStatus?.subscriptionTier || "free";
  const hasStripeSubscription = !!subscriptionStatus?.stripeSubscriptionId;

  const handleUpgrade = (tier: "plus" | "premium") => {
    upgradeToTier(tier, "monthly");
  };

  return (
    <div className="space-y-6" role="region" aria-label="Billing and Payments">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" aria-hidden="true" />
            Billing & Payments
            <PremiumBadge size="md" />
          </h2>
          <p className="text-muted-foreground mt-1">
            View your plan, usage, payment history, and invoices
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => portalMutation.mutate()}
          disabled={portalMutation.isPending || !hasStripeSubscription}
          aria-label="Open billing management portal"
        >
          <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
          Manage Billing
        </Button>
      </div>

      {statusLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2">
                    <Crown className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Your Plan</CardTitle>
                    <CardDescription className="text-xs">
                      {subscriptionStatus?.subscriptionEndDate
                        ? `${currentTier === "free" ? "Expires" : "Renews"} ${formatDate(subscriptionStatus.subscriptionEndDate)}`
                        : currentTier === "free" ? "No active subscription" : "Active subscription"
                      }
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PlanBadge tier={currentTier} />
                  {currentTier !== "free" && hasStripeSubscription && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelSubscription()}
                      disabled={isCancelling}
                      className="text-destructive hover:text-destructive"
                      aria-label="Cancel subscription"
                    >
                      {isCancelling ? "Cancelling..." : "Cancel"}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-0">
              <UsageMeters tier={currentTier} skipStatus={skipStatus} />
              <Separator />
              <PlanComparisonTable currentTier={currentTier} onUpgrade={handleUpgrade} />
            </CardContent>
          </Card>
        </>
      )}

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" aria-hidden="true" />
            Transaction History
          </CardTitle>
          <CardDescription>
            All payments across Stripe, PayPal, and cryptocurrency
          </CardDescription>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
              <p>No transactions yet</p>
              <p className="text-sm">Your payment history will appear here</p>
            </div>
          ) : (
            <>
              <div className="space-y-2" role="list" aria-label="Transaction history">
                {transactions.map((tx: any) => (
                  <div
                    key={tx.id}
                    role="listitem"
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0" aria-hidden="true">
                        {tx.provider === "stripe" && <CreditCard className="h-4 w-4 text-indigo-500" />}
                        {tx.provider === "paypal" && <DollarSign className="h-4 w-4 text-blue-500" />}
                        {tx.provider === "coinbase" && <DollarSign className="h-4 w-4 text-orange-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{tx.description || tx.type}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {typeBadge(tx.type)}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(tx.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-semibold text-sm ${tx.status === "failed" ? "text-destructive" : ""}`}>
                        {tx.amountCents > 0 ? formatCents(tx.amountCents, tx.currency) : "—"}
                      </span>
                      {statusBadge(tx.status)}
                      {tx.receiptUrl && (
                        <a
                          href={tx.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="View receipt"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {txPage + 1} of {totalPages} ({totalTx} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage === 0}
                      onClick={() => setTxPage((p) => p - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage >= totalPages - 1}
                      onClick={() => setTxPage((p) => p + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" aria-hidden="true" />
            Invoices
          </CardTitle>
          <CardDescription>Download PDF invoices from Stripe</CardDescription>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" aria-hidden="true" />
              <p className="text-sm">No invoices available</p>
            </div>
          ) : (
            <div className="space-y-2" role="list" aria-label="Invoices">
              {invoices.map((inv: any) => (
                <div
                  key={inv.id}
                  role="listitem"
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{inv.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {inv.number || inv.id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(inv.date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-sm">
                      {formatCents(inv.amountCents, inv.currency)}
                    </span>
                    {statusBadge(inv.status || "completed")}
                    <div className="flex gap-1">
                      {inv.pdfUrl && (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Download PDF invoice"
                        >
                          <Button variant="ghost" size="sm">
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </a>
                      )}
                      {inv.hostedUrl && (
                        <a
                          href={inv.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View invoice online"
                        >
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <GiftCards />
    </div>
  );
}
