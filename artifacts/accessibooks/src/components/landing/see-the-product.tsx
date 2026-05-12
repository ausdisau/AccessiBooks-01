import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  Type,
  Contrast,
  Sparkles,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Headphones,
  ArrowRight,
} from "lucide-react";
import { BrandButton } from "@/components/brand";

type ReadingMode = "standard" | "dyslexia" | "easy";
type ContrastMode = "normal" | "high" | "sepia";

interface SeeTheProductProps {
  onOpenRegister: () => void;
  onBrowseAsGuest?: () => void;
}

const STANDARD_PASSAGE = [
  "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
  "However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.",
  '"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"',
];

const EASY_ENGLISH_PASSAGE = [
  "Most people think the same thing. They think a rich man who is not married will want to find a wife.",
  "When a rich man moves to a new town, the families nearby often hope he will marry one of their daughters.",
  'One day, Mrs. Bennet said to her husband, "Did you hear? Someone has rented the big house at Netherfield Park."',
];

const SPEEDS = [0.75, 1, 1.25, 1.5];

export function SeeTheProductSection({
  onOpenRegister,
  onBrowseAsGuest,
}: SeeTheProductProps) {
  const [mode, setMode] = useState<ReadingMode>("standard");
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.7);
  const [contrast, setContrast] = useState<ContrastMode>("normal");
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(42);

  const totalSec = 28 * 60 + 30;
  const elapsedSec = Math.round((progress / 100) * totalSec);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  function handleRadioKey<T extends string | number>(
    e: KeyboardEvent<HTMLButtonElement>,
    options: readonly T[],
    current: T,
    setValue: (v: never) => void,
  ) {
    const idx = options.indexOf(current);
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    (setValue as (v: T) => void)(options[next]);
  }

  const fontSizeId = useId();
  const lineHeightId = useId();
  const announceId = useId();

  const passage = mode === "easy" ? EASY_ENGLISH_PASSAGE : STANDARD_PASSAGE;

  const previewStyles = useMemo(() => {
    const base = {
      fontFamily:
        mode === "dyslexia"
          ? "'OpenDyslexic', 'Inter', sans-serif"
          : "var(--font-serif)",
      fontSize: `${fontSize}px`,
      lineHeight,
      letterSpacing: mode === "dyslexia" ? "0.04em" : "normal",
    } as CSSProperties;

    if (contrast === "high") {
      return {
        ...base,
        backgroundColor: "#000",
        color: "#fff",
        borderColor: "#000",
      };
    }
    if (contrast === "sepia") {
      return {
        ...base,
        backgroundColor: "#f4ecd8",
        color: "#3d2f1c",
        borderColor: "#d8c9a8",
      };
    }
    return {
      ...base,
      backgroundColor: "var(--brand-cream)",
      color: "var(--brand-ink)",
      borderColor: "var(--brand-line)",
    };
  }, [mode, fontSize, lineHeight, contrast]);

  const announcement = `Reading mode ${
    mode === "easy" ? "Easy English" : mode === "dyslexia" ? "Dyslexia friendly" : "Standard"
  }. Text size ${fontSize} pixels. Line spacing ${lineHeight}. Contrast ${
    contrast === "high" ? "high contrast" : contrast === "sepia" ? "sepia" : "normal"
  }. Playback speed ${speed}x.`;

  return (
    <section
      id="see-the-product"
      aria-labelledby="see-the-product-heading"
      className="py-20 sm:py-24"
      style={{ backgroundColor: "var(--brand-cream)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p
            className="text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] mb-4"
            style={{ color: "var(--brand-orange-deep)" }}
          >
            See it in action
          </p>
          <h2
            id="see-the-product-heading"
            className="brand-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight"
            style={{ color: "var(--brand-navy)" }}
          >
            Try the controls. Watch the page respond.
          </h2>
          <p
            className="mt-5 text-lg leading-relaxed"
            style={{ color: "var(--brand-ink-soft)" }}
          >
            Change the reading mode, type size, line spacing, or contrast — and the
            sample passage updates instantly. No sign-up needed.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-12 items-start">
          {/* CONTROLS */}
          <div className="lg:col-span-5">
            <div
              className="rounded-2xl border-2 p-6 sm:p-7 space-y-7"
              style={{
                backgroundColor: "var(--brand-cream-deep)",
                borderColor: "var(--brand-line)",
              }}
              role="group"
              aria-label="Reading preferences"
            >
              {/* Reading mode */}
              <fieldset>
                <legend
                  className="text-sm font-semibold inline-flex items-center gap-2 mb-3"
                  style={{ color: "var(--brand-navy)" }}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Reading mode
                </legend>
                <div
                  className="grid grid-cols-3 gap-2 rounded-xl p-1 border"
                  style={{
                    backgroundColor: "var(--brand-cream)",
                    borderColor: "var(--brand-line)",
                  }}
                  role="radiogroup"
                  aria-label="Reading mode"
                >
                  {(() => {
                    const opts = [
                      { id: "standard" as const, label: "Standard" },
                      { id: "dyslexia" as const, label: "Dyslexia" },
                      { id: "easy" as const, label: "Easy English" },
                    ];
                    const ids = opts.map((o) => o.id);
                    return opts.map((opt) => {
                      const active = mode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          tabIndex={active ? 0 : -1}
                          onClick={() => setMode(opt.id)}
                          onKeyDown={(e) => handleRadioKey(e, ids, mode, setMode)}
                          className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                          style={{
                            backgroundColor: active ? "var(--brand-navy)" : "transparent",
                            color: active ? "var(--brand-cream)" : "var(--brand-ink)",
                          }}
                          data-testid={`demo-mode-${opt.id}`}
                        >
                          {opt.label}
                        </button>
                      );
                    });
                  })()}
                </div>
              </fieldset>

              {/* Text size */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor={fontSizeId}
                    className="text-sm font-semibold inline-flex items-center gap-2"
                    style={{ color: "var(--brand-navy)" }}
                  >
                    <Type className="h-4 w-4" aria-hidden="true" />
                    Text size
                  </label>
                  <span
                    className="text-sm tabular-nums"
                    style={{ color: "var(--brand-ink-soft)" }}
                  >
                    {fontSize}px
                  </span>
                </div>
                <input
                  id={fontSizeId}
                  type="range"
                  min={14}
                  max={28}
                  step={1}
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  className="w-full accent-[var(--brand-orange-deep)]"
                  data-testid="demo-font-size"
                />
              </div>

              {/* Line spacing */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor={lineHeightId}
                    className="text-sm font-semibold"
                    style={{ color: "var(--brand-navy)" }}
                  >
                    Line spacing
                  </label>
                  <span
                    className="text-sm tabular-nums"
                    style={{ color: "var(--brand-ink-soft)" }}
                  >
                    {lineHeight.toFixed(1)}
                  </span>
                </div>
                <input
                  id={lineHeightId}
                  type="range"
                  min={1.3}
                  max={2.2}
                  step={0.1}
                  value={lineHeight}
                  onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                  className="w-full accent-[var(--brand-orange-deep)]"
                  data-testid="demo-line-height"
                />
              </div>

              {/* Contrast */}
              <fieldset>
                <legend
                  className="text-sm font-semibold inline-flex items-center gap-2 mb-3"
                  style={{ color: "var(--brand-navy)" }}
                >
                  <Contrast className="h-4 w-4" aria-hidden="true" />
                  Contrast
                </legend>
                <div
                  className="grid grid-cols-3 gap-2 rounded-xl p-1 border"
                  style={{
                    backgroundColor: "var(--brand-cream)",
                    borderColor: "var(--brand-line)",
                  }}
                  role="radiogroup"
                  aria-label="Contrast"
                >
                  {(() => {
                    const opts = [
                      { id: "normal" as const, label: "Normal" },
                      { id: "high" as const, label: "High" },
                      { id: "sepia" as const, label: "Sepia" },
                    ];
                    const ids = opts.map((o) => o.id);
                    return opts.map((opt) => {
                      const active = contrast === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          tabIndex={active ? 0 : -1}
                          onClick={() => setContrast(opt.id)}
                          onKeyDown={(e) => handleRadioKey(e, ids, contrast, setContrast)}
                          className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                          style={{
                            backgroundColor: active ? "var(--brand-navy)" : "transparent",
                            color: active ? "var(--brand-cream)" : "var(--brand-ink)",
                          }}
                          data-testid={`demo-contrast-${opt.id}`}
                        >
                          {opt.label}
                        </button>
                      );
                    });
                  })()}
                </div>
              </fieldset>

              <p
                id={announceId}
                className="sr-only"
                aria-live="polite"
                aria-atomic="true"
              >
                {announcement}
              </p>
            </div>
          </div>

          {/* PREVIEW */}
          <div className="lg:col-span-7 space-y-5">
            <div
              className="rounded-2xl border-2 p-6 sm:p-8 transition-colors"
              style={previewStyles}
              aria-describedby={announceId}
              data-testid="demo-preview"
            >
              <div className="flex items-center justify-between mb-4 text-xs uppercase tracking-wider font-semibold opacity-70">
                <span>Pride and Prejudice · Chapter 1</span>
                <span>Sample passage</span>
              </div>
              {passage.map((para, i) => (
                <p key={i} className={i > 0 ? "mt-4" : ""}>
                  {para}
                </p>
              ))}
            </div>

            {/* MINI PLAYER */}
            <div
              className="rounded-2xl border-2 p-5"
              style={{
                backgroundColor: "var(--brand-navy-strong)",
                borderColor: "var(--brand-navy-strong)",
                color: "var(--brand-cream)",
              }}
              role="group"
              aria-label="Sample audiobook player"
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--brand-cream) 14%, transparent)",
                  }}
                  aria-hidden="true"
                >
                  <Headphones className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[11px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--brand-orange)" }}
                  >
                    {playing ? "Now playing" : "Paused"}
                  </div>
                  <div className="text-sm font-semibold truncate">
                    Pride and Prejudice — Ch. 1
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "color-mix(in srgb, var(--brand-cream) 70%, transparent)" }}
                  >
                    Narrated by Karen Savage · {fmt(elapsedSec)} / {fmt(totalSec)}
                  </div>
                </div>
              </div>

              <div
                className="mt-4 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "color-mix(in srgb, var(--brand-cream) 18%, transparent)" }}
                role="progressbar"
                aria-label="Playback progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, backgroundColor: "var(--brand-orange)" }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProgress((p) => Math.max(0, p - 5))}
                    className="h-10 w-10 rounded-full inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                    style={{ backgroundColor: "color-mix(in srgb, var(--brand-cream) 14%, transparent)" }}
                    aria-label="Skip back 30 seconds"
                    data-testid="demo-skip-back"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    className="h-12 w-12 rounded-full inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                    style={{ backgroundColor: "var(--brand-orange)", color: "var(--brand-navy-strong)" }}
                    aria-label={playing ? "Pause sample" : "Play sample"}
                    aria-pressed={playing}
                    data-testid="demo-play-toggle"
                  >
                    {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgress((p) => Math.min(100, p + 5))}
                    className="h-10 w-10 rounded-full inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                    style={{ backgroundColor: "color-mix(in srgb, var(--brand-cream) 14%, transparent)" }}
                    aria-label="Skip forward 30 seconds"
                    data-testid="demo-skip-forward"
                  >
                    <RotateCw className="h-5 w-5" />
                  </button>
                </div>

                <fieldset className="flex items-center gap-1">
                  <legend className="sr-only">Playback speed</legend>
                  <div role="radiogroup" aria-label="Playback speed" className="flex items-center gap-1">
                    {SPEEDS.map((s) => {
                      const active = speed === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          tabIndex={active ? 0 : -1}
                          onClick={() => setSpeed(s)}
                          onKeyDown={(e) => handleRadioKey(e, SPEEDS, speed, setSpeed)}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
                          style={{
                            backgroundColor: active
                              ? "var(--brand-orange)"
                              : "color-mix(in srgb, var(--brand-cream) 14%, transparent)",
                            color: active ? "var(--brand-navy-strong)" : "var(--brand-cream)",
                          }}
                          data-testid={`demo-speed-${s}`}
                        >
                          {s}x
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div
          className="mt-12 rounded-2xl border-2 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
          style={{
            backgroundColor: "var(--brand-cream-deep)",
            borderColor: "var(--brand-line)",
          }}
        >
          <div>
            <h3
              className="brand-display text-xl sm:text-2xl font-semibold"
              style={{ color: "var(--brand-navy)" }}
            >
              Like what you see? Save your settings to your account.
            </h3>
            <p
              className="mt-2 text-base"
              style={{ color: "var(--brand-ink-soft)" }}
            >
              Sign up free to keep your reading preferences across every device.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <BrandButton
              variant="primary"
              size="lg"
              onClick={onOpenRegister}
              rightIcon={<ArrowRight className="h-5 w-5" aria-hidden="true" />}
              data-testid="see-product-cta-sign-up"
            >
              Create a free account
            </BrandButton>
            {onBrowseAsGuest && (
              <BrandButton
                variant="outline"
                size="lg"
                onClick={onBrowseAsGuest}
                data-testid="see-product-cta-guest"
              >
                Browse as a guest
              </BrandButton>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
