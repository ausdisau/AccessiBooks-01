import { useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield, Eye, Users, Accessibility, Type, Keyboard,
  Monitor, Volume2, Palette, CheckCircle
} from "lucide-react";

const STANDARDS = [
  {
    title: "Our Accessibility Standards",
    description: "We adhere to WCAG 2.1 AA compliance across every page and feature.",
    icon: Shield,
    items: [
      "WCAG 2.1 AA compliance",
      "Full screen reader support",
      "Complete keyboard navigation",
      "Semantic HTML structure",
    ],
  },
  {
    title: "Data Privacy",
    description: "Your data is handled with care. Preferences are stored locally and synced securely.",
    icon: Eye,
    items: [
      "Preferences stored locally first",
      "Encrypted server-side sync",
      "No third-party data sharing",
      "GDPR and CCPA compliant",
    ],
  },
  {
    title: "Community Reviews",
    description: "User-driven accessibility reviews and ratings help everyone find accessible content.",
    icon: Users,
    items: [
      "Crowdsourced accessibility ratings",
      "Verified reviewer program",
      "Detailed score breakdowns",
      "Community-powered improvements",
    ],
  },
];

const FEATURES = [
  { label: "High Contrast", icon: Palette },
  { label: "Dyslexia Font", icon: Type },
  { label: "Screen Reader", icon: Monitor },
  { label: "Keyboard Nav", icon: Keyboard },
  { label: "Captions", icon: Volume2 },
  { label: "Reduced Motion", icon: Accessibility },
];

export default function TrustPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "Trust & Safety — AccessiBooks";
    const setMeta = (sel: string, attr: string, val: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(sel);
      const existed = !!el;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr.split("=")[0], attr.split("=")[1]); document.head.appendChild(el); }
      const old = el.getAttribute("content") ?? "";
      el.setAttribute("content", val);
      return { el, existed, old };
    };
    const metas = [
      setMeta('meta[name="description"]', "name=description", "How AccessiBooks protects your privacy, meets WCAG 2.1 AA accessibility standards, and earns your trust — built by Australian Disability Ltd."),
      setMeta('meta[property="og:title"]', "property=og:title", "Trust & Safety — AccessiBooks"),
      setMeta('meta[property="og:description"]', "property=og:description", "AccessiBooks is built on accessibility, privacy, and community trust. WCAG 2.1 AA compliant, GDPR ready, with open accessibility scores for every title."),
      setMeta('meta[property="og:url"]', "property=og:url", "https://accessibooks.org/trust"),
      setMeta('meta[name="twitter:title"]', "name=twitter:title", "Trust & Safety — AccessiBooks"),
      setMeta('meta[name="twitter:description"]', "name=twitter:description", "Accessibility, privacy, and community trust at the heart of AccessiBooks."),
    ];
    let canonicalEl = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevCanonical = canonicalEl?.getAttribute("href") ?? "";
    if (!canonicalEl) { canonicalEl = document.createElement("link"); canonicalEl.setAttribute("rel", "canonical"); document.head.appendChild(canonicalEl); }
    canonicalEl.setAttribute("href", "https://accessibooks.org/trust");
    return () => {
      document.title = prev;
      for (const { el, existed, old } of metas) { if (existed) el.setAttribute("content", old); else el.remove(); }
      if (canonicalEl) canonicalEl.setAttribute("href", prevCanonical);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16 operator-shell">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Trust & Transparency</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            AccessiBooks is built on a foundation of accessibility, privacy, and community trust.
            Every feature we ship is designed to be usable by everyone.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {STANDARDS.map((standard) => {
            const Icon = standard.icon;
            return (
              <Card key={standard.title} className="bg-card dark:bg-card border border-border">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{standard.title}</CardTitle>
                  </div>
                  <CardDescription>{standard.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {standard.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-foreground dark:text-foreground">
                        <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold">Accessibility Features</h2>
            <p className="text-muted-foreground mt-2">
              Built-in tools that make reading accessible for everyone
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.label}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/50 dark:bg-muted/20 border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <Badge variant="secondary" className="text-xs font-medium">
                    {feature.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="bg-card dark:bg-card border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Accessibility className="h-6 w-6 text-primary" />
              <CardTitle>Open Accessibility Scores</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Every book on AccessiBooks receives an accessibility score based on multiple dimensions:
              screen reader compatibility, keyboard navigation support, contrast ratios, and overall usability.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 dark:bg-muted/20">
                <p className="font-semibold text-foreground">How scores are calculated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Scores combine automated testing with community reviews to provide a comprehensive
                  accessibility rating from 1 to 5 across four categories.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 dark:bg-muted/20">
                <p className="font-semibold text-foreground">Community-driven accuracy</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Verified reviewers contribute detailed assessments that are aggregated into
                  transparent, publicly visible scores for every title.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center pt-4 pb-8">
          <Link href="/">
            <Button variant="outline" size="lg">
              ← Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
