import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Gift,
  Heart,
  HeartHandshake,
  Loader2,
  Copy,
  Check,
  Crown,
  Coins,
  Ticket,
  Sparkles,
  Send,
} from "lucide-react";

type GiftKind = "subscription" | "credits";

interface GiftSubOption {
  key: string;
  tier: string;
  months: number;
  priceCents: number;
  label: string;
}
interface CreditPack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  badge: string | null;
}
interface GiftOptions {
  subscriptions: GiftSubOption[];
  creditPacks: CreditPack[];
  currency: string;
}
interface PoolStats {
  available: number;
  subscriptions: number;
  credits: number;
}
interface GiftRecord {
  id: string;
  code: string;
  type: string;
  status: string;
  tierGift: string | null;
  monthsGift: number | null;
  creditAmount: number | null;
  amountCents: number;
  toEmail: string | null;
  message: string | null;
  createdAt: string | null;
  redeemedAt: string | null;
}
interface SponsorshipRecord {
  id: string;
  kind: string;
  tier: string | null;
  termMonths: number | null;
  creditAmount: number | null;
  amountCents: number;
  status: string;
  createdAt: string | null;
}
interface RedeemOutcome {
  kind: GiftKind;
  tier: string | null;
  months: number | null;
  credits: number | null;
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function extractError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const m = err.message.match(/^\d+:\s*([\s\S]*)$/);
    const body = m ? m[1] : err.message;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.message === "string") return parsed.message;
    } catch {
      /* not JSON — fall through */
    }
    return body || fallback;
  }
  return fallback;
}

function outcomeMessage(o: RedeemOutcome): string {
  if (o.kind === "subscription" && o.tier && o.months) {
    return `You've unlocked ${o.tier} access for ${o.months} month${o.months > 1 ? "s" : ""}.`;
  }
  if (o.kind === "credits" && o.credits) {
    return `${o.credits} title credit${o.credits > 1 ? "s" : ""} added to your account.`;
  }
  return "Your benefit has been applied.";
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "redeemed" || s === "claimed")
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (s === "active" || s === "funded")
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  if (s === "pending")
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-muted text-muted-foreground";
}

export function GiftsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>("gift");

  // Gift composer state
  const [giftKind, setGiftKind] = useState<GiftKind>("subscription");
  const [giftSubKey, setGiftSubKey] = useState<string>("");
  const [giftPackId, setGiftPackId] = useState<string>("");
  const [toEmail, setToEmail] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  // Sponsor composer state
  const [sponsorKind, setSponsorKind] = useState<GiftKind>("subscription");
  const [sponsorSubKey, setSponsorSubKey] = useState<string>("");
  const [sponsorPackId, setSponsorPackId] = useState<string>("");
  const [sponsorMessage, setSponsorMessage] = useState("");

  // Redeem state
  const [redeemCode, setRedeemCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: options, isLoading: optionsLoading } = useQuery<GiftOptions>({
    queryKey: ["/api/gifts/options"],
  });

  const { data: pool } = useQuery<PoolStats>({
    queryKey: ["/api/sponsor-subs/pool"],
  });

  const { data: sent } = useQuery<GiftRecord[]>({
    queryKey: ["/api/gifts/sent"],
    enabled: !!user,
  });

  const { data: received } = useQuery<GiftRecord[]>({
    queryKey: ["/api/gifts/received"],
    enabled: !!user,
  });

  const { data: mySponsorships } = useQuery<SponsorshipRecord[]>({
    queryKey: ["/api/sponsor-subs/mine"],
    enabled: !!user,
  });

  // Handle Stripe return + share deep links: ?gift=success&code= / ?sponsor=success / ?redeem=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gift = params.get("gift");
    const sponsor = params.get("sponsor");
    const code = params.get("code");
    const redeem = params.get("redeem");
    let handled = false;

    if (gift === "success") {
      setActiveTab("gift");
      toast({
        title: "Gift purchased",
        description: code
          ? `Share this code with your recipient: ${code}`
          : "Your gift is ready to share from the list below.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/gifts/sent"] });
      handled = true;
    } else if (gift === "cancelled") {
      toast({ title: "Checkout cancelled", description: "No charge was made." });
      handled = true;
    }

    if (sponsor === "success") {
      setActiveTab("sponsor");
      toast({
        title: "Thank you for sponsoring access",
        description: "Your contribution is now in the pool for an eligible member to claim.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sponsor-subs/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sponsor-subs/pool"] });
      handled = true;
    } else if (sponsor === "cancelled") {
      toast({ title: "Checkout cancelled", description: "No charge was made." });
      handled = true;
    }

    if (redeem) {
      setRedeemCode(redeem);
      setActiveTab("redeem");
      handled = true;
    }

    if (handled) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const giftCheckout = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { kind: giftKind };
      if (giftKind === "subscription") body.optionKey = giftSubKey;
      else body.packId = giftPackId;
      if (toEmail.trim()) body.toEmail = toEmail.trim();
      if (giftMessage.trim()) body.message = giftMessage.trim();
      const res = await apiRequest("POST", "/api/gifts/checkout", body);
      return (await res.json()) as { checkoutUrl?: string };
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Could not start checkout", variant: "destructive" });
      }
    },
    onError: (err) =>
      toast({
        title: "Could not start checkout",
        description: extractError(err, "Please try again."),
        variant: "destructive",
      }),
  });

  const sponsorCheckout = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { kind: sponsorKind };
      if (sponsorKind === "subscription") body.optionKey = sponsorSubKey;
      else body.packId = sponsorPackId;
      if (sponsorMessage.trim()) body.message = sponsorMessage.trim();
      const res = await apiRequest("POST", "/api/sponsor-subs/checkout", body);
      return (await res.json()) as { checkoutUrl?: string };
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Could not start checkout", variant: "destructive" });
      }
    },
    onError: (err) =>
      toast({
        title: "Could not start checkout",
        description: extractError(err, "Please try again."),
        variant: "destructive",
      }),
  });

  const redeem = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gifts/redeem", {
        code: redeemCode.trim(),
      });
      return (await res.json()) as RedeemOutcome & { success: boolean };
    },
    onSuccess: (data) => {
      toast({ title: "Gift redeemed", description: outcomeMessage(data) });
      setRedeemCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["n"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gifts/received"] });
    },
    onError: (err) =>
      toast({
        title: "Could not redeem gift",
        description: extractError(err, "That code can't be redeemed."),
        variant: "destructive",
      }),
  });

  const claim = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sponsor-subs/claim", {});
      return (await res.json()) as RedeemOutcome & { success: boolean };
    },
    onSuccess: (data) => {
      toast({ title: "Access claimed", description: outcomeMessage(data) });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["n"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sponsor-subs/pool"] });
    },
    onError: (err) =>
      toast({
        title: "Could not claim access",
        description: extractError(err, "No sponsored access is available right now."),
        variant: "destructive",
      }),
  });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast({ title: "Copied", description: "Gift code copied to clipboard." });
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Please sign in to gift, sponsor, redeem, or claim access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subOptions = options?.subscriptions ?? [];
  const creditPacks = options?.creditPacks ?? [];

  const giftReady =
    giftKind === "subscription" ? !!giftSubKey : !!giftPackId;
  const sponsorReady =
    sponsorKind === "subscription" ? !!sponsorSubKey : !!sponsorPackId;

  const renderOptionGrid = (
    kind: GiftKind,
    selectedSubKey: string,
    selectedPackId: string,
    onSelectSub: (k: string) => void,
    onSelectPack: (id: string) => void,
    idPrefix: string,
  ) => {
    if (optionsLoading) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }
    if (kind === "subscription") {
      return (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Subscription gift options"
        >
          {subOptions.map((o) => {
            const selected = selectedSubKey === o.key;
            return (
              <Button
                key={o.key}
                variant={selected ? "default" : "outline"}
                className="justify-between h-auto py-3"
                role="radio"
                aria-checked={selected}
                data-testid={`${idPrefix}-sub-${o.key}`}
                onClick={() => onSelectSub(o.key)}
              >
                <span className="flex items-center gap-2">
                  <Crown className="h-4 w-4" />
                  {o.label}
                </span>
                <span className="font-semibold">{fmt(o.priceCents)}</span>
              </Button>
            );
          })}
        </div>
      );
    }
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        role="radiogroup"
        aria-label="Credit pack gift options"
      >
        {creditPacks.map((p) => {
          const selected = selectedPackId === p.id;
          return (
            <Button
              key={p.id}
              variant={selected ? "default" : "outline"}
              className="flex-col h-auto py-4 gap-1 relative"
              role="radio"
              aria-checked={selected}
              data-testid={`${idPrefix}-pack-${p.id}`}
              onClick={() => onSelectPack(p.id)}
            >
              {p.badge && (
                <Badge className="absolute -top-2 right-2 text-[10px]">{p.badge}</Badge>
              )}
              <Coins className="h-4 w-4" />
              <span className="font-medium">{p.name}</span>
              <span className="text-xs opacity-80">{p.credits} credits</span>
              <span className="font-semibold">{fmt(p.priceCents)}</span>
            </Button>
          );
        })}
      </div>
    );
  };

  const KindToggle = ({
    value,
    onChange,
    idPrefix,
  }: {
    value: GiftKind;
    onChange: (k: GiftKind) => void;
    idPrefix: string;
  }) => (
    <div className="inline-flex rounded-lg border p-1 bg-muted/50">
      <Button
        size="sm"
        variant={value === "subscription" ? "default" : "ghost"}
        onClick={() => onChange("subscription")}
        data-testid={`${idPrefix}-kind-subscription`}
      >
        <Crown className="h-4 w-4 mr-1" /> Subscription
      </Button>
      <Button
        size="sm"
        variant={value === "credits" ? "default" : "ghost"}
        onClick={() => onChange("credits")}
        data-testid={`${idPrefix}-kind-credits`}
      >
        <Coins className="h-4 w-4 mr-1" /> Title credits
      </Button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="page-hero">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="page-title text-3xl">Gift &amp; Sponsor</h1>
        </div>
        <p className="text-muted-foreground">
          Give a subscription or title credits to someone you know, or sponsor access into a shared
          pool that eligible members can claim for free.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="gift" data-testid="tab-gift">
            <Gift className="h-4 w-4 mr-1" /> Gift
          </TabsTrigger>
          <TabsTrigger value="sponsor" data-testid="tab-sponsor">
            <HeartHandshake className="h-4 w-4 mr-1" /> Sponsor
          </TabsTrigger>
          <TabsTrigger value="redeem" data-testid="tab-redeem">
            <Ticket className="h-4 w-4 mr-1" /> Redeem
          </TabsTrigger>
          <TabsTrigger value="claim" data-testid="tab-claim">
            <Sparkles className="h-4 w-4 mr-1" /> Claim
          </TabsTrigger>
        </TabsList>

        {/* ---- GIFT ---- */}
        <TabsContent value="gift" className="space-y-6 mt-4">
          <Card className="dark:bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5" /> Gift a subscription or credits
              </CardTitle>
              <CardDescription>
                Pay now and we'll generate a redemption code your recipient can use to unlock the
                benefit. You can email it to them or share the code yourself.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <KindToggle value={giftKind} onChange={setGiftKind} idPrefix="gift" />
              {renderOptionGrid(
                giftKind,
                giftSubKey,
                giftPackId,
                setGiftSubKey,
                setGiftPackId,
                "gift",
              )}

              <div className="grid grid-cols-1 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="gift-email">Recipient email (optional)</Label>
                  <Input
                    id="gift-email"
                    type="email"
                    placeholder="friend@example.com"
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    data-testid="input-gift-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gift-message">Message (optional)</Label>
                  <Textarea
                    id="gift-message"
                    placeholder="Enjoy a year of accessible reading!"
                    value={giftMessage}
                    maxLength={500}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    data-testid="input-gift-message"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={!giftReady || giftCheckout.isPending}
                onClick={() => giftCheckout.mutate()}
                data-testid="button-gift-checkout"
              >
                {giftCheckout.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" /> Buy gift
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Payments are processed securely via Stripe.
              </p>
            </CardContent>
          </Card>

          <Card className="dark:bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4" /> Gifts you've sent
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!sent || sent.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Gift className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>You haven't sent any gifts yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sent.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 dark:bg-muted/30 gap-3"
                      data-testid={`gift-sent-${g.id}`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium dark:text-white truncate">
                          {g.type === "subscription"
                            ? `${g.tierGift ?? ""} · ${g.monthsGift ?? 0} mo`
                            : `${g.creditAmount ?? 0} credits`}
                          {g.toEmail ? ` → ${g.toEmail}` : ""}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs font-mono bg-background px-2 py-0.5 rounded border">
                            {g.code}
                          </code>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Copy gift code"
                            onClick={() => copyCode(g.code)}
                            data-testid={`button-copy-${g.id}`}
                          >
                            {copiedCode === g.code ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-xs px-2 py-1 rounded-full ${statusBadgeClass(g.status)}`}
                      >
                        {g.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- SPONSOR ---- */}
        <TabsContent value="sponsor" className="space-y-6 mt-4">
          <Card className="dark:bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartHandshake className="h-5 w-5" /> Sponsor access for someone in need
              </CardTitle>
              <CardDescription>
                Your contribution goes into a shared pool. An eligible free-tier member can claim it
                — no recipient or code required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 text-primary px-3 py-2 text-sm">
                <Heart className="h-4 w-4" />
                <span data-testid="text-pool-available">
                  {pool?.available ?? 0} sponsored benefit{(pool?.available ?? 0) === 1 ? "" : "s"}{" "}
                  currently waiting to be claimed
                </span>
              </div>

              <KindToggle value={sponsorKind} onChange={setSponsorKind} idPrefix="sponsor" />
              {renderOptionGrid(
                sponsorKind,
                sponsorSubKey,
                sponsorPackId,
                setSponsorSubKey,
                setSponsorPackId,
                "sponsor",
              )}

              <div className="space-y-2 pt-2">
                <Label htmlFor="sponsor-message">Note of encouragement (optional)</Label>
                <Textarea
                  id="sponsor-message"
                  placeholder="Hope this helps you enjoy more books!"
                  value={sponsorMessage}
                  maxLength={500}
                  onChange={(e) => setSponsorMessage(e.target.value)}
                  data-testid="input-sponsor-message"
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={!sponsorReady || sponsorCheckout.isPending}
                onClick={() => sponsorCheckout.mutate()}
                data-testid="button-sponsor-checkout"
              >
                {sponsorCheckout.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting…
                  </>
                ) : (
                  <>
                    <HeartHandshake className="h-4 w-4 mr-2" /> Fund sponsorship
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Payments are processed securely via Stripe.
              </p>
            </CardContent>
          </Card>

          <Card className="dark:bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Heart className="h-4 w-4" /> Your sponsorships
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!mySponsorships || mySponsorships.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <HeartHandshake className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>You haven't sponsored any access yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mySponsorships.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 dark:bg-muted/30 gap-3"
                      data-testid={`sponsorship-${s.id}`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium dark:text-white truncate">
                          {s.kind === "subscription"
                            ? `${s.tier ?? ""} · ${s.termMonths ?? 0} mo`
                            : `${s.creditAmount ?? 0} credits`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ""} ·{" "}
                          {fmt(s.amountCents)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-xs px-2 py-1 rounded-full ${statusBadgeClass(s.status)}`}
                      >
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- REDEEM ---- */}
        <TabsContent value="redeem" className="space-y-6 mt-4">
          <Card className="dark:bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-5 w-5" /> Redeem a gift
              </CardTitle>
              <CardDescription>
                Enter the code from a gift to add the subscription or credits to your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="redeem-code">Gift code</Label>
                <div className="flex gap-2">
                  <Input
                    id="redeem-code"
                    placeholder="Enter your gift code"
                    value={redeemCode}
                    onChange={(e) => setRedeemCode(e.target.value)}
                    className="font-mono"
                    data-testid="input-redeem-code"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && redeemCode.trim() && !redeem.isPending) {
                        redeem.mutate();
                      }
                    }}
                  />
                  <Button
                    onClick={() => redeem.mutate()}
                    disabled={!redeemCode.trim() || redeem.isPending}
                    data-testid="button-redeem"
                  >
                    {redeem.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Redeem"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gift className="h-4 w-4" /> Gifts you've received
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!received || received.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Ticket className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>You haven't redeemed any gifts yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {received.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 dark:bg-muted/30 gap-3"
                      data-testid={`gift-received-${g.id}`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium dark:text-white truncate">
                          {g.type === "subscription"
                            ? `${g.tierGift ?? ""} · ${g.monthsGift ?? 0} mo`
                            : `${g.creditAmount ?? 0} credits`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {g.redeemedAt
                            ? `Redeemed ${new Date(g.redeemedAt).toLocaleDateString()}`
                            : ""}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-xs px-2 py-1 rounded-full ${statusBadgeClass(g.status)}`}
                      >
                        {g.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- CLAIM ---- */}
        <TabsContent value="claim" className="space-y-6 mt-4">
          <Card className="dark:bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" /> Claim sponsored access
              </CardTitle>
              <CardDescription>
                Sponsored access is available to free-tier members. Claim one benefit from the pool —
                it's applied to your account instantly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 text-primary px-3 py-2 text-sm">
                <Heart className="h-4 w-4" />
                <span>
                  {pool?.available ?? 0} sponsored benefit{(pool?.available ?? 0) === 1 ? "" : "s"}{" "}
                  available right now
                </span>
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={claim.isPending || (pool?.available ?? 0) === 0}
                onClick={() => claim.mutate()}
                data-testid="button-claim"
              >
                {claim.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Claiming…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Claim free access
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                One sponsored benefit per member. Already on a paid plan? This is reserved for
                free-tier members.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default GiftsPage;
