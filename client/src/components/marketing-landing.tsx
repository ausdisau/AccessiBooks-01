import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Accessibility,
  ArrowRight,
  BookOpen,
  Brain,
  Building2,
  Check,
  Contrast,
  Eye,
  GraduationCap,
  Headphones,
  Heart,
  Keyboard,
  Menu,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Type,
  Users,
  X,
} from "lucide-react";
import { AccessibilityControls } from "@/components/accessibility-controls";
import { Button } from "@/components/ui/button";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useAccessibility } from "@/hooks/use-accessibility";
import { cn } from "@/lib/utils";
import { MARKETING_FOOTER_LINKS, MARKETING_NAV_ITEMS, type MarketingSectionId } from "@/lib/marketing-routes";

type ReadingMode = "standard" | "dyslexia" | "easy-english";
type DemoContrast = "normal" | "high" | "sepia";
type SectionTone = "cream" | "deep" | "navy";

const SECTION_SPACING = {
  lg: "py-16 sm:py-24",
  xl: "py-20 sm:py-28 md:py-32",
} as const;

const SECTION_TONE: Record<SectionTone, { bg: string; color: string }> = {
  cream: { bg: "var(--brand-cream)", color: "var(--brand-ink)" },
  deep: { bg: "var(--brand-cream-deep)", color: "var(--brand-ink)" },
  navy: { bg: "var(--brand-navy-strong)", color: "var(--brand-cream)" },
};

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

const AUDIENCES = [
  { icon: Eye, label: "People with print or vision differences" },
  { icon: Brain, label: "Readers with dyslexia or cognitive needs" },
  { icon: Heart, label: "NDIS participants and support workers" },
  { icon: Users, label: "Families reading together" },
  { icon: GraduationCap, label: "Students and lifelong learners" },
  { icon: Building2, label: "Schools, libraries and institutions" },
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
const DEMO_DURATION_SEC = 1710;

function formatTitleCount(count: number): string {
  if (count >= 1000) {
    const rounded = (count / 1000).toFixed(1).replace(/\.0$/, "");
    return `${rounded}k`;
  }
  return `${count}`;
}

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function BrandWordmark({ size = "md", showTagline = false }: { size?: "md" | "lg"; showTagline?: boolean }) {
  const titleClass = size === "lg" ? "text-3xl" : "text-2xl";
  const tagClass = size === "lg" ? "text-sm" : "text-xs";

  return (
    <div className="flex flex-col">
      <span className={cn("brand-display font-semibold leading-none", titleClass)} style={{ color: "var(--brand-navy)" }}>
        Accessi<span style={{ color: "var(--brand-orange-deep)" }}>Books</span>
      </span>
      {showTagline && (
        <span
          className={cn("mt-2 uppercase tracking-[0.18em] font-medium", tagClass)}
          style={{ color: "var(--brand-ink-soft)" }}
        >
          Audiobooks &amp; ebooks for everyone
        </span>
      )}
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] mb-4"
      style={{ color: "var(--brand-orange-deep)" }}
    >
      {children}
    </p>
  );
}

function MarketingSection({
  id,
  tone = "cream",
  spacing = "lg",
  ariaLabel,
  ariaLabelledby,
  className,
  children,
}: {
  id?: string;
  tone?: SectionTone;
  spacing?: keyof typeof SECTION_SPACING;
  ariaLabel?: string;
  ariaLabelledby?: string;
  className?: string;
  children: ReactNode;
}) {
  const palette = SECTION_TONE[tone];
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cn(SECTION_SPACING[spacing], className)}
      style={{ backgroundColor: palette.bg, color: palette.color }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

type BrandButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "outline-light";

function BrandButton({
  variant = "primary",
  size = "default",
  className,
  children,
  rightIcon,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant"> & {
  variant?: BrandButtonVariant;
  rightIcon?: ReactNode;
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-[var(--brand-navy)] text-[var(--brand-cream)] hover:bg-[var(--brand-navy-strong)] border-transparent",
    secondary:
      "bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-orange-deep)] border-transparent",
    outline:
      "bg-transparent border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] hover:bg-[var(--brand-navy)] hover:text-[var(--brand-cream)]",
    ghost: "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-cream-deep)] border-transparent",
    "outline-light":
      "bg-transparent border-2 border-[var(--brand-cream)] text-[var(--brand-cream)] hover:bg-[var(--brand-cream)] hover:text-[var(--brand-navy-strong)]",
  };

  return (
    <Button
      size={size}
      className={cn("font-semibold focus-visible:ring-[var(--brand-orange)]", styles[variant], className)}
      {...props}
    >
      {children}
      {rightIcon}
    </Button>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div
        className="brand-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight break-words"
        style={{ color: "var(--brand-orange-deep)" }}
      >
        {value}
      </div>
      <div className="mt-2 text-sm uppercase tracking-wider font-medium" style={{ color: "var(--brand-ink-soft)" }}>
        {label}
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Headphones;
  title: string;
  description: string;
}) {
  return (
    <article
      className="rounded-2xl p-6 sm:p-7 h-full border-2 transition-colors"
      style={{ backgroundColor: "var(--brand-cream)", borderColor: "var(--brand-line)" }}
    >
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
        style={{ backgroundColor: "var(--brand-cream-deep)", color: "var(--brand-orange-deep)" }}
        aria-hidden="true"
      >
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="brand-display text-xl sm:text-2xl font-semibold mb-2 leading-tight" style={{ color: "var(--brand-navy)" }}>
        {title}
      </h3>
      <p className="text-base leading-relaxed" style={{ color: "var(--brand-ink-soft)" }}>
        {description}
      </p>
    </article>
  );
}

function TestimonialCard({
  quote,
  name,
  role,
}: {
  quote: string;
  name: string;
  role: string;
}) {
  return (
    <figure
      className="rounded-2xl border-2 p-6 sm:p-7 h-full"
      style={{ backgroundColor: "var(--brand-cream)", borderColor: "var(--brand-line)" }}
    >
      <div className="brand-display text-5xl leading-none mb-2" style={{ color: "var(--brand-orange)" }} aria-hidden="true">
        &ldquo;
      </div>
      <blockquote className="brand-display text-xl sm:text-2xl leading-snug font-medium" style={{ color: "var(--brand-navy)" }}>
        {quote}
      </blockquote>
      <figcaption className="mt-6">
        <p className="font-semibold" style={{ color: "var(--brand-ink)" }}>
          {name}
        </p>
        <p className="text-sm" style={{ color: "var(--brand-ink-soft)" }}>
          {role}
        </p>
      </figcaption>
    </figure>
  );
}

export function MarketingFooter({ onBrowseAsGuest: _onBrowseAsGuest }: { onBrowseAsGuest?: () => void } = {}) {
  const year = new Date().getFullYear();
  const footerColumns = [
    { title: "Product", links: MARKETING_FOOTER_LINKS.product },
    { title: "Support", links: MARKETING_FOOTER_LINKS.support },
    { title: "Organisation", links: MARKETING_FOOTER_LINKS.organisation },
  ];

  return (
    <footer
      role="contentinfo"
      className="border-t"
      style={{
        backgroundColor: "var(--brand-navy-strong)",
        borderColor: "var(--brand-navy-strong)",
        color: "var(--brand-cream)",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 py-14 sm:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <BrandWordmark size="lg" showTagline />
            <a
              href="https://ausdis.au"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
              aria-label="Australian Disability Ltd — opens in a new tab"
            >
              <img src="/assets/ausdis-logo.jpg" alt="" className="h-12 w-auto bg-white rounded-md p-1.5" />
              <span className="text-xs uppercase tracking-[0.18em] font-semibold opacity-80">
                A project of
                <span className="block normal-case tracking-normal text-sm mt-0.5 text-[var(--brand-cream)]">
                  Australian Disability Ltd
                </span>
              </span>
            </a>
            <p className="mt-6 text-base leading-relaxed max-w-md opacity-80">
              AccessiBooks is built and operated by Australian Disability Ltd, a registered charity working to make
              literature accessible to every reader and listener.
            </p>
            <p className="mt-4 text-sm font-medium opacity-70">
              Designed to meet WCAG 2.2 AA · Keyboard friendly · Screen reader tested
            </p>
          </div>
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h2 className="text-xs uppercase tracking-[0.18em] font-semibold mb-4 opacity-70">{column.title}</h2>
                <ul className="space-y-2 text-sm opacity-80">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      {"external" in link && link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)] rounded-sm"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)] rounded-sm"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div
          className="mt-12 pt-6 border-t flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between text-sm opacity-70"
          style={{ borderColor: "color-mix(in srgb, var(--brand-cream) 20%, transparent)" }}
        >
          <p>&copy; {year} Australian Disability Ltd. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            Made with care for accessible reading
          </p>
        </div>
      </div>
    </footer>
  );
}

function DemoRadioGroup<T extends string>({
  legend,
  legendIcon: LegendIcon,
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  legend: string;
  legendIcon?: typeof Type;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testIdPrefix: string;
}) {
  const ids = options.map((option) => option.id);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: T) => {
    const index = ids.indexOf(current);
    if (index < 0) return;

    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % ids.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    else return;

    event.preventDefault();
    onChange(ids[next]);
  };

  return (
    <fieldset>
      <legend className="text-sm font-semibold inline-flex items-center gap-2 mb-3" style={{ color: "var(--brand-navy)" }}>
        {LegendIcon && <LegendIcon className="h-4 w-4" aria-hidden="true" />}
        {legend}
      </legend>
      <div
        className="grid grid-cols-3 gap-2 rounded-xl p-1 border"
        style={{ backgroundColor: "var(--brand-cream)", borderColor: "var(--brand-line)" }}
        role="radiogroup"
        aria-label={legend}
      >
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.id)}
              onKeyDown={(event) => handleKeyDown(event, option.id)}
              className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
              style={{
                backgroundColor: selected ? "var(--brand-navy)" : "transparent",
                color: selected ? "var(--brand-cream)" : "var(--brand-ink)",
              }}
              data-testid={`${testIdPrefix}-${option.id}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ReadingDemo({
  onOpenRegister,
  onBrowseAsGuest,
}: {
  onOpenRegister: () => void;
  onBrowseAsGuest?: () => void;
}) {
  const [readingMode, setReadingMode] = useState<ReadingMode>("standard");
  const [textSize, setTextSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState(1.7);
  const [contrast, setContrast] = useState<DemoContrast>("normal");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [progressSec, setProgressSec] = useState(718);
  const fontSizeId = useId();
  const lineSpacingId = useId();

  const passage = SAMPLE_PASSAGE[readingMode];

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setProgressSec((current) => Math.min(current + 1, DEMO_DURATION_SEC));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const passageStyle: Record<string, string | number> = {
    fontSize: `${textSize}px`,
    lineHeight: lineSpacing,
    ...(readingMode === "dyslexia"
      ? {
          fontFamily: "'OpenDyslexic', var(--font-serif), serif",
          letterSpacing: "0.04em",
        }
      : { fontFamily: "var(--font-serif)" }),
    ...(contrast === "high"
      ? { backgroundColor: "#000", color: "#fff" }
      : contrast === "sepia"
        ? { backgroundColor: "#f4ecd8", color: "#3d2f1c" }
        : { backgroundColor: "var(--brand-cream)", color: "var(--brand-ink)" }),
  };

  const progressPct = Math.round((progressSec / DEMO_DURATION_SEC) * 100);

  return (
    <section id="see-the-product" aria-labelledby="see-the-product-heading" className="py-20 sm:py-24" style={{ backgroundColor: "var(--brand-cream)" }}>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <SectionEyebrow>See it in action</SectionEyebrow>
          <h2
            id="see-the-product-heading"
            className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
            style={{ color: "var(--brand-navy)" }}
          >
            Try the controls. Watch the page respond.
          </h2>
          <p className="mt-5 text-lg leading-relaxed" style={{ color: "var(--brand-ink-soft)" }}>
            Change the reading mode, type size, line spacing, or contrast — and the sample passage updates instantly.
            No sign-up needed.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-12 items-start">
          <div className="lg:col-span-5">
            <div
              className="rounded-2xl border-2 p-6 sm:p-7 space-y-7"
              style={{ backgroundColor: "var(--brand-cream-deep)", borderColor: "var(--brand-line)" }}
              role="group"
              aria-label="Reading preferences"
            >
              <DemoRadioGroup
                legend="Reading mode"
                legendIcon={Sparkles}
                options={[
                  { id: "standard", label: "Standard" },
                  { id: "dyslexia", label: "Dyslexia" },
                  { id: "easy-english", label: "Easy English" },
                ]}
                value={readingMode}
                onChange={setReadingMode}
                testIdPrefix="demo-mode"
              />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor={fontSizeId} className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: "var(--brand-navy)" }}>
                    <Type className="h-4 w-4" aria-hidden="true" />
                    Text size
                  </label>
                  <span className="text-sm tabular-nums" style={{ color: "var(--brand-ink-soft)" }}>
                    {textSize}px
                  </span>
                </div>
                <input
                  id={fontSizeId}
                  type="range"
                  min={14}
                  max={28}
                  step={1}
                  value={textSize}
                  onChange={(event) => setTextSize(parseInt(event.target.value, 10))}
                  className="w-full accent-[var(--brand-orange-deep)]"
                  data-testid="demo-font-size"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor={lineSpacingId} className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: "var(--brand-navy)" }}>
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    Line spacing
                  </label>
                  <span className="text-sm tabular-nums" style={{ color: "var(--brand-ink-soft)" }}>
                    {lineSpacing.toFixed(1)}
                  </span>
                </div>
                <input
                  id={lineSpacingId}
                  type="range"
                  min={1.2}
                  max={2.4}
                  step={0.1}
                  value={lineSpacing}
                  onChange={(event) => setLineSpacing(parseFloat(event.target.value))}
                  className="w-full accent-[var(--brand-orange-deep)]"
                  data-testid="demo-line-spacing"
                />
              </div>

              <DemoRadioGroup
                legend="Contrast"
                legendIcon={Contrast}
                options={[
                  { id: "normal", label: "Normal" },
                  { id: "high", label: "High" },
                  { id: "sepia", label: "Sepia" },
                ]}
                value={contrast}
                onChange={setContrast}
                testIdPrefix="demo-contrast"
              />
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div
              className="rounded-2xl border-2 p-6 sm:p-8 min-h-[280px]"
              style={{
                ...passageStyle,
                borderColor: contrast === "high" ? "#000" : contrast === "sepia" ? "#d8c9a8" : "var(--brand-line)",
              }}
            >
              <p className="text-xs uppercase tracking-wider font-semibold mb-5 opacity-70">
                Pride and Prejudice · Chapter 1
                <span className="ml-2" style={{ color: "var(--brand-orange-deep)" }}>
                  Sample passage
                </span>
              </p>
              <div className="space-y-4 max-w-prose">
                {passage.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>

            <div
              className="rounded-2xl border-2 p-5 sm:p-6"
              style={{ backgroundColor: "var(--brand-cream)", borderColor: "var(--brand-line)" }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold truncate" style={{ color: "var(--brand-navy)" }}>
                    Pride and Prejudice — Ch. 1
                  </p>
                  <p className="text-sm truncate" style={{ color: "var(--brand-ink-soft)" }}>
                    Narrated by Karen Savage · {formatClock(progressSec)} / {formatClock(DEMO_DURATION_SEC)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPlaying((playing) => !playing)}
                  className="inline-flex items-center justify-center w-11 h-11 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                  style={{ borderColor: "var(--brand-navy)", color: "var(--brand-navy)" }}
                  aria-label={isPlaying ? "Pause sample playback" : "Play sample playback"}
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--brand-ink-soft)" }} aria-live="polite">
                {isPlaying ? "Playing" : "Paused"}
              </p>
              <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--brand-cream-deep)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%`, backgroundColor: "var(--brand-orange-deep)" }}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setPlaybackSpeed(speed)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                    style={{
                      backgroundColor: playbackSpeed === speed ? "var(--brand-navy)" : "transparent",
                      color: playbackSpeed === speed ? "var(--brand-cream)" : "var(--brand-ink)",
                      borderColor: "var(--brand-line)",
                    }}
                    aria-pressed={playbackSpeed === speed}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-12 rounded-2xl border-2 p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
          style={{ backgroundColor: "var(--brand-cream-deep)", borderColor: "var(--brand-line)" }}
        >
          <div>
            <h3 className="brand-display text-xl sm:text-2xl font-semibold" style={{ color: "var(--brand-navy)" }}>
              Like what you see? Save your settings to your account.
            </h3>
            <p className="mt-2 text-base" style={{ color: "var(--brand-ink-soft)" }}>
              Sign up free to keep your reading preferences across every device.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <BrandButton variant="secondary" onClick={onOpenRegister}>
              Create a free account
            </BrandButton>
            {onBrowseAsGuest && (
              <BrandButton variant="outline" onClick={onBrowseAsGuest}>
                Browse as a guest
              </BrandButton>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingNav({
  onOpenLogin,
  onOpenRegister,
}: {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const routeSection = MARKETING_NAV_ITEMS.find((item) => item.href === location)?.sectionId ?? null;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (location !== "/") return;

    const sectionIds = MARKETING_NAV_ITEMS.map((item) => item.sectionId);
    const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) ratios.set(entry.target.id, entry.intersectionRatio);
          else ratios.delete(entry.target.id);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of Array.from(ratios.entries())) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        setActiveSection(bestId);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [location]);

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 backdrop-blur-md border-b"
      style={{
        backgroundColor: "color-mix(in srgb, var(--brand-cream) 88%, transparent)",
        borderColor: "var(--brand-line)",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 h-16 sm:h-[4.5rem] flex items-center justify-between gap-4">
        <Link href="/" className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)] rounded-sm">
          <BrandWordmark />
        </Link>

        <nav className="hidden lg:flex items-center gap-1" aria-label="Landing page sections">
          {MARKETING_NAV_ITEMS.map((item) => {
            const isActive = routeSection === item.sectionId || activeSection === item.sectionId;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative px-3 py-2 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)]"
                style={{
                  color: isActive ? "var(--brand-orange-deep)" : "var(--brand-ink)",
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--brand-orange-deep)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <AccessibilityControls />
          <BrandButton variant="ghost" onClick={onOpenLogin} data-testid="nav-sign-in">
            Sign In
          </BrandButton>
          <BrandButton variant="secondary" onClick={onOpenRegister} data-testid="nav-get-started">
            Get Started
          </BrandButton>
        </div>

        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
          style={{ borderColor: "var(--brand-line)", color: "var(--brand-navy)" }}
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          data-testid="mobile-menu-toggle"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t px-5 pb-5 pt-4 space-y-3" style={{ borderColor: "var(--brand-line)" }}>
          <div className="flex justify-center">
            <AccessibilityControls />
          </div>
          {MARKETING_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm font-medium"
              style={{ color: "var(--brand-ink)" }}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <BrandButton variant="ghost" className="w-full justify-start" onClick={() => { onOpenLogin(); setMobileOpen(false); }}>
            Sign In
          </BrandButton>
          <BrandButton variant="secondary" className="w-full justify-start" onClick={() => { onOpenRegister(); setMobileOpen(false); }}>
            Get Started
          </BrandButton>
        </div>
      )}
    </header>
  );
}

export interface MarketingLandingProps {
  onBrowseAsGuest?: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  initialSection?: MarketingSectionId;
}

export function MarketingLanding({
  onBrowseAsGuest,
  onOpenLogin,
  onOpenRegister,
  initialSection,
}: MarketingLandingProps) {
  const { toggleHighContrast } = useAccessibility();

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

  useEffect(() => {
    if (!initialSection) return;
    const target = document.getElementById(initialSection);
    if (!target) return;
    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [initialSection]);

  const titleCount = useMemo(() => {
    if (platformStats?.totalBooks) return `${formatTitleCount(platformStats.totalBooks)}+`;
    return "13.7k+";
  }, [platformStats?.totalBooks]);

  const thirdStat = useMemo(() => {
    const minutes = platformStats?.totalListeningMinutes ?? 0;
    if (minutes > 0) {
      return { value: `${formatTitleCount(minutes)}+`, label: "Minutes listened" };
    }
    return { value: "100%", label: "Keyboard navigable" };
  }, [platformStats?.totalListeningMinutes]);

  return (
    <div className="brand-surface min-h-screen flex flex-col">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <MarketingNav onOpenLogin={onOpenLogin} onOpenRegister={onOpenRegister} />

      <main id="main-content" className="flex-1" data-testid="brand-landing-main">
        <MarketingSection spacing="lg" tone="cream" ariaLabel="AccessiBooks introduction" className="!pt-10 sm:!pt-14">
          <div className="grid gap-10 md:gap-14 md:grid-cols-12 items-center">
            <div className="md:col-span-7 max-w-2xl">
              <SectionEyebrow>From Australian Disability Ltd</SectionEyebrow>
              <h1
                className="brand-display text-3xl sm:text-4xl md:text-[2.5rem] lg:text-5xl xl:text-[3.25rem] font-semibold leading-[1.08] tracking-tight"
                style={{ color: "var(--brand-navy)" }}
              >
                Audiobooks &amp; ebooks,
                <br />
                <span style={{ color: "var(--brand-orange-deep)" }}>designed for every reader</span>.
              </h1>
              <p className="mt-6 text-lg sm:text-xl leading-relaxed max-w-prose" style={{ color: "var(--brand-ink-soft)" }}>
                A calm, accessibility-first library you can listen to, read, and shape to suit how <em>you</em> read best
                — whatever your vision, hearing, motor or cognitive needs.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <BrandButton
                  variant="secondary"
                  size="lg"
                  onClick={onOpenRegister}
                  rightIcon={<ArrowRight className="h-5 w-5 ml-2" aria-hidden="true" />}
                  data-testid="hero-get-started"
                >
                  Create a free account
                </BrandButton>
                {onBrowseAsGuest && (
                  <BrandButton variant="outline" size="lg" onClick={onBrowseAsGuest} data-testid="browse-as-guest">
                    Browse as a guest
                  </BrandButton>
                )}
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="relative">
                <div
                  className="relative rounded-3xl overflow-hidden border-2"
                  style={{ borderColor: "var(--brand-line)", backgroundColor: "var(--brand-cream-deep)" }}
                >
                  <img
                    src="/assets/hero-illustration.png"
                    alt=""
                    className="block w-full h-auto"
                    loading="eager"
                    decoding="async"
                  />
                </div>
                <div
                  aria-hidden="true"
                  className="hidden sm:block absolute -bottom-6 -left-6 md:-left-10 w-[78%] max-w-xs rounded-2xl border-2 shadow-xl p-4"
                  style={{ backgroundColor: "var(--brand-cream)", borderColor: "var(--brand-line)", color: "var(--brand-ink)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "var(--brand-navy)", color: "var(--brand-cream)" }}
                    >
                      <Headphones className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--brand-orange-deep)" }}>
                        Now playing
                      </div>
                      <div className="text-sm font-semibold truncate">Pride and Prejudice</div>
                      <div className="text-xs truncate" style={{ color: "var(--brand-ink-soft)" }}>
                        Ch. 3 · 12:04 / 28:30
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--brand-cream-deep)" }}>
                    <div className="h-full w-2/5 rounded-full" style={{ backgroundColor: "var(--brand-orange-deep)" }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--brand-ink-soft)" }}>
                    <span className="inline-flex items-center gap-1.5">
                      <Type className="h-3.5 w-3.5" /> Dyslexia font
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Contrast className="h-3.5 w-3.5" /> High contrast
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="mt-16 sm:mt-24 grid grid-cols-1 md:grid-cols-3 gap-y-8 gap-x-8 border-t pt-10"
            style={{ borderColor: "var(--brand-line)" }}
            aria-label="Platform highlights"
          >
            <StatTile value={titleCount} label="Titles in library" />
            <StatTile value="WCAG 2.2 AA" label="Built to conform" />
            <StatTile value={thirdStat.value} label={thirdStat.label} />
          </div>
        </MarketingSection>

        <MarketingSection id="audiences" tone="deep" spacing="lg" ariaLabelledby="audiences-heading">
          <div className="text-center max-w-2xl mx-auto">
            <SectionEyebrow>Who it&apos;s for</SectionEyebrow>
            <h2
              id="audiences-heading"
              className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
              style={{ color: "var(--brand-navy)" }}
            >
              A library that adapts to the way you read.
            </h2>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
            {AUDIENCES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-start gap-4 rounded-2xl p-5 border-2"
                style={{ backgroundColor: "var(--brand-cream)", borderColor: "var(--brand-line)" }}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
                  style={{ backgroundColor: "var(--brand-cream-deep)", color: "var(--brand-orange-deep)" }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-base sm:text-lg font-medium leading-snug pt-1.5" style={{ color: "var(--brand-ink)" }}>
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </MarketingSection>

        <MarketingSection id="features" spacing="lg" ariaLabelledby="features-heading">
          <div className="max-w-2xl">
            <SectionEyebrow>What you can do</SectionEyebrow>
            <h2
              id="features-heading"
              className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
              style={{ color: "var(--brand-navy)" }}
            >
              Read your way. Listen your way. No compromise.
            </h2>
            <p className="mt-5 text-lg leading-relaxed" style={{ color: "var(--brand-ink-soft)" }}>
              Every feature is built with access in mind from the start — not retrofitted later.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </MarketingSection>

        <ReadingDemo onOpenRegister={onOpenRegister} onBrowseAsGuest={onBrowseAsGuest} />

        <MarketingSection id="accessibility" tone="deep" spacing="lg" ariaLabelledby="commitments-heading">
          <div className="grid gap-10 md:grid-cols-12 items-start">
            <div className="md:col-span-5">
              <SectionEyebrow>Our accessibility promise</SectionEyebrow>
              <h2
                id="commitments-heading"
                className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
                style={{ color: "var(--brand-navy)" }}
              >
                Accessibility isn&apos;t a setting. It&apos;s the whole product.
              </h2>
              <p className="mt-5 text-lg leading-relaxed" style={{ color: "var(--brand-ink-soft)" }}>
                AccessiBooks is built and operated by Australian Disability Ltd, a registered charity. A share of every
                subscription supports accessibility programs across Australia.
              </p>
            </div>
            <div className="md:col-span-7">
              <ul className="space-y-4" role="list">
                {ACCESSIBILITY_PROMISES.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--brand-navy)" }} aria-hidden="true" />
                    <span className="text-base" style={{ color: "var(--brand-ink)" }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </MarketingSection>

        <MarketingSection spacing="lg" ariaLabelledby="testimonials-heading">
          <div className="max-w-2xl">
            <SectionEyebrow>Voices from the community</SectionEyebrow>
            <h2
              id="testimonials-heading"
              className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
              style={{ color: "var(--brand-navy)" }}
            >
              Built with — not just for — readers.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <TestimonialCard key={testimonial.name} {...testimonial} />
            ))}
          </div>
        </MarketingSection>

        <MarketingSection id="pricing" tone="deep" spacing="lg" ariaLabelledby="pricing-heading">
          <div className="grid gap-10 md:grid-cols-12 items-center">
            <div className="md:col-span-7">
              <SectionEyebrow>Simple, fair pricing</SectionEyebrow>
              <h2
                id="pricing-heading"
                className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
                style={{ color: "var(--brand-navy)" }}
              >
                Start free. Upgrade only when it helps.
              </h2>
              <p className="mt-5 text-lg leading-relaxed" style={{ color: "var(--brand-ink-soft)" }}>
                A generous free tier covers the public-domain library, full accessibility features, and personal
                bookmarks. Plus and Premium plans unlock ad-free listening, offline downloads, and family sharing.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/pricing">
                  <BrandButton
                    variant="primary"
                    size="lg"
                    rightIcon={<ArrowRight className="h-5 w-5 ml-2" aria-hidden="true" />}
                  >
                    See plans &amp; pricing
                  </BrandButton>
                </Link>
                <BrandButton variant="ghost" size="lg" onClick={onOpenRegister}>
                  Or start free
                </BrandButton>
              </div>
            </div>
            <div className="md:col-span-5">
              <div
                className="rounded-2xl p-7 border-2"
                style={{ backgroundColor: "var(--brand-cream)", borderColor: "var(--brand-line)" }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5" style={{ color: "var(--brand-orange-deep)" }} aria-hidden="true" />
                  <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--brand-ink-soft)" }}>
                    Included free
                  </span>
                </div>
                <ul className="space-y-3">
                  {FREE_TIER_ITEMS.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Check className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--brand-navy)" }} aria-hidden="true" />
                      <span className="text-base" style={{ color: "var(--brand-ink)" }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </MarketingSection>

        <MarketingSection spacing="xl" tone="navy" ariaLabelledby="final-cta-heading">
          <div className="text-center max-w-3xl mx-auto">
            <div className="flex items-center justify-center gap-2">
              <Accessibility className="h-8 w-8" style={{ color: "var(--brand-cream)" }} aria-hidden="true" />
              <span className="brand-display text-2xl font-semibold" style={{ color: "var(--brand-cream)" }}>
                AccessiBooks
              </span>
            </div>
            <h2
              id="final-cta-heading"
              className="brand-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.05] mt-8"
              style={{ color: "var(--brand-cream)" }}
            >
              Ready to start reading on your terms?
            </h2>
            <p className="mt-6 text-lg sm:text-xl leading-relaxed opacity-80">
              Create a free AccessiBooks account in seconds — no credit card needed.
            </p>
            <div className="mt-10 flex flex-wrap gap-3 justify-center">
              <BrandButton
                variant="secondary"
                size="lg"
                onClick={onOpenRegister}
                rightIcon={<ArrowRight className="h-5 w-5 ml-2" aria-hidden="true" />}
                data-testid="cta-get-started"
              >
                Create a free account
              </BrandButton>
              <BrandButton variant="outline-light" size="lg" onClick={onOpenLogin}>
                I already have an account
              </BrandButton>
            </div>
            <p className="mt-6 text-sm flex items-center justify-center gap-2 opacity-70">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Built and tested with accessibility in mind, every step.
            </p>
          </div>
        </MarketingSection>
      </main>

      <MarketingFooter />
    </div>
  );
}
