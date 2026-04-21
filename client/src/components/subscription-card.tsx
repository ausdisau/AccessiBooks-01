import { useState } from "react";
import { Crown, Check, Loader2, CreditCard, Zap, Star, X, Building2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { TIER_PRICING } from "@shared/schema";
import { Link } from "wouter";

function ComingSoonBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1.5 text-[11px] text-blue-700 dark:text-blue-300 mt-2"
    >
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <span>Upgrade flow coming next — check back soon.</span>
    </div>
  );
}

const TIERS = [
  {
    id: "free" as const,
    name: "Free",
    icon: Zap,
    color: "text-muted-foreground",
    borderColor: "border-border",
    bgColor: "",
    badgeColor: "",
    features: [
      { text: "All content with ads", included: true },
      { text: "128kbps audio quality", included: true },
      { text: "6 skips per hour", included: true },
      { text: "2 devices", included: true },
      { text: "10 bookmarks", included: true },
      { text: "Ad-free listening", included: false },
      { text: "Offline downloads", included: false },
      { text: "Text-to-Speech", included: false },
    ],
  },
  {
    id: "plus" as const,
    name: "Plus",
    icon: Star,
    color: "text-blue-500",
    borderColor: "border-blue-500",
    bgColor: "bg-blue-500/5",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    features: [
      { text: "All content, ad-free", included: true },
      { text: "192kbps audio quality", included: true },
      { text: "Unlimited skips", included: true },
      { text: "3 devices", included: true },
      { text: "Unlimited bookmarks", included: true },
      { text: "Ad-free listening", included: true },
      { text: "10 TTS pages/day", included: true },
      { text: "Offline downloads", included: false },
    ],
  },
  {
    id: "premium" as const,
    name: "Premium",
    icon: Crown,
    color: "text-amber-500",
    borderColor: "border-amber-500",
    bgColor: "bg-amber-500/5",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    features: [
      { text: "All content, ad-free", included: true },
      { text: "320kbps HD audio", included: true },
      { text: "Unlimited skips", included: true },
      { text: "5 devices", included: true },
      { text: "Unlimited bookmarks", included: true },
      { text: "Ad-free listening", included: true },
      { text: "Unlimited TTS", included: true },
      { text: "Offline downloads", included: true },
    ],
  },
];

export function SubscriptionCard() {
  const [isAnnual, setIsAnnual] = useState(true);
  const { toast } = useToast();
  const {
    tier,
    cancelSubscription,
    isCancelling,
    subscription,
  } = useSubscription();
  const isUpgrading = false;
  const handleUpgradeClick = (planName: string) => {
    toast({
      title: "Coming soon",
      description: `${planName} checkout will be available shortly.`,
    });
  };

  const getPrice = (tierId: "plus" | "premium") => {
    const pricing = TIER_PRICING[tierId];
    if (isAnnual) {
      return { display: pricing.yearlyMonthly, period: "/mo", total: pricing.yearlyDisplay + "/yr" };
    }
    return { display: pricing.monthlyDisplay, period: "/mo", total: null };
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Choose Your Plan</h2>
        <p className="text-muted-foreground">All content is free with ads. Upgrade for ad-free listening and more.</p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className={`text-sm ${!isAnnual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>Monthly</span>
          <Switch checked={isAnnual} onCheckedChange={setIsAnnual} />
          <span className={`text-sm ${isAnnual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            Annual
          </span>
          {isAnnual && (
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
              Save up to 17%
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((t) => {
          const isCurrentTier = tier === t.id;
          const isUpgrade = (t.id === "plus" && tier === "free") || (t.id === "premium" && (tier === "free" || tier === "plus"));
          const Icon = t.icon;
          const price = t.id !== "free" ? getPrice(t.id) : null;

          return (
            <Card
              key={t.id}
              className={`relative transition-all ${isCurrentTier ? `${t.borderColor} border-2 ${t.bgColor}` : "border"} ${t.id === "premium" ? "md:scale-105 premium-card-animated shadow-lg shadow-amber-500/10" : ""}`}
            >
              {t.id === "premium" && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="premium-shimmer-bg text-white border-0 px-3 py-1 text-xs font-bold shadow-md">
                    ⭐ Best Value
                  </Badge>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <Icon className={`h-8 w-8 mx-auto mb-1 ${t.color}`} />
                <CardTitle className="text-lg">
                  {t.name}
                  {isCurrentTier && (
                    <Badge variant="secondary" className={`ml-2 text-[10px] ${t.badgeColor || "bg-muted"}`}>
                      Current
                    </Badge>
                  )}
                </CardTitle>
                <div className="mt-2">
                  {t.id === "free" ? (
                    <div className="text-3xl font-bold text-foreground">$0</div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-foreground">{price!.display}</div>
                      <p className="text-xs text-muted-foreground">{price!.period}</p>
                      {price!.total && (
                        <p className="text-xs text-muted-foreground mt-0.5">Billed {price!.total}</p>
                      )}
                    </>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {t.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {feature.included ? (
                        <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 mt-0.5 text-muted-foreground/40 shrink-0" />
                      )}
                      <span className={feature.included ? "text-foreground" : "text-muted-foreground/60"}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {t.id === "free" ? (
                  isCurrentTier ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : null
                ) : isCurrentTier ? (
                  <div className="space-y-2">
                    {subscription?.subscriptionEndDate && (
                      <p className="text-xs text-center text-muted-foreground">
                        Renews {new Date(subscription.subscriptionEndDate).toLocaleDateString()}
                      </p>
                    )}
                    <Button variant="outline" className="w-full" onClick={() => cancelSubscription()} disabled={isCancelling}>
                      {isCancelling ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelling...</> : "Cancel Subscription"}
                    </Button>
                  </div>
                ) : isUpgrade ? (
                  <>
                    <Button
                      className={`w-full focus-visible:ring-2 focus-visible:ring-offset-2 ${t.id === "premium" ? "bg-amber-500 hover:bg-amber-600 text-white focus-visible:ring-amber-400" : ""}`}
                      onClick={() => handleUpgradeClick(t.name)}
                      aria-label={`Upgrade to ${t.name}`}
                    >
                      <CreditCard className="h-4 w-4 mr-2" aria-hidden="true" /> Upgrade to {t.name}
                    </Button>
                    <ComingSoonBanner />
                  </>
                ) : null}

                {t.id !== "free" && (
                  <p className="text-xs text-center text-muted-foreground">
                    {t.id === "plus" ? "10% off individual titles" : "20% off individual titles"}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      <div className="rounded-lg border border-dashed border-border p-4 flex items-start gap-3">
        <Building2 className="h-6 w-6 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold text-sm text-foreground">Institutional Access</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Available via partner organisations or libraries. If your school, library, or workplace provides AccessiBooks access, you can activate it through your institution.
          </p>
          <Link
            href="/institutional"
            className="inline-block mt-2 text-sm text-primary underline hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Contact us about institutional access
          </Link>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Don't want a subscription? Buy individual titles starting at $1.99 each.
        </p>
      </div>
    </div>
  );
}
