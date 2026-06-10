import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Accessibility,
  BookOpen,
  Headphones,
  Keyboard,
  Brain,
  Mic,
  Eye,
  Check,
  Play,
  Pause,
  Quote,
  Shield,
  Heart,
  Menu,
  X,
  User,
} from "lucide-react";
import { AccessiBooksLogo } from "@/components/accessibooks-logo";
import { AccessibilityControls } from "@/components/accessibility-controls";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useAccessibility } from "@/hooks/use-accessibility";
import { cn } from "@/lib/utils";

type ReadingMode = "standard" | "dyslexia" | "easy-english";
type DemoContrast = "normal" | "high" | "sepia";

const SAMPLE_PASSAGE = {
  standard: [
    "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    "However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.",
    '"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"',
  ],
  dyslexia: [
    "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    "However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.",
    '"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"',
  ],
  "easy-english": [
    "Everyone knows that a rich single man needs a wife.",
    "When a rich man moves to a new area, families think he should marry one of their daughters.",
    '"My dear Mr. Bennet," his wife said one day, "have you heard that Netherfield Park has a new tenant?"',
  ],
};

const WHO_ITS_FOR = [
  "People with print or vision differences",
  "Readers with dyslexia or cognitive needs",
  "NDIS participants and support workers",
  "Families reading together",
  "Students and lifelong learners",
  "Schools, libraries and institutions",
];

const FEATURES = [
  {
    icon: Headphones,
    title: "Listen anywhere",
    description:
      "Stream a growing library of audiobooks with chapter navigation, sleep timers, and variable playback speed.",
  },
  {
    icon: BookOpen,
    title: "Read with comfort",
    description:
      "Adjust type size, line height, contrast, and font — including a dyslexia-friendly typeface — on every page.",
  },
  {
    icon: Eye,
    title: "Built for low vision",
    description:
      "High-contrast and inverted-colour modes, large click targets, and clear focus outlines on every control.",
  },
  {
    icon: Keyboard,
    title: "Keyboard & switch ready",
    description:
      "Every flow is reachable without a mouse, with skip links, visible focus, and a switch-access scanner.",
  },
  {
    icon: Brain,
    title: "Cognitive supports",
    description:
      "Plain language, focus mode that hides distractions, and an AI coach that explains what's on screen.",
  },
  {
    icon: Mic,
    title: "Voice control",
    description:
      "Drive playback, navigate the library, and adjust accessibility settings hands-free with simple voice commands.",
  },
];

const ACCESSIBILITY_PROMISES = [
  "Designed to meet WCAG 2.2 AA across colour, contrast and interaction.",
  "Tested with screen readers, keyboard-only flows, and switch access.",
  "Respects reduced-motion, high-contrast, and reader-zoom system settings.",
  "Plain-language copy and short line lengths throughout the experience.",
  "Donates a share of every subscription to Australian Disability Ltd programs.",
];

const TESTIMONIALS = [
  {
    quote:
      "The high-contrast mode and large focus rings finally let me browse a library without losing my place every five seconds.",
    name: "Mira",
    role: "reader, low vision",
  },
  {
    quote:
      "Voice control plus the focus mode means I can listen to a chapter end-to-end without fighting the interface.",
    name: "Daniel",
    role: "NDIS participant",
  },
  {
    quote:
      "The dyslexia font and plain-language copy made AccessiBooks the easiest pick for our classroom reading hour.",
    name: "Ms. Patel",
    role: "primary school teacher",
  },
];

const FREE_TIER_ITEMS = [
  "All accessibility features (WCAG 2.2 AA)",
  "Public-domain audiobooks & ebooks",
  "Bookmarks, progress sync, sleep timer",
  "Voice control & focus mode",
];

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;

function formatTitleCount(count: number): string {
  if (count >= 1000) {
    const rounded = (count / 1000).toFixed(1).replace(/\.0$/, "");
    return `${rounded}k+`;
  }
  return `${count}+`;
}

function ReadingDemo() {
  const [readingMode, setReadingMode] = useState<ReadingMode>("standard");
  const [textSize, setTextSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState(1.7);
  const [contrast, setContrast] = useState<DemoContrast>("normal");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const passage = SAMPLE_PASSAGE[readingMode];

  const demoStyles: Record<string, string | number> = {
    fontSize: `${textSize}px`,
    lineHeight: lineSpacing,
    ...(readingMode === "dyslexia"
      ? { fontFamily: "'OpenDyslexic', 'Inter', sans-serif", letterSpacing: "0.05em", wordSpacing: "0.1em" }
      : {}),
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <div className="space-y-6">
        <fieldset>
          <legend className="text-sm font-medium mb-2">Reading mode</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["standard", "Standard"],
                ["dyslexia", "Dyslexia"],
                ["easy-english", "Easy English"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={readingMode === value ? "default" : "outline"}
                onClick={() => setReadingMode(value)}
                aria-pressed={readingMode === value}
              >
                {label}
              </Button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="demo-text-size" className="text-sm font-medium flex justify-between mb-2">
            <span>Text size</span>
            <span className="text-muted-foreground">{textSize}px</span>
          </label>
          <Slider
            id="demo-text-size"
            min={14}
            max={28}
            step={1}
            value={[textSize]}
            onValueChange={([v]) => setTextSize(v)}
            aria-label="Text size"
          />
        </div>

        <div>
          <label htmlFor="demo-line-spacing" className="text-sm font-medium flex justify-between mb-2">
            <span>Line spacing</span>
            <span className="text-muted-foreground">{lineSpacing.toFixed(1)}</span>
          </label>
          <Slider
            id="demo-line-spacing"
            min={1.2}
            max={2.4}
            step={0.1}
            value={[lineSpacing]}
            onValueChange={([v]) => setLineSpacing(v)}
            aria-label="Line spacing"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium mb-2">Contrast</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["normal", "Normal"],
                ["high", "High"],
                ["sepia", "Sepia"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={contrast === value ? "default" : "outline"}
                onClick={() => setContrast(value)}
                aria-pressed={contrast === value}
              >
                {label}
              </Button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="space-y-4">
        <Card
          className={cn(
            "overflow-hidden border-2",
            contrast === "high" && "bg-white text-black border-black",
            contrast === "sepia" && "bg-[#f4ecd8] text-[#433422] border-[#c4a882]",
          )}
        >
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">
              Pride and Prejudice · Chapter 1
              <span className="ml-2 text-primary">Sample passage</span>
            </p>
            <div style={demoStyles} className="space-y-4 max-w-prose">
              {passage.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">Pride and Prejudice — Ch. 1</p>
                <p className="text-xs text-muted-foreground">Narrated by Karen Savage · 11:58 / 28:30</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3" aria-live="polite">
              {isPlaying ? "Playing" : "Paused"}
            </p>
            <div className="flex flex-wrap gap-2">
              {PLAYBACK_SPEEDS.map((speed) => (
                <Button
                  key={speed}
                  type="button"
                  size="sm"
                  variant={playbackSpeed === speed ? "default" : "outline"}
                  onClick={() => setPlaybackSpeed(speed)}
                  aria-pressed={playbackSpeed === speed}
                >
                  {speed}x
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export interface MarketingLandingProps {
  onBrowseAsGuest?: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

export function MarketingLanding({ onBrowseAsGuest, onOpenLogin, onOpenRegister }: MarketingLandingProps) {
  const { toggleHighContrast } = useAccessibility();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: platformStats } = useQuery<{
    totalBooks: number;
    totalUsers: number;
    totalListeningMinutes: number;
  }>({
    queryKey: ["/api/platform/stats"],
  });

  useKeyboardShortcuts({
    onHighContrast: toggleHighContrast,
  });

  const titleCount = platformStats?.totalBooks
    ? formatTitleCount(platformStats.totalBooks)
    : "13.7k+";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <nav className="border-b bg-background/90 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex justify-between items-center gap-4">
          <AccessiBooksLogo onClick={() => setMobileMenuOpen(!mobileMenuOpen)} />

          <div className="hidden md:flex items-center gap-3">
            <AccessibilityControls />
            <Button variant="ghost" onClick={onOpenLogin} data-testid="nav-sign-in">
              Sign In
            </Button>
            <Button onClick={onOpenRegister} data-testid="nav-get-started">
              Get Started
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            data-testid="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>

        <div
          className={cn(
            "md:hidden overflow-hidden transition-all duration-300",
            mobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="px-4 pb-4 space-y-3 border-t pt-4">
            <div className="flex justify-center">
              <AccessibilityControls />
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                onOpenLogin();
                setMobileMenuOpen(false);
              }}
            >
              <User className="mr-2 h-4 w-4" /> Sign In
            </Button>
            <Button
              className="w-full justify-start"
              onClick={() => {
                onOpenRegister();
                setMobileMenuOpen(false);
              }}
            >
              <Headphones className="mr-2 h-4 w-4" /> Get Started
            </Button>
          </div>
        </div>
      </nav>

      <main id="main-content">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24" aria-labelledby="hero-heading">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-6 text-sm font-normal">
              From Australian Disability Ltd
            </Badge>
            <h1 id="hero-heading" className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
              Audiobooks &amp; ebooks,{" "}
              <span className="text-primary">designed for every reader.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl">
              A calm, accessibility-first library you can listen to, read, and shape to suit how you read best —
              whatever your vision, hearing, motor or cognitive needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <Button size="lg" onClick={onOpenRegister} data-testid="hero-get-started">
                Create a free account
              </Button>
              {onBrowseAsGuest && (
                <Button size="lg" variant="outline" onClick={onBrowseAsGuest} data-testid="browse-as-guest">
                  Browse as a guest
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 max-w-3xl">
            <div>
              <p className="text-3xl font-bold text-primary">{titleCount}</p>
              <p className="text-sm text-muted-foreground mt-1">Titles in library</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">WCAG 2.2 AA</p>
              <p className="text-sm text-muted-foreground mt-1">Built to conform</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary">100%</p>
              <p className="text-sm text-muted-foreground mt-1">Keyboard navigable</p>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className="bg-muted/40 py-16 md:py-20" aria-labelledby="who-heading">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <p className="text-sm font-medium text-primary uppercase tracking-wider mb-2">Who it&apos;s for</p>
            <h2 id="who-heading" className="text-3xl md:text-4xl font-bold mb-8 max-w-2xl">
              A library that adapts to the way you read.
            </h2>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
              {WHO_ITS_FOR.map((item) => (
                <li key={item} className="flex items-start gap-3 text-muted-foreground">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 md:py-20" aria-labelledby="features-heading">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <p className="text-sm font-medium text-primary uppercase tracking-wider mb-2">What you can do</p>
            <h2 id="features-heading" className="text-3xl md:text-4xl font-bold mb-4 max-w-2xl">
              Read your way. Listen your way. No compromise.
            </h2>
            <p className="text-muted-foreground mb-12 max-w-2xl leading-relaxed">
              Every feature is built with access in mind from the start — not retrofitted later.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map((feature) => (
                <Card key={feature.title} className="border-2 hover:border-primary/40 transition-colors">
                  <CardContent className="pt-6">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary w-fit mb-4">
                      <feature.icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive demo */}
        <section className="bg-muted/40 py-16 md:py-20" aria-labelledby="demo-heading">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <p className="text-sm font-medium text-primary uppercase tracking-wider mb-2">See it in action</p>
            <h2 id="demo-heading" className="text-3xl md:text-4xl font-bold mb-4 max-w-2xl">
              Try the controls. Watch the page respond.
            </h2>
            <p className="text-muted-foreground mb-10 max-w-2xl leading-relaxed">
              Change the reading mode, type size, line spacing, or contrast — and the sample passage updates
              instantly. No sign-up needed.
            </p>
            <ReadingDemo />
            <Card className="mt-12 border-primary/20 bg-primary/5">
              <CardContent className="py-8 px-6 md:px-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <h3 className="text-xl font-semibold mb-2">Like what you see? Save your settings to your account.</h3>
                  <p className="text-muted-foreground text-sm">
                    Sign up free to keep your reading preferences across every device.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                  <Button onClick={onOpenRegister}>Create a free account</Button>
                  {onBrowseAsGuest && (
                    <Button variant="outline" onClick={onBrowseAsGuest}>
                      Browse as a guest
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Accessibility promise */}
        <section className="py-16 md:py-20" aria-labelledby="promise-heading">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <p className="text-sm font-medium text-primary uppercase tracking-wider mb-2">
              Our accessibility promise
            </p>
            <h2 id="promise-heading" className="text-3xl md:text-4xl font-bold mb-4 max-w-2xl">
              Accessibility isn&apos;t a setting. It&apos;s the whole product.
            </h2>
            <p className="text-muted-foreground mb-10 max-w-2xl leading-relaxed">
              AccessiBooks is built and operated by Australian Disability Ltd, a registered charity. A share of every
              subscription supports accessibility programs across Australia.
            </p>
            <ul className="space-y-4 max-w-3xl">
              {ACCESSIBILITY_PROMISES.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-muted/40 py-16 md:py-20" aria-labelledby="testimonials-heading">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <p className="text-sm font-medium text-primary uppercase tracking-wider mb-2">
              Voices from the community
            </p>
            <h2 id="testimonials-heading" className="text-3xl md:text-4xl font-bold mb-12">
              Built with — not just for — readers.
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t) => (
                <Card key={t.name} className="border-2">
                  <CardContent className="pt-6">
                    <Quote className="h-8 w-8 text-primary/40 mb-4" aria-hidden="true" />
                    <blockquote className="text-sm leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</blockquote>
                    <footer>
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </footer>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing preview */}
        <section className="py-16 md:py-20" aria-labelledby="pricing-heading">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <p className="text-sm font-medium text-primary uppercase tracking-wider mb-2">Simple, fair pricing</p>
            <h2 id="pricing-heading" className="text-3xl md:text-4xl font-bold mb-4 max-w-2xl">
              Start free. Upgrade only when it helps.
            </h2>
            <p className="text-muted-foreground mb-10 max-w-2xl leading-relaxed">
              A generous free tier covers the public-domain library, full accessibility features, and personal
              bookmarks. Plus and Premium plans unlock ad-free listening, offline downloads, and family sharing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Button size="lg" onClick={onOpenRegister}>
                See plans &amp; pricing
              </Button>
              <Button size="lg" variant="outline" onClick={onOpenRegister}>
                Or start free
              </Button>
            </div>
            <Card className="max-w-xl border-2">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" aria-hidden="true" />
                  Included free
                </h3>
                <ul className="space-y-3">
                  {FREE_TIER_ITEMS.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 md:py-20 bg-primary text-primary-foreground" aria-labelledby="cta-heading">
          <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Accessibility className="h-8 w-8" aria-hidden="true" />
              <span className="text-xl font-bold">AccessiBooks</span>
            </div>
            <h2 id="cta-heading" className="text-3xl md:text-4xl font-bold mb-4">
              Ready to start reading on your terms?
            </h2>
            <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
              Create a free AccessiBooks account in seconds — no credit card needed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" onClick={onOpenRegister} data-testid="cta-get-started">
                Create a free account
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
                onClick={onOpenLogin}
              >
                I already have an account
              </Button>
            </div>
            <p className="text-sm opacity-75 mt-6">
              Built and tested with accessibility in mind, every step.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
