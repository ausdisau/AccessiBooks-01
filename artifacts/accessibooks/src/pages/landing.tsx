import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Headphones,
  BookOpen,
  Accessibility,
  Keyboard,
  Eye,
  Brain,
  Volume2,
  Heart,
  Users,
  GraduationCap,
  Building2,
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";

import {
  BrandHeader,
  BrandFooter,
  Section,
  Hero,
  FeatureCard,
  Stat,
  Quote,
  BrandButton,
  BrandWordmark,
} from "@/components/brand";

import brandArt from "@assets/AccessiBooksV3_1776746168818.png";

interface BrandLandingPageProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onBrowseAsGuest?: () => void;
}

interface PlatformStats {
  totalBooks: number;
  totalUsers: number;
  totalListeningMinutes: number;
}

const features = [
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
    icon: Volume2,
    title: "Voice control",
    description:
      "Drive playback, navigate the library, and adjust accessibility settings hands-free with simple voice commands.",
  },
];

const audiences = [
  { icon: Eye, label: "People with print or vision differences" },
  { icon: Brain, label: "Readers with dyslexia or cognitive needs" },
  { icon: Heart, label: "NDIS participants and support workers" },
  { icon: Users, label: "Families reading together" },
  { icon: GraduationCap, label: "Students and lifelong learners" },
  { icon: Building2, label: "Schools, libraries and institutions" },
];

const commitments = [
  "Designed to meet WCAG 2.2 AA across colour, contrast and interaction.",
  "Tested with screen readers, keyboard-only flows, and switch access.",
  "Respects reduced-motion, high-contrast, and reader-zoom system settings.",
  "Plain-language copy and short line lengths throughout the experience.",
  "Donates a share of every subscription to Australian Disability Ltd programs.",
];

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toString();
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function BrandLandingPage({
  onOpenLogin,
  onOpenRegister,
  onBrowseAsGuest,
}: BrandLandingPageProps) {
  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title =
      "AccessiBooks — Audiobooks & ebooks designed for everyone";

    const description =
      "AccessiBooks is an accessibility-first audiobook and ebook platform from Australian Disability Ltd. Listen, read, and learn with built-in supports for vision, cognitive, and motor needs.";

    // Track which meta tags we created (so we can remove them on unmount)
    // and snapshot prior content of pre-existing tags (so we can restore
    // them, rather than leaking landing-page copy into other pages).
    const created: HTMLMetaElement[] = [];
    const restored: { el: HTMLMetaElement; previous: string }[] = [];
    const setOrCreate = (
      name: string,
      content: string,
      attr: "name" | "property" = "name"
    ) => {
      const selector = `meta[${attr}="${name}"]`;
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
        created.push(el);
      } else {
        restored.push({ el, previous: el.getAttribute("content") ?? "" });
      }
      el.setAttribute("content", content);
    };

    setOrCreate("description", description);
    setOrCreate("og:title", "AccessiBooks — Audiobooks & ebooks designed for everyone", "property");
    setOrCreate("og:description", description, "property");
    setOrCreate("og:type", "website", "property");
    setOrCreate("og:image", brandArt, "property");
    setOrCreate("twitter:card", "summary_large_image");
    setOrCreate("twitter:title", "AccessiBooks");
    setOrCreate("twitter:description", description);
    setOrCreate("twitter:image", brandArt);

    return () => {
      document.title = previousTitle;
      for (const el of created) el.remove();
      for (const { el, previous } of restored) el.setAttribute("content", previous);
    };
  }, []);

  const totalBooks = stats?.totalBooks ?? 90;
  const totalListeners = stats?.totalUsers ?? 0;
  const totalMinutes = stats?.totalListeningMinutes ?? 0;

  return (
    <div className="brand-surface min-h-screen flex flex-col">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <BrandHeader onSignIn={onOpenLogin} onSignUp={onOpenRegister} />

      <main id="main-content" className="flex-1" data-testid="brand-landing-main">
        {/* HERO */}
        <Section spacing="xl" tone="cream" ariaLabel="AccessiBooks introduction">
          <Hero
            eyebrow="From Australian Disability Ltd"
            headline={
              <>
                Audiobooks &amp; ebooks,{" "}
                <span style={{ color: "var(--brand-orange-deep)" }}>designed for every reader</span>.
              </>
            }
            body={
              <>
                A calm, accessibility-first library you can listen to, read, and shape to suit
                how <em>you</em> read best — whatever your vision, hearing, motor or cognitive
                needs.
              </>
            }
            actions={
              <>
                <BrandButton
                  variant="secondary"
                  size="lg"
                  onClick={onOpenRegister}
                  rightIcon={<ArrowRight className="h-5 w-5" aria-hidden="true" />}
                  data-testid="brand-hero-sign-up"
                >
                  Create a free account
                </BrandButton>
                {onBrowseAsGuest && (
                  <BrandButton
                    variant="outline"
                    size="lg"
                    onClick={onBrowseAsGuest}
                    data-testid="brand-hero-browse-guest"
                  >
                    Browse as a guest
                  </BrandButton>
                )}
              </>
            }
            art={
              <div
                className="relative rounded-3xl overflow-hidden border-2"
                style={{
                  borderColor: "var(--brand-line)",
                  backgroundColor: "var(--brand-cream-deep)",
                }}
              >
                <img
                  src={brandArt}
                  alt=""
                  className="block w-full h-auto"
                  loading="eager"
                  decoding="async"
                />
              </div>
            }
          />

          <div
            className="mt-14 sm:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-y-8 gap-x-6 border-t pt-10"
            style={{ borderColor: "var(--brand-line)" }}
            aria-label="Platform highlights"
          >
            <Stat value={`${formatNumber(totalBooks)}+`} label="Titles in library" />
            <Stat value="WCAG 2.2 AA" label="Designed to meet" />
            <Stat
              value={totalListeners > 0 ? `${formatNumber(totalListeners)}+` : "Free"}
              label={totalListeners > 0 ? "Active listeners" : "To get started"}
            />
            <Stat
              value={totalMinutes > 0 ? `${formatNumber(totalMinutes)}+` : "100%"}
              label={totalMinutes > 0 ? "Minutes listened" : "Keyboard navigable"}
            />
          </div>
        </Section>

        {/* AUDIENCES */}
        <Section
          id="audiences"
          tone="deep"
          spacing="lg"
          ariaLabelledby="audiences-heading"
        >
          <div className="text-center max-w-2xl mx-auto">
            <p
              className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] mb-4"
              style={{ color: "var(--brand-orange-deep)" }}
            >
              Who it's for
            </p>
            <h2
              id="audiences-heading"
              className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
              style={{ color: "var(--brand-navy)" }}
            >
              A library that adapts to the way you read.
            </h2>
          </div>

          <ul
            className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="list"
          >
            {audiences.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-start gap-4 rounded-2xl p-5 border-2"
                style={{
                  backgroundColor: "var(--brand-cream)",
                  borderColor: "var(--brand-line)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
                  style={{
                    backgroundColor: "var(--brand-cream-deep)",
                    color: "var(--brand-orange-deep)",
                  }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className="text-base sm:text-lg font-medium leading-snug pt-1.5"
                  style={{ color: "var(--brand-ink)" }}
                >
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* FEATURES */}
        <Section id="features" spacing="lg" ariaLabelledby="features-heading">
          <div className="max-w-2xl">
            <p
              className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] mb-4"
              style={{ color: "var(--brand-orange-deep)" }}
            >
              What you can do
            </p>
            <h2
              id="features-heading"
              className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
              style={{ color: "var(--brand-navy)" }}
            >
              Read your way. Listen your way. No compromise.
            </h2>
            <p
              className="mt-5 text-lg leading-relaxed"
              style={{ color: "var(--brand-ink-soft)" }}
            >
              Every feature is built with access in mind from the start — not retrofitted later.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <FeatureCard
                key={f.title}
                icon={<f.icon className="h-6 w-6" aria-hidden="true" />}
                title={f.title}
                description={f.description}
              />
            ))}
          </div>
        </Section>

        {/* ACCESSIBILITY COMMITMENTS */}
        <Section
          id="accessibility"
          tone="deep"
          spacing="lg"
          ariaLabelledby="commitments-heading"
        >
          <div className="grid gap-10 md:grid-cols-12 items-start">
            <div className="md:col-span-5">
              <p
                className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: "var(--brand-orange-deep)" }}
              >
                Our accessibility promise
              </p>
              <h2
                id="commitments-heading"
                className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
                style={{ color: "var(--brand-navy)" }}
              >
                Accessibility isn't a setting. It's the whole product.
              </h2>
              <p
                className="mt-5 text-lg leading-relaxed"
                style={{ color: "var(--brand-ink-soft)" }}
              >
                AccessiBooks is built and operated by Australian Disability Ltd, a registered
                charity. A share of every subscription supports accessibility programs across
                Australia.
              </p>
            </div>

            <div className="md:col-span-7">
              <ul className="space-y-4" role="list">
                {commitments.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-4 rounded-xl p-4 sm:p-5 border-2"
                    style={{
                      backgroundColor: "var(--brand-cream)",
                      borderColor: "var(--brand-line)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 mt-0.5"
                      style={{
                        backgroundColor: "var(--brand-navy)",
                        color: "var(--brand-cream)",
                      }}
                    >
                      <Check className="h-5 w-5" />
                    </span>
                    <span
                      className="text-base sm:text-lg leading-relaxed font-medium"
                      style={{ color: "var(--brand-ink)" }}
                    >
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* TESTIMONIALS */}
        <Section spacing="lg" ariaLabelledby="testimonials-heading">
          <div className="max-w-2xl">
            <p
              className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] mb-4"
              style={{ color: "var(--brand-orange-deep)" }}
            >
              Voices from the community
            </p>
            <h2
              id="testimonials-heading"
              className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
              style={{ color: "var(--brand-navy)" }}
            >
              Built with — not just for — readers.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Quote attribution="Mira" role="reader, low vision">
              The high-contrast mode and large focus rings finally let me browse a library
              without losing my place every five seconds.
            </Quote>
            <Quote attribution="Daniel" role="NDIS participant">
              Voice control plus the focus mode means I can listen to a chapter end-to-end
              without fighting the interface.
            </Quote>
            <Quote attribution="Ms. Patel" role="primary school teacher">
              The dyslexia font and plain-language copy made AccessiBooks the easiest pick for
              our classroom reading hour.
            </Quote>
          </div>
        </Section>

        {/* PRICING TEASER */}
        <Section
          id="pricing"
          tone="deep"
          spacing="lg"
          ariaLabelledby="pricing-heading"
        >
          <div className="grid gap-10 md:grid-cols-12 items-center">
            <div className="md:col-span-7">
              <p
                className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] mb-4"
                style={{ color: "var(--brand-orange-deep)" }}
              >
                Simple, fair pricing
              </p>
              <h2
                id="pricing-heading"
                className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
                style={{ color: "var(--brand-navy)" }}
              >
                Start free. Upgrade only when it helps.
              </h2>
              <p
                className="mt-5 text-lg leading-relaxed max-w-xl"
                style={{ color: "var(--brand-ink-soft)" }}
              >
                A generous free tier covers the public-domain library, full accessibility
                features, and personal bookmarks. Plus and Premium plans unlock ad-free
                listening, offline downloads, and family sharing.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <BrandButton
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    window.location.href = "/pricing";
                  }}
                  rightIcon={<ArrowRight className="h-5 w-5" aria-hidden="true" />}
                  data-testid="brand-pricing-cta"
                >
                  See plans &amp; pricing
                </BrandButton>
                <BrandButton variant="ghost" size="lg" onClick={onOpenRegister}>
                  Or start free
                </BrandButton>
              </div>
            </div>

            <div className="md:col-span-5">
              <div
                className="rounded-2xl p-7 border-2"
                style={{
                  backgroundColor: "var(--brand-cream)",
                  borderColor: "var(--brand-line)",
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles
                    className="h-5 w-5"
                    aria-hidden="true"
                    style={{ color: "var(--brand-orange-deep)" }}
                  />
                  <span
                    className="text-sm font-semibold uppercase tracking-wider"
                    style={{ color: "var(--brand-ink-soft)" }}
                  >
                    Included free
                  </span>
                </div>
                <ul className="space-y-3">
                  {[
                    "All accessibility features (WCAG 2.2 AA)",
                    "Public-domain audiobooks & ebooks",
                    "Bookmarks, progress sync, sleep timer",
                    "Voice control & focus mode",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Check
                        className="h-5 w-5 mt-0.5 shrink-0"
                        aria-hidden="true"
                        style={{ color: "var(--brand-navy)" }}
                      />
                      <span
                        className="text-base"
                        style={{ color: "var(--brand-ink)" }}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Section>

        {/* FINAL CTA */}
        <Section spacing="xl" tone="navy" ariaLabelledby="final-cta-heading">
          <div className="text-center max-w-3xl mx-auto">
            <BrandWordmark size="lg" className="justify-center items-center mx-auto" />
            <h2
              id="final-cta-heading"
              className="brand-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.05] mt-8"
              style={{ color: "var(--brand-cream)" }}
            >
              Ready to start reading on your terms?
            </h2>
            <p
              className="mt-6 text-lg sm:text-xl leading-relaxed"
              style={{ color: "color-mix(in srgb, var(--brand-cream) 80%, transparent)" }}
            >
              Create a free AccessiBooks account in seconds — no credit card needed.
            </p>
            <div className="mt-10 flex flex-wrap gap-3 justify-center">
              <BrandButton
                variant="secondary"
                size="lg"
                onClick={onOpenRegister}
                rightIcon={<ArrowRight className="h-5 w-5" aria-hidden="true" />}
                data-testid="brand-final-cta-sign-up"
              >
                Create a free account
              </BrandButton>
              <BrandButton
                variant="outline"
                size="lg"
                onClick={onOpenLogin}
                className="!border-[var(--brand-cream)] !text-[var(--brand-cream)] hover:!bg-[var(--brand-cream)] hover:!text-[var(--brand-navy-strong)]"
                data-testid="brand-final-cta-sign-in"
              >
                I already have an account
              </BrandButton>
            </div>
            <p
              className="mt-6 text-sm flex items-center justify-center gap-2"
              style={{ color: "color-mix(in srgb, var(--brand-cream) 70%, transparent)" }}
            >
              <Accessibility className="h-4 w-4" aria-hidden="true" />
              Built and tested with accessibility in mind, every step.
            </p>
          </div>
        </Section>
      </main>

      <BrandFooter />
    </div>
  );
}
