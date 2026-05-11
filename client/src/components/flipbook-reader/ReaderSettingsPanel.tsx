import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { X, RotateCcw } from "lucide-react";
import type { ReaderSettingsPanelProps } from "./flipbook-types";
import {
  FONT_FAMILY_LABEL,
  PRESET_DESCRIPTION,
  PRESET_LABEL,
  THEME_LABEL,
  TYPOGRAPHY_BOUNDS,
  type FlipbookFontFamily,
  type FlipbookPreset,
  type FlipbookTheme,
} from "./flipbook-typography";
import { TTS_BOUNDS } from "./tts-service";

const FONT_OPTIONS: FlipbookFontFamily[] = [
  "system-sans",
  "serif",
  "atkinson",
  "opendyslexic",
];

const THEME_OPTIONS: FlipbookTheme[] = ["light", "sepia", "dark", "high-contrast"];

const PRESET_OPTIONS: Exclude<FlipbookPreset, "none">[] = [
  "dyslexia",
  "low-vision",
  "cognitive-ease",
  "high-contrast",
  "keyboard-only",
  "screen-reader",
];

export function ReaderSettingsPanel({
  open,
  onClose,
  settings,
  onTypographyChange,
  onFontFamilyChange,
  onThemeChange,
  onPresetChange,
  onResetDefaults,
  ttsSupported,
  ttsVoices,
  ttsPrefs,
  onTtsPrefsChange,
}: ReaderSettingsPanelProps) {
  if (!open) return null;
  const { typography, theme, activePreset } = settings;

  return (
    <aside
      id="flipbook-settings-panel"
      role="region"
      aria-label="Reader settings"
      data-flipbook-panel="settings"
      className="border-l w-80 flex flex-col overflow-y-auto"
      style={{
        background: "var(--fb-surface)",
        color: "var(--fb-fg)",
        borderColor: "var(--fb-border)",
      }}
      data-testid="flipbook-settings-panel"
    >
      <header
        className="flex items-center justify-between p-3 border-b sticky top-0"
        style={{
          background: "var(--fb-surface)",
          borderColor: "var(--fb-border)",
        }}
      >
        <h2 className="text-sm font-semibold">Reader settings</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close settings"
          data-testid="flipbook-settings-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="p-4 space-y-6">
        <section aria-labelledby="fb-presets-heading">
          <h3 id="fb-presets-heading" className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--fb-muted)" }}>
            Accessibility presets
          </h3>
          <div className="grid grid-cols-1 gap-1.5">
            {PRESET_OPTIONS.map((p) => {
              const active = activePreset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPresetChange(p)}
                  aria-pressed={active}
                  data-testid={`flipbook-preset-${p}`}
                  className="text-left rounded-md border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    background: active ? "var(--fb-accent)" : "var(--fb-page-bg)",
                    color: active ? "var(--fb-on-accent)" : "var(--fb-fg)",
                    borderColor: active ? "var(--fb-accent)" : "var(--fb-border)",
                  }}
                >
                  <div className="text-sm font-medium">{PRESET_LABEL[p]}</div>
                  <div className="text-xs opacity-80 mt-0.5">{PRESET_DESCRIPTION[p]}</div>
                </button>
              );
            })}
          </div>
          {activePreset !== "none" && (
            <p className="text-xs mt-2" style={{ color: "var(--fb-muted)" }}>
              Editing any control below switches you back to a custom set-up.
            </p>
          )}
        </section>

        <section aria-labelledby="fb-theme-heading">
          <h3 id="fb-theme-heading" className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--fb-muted)" }}>
            Theme
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {THEME_OPTIONS.map((t) => {
              const active = theme === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onThemeChange(t)}
                  aria-pressed={active}
                  data-testid={`flipbook-theme-${t}`}
                  className="rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    background: active ? "var(--fb-accent)" : "var(--fb-page-bg)",
                    color: active ? "var(--fb-on-accent)" : "var(--fb-fg)",
                    borderColor: active ? "var(--fb-accent)" : "var(--fb-border)",
                  }}
                >
                  {THEME_LABEL[t]}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="fb-font-heading">
          <h3 id="fb-font-heading" className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--fb-muted)" }}>
            Font family
          </h3>
          <div className="grid grid-cols-1 gap-1.5">
            {FONT_OPTIONS.map((f) => {
              const active = typography.fontFamily === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => onFontFamilyChange(f)}
                  aria-pressed={active}
                  data-testid={`flipbook-font-${f}`}
                  className="rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 text-left"
                  style={{
                    background: active ? "var(--fb-accent)" : "var(--fb-page-bg)",
                    color: active ? "var(--fb-on-accent)" : "var(--fb-fg)",
                    borderColor: active ? "var(--fb-accent)" : "var(--fb-border)",
                  }}
                >
                  {FONT_FAMILY_LABEL[f]}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="fb-typography-heading" className="space-y-4">
          <h3 id="fb-typography-heading" className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fb-muted)" }}>
            Typography
          </h3>

          <SliderControl
            id="fb-font-size"
            label="Font size"
            value={typography.fontSize}
            display={`${typography.fontSize}px`}
            bounds={TYPOGRAPHY_BOUNDS.fontSize}
            onChange={(v) => onTypographyChange({ fontSize: v })}
            testid="flipbook-slider-font-size"
          />
          <SliderControl
            id="fb-line-height"
            label="Line height"
            value={typography.lineHeight}
            display={typography.lineHeight.toFixed(1)}
            bounds={TYPOGRAPHY_BOUNDS.lineHeight}
            onChange={(v) => onTypographyChange({ lineHeight: round(v, 1) })}
            testid="flipbook-slider-line-height"
          />
          <SliderControl
            id="fb-letter-spacing"
            label="Letter spacing"
            value={typography.letterSpacing}
            display={`${typography.letterSpacing.toFixed(2)}em`}
            bounds={TYPOGRAPHY_BOUNDS.letterSpacing}
            onChange={(v) => onTypographyChange({ letterSpacing: round(v, 2) })}
            testid="flipbook-slider-letter-spacing"
          />
          <SliderControl
            id="fb-word-spacing"
            label="Word spacing"
            value={typography.wordSpacing}
            display={`${typography.wordSpacing.toFixed(2)}em`}
            bounds={TYPOGRAPHY_BOUNDS.wordSpacing}
            onChange={(v) => onTypographyChange({ wordSpacing: round(v, 2) })}
            testid="flipbook-slider-word-spacing"
          />
        </section>

        <section aria-labelledby="fb-tts-heading" className="space-y-4">
          <h3
            id="fb-tts-heading"
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--fb-muted)" }}
          >
            Read aloud
          </h3>
          {!ttsSupported ? (
            <p className="text-xs" style={{ color: "var(--fb-muted)" }} data-testid="flipbook-tts-unsupported">
              Text-to-speech isn’t supported in this browser. Try a recent version of Chrome, Edge, Safari, or Firefox.
            </p>
          ) : (
            <>
              <div>
                <label
                  htmlFor="fb-tts-voice"
                  className="text-sm font-medium block mb-1.5"
                >
                  Voice
                </label>
                <select
                  id="fb-tts-voice"
                  value={ttsPrefs.voiceId ?? ""}
                  onChange={(e) =>
                    onTtsPrefsChange({ voiceId: e.target.value === "" ? null : e.target.value })
                  }
                  className="w-full rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    background: "var(--fb-page-bg)",
                    color: "var(--fb-fg)",
                    borderColor: "var(--fb-border)",
                  }}
                  data-testid="flipbook-tts-voice"
                >
                  <option value="">System default</option>
                  {ttsVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.lang ? ` — ${v.lang}` : ""}
                    </option>
                  ))}
                </select>
                {ttsVoices.length === 0 && (
                  <p className="text-xs mt-1" style={{ color: "var(--fb-muted)" }}>
                    No voices found yet. Your browser may load them on first use.
                  </p>
                )}
              </div>
              <SliderControl
                id="fb-tts-rate"
                label="Speaking rate"
                value={ttsPrefs.rate}
                display={`${ttsPrefs.rate.toFixed(1)}x`}
                bounds={TTS_BOUNDS.rate}
                onChange={(v) => onTtsPrefsChange({ rate: round(v, 1) })}
                testid="flipbook-tts-rate"
              />
              <SliderControl
                id="fb-tts-pitch"
                label="Pitch"
                value={ttsPrefs.pitch}
                display={ttsPrefs.pitch.toFixed(1)}
                bounds={TTS_BOUNDS.pitch}
                onChange={(v) => onTtsPrefsChange({ pitch: round(v, 1) })}
                testid="flipbook-tts-pitch"
              />
              <SliderControl
                id="fb-tts-volume"
                label="Volume"
                value={ttsPrefs.volume}
                display={`${Math.round(ttsPrefs.volume * 100)}%`}
                bounds={TTS_BOUNDS.volume}
                onChange={(v) => onTtsPrefsChange({ volume: round(v, 2) })}
                testid="flipbook-tts-volume"
              />
            </>
          )}
        </section>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResetDefaults}
          className="w-full"
          data-testid="flipbook-settings-reset"
        >
          <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
          Reset to defaults
        </Button>
      </div>
    </aside>
  );
}

interface SliderControlProps {
  id: string;
  label: string;
  display: string;
  value: number;
  bounds: { min: number; max: number; step: number };
  onChange: (next: number) => void;
  testid: string;
}

function SliderControl({ id, label, display, value, bounds, onChange, testid }: SliderControlProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-xs tabular-nums" style={{ color: "var(--fb-muted)" }}>
          {display}
        </span>
      </div>
      <Slider
        id={id}
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        aria-label={label}
        data-testid={testid}
      />
    </div>
  );
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
