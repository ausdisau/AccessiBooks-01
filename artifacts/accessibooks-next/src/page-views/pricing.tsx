import { useLocation } from "@/lib/wouter-compat";
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
    <main className="max-w-6xl mx-auto px-6 py-20 space-y-16 app-shell-bg">
      <div className="text-center space-y-4">
        <h1 className="text-4xl sm:text-6xl font-serif font-bold tracking-tight text-foreground">
          Choose your plan
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
          Start for free with our curated catalog, or unlock the full AccessiBooks experience with Premium.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
        <Card
          className="border-none bg-card/50 backdrop-blur-sm flex flex-col"
          aria-label="Free plan"
        >
          <CardHeader className="pb-8 text-center space-y-4">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Zap className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>
            <h2 className="text-2xl font-serif font-bold text-foreground">Free</h2>
            <div>
              <span className="text-5xl font-bold text-foreground">$0</span>
              <span className="text-muted-foreground text-sm"> / month</span>
            </div>
            <p className="text-sm text-muted-foreground px-4">Great for trying AccessiBooks with a curated selection.</p>
          </CardHeader>
          <CardContent className="space-y-8 flex-1 flex flex-col">
            <ul className="space-y-4 flex-1" aria-label="Free plan features">
              {FREE_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  {f.included ? (
                    <Check className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                  ) : (
                    <X className="h-5 w-5 text-muted-foreground/30 shrink-0" aria-hidden="true" />
                  )}
                  <span className={f.included ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              aria-label="Get started free"
              onClick={() => navigate("/")}
            >
              Get started free
            </Button>
          </CardContent>
        </Card>

        <Card
          className="border-2 border-primary bg-primary/5 md:scale-105 shadow-2xl shadow-primary/10 relative flex flex-col"
          aria-label="Premium plan — recommended"
        >
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
            <Badge className="bg-primary text-white border-0 px-4 py-1.5 text-xs font-bold shadow-xl uppercase tracking-wider">
              Recommended
            </Badge>
          </div>
          <CardHeader className="pb-8 text-center space-y-4">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                <Crown className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
            </div>
            <h2 className="text-2xl font-serif font-bold text-foreground">Premium</h2>
            <div>
              <span className="text-5xl font-bold text-foreground">{TIER_PRICING.premium.monthlyDisplay}</span>
              <span className="text-muted-foreground text-sm"> / month</span>
            </div>
            <p className="text-xs text-primary font-medium">
              Or {TIER_PRICING.premium.yearlyDisplay}/year — save 17%
            </p>
            <p className="text-sm text-muted-foreground px-4">Full access, ad-free. No compromises.</p>
          </CardHeader>
          <CardContent className="space-y-8 flex-1 flex flex-col">
            <ul className="space-y-4 flex-1" aria-label="Premium plan features">
              {PREMIUM_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <Check className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                  <span className="text-foreground font-medium">{f.text}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-4">
              <Button
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                aria-label="Upgrade to Premium"
                onClick={() => handleUpgradeClick("Premium")}
              >
                <Crown className="h-4 w-4 mr-2" aria-hidden="true" />
                Upgrade to Premium
              </Button>
              <ComingSoonBanner />
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-none bg-card/50 backdrop-blur-sm flex flex-col"
          aria-label="Institutional plan"
        >
          <CardHeader className="pb-8 text-center space-y-4">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>
            <h2 className="text-2xl font-serif font-bold text-foreground">Institutional</h2>
            <div>
              <span className="text-3xl font-bold text-foreground">Contact us</span>
            </div>
            <p className="text-sm text-muted-foreground px-4">Available via partner organisations or libraries.</p>
          </CardHeader>
          <CardContent className="space-y-8 flex-1 flex flex-col">
            <ul className="space-y-4 flex-1" aria-label="Institutional plan features">
              {INSTITUTIONAL_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <Check className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                  <span className="text-foreground font-medium">{f.text}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-4">
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                aria-label="Learn more about Institutional access"
                onClick={() => navigate("/institutional")}
              >
                <Building2 className="h-4 w-4 mr-2" aria-hidden="true" />
                Learn more
              </Button>
              <ComingSoonBanner />
            </div>
          </CardContent>
        </Card>
      </div>

      <section
        className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 p-10 text-center space-y-4"
        aria-labelledby="pricing-note-heading"
      >
        <h3 id="pricing-note-heading" className="text-xl font-serif font-bold text-foreground">
          No subscription? No problem.
        </h3>
        <p className="text-muted-foreground max-w-xl mx-auto">
          You can buy individual titles starting at $1.99. Premium subscribers receive a 20% discount on all purchases.
        </p>
      </section>
    </main>
  );
}
