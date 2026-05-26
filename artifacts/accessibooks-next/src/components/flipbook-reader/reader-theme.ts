export type ReaderFontFamily = "opendyslexic" | "atkinson" | "sans" | "serif";

export type ReaderThemeName = "light" | "sepia" | "dark" | "high-contrast";

export type ReaderPresetId =
  | "none"
  | "dyslexia-support"
  | "low-vision"
  | "cognitive-ease"
  | "high-contrast"
  | "keyboard-only"
  | "screen-reader-optimized";

export type ReaderMotion = "full" | "reduced";
export type ReaderControlDensity = "comfortable" | "compact";

export interface ReaderTypography {
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  wordSpacing: number;
}

/** A preset describes a complete reading configuration. */
export interface ReaderPreset {
  id: ReaderPresetId;
  label: string;
  description: string;
  typography: ReaderTypography;
  theme: ReaderThemeName;
  motion: ReaderMotion;
  controlDensity: ReaderControlDensity;
}

/**
 * The user's overrides on top of a preset. Any field set here wins over
 * the preset's value. We keep this separate from the preset identity so
 * that a user can apply "Dyslexia Support" and then bump the font size
 * without losing the fact that the preset is still selected.
 */
export interface ReaderOverrides {
  fontFamily?: ReaderFontFamily;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  wordSpacing?: number;
  theme?: ReaderThemeName;
  motion?: ReaderMotion;
  controlDensity?: ReaderControlDensity;
}

export interface ReaderThemeState {
  basePreset: ReaderPresetId;
  overrides: ReaderOverrides;
}

/** Resolved values that the UI actually renders. */
export interface ResolvedReaderTheme {
  typography: ReaderTypography;
  theme: ReaderThemeName;
  motion: ReaderMotion;
  controlDensity: ReaderControlDensity;
  hasOverrides: boolean;
}

export const FONT_FAMILY_OPTIONS: {
  id: ReaderFontFamily;
  label: string;
  description: string;
  cssStack: string;
}[] = [
  {
    id: "opendyslexic",
    label: "OpenDyslexic",
    description: "Weighted bottoms reduce letter rotation for dyslexic readers",
    cssStack: "'OpenDyslexic', 'Atkinson Hyperlegible', system-ui, sans-serif",
  },
  {
    id: "atkinson",
    label: "Atkinson Hyperlegible",
    description: "Designed by the Braille Institute for low-vision readers",
    cssStack: "'Atkinson Hyperlegible', 'Inter', system-ui, sans-serif",
  },
  {
    id: "sans",
    label: "System Sans",
    description: "Clean modern sans-serif",
    cssStack:
      "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: "serif",
    label: "Serif",
    description: "Traditional serif for long-form reading",
    cssStack:
      "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
  },
];

export const THEME_OPTIONS: {
  id: ReaderThemeName;
  label: string;
  swatch: string;
}[] = [
  { id: "light", label: "Light", swatch: "#ffffff" },
  { id: "sepia", label: "Sepia", swatch: "#f4ecd8" },
  { id: "dark", label: "Dark", swatch: "#1a1a1a" },
  { id: "high-contrast", label: "High Contrast", swatch: "#000000" },
];

export const TYPOGRAPHY_BOUNDS = {
  fontSize: { min: 14, max: 32, step: 1, default: 18, unit: "px" },
  lineHeight: { min: 1.2, max: 2.4, step: 0.1, default: 1.6, unit: "" },
  letterSpacing: { min: 0, max: 0.2, step: 0.01, default: 0, unit: "em" },
  wordSpacing: { min: 0, max: 0.5, step: 0.02, default: 0, unit: "em" },
} as const;

export const DEFAULT_TYPOGRAPHY: ReaderTypography = {
  fontFamily: "sans",
  fontSize: TYPOGRAPHY_BOUNDS.fontSize.default,
  lineHeight: TYPOGRAPHY_BOUNDS.lineHeight.default,
  letterSpacing: TYPOGRAPHY_BOUNDS.letterSpacing.default,
  wordSpacing: TYPOGRAPHY_BOUNDS.wordSpacing.default,
};

/** The "no preset" baseline used as a starting point. */
export const BASELINE_PRESET: ReaderPreset = {
  id: "none",
  label: "Custom",
  description: "Your own combination of typography and theme",
  typography: DEFAULT_TYPOGRAPHY,
  theme: "light",
  motion: "full",
  controlDensity: "comfortable",
};

export const DEFAULT_THEME_STATE: ReaderThemeState = {
  basePreset: "none",
  overrides: {},
};

export const READER_PRESETS: ReaderPreset[] = [
  {
    id: "dyslexia-support",
    label: "Dyslexia Support",
    description: "OpenDyslexic font with extra spacing on a sepia background",
    typography: {
      fontFamily: "opendyslexic",
      fontSize: 20,
      lineHeight: 1.8,
      letterSpacing: 0.05,
      wordSpacing: 0.16,
    },
    theme: "sepia",
    motion: "full",
    controlDensity: "comfortable",
  },
  {
    id: "low-vision",
    label: "Low Vision",
    description: "Larger Atkinson Hyperlegible text on a high-contrast theme",
    typography: {
      fontFamily: "atkinson",
      fontSize: 26,
      lineHeight: 1.8,
      letterSpacing: 0.04,
      wordSpacing: 0.18,
    },
    theme: "high-contrast",
    motion: "reduced",
    controlDensity: "comfortable",
  },
  {
    id: "cognitive-ease",
    label: "Cognitive Ease",
    description: "Generous line height and warm sepia for fatigue-free reading",
    typography: {
      fontFamily: "atkinson",
      fontSize: 19,
      lineHeight: 2.0,
      letterSpacing: 0.02,
      wordSpacing: 0.12,
    },
    theme: "sepia",
    motion: "reduced",
    controlDensity: "comfortable",
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    description: "Pure black on white for maximum legibility",
    typography: {
      fontFamily: "sans",
      fontSize: 20,
      lineHeight: 1.7,
      letterSpacing: 0.02,
      wordSpacing: 0.08,
    },
    theme: "high-contrast",
    motion: "full",
    controlDensity: "comfortable",
  },
  {
    id: "keyboard-only",
    label: "Keyboard Only",
    description: "Compact controls and a calm sans-serif tuned for keyboard use",
    typography: {
      fontFamily: "sans",
      fontSize: 18,
      lineHeight: 1.6,
      letterSpacing: 0,
      wordSpacing: 0.06,
    },
    theme: "light",
    motion: "full",
    controlDensity: "compact",
  },
  {
    id: "screen-reader-optimized",
    label: "Screen Reader Optimized",
    description: "Calm visual layout that prioritises semantic landmarks",
    typography: {
      fontFamily: "sans",
      fontSize: 18,
      lineHeight: 1.7,
      letterSpacing: 0,
      wordSpacing: 0.08,
    },
    theme: "light",
    motion: "reduced",
    controlDensity: "comfortable",
  },
];

export function findPreset(id: ReaderPresetId): ReaderPreset {
  if (id === "none") return BASELINE_PRESET;
  return READER_PRESETS.find((p) => p.id === id) ?? BASELINE_PRESET;
}

/** Merge the active preset with the user's overrides into final values. */
export function resolveReaderTheme(
  state: ReaderThemeState,
): ResolvedReaderTheme {
  const preset = findPreset(state.basePreset);
  const o = state.overrides;
  const typography: ReaderTypography = {
    fontFamily: o.fontFamily ?? preset.typography.fontFamily,
    fontSize: o.fontSize ?? preset.typography.fontSize,
    lineHeight: o.lineHeight ?? preset.typography.lineHeight,
    letterSpacing: o.letterSpacing ?? preset.typography.letterSpacing,
    wordSpacing: o.wordSpacing ?? preset.typography.wordSpacing,
  };
  const hasOverrides = Object.values(o).some((v) => v !== undefined);
  return {
    typography,
    theme: o.theme ?? preset.theme,
    motion: o.motion ?? preset.motion,
    controlDensity: o.controlDensity ?? preset.controlDensity,
    hasOverrides,
  };
}

export const STORAGE_KEY = "accessibooks:flipbook-reader-theme:v2";

export function loadReaderThemeState(): ReaderThemeState {
  if (typeof window === "undefined") return DEFAULT_THEME_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_STATE;
    const parsed = JSON.parse(raw) as Partial<ReaderThemeState>;
    return {
      basePreset: parsed.basePreset ?? DEFAULT_THEME_STATE.basePreset,
      overrides: parsed.overrides ?? {},
    };
  } catch {
    return DEFAULT_THEME_STATE;
  }
}

export function saveReaderThemeState(state: ReaderThemeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

export function fontStackFor(family: ReaderFontFamily): string {
  const opt = FONT_FAMILY_OPTIONS.find((f) => f.id === family);
  return opt?.cssStack ?? FONT_FAMILY_OPTIONS[2].cssStack;
}

/** Strongly-typed CSS custom properties map. */
export type CSSVarMap = Record<`--${string}`, string | number>;

export function buildReaderCssVars(t: ReaderTypography): CSSVarMap {
  return {
    "--reader-font-family": fontStackFor(t.fontFamily),
    "--reader-font-size": `${t.fontSize}px`,
    "--reader-line-height": String(t.lineHeight),
    "--reader-letter-spacing": `${t.letterSpacing}em`,
    "--reader-word-spacing": `${t.wordSpacing}em`,
  };
}
