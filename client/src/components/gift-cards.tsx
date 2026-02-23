import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Gift, Send, Inbox, CreditCard, Crown, Coins, Copy, Check, Tag } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const SUBSCRIPTION_OPTIONS = [
  { key: "plus-1", tier: "Plus", months: 1, price: 499 },
  { key: "plus-3", tier: "Plus", months: 3, price: 1397 },
  { key: "plus-6", tier: "Plus", months: 6, price: 2694 },
  { key: "plus-12", tier: "Plus", months: 12, price: 4999 },
  { key: "premium-1", tier: "Premium", months: 1, price: 999 },
  { key: "premium-3", tier: "Premium", months: 3, price: 2797 },
  { key: "premium-6", tier: "Premium", months: 6, price: 5394 },
  { key: "premium-12", tier: "Premium", months: 12, price: 9999 },
];

const CREDIT_OPTIONS = [
  { key: "500", amount: 500, label: "$5" },
  { key: "1000", amount: 1000, label: "$10" },
  { key: "2500", amount: 2500, label: "$25" },
  { key: "5000", amount: 5000, label: "$50" },
];

export function GiftCards() {
  const { toast } = useToast();
  const [giftType, setGiftType] = useState<"subscription" | "credits">("subscription");
  const [selectedOption, setSelectedOption] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: sentGifts, isLoading: sentLoading } = useQuery<any[]>({
    queryKey: ["/api/gifts/sent"],
  });

  const { data: receivedGifts, isLoading: receivedLoading } = useQuery<any[]>({
    queryKey: ["/api/gifts/received"],
  });

  const purchaseMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/gifts/purchase", {
        type: giftType,
        optionKey: selectedOption,
        toEmail: toEmail || undefined,
        message: giftMessage || undefined,
      }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/gifts/sent"] });
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
      }
      toast({
        title: "Gift Card Created!",
        description: `Code: ${data.code}. Share this code with the recipient.`,
      });
      setSelectedOption("");
      setToEmail("");
      setGiftMessage("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to purchase gift card", variant: "destructive" });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gifts/redeem", { code: redeemCode }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/gifts/received"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Gift Redeemed!", description: data.message });
      setRedeemCode("");
    },
    onError: async (err: any) => {
      let msg = "Failed to redeem gift card";
      try {
        const data = await err.response?.json?.();
        if (data?.message) msg = data.message;
      } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Gift className="h-6 w-6" />
          Gift Cards
        </h2>
        <p className="text-muted-foreground mt-1">
          Send gifts to friends or redeem a gift code
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Redeem a Gift Card
          </CardTitle>
          <CardDescription>Enter your 16-character gift code</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Enter gift code (e.g., ABCD1234EFGH5678)"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              className="font-mono tracking-wider"
              maxLength={20}
            />
            <Button
              onClick={() => redeemMutation.mutate()}
              disabled={!redeemCode.trim() || redeemMutation.isPending}
            >
              {redeemMutation.isPending ? "Redeeming..." : "Redeem"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send a Gift
          </CardTitle>
          <CardDescription>Choose a gift type and amount</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={giftType} onValueChange={(v) => { setGiftType(v as any); setSelectedOption(""); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="subscription" className="flex items-center gap-2">
                <Crown className="h-4 w-4" /> Subscription
              </TabsTrigger>
              <TabsTrigger value="credits" className="flex items-center gap-2">
                <Coins className="h-4 w-4" /> Credits
              </TabsTrigger>
            </TabsList>

            <TabsContent value="subscription" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground">Gift a Plus or Premium subscription</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {SUBSCRIPTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedOption(opt.key)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      selectedOption === opt.key
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="font-semibold text-sm">{opt.tier}</div>
                    <div className="text-xs text-muted-foreground">{opt.months} month{opt.months > 1 ? "s" : ""}</div>
                    <div className="font-bold mt-1">{formatCents(opt.price)}</div>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="credits" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground">Gift credits for individual title purchases</p>
              <div className="grid grid-cols-4 gap-2">
                {CREDIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedOption(opt.key)}
                    className={`p-4 rounded-lg border text-center transition-colors ${
                      selectedOption === opt.key
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="font-bold text-lg">{opt.label}</div>
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-3 pt-2">
            <div>
              <Label htmlFor="gift-email">Recipient Email (optional)</Label>
              <Input
                id="gift-email"
                type="email"
                placeholder="friend@example.com"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="gift-message">Personal Message (optional)</Label>
              <Textarea
                id="gift-message"
                placeholder="Enjoy some great audiobooks!"
                value={giftMessage}
                onChange={(e) => setGiftMessage(e.target.value)}
                rows={2}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => purchaseMutation.mutate()}
              disabled={!selectedOption || purchaseMutation.isPending}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {purchaseMutation.isPending ? "Processing..." : `Purchase Gift Card${selectedOption ? ` — ${formatCents(
                giftType === "subscription"
                  ? SUBSCRIPTION_OPTIONS.find(o => o.key === selectedOption)?.price || 0
                  : parseInt(selectedOption) || 0
              )}` : ""}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Tabs defaultValue="sent">
        <TabsList>
          <TabsTrigger value="sent" className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Sent Gifts
          </TabsTrigger>
          <TabsTrigger value="received" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Received Gifts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sent" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {sentLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : !sentGifts?.length ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Gift className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No gifts sent yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sentGifts.map((gift: any) => (
                    <div key={gift.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {gift.type === "subscription"
                              ? `${gift.monthsGift}mo ${gift.tierGift}`
                              : formatCents(gift.amountCents)}
                          </span>
                          <Badge variant={gift.status === "active" ? "default" : gift.status === "redeemed" ? "secondary" : "outline"}>
                            {gift.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-xs tracking-wider text-muted-foreground">{gift.code}</span>
                          <button onClick={() => copyCode(gift.code)} className="text-muted-foreground hover:text-foreground">
                            {copiedCode === gift.code ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        {gift.toEmail && <p className="text-xs text-muted-foreground mt-0.5">To: {gift.toEmail}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">{formatCents(gift.amountCents)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(gift.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="received" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {receivedLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : !receivedGifts?.length ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Inbox className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No gifts received yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {receivedGifts.map((gift: any) => (
                    <div key={gift.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {gift.type === "subscription"
                              ? `${gift.monthsGift}mo ${gift.tierGift}`
                              : formatCents(gift.amountCents)}
                          </span>
                          <Badge variant="secondary">Redeemed</Badge>
                        </div>
                        {gift.message && <p className="text-xs text-muted-foreground mt-1 italic">"{gift.message}"</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">{formatCents(gift.amountCents)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(gift.redeemedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
