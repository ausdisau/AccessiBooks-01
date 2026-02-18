import { useState } from "react";
import { Crown, Check, Loader2, CreditCard, Bitcoin } from "lucide-react";
import { SiPaypal } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubscription } from "@/hooks/use-subscription";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import PayPalButton from "./PayPalButton";

const PREMIUM_FEATURES = [
  "Ad-free listening experience",
  "Unlimited bookmarks",
  "Offline playback (coming soon)",
  "Priority customer support",
  "Early access to new features",
  "Enhanced playback controls",
];

interface PaymentMethods {
  stripe: boolean;
  paypal: boolean;
  coinbase: boolean;
  supportedCryptos: string[];
}

export function SubscriptionCard() {
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "paypal" | "crypto">("stripe");
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");
  const [isCryptoProcessing, setIsCryptoProcessing] = useState(false);
  
  const { 
    isPremium, 
    tier, 
    upgradeToPremium, 
    isUpgrading,
    cancelSubscription,
    isCancelling,
    subscription
  } = useSubscription();

  const { data: paymentMethods } = useQuery<PaymentMethods>({
    queryKey: ["/api/payment-methods"],
  });

  const handleCryptoPayment = async () => {
    setIsCryptoProcessing(true);
    try {
      const response = await fetch("/api/crypto/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: "9.99",
          currency: "USD",
          name: "AccessiBooks Premium",
          description: "Monthly premium subscription",
          type: "subscription",
        }),
      });

      const data = await response.json();
      
      if (data.hosted_url) {
        window.open(data.hosted_url, "_blank");
        toast({
          title: "Crypto Payment Started",
          description: "Complete your payment in the Coinbase Commerce window.",
        });
      } else {
        throw new Error(data.error || "Failed to create crypto charge");
      }
    } catch (error) {
      console.error("Crypto payment error:", error);
      toast({
        title: "Payment Error",
        description: "Failed to initiate crypto payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCryptoProcessing(false);
    }
  };

  const handlePayPalSuccess = () => {
    toast({
      title: "Payment Successful",
      description: "Welcome to AccessiBooks Premium!",
    });
    window.location.reload();
  };

  const hasMultipleMethods = [
    paymentMethods?.stripe,
    paymentMethods?.paypal,
    paymentMethods?.coinbase,
  ].filter(Boolean).length > 1;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2">
          <Crown className={`h-10 w-10 ${isPremium ? "text-amber-500" : "text-muted-foreground"}`} />
        </div>
        <CardTitle className="flex items-center justify-center gap-2">
          {isPremium ? "Premium Member" : "Free Plan"}
          {isPremium && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {isPremium 
            ? "You have access to all premium features" 
            : "Upgrade for ad-free listening and premium features"
          }
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!isPremium && (
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`relative rounded-lg border p-4 cursor-pointer transition-all ${
                selectedPlan === "monthly"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/50"
              }`}
              onClick={() => setSelectedPlan("monthly")}
            >
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground mb-1">Monthly</p>
                <div className="text-2xl font-bold text-foreground">$9.99</div>
                <p className="text-xs text-muted-foreground">/month</p>
                <p className="text-xs text-muted-foreground mt-2">Cancel anytime</p>
              </div>
            </div>
            <div
              className={`relative rounded-lg border p-4 cursor-pointer transition-all ${
                selectedPlan === "annual"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-amber-500/50 hover:border-amber-500"
              }`}
              onClick={() => setSelectedPlan("annual")}
            >
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white hover:bg-amber-500 text-[10px] px-2">
                Save 17%
              </Badge>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground mb-1">Annual</p>
                <div className="text-2xl font-bold text-foreground">$8.33</div>
                <p className="text-xs text-muted-foreground">/month</p>
                <p className="text-xs text-muted-foreground mt-1 line-through">$9.99/mo</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">$99.99/year</p>
              </div>
            </div>
          </div>
        )}

        <ul className="space-y-3">
          {PREMIUM_FEATURES.map((feature, index) => (
            <li key={index} className="flex items-center gap-3">
              <Check className={`h-5 w-5 ${isPremium ? "text-green-500" : "text-muted-foreground"}`} />
              <span className={isPremium ? "text-foreground" : "text-muted-foreground"}>
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {isPremium ? (
          <div className="space-y-3">
            {subscription?.subscriptionEndDate && (
              <p className="text-sm text-center text-muted-foreground">
                Renews on {new Date(subscription.subscriptionEndDate).toLocaleDateString()}
              </p>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => cancelSubscription()}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Cancel Subscription"
              )}
            </Button>
          </div>
        ) : hasMultipleMethods ? (
          <Tabs value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              {paymentMethods?.stripe && (
                <TabsTrigger value="stripe" className="flex items-center gap-1 text-xs">
                  <CreditCard className="h-3 w-3" />
                  Card
                </TabsTrigger>
              )}
              {paymentMethods?.paypal && (
                <TabsTrigger value="paypal" className="flex items-center gap-1 text-xs">
                  <SiPaypal className="h-3 w-3" />
                  PayPal
                </TabsTrigger>
              )}
              {paymentMethods?.coinbase && (
                <TabsTrigger value="crypto" className="flex items-center gap-1 text-xs">
                  <Bitcoin className="h-3 w-3" />
                  Crypto
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="stripe">
              <Button
                className="w-full"
                size="lg"
                onClick={() => upgradeToPremium(selectedPlan)}
                disabled={isUpgrading}
              >
                {isUpgrading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading checkout...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay {selectedPlan === "annual" ? "$99.99/yr" : "$9.99/mo"} with Card
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="paypal">
              <div className="paypal-button-container">
                <PayPalButton
                  amount="9.99"
                  currency="USD"
                  intent="CAPTURE"
                  onSuccess={handlePayPalSuccess}
                />
              </div>
            </TabsContent>

            <TabsContent value="crypto" className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                Pay with Bitcoin, Ethereum, USDC & more
              </p>
              <Button
                className="w-full"
                size="lg"
                variant="outline"
                onClick={handleCryptoPayment}
                disabled={isCryptoProcessing}
              >
                {isCryptoProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating payment...
                  </>
                ) : (
                  <>
                    <Bitcoin className="h-4 w-4 mr-2" />
                    Pay {selectedPlan === "annual" ? "$99.99/yr" : "$9.99/mo"} with Crypto
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <Button
            className="w-full"
            size="lg"
            onClick={() => upgradeToPremium(selectedPlan)}
            disabled={isUpgrading}
          >
            {isUpgrading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading checkout...
              </>
            ) : (
              <>
                <Crown className="h-4 w-4 mr-2" />
                Subscribe {selectedPlan === "annual" ? "Annually — $99.99/yr" : "Monthly — $9.99/mo"}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
