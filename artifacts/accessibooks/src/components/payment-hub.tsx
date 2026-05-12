import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Bitcoin, ExternalLink } from "lucide-react";
import { SiPaypal } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import PayPalButton from "./PayPalButton";

interface PaymentMethods {
  stripe: boolean;
  paypal: boolean;
  coinbase: boolean;
  supportedCryptos: string[];
}

interface PaymentHubProps {
  amount: number;
  type: "subscription" | "donation";
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function PaymentHub({ amount, type, onSuccess, onCancel }: PaymentHubProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [customAmount, setCustomAmount] = useState(amount.toString());
  const [selectedMethod, setSelectedMethod] = useState<"stripe" | "paypal" | "crypto">("stripe");

  const { data: paymentMethods, isLoading: methodsLoading } = useQuery<PaymentMethods>({
    queryKey: ["/api/payment-methods"],
  });

  const handleStripePayment = async () => {
    setIsProcessing(true);
    try {
      const endpoint = type === "subscription" 
        ? "/api/subscription/create-checkout"
        : "/api/donate";
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          amount: parseFloat(customAmount),
          priceId: type === "subscription" ? undefined : undefined,
        }),
      });

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (error) {
      console.error("Stripe payment error:", error);
      toast({
        title: "Payment Error",
        description: "Failed to process payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCryptoPayment = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/crypto/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: parseFloat(customAmount),
          currency: "USD",
          name: type === "subscription" ? "AccessiBooks Premium" : "AccessiBooks Donation",
          description: type === "subscription" 
            ? "Monthly premium subscription" 
            : "Support AccessiBooks",
          type,
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
      setIsProcessing(false);
    }
  };

  const handlePayPalSuccess = (data: any) => {
    toast({
      title: "Payment Successful",
      description: "Thank you for your payment via PayPal!",
    });
    if (onSuccess) onSuccess();
  };

  const handlePayPalError = (error: any) => {
    toast({
      title: "Payment Error",
      description: "PayPal payment failed. Please try again.",
      variant: "destructive",
    });
  };

  if (methodsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasMultipleMethods = [
    paymentMethods?.stripe,
    paymentMethods?.paypal,
    paymentMethods?.coinbase,
  ].filter(Boolean).length > 1;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {type === "subscription" ? "Subscribe to Premium" : "Make a Donation"}
        </CardTitle>
        <CardDescription>
          {type === "subscription" 
            ? "Choose your preferred payment method for $9.99/month"
            : "Support AccessiBooks with a donation"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {type === "donation" && (
          <div className="space-y-2">
            <Label htmlFor="amount">Donation Amount (USD)</Label>
            <div className="flex gap-2">
              {[5, 10, 25, 50].map((preset) => (
                <Button
                  key={preset}
                  variant={customAmount === preset.toString() ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCustomAmount(preset.toString())}
                >
                  ${preset}
                </Button>
              ))}
            </div>
            <Input
              id="amount"
              type="number"
              min="1"
              step="0.01"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="Custom amount"
            />
          </div>
        )}

        {hasMultipleMethods ? (
          <Tabs value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              {paymentMethods?.stripe && (
                <TabsTrigger value="stripe" className="flex items-center gap-1">
                  <CreditCard className="h-4 w-4" />
                  Card
                </TabsTrigger>
              )}
              {paymentMethods?.paypal && (
                <TabsTrigger value="paypal" className="flex items-center gap-1">
                  <SiPaypal className="h-4 w-4" />
                  PayPal
                </TabsTrigger>
              )}
              {paymentMethods?.coinbase && (
                <TabsTrigger value="crypto" className="flex items-center gap-1">
                  <Bitcoin className="h-4 w-4" />
                  Crypto
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="stripe" className="mt-4">
              <Button 
                onClick={handleStripePayment} 
                disabled={isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Pay ${type === "subscription" ? "9.99" : customAmount} with Card
              </Button>
            </TabsContent>

            <TabsContent value="paypal" className="mt-4">
              <div className="paypal-button-container">
                <PayPalButton
                  amount={type === "subscription" ? "9.99" : customAmount}
                  currency="USD"
                  intent="CAPTURE"
                  onSuccess={handlePayPalSuccess}
                  onError={handlePayPalError}
                />
              </div>
            </TabsContent>

            <TabsContent value="crypto" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Pay with Bitcoin, Ethereum, USDC, or other cryptocurrencies
              </p>
              {paymentMethods?.supportedCryptos && (
                <div className="flex flex-wrap gap-2">
                  {paymentMethods.supportedCryptos.map((crypto) => (
                    <span
                      key={crypto}
                      className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs font-mono"
                    >
                      {crypto}
                    </span>
                  ))}
                </div>
              )}
              <Button 
                onClick={handleCryptoPayment} 
                disabled={isProcessing}
                className="w-full"
                variant="outline"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Bitcoin className="h-4 w-4 mr-2" />
                )}
                Pay ${type === "subscription" ? "9.99" : customAmount} with Crypto
                <ExternalLink className="h-3 w-3 ml-2" />
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <Button 
            onClick={handleStripePayment} 
            disabled={isProcessing}
            className="w-full"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CreditCard className="h-4 w-4 mr-2" />
            )}
            Pay ${type === "subscription" ? "9.99" : customAmount}
          </Button>
        )}

        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="w-full">
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface CryptoCharge {
  id: string;
  code: string;
  status: string;
  pricing?: any;
  payments?: any;
}

export function CryptoPaymentStatus({ chargeId }: { chargeId: string }) {
  const { data: charge, isLoading } = useQuery<CryptoCharge>({
    queryKey: ["/api/crypto/charge", chargeId],
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking payment status...
      </div>
    );
  }

  const status = charge?.status || "UNKNOWN";
  const statusColors: Record<string, string> = {
    NEW: "text-yellow-500",
    PENDING: "text-yellow-500",
    COMPLETED: "text-green-500",
    CONFIRMED: "text-green-500",
    FAILED: "text-red-500",
    EXPIRED: "text-gray-500",
  };

  return (
    <div className={`font-medium ${statusColors[status] || "text-gray-500"}`}>
      Payment Status: {status}
    </div>
  );
}
