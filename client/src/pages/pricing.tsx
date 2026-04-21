import { useLocation } from "wouter";
import { Info, Crown, Zap, Building2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { TIER_PRICING } from "@shared/schema";

function ComingSoonBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 mt-2"
    >
      <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>Upgrade flow coming next — check back soon.</span>
    </div>
  );
}

const FREE_FEATURES = [
  { text: "Selected free catalog of audiobooks & ebooks", included: true },
  { text: "Ad-supported listening", included: true },
  { text: "Basic accessibility features (font size, dyslexia font)", included: true },
  { text: "6 skips per hour", included: true },
  { text: "Up to 10 bookmarks", included: true },
  { text: "Ad-free listening", included: false },
  { text: "Offline downloads", included: false },
  { text: "Ultra high-quality (UHQ) audio", included: false },
  { text: "Full catalog access", included: false },
];

const PREMIUM_FEATURES = [
  { text: "Full catalog access — no restrictions", included: true },
  { text: "Ad-free listening", included: true },
  { text: "Offline downloads", included: true },
  { text: "Ultra high-quality (UHQ) 320 kbps audio", included: true },
  { text: "Unlimited skips & bookmarks", included: true },
  { text: "Text-to-Speech (unlimited)", included: true },
  { text: "Up to 5 devices", included: true },
  { text: "20% discount on individual title purchases", included: true },
];

const INSTITUTIONAL_FEATURES = [
  { text: "Full catalog access for all members", included: true },
  { text: "Ad-free experience across the organisation", included: true },
  { text: "Offline & UHQ audio for all users", included: true },
  { text: "Centralised billing and usage reporting", included: true },
  { text: "Dedicated accessibility support", included: true },
  { text: "Custom onboarding for staff and patrons", included: true },
];

export function PricingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleUpgradeClick = (planName: string) => {
    toast({
      title: "Coming soon",
      description: `${planName} checkout will be available shortly. Check back soon!`,
    });
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
      <div className="text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Choose your plan
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-base">
          Start for free with our curated catalog, or unlock the full AccessiBooks experience with Premium. Institutional access is available through partner organisations and libraries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <Card
          className="border"
          aria-label="Free plan"
        >
          <CardHeader className="pb-4 text-center space-y-3">
            <div className="flex justify-center">
              <Zap className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Free</h2>
            <div>
              <span className="text-4xl font-bold text-foreground">$0</span>
              <span className="text-muted-foreground text-sm"> / month</span>
            </div>
            <p className="text-sm text-muted-foreground">Great for trying AccessiBooks with a curated selection.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2" aria-label="Free plan features">
              {FREE_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {f.included ? (
                    <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" aria-hidden="true" />
                  ) : (
                    <X className="h-4 w-4 mt-0.5 text-muted-foreground/40 shrink-0" aria-hidden="true" />
                  )}
                  <span className={f.included ? "text-foreground" : "text-muted-foreground/60"}>
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Upgrade to Free"
              onClick={() => navigate("/")}
            >
              Get started free
            </Button>
          </CardContent>
        </Card>

        <Card
          className="border-2 border-amber-500 bg-amber-500/5 md:scale-105 shadow-lg shadow-amber-500/10 relative"
          aria-label="Premium plan — recommended"
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
            <Badge className="bg-amber-500 text-white border-0 px-3 py-1 text-xs font-bold shadow-md">
              ⭐ Best Value
            </Badge>
          </div>
          <CardHeader className="pb-4 text-center space-y-3">
            <div className="flex justify-center">
              <Crown className="h-8 w-8 text-amber-500" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Premium</h2>
            <div>
              <span className="text-4xl font-bold text-foreground">{TIER_PRICING.premium.monthlyDisplay}</span>
              <span className="text-muted-foreground text-sm"> / month</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Or {TIER_PRICING.premium.yearlyDisplay}/year — save 17%
            </p>
            <p className="text-sm text-muted-foreground">Full access, ad-free. No compromises.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2" aria-label="Premium plan features">
              {PREMIUM_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" aria-hidden="true" />
                  <span className="text-foreground">{f.text}</span>
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-white focus-visible:ring-2 focus-visible:ring-amber-400"
              aria-label="Upgrade to Premium"
              onClick={() => handleUpgradeClick("Premium")}
            >
              <Crown className="h-4 w-4 mr-2" aria-hidden="true" />
              Upgrade to Premium
            </Button>
            <ComingSoonBanner />
          </CardContent>
        </Card>

        <Card
          className="border"
          aria-label="Institutional plan"
        >
          <CardHeader className="pb-4 text-center space-y-3">
            <div className="flex justify-center">
              <Building2 className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Institutional</h2>
            <div>
              <span className="text-2xl font-bold text-foreground">Contact us</span>
            </div>
            <p className="text-sm text-muted-foreground">Available via partner organisations or libraries.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2" aria-label="Institutional plan features">
              {INSTITUTIONAL_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" aria-hidden="true" />
                  <span className="text-foreground">{f.text}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Upgrade to Institutional"
              onClick={() => navigate("/institutional")}
            >
              <Building2 className="h-4 w-4 mr-2" aria-hidden="true" />
              Learn more
            </Button>
            <ComingSoonBanner />
          </CardContent>
        </Card>
      </div>

      <section
        className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center space-y-2"
        aria-labelledby="pricing-note-heading"
      >
        <h3 id="pricing-note-heading" className="font-semibold text-foreground">
          No subscription? No problem.
        </h3>
        <p className="text-sm text-muted-foreground">
          You can buy individual titles starting at $1.99. Premium subscribers receive a 20% discount on all purchases.
        </p>
      </section>
    </main>
  );
}
