import { useState } from "react";
import { Heart, Loader2, CreditCard, Bitcoin } from "lucide-react";
import { SiPaypal } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import PayPalButton from "./PayPalButton";

interface PaymentMethods {
  stripe: boolean;
  paypal: boolean;
  coinbase: boolean;
  supportedCryptos: string[];
}

const SUGGESTED_AMOUNTS = [5, 10, 25, 50];

export function DonationCard() {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(10);
  const [customAmount, setCustomAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "paypal" | "crypto">("stripe");
  const { toast } = useToast();

  const { data: paymentMethods } = useQuery<PaymentMethods>({
    queryKey: ["/api/payment-methods"],
  });

  const handleDonate = async () => {
    const amountInCents = selectedAmount 
      ? selectedAmount * 100 
      : parseInt(customAmount) * 100;
    
    if (!amountInCents || amountInCents < 100) {
      toast({
        title: "Invalid amount",
        description: "Minimum donation is $1",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/donation/create-checkout", {
        amount: amountInCents,
      });
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create donation checkout",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCryptoDonate = async () => {
    const amount = selectedAmount || (customAmount ? parseInt(customAmount) : 0);
    if (amount < 1) {
      toast({
        title: "Invalid amount",
        description: "Minimum donation is $1",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/crypto/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: amount.toString(),
          currency: "USD",
          name: "AccessiBooks Donation",
          description: "Support AccessiBooks",
          type: "donation",
        }),
      });

      const data = await response.json();
      
      if (data.hosted_url) {
        window.open(data.hosted_url, "_blank");
        toast({
          title: "Crypto Payment Started",
          description: "Complete your donation in the Coinbase Commerce window.",
        });
      } else {
        throw new Error(data.error || "Failed to create crypto charge");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create crypto donation",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayPalSuccess = () => {
    toast({
      title: "Thank You!",
      description: "Your donation via PayPal was successful.",
    });
  };

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedAmount(null);
  };

  const currentAmount = selectedAmount || (customAmount ? parseInt(customAmount) : 0);

  const hasMultipleMethods = [
    paymentMethods?.stripe,
    paymentMethods?.paypal,
    paymentMethods?.coinbase,
  ].filter(Boolean).length > 1;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2">
          <Heart className="h-10 w-10 text-rose-500" />
        </div>
        <CardTitle>Support AccessiBooks</CardTitle>
        <CardDescription>
          Your donation helps us keep audiobooks accessible for everyone
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="grid grid-cols-4 gap-2">
          {SUGGESTED_AMOUNTS.map((amount) => (
            <Button
              key={amount}
              variant={selectedAmount === amount ? "default" : "outline"}
              className="w-full"
              onClick={() => handleAmountSelect(amount)}
            >
              ${amount}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom-amount">Or enter a custom amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="custom-amount"
              type="number"
              min="1"
              max="1000"
              placeholder="Custom amount"
              value={customAmount}
              onChange={(e) => handleCustomAmountChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {hasMultipleMethods ? (
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
                onClick={handleDonate}
                disabled={isLoading || currentAmount < 1}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Donate {currentAmount > 0 ? `$${currentAmount}` : ""} with Card
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="paypal">
              <div className="paypal-button-container">
                <PayPalButton
                  amount={currentAmount.toString()}
                  currency="USD"
                  intent="CAPTURE"
                  onSuccess={handlePayPalSuccess}
                />
              </div>
            </TabsContent>

            <TabsContent value="crypto" className="space-y-2">
              <Button
                className="w-full"
                size="lg"
                variant="outline"
                onClick={handleCryptoDonate}
                disabled={isLoading || currentAmount < 1}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Bitcoin className="h-4 w-4 mr-2" />
                    Donate {currentAmount > 0 ? `$${currentAmount}` : ""} with Crypto
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <Button
            className="w-full"
            size="lg"
            onClick={handleDonate}
            disabled={isLoading || currentAmount < 1}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Heart className="h-4 w-4 mr-2" />
                Donate {currentAmount > 0 ? `$${currentAmount}` : ""}
              </>
            )}
          </Button>
        )}

        <p className="text-xs text-center text-muted-foreground">
          {hasMultipleMethods 
            ? "Payments processed securely via Stripe, PayPal, or cryptocurrency"
            : "Donations are processed securely via Stripe"
          }
        </p>
      </CardContent>
    </Card>
  );
}
