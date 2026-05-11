export type FlipbookTheme = "light" | "sepia" | "dark" | "high-contrast";

export type FlipbookFontFamily =
  | "system-sans"
  | "serif"
  | "atkinson"
  | "opendyslexic";

export type FlipbookPreset =
  | "none"
  | "dyslexia"
  | "low-vision"
  | "cognitive-ease"
  | "high-contrast"
  | "keyboard-only"
  | "screen-reader";

export interface FlipbookTypography {
  fontFamily: FlipbookFontFamily;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  wordSpacing: number;
}

export interface FlipbookSettings {
  typography: FlipbookTypography;
  theme: FlipbookTheme;
  activePreset: FlipbookPreset;
}

export const FONT_FAMILY_LABEL: Record<FlipbookFontFamily, string> = {
  "system-sans": "System Sans",
  serif: "Serif",
  atkinson: "Atkinson Hyperlegible",
  opendyslexic: "OpenDyslexic",
};

export const FONT_FAMILY_STACK: Record<FlipbookFontFamily, string> = {
  "system-sans":
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  atkinson:
    "'Atkinson Hyperlegible', system-ui, -apple-system, sans-serif",
  opendyslexic:
    "'OpenDyslexic', 'Atkinson Hyperlegible', system-ui, sans-serif",
};

export const THEME_LABEL: Record<FlipbookTheme, string> = {
  light: "Light",
  sepia: "Sepia",
  dark: "Dark",
  "high-contrast": "High Contrast",
};

export const PRESET_LABEL: Record<FlipbookPreset, string> = {
  none: "Custom",
  dyslexia: "Dyslexia Support",
  "low-vision": "Low Vision",
  "cognitive-ease": "Cognitive Ease",
  "high-contrast": "High Contrast",
  "keyboard-only": "Keyboard Only",
  "screen-reader": "Screen Reader Optimized",
};

export const PRESET_DESCRIPTION: Record<FlipbookPreset, string> = {
  none: "Your own custom combination.",
  dyslexia: "OpenDyslexic, generous spacing, calm sepia background.",
  "low-vision": "Large text, high contrast, wide line height.",
  "cognitive-ease": "Atkinson Hyperlegible, sepia, relaxed spacing.",
  "high-contrast": "Maximum contrast for low vision and bright environments.",
  "keyboard-only": "Larger controls, system font, light theme.",
  "screen-reader": "Calm typography that pairs well with TTS in Stage 3.",
};

export const TYPOGRAPHY_BOUNDS = {
  fontSize: { min: 14, max: 28, step: 1 },
  lineHeight: { min: 1.2, max: 2.2, step: 0.1 },
  letterSpacing: { min: 0, max: 0.2, step: 0.01 },
  wordSpacing: { min: 0, max: 0.5, step: 0.05 },
} as const;

export const DEFAULT_TYPOGRAPHY: FlipbookTypography = {
  fontFamily: "system-sans",
  fontSize: 18,
  lineHeight: 1.6,
  letterSpacing: 0.01,
  wordSpacing: 0.05,
};

export const DEFAULT_SETTINGS: FlipbookSettings = {
  typography: DEFAULT_TYPOGRAPHY,
  theme: "light",
  activePreset: "none",
};

export const PRESETS: Record<
  Exclude<FlipbookPreset, "none">,
  { typography: FlipbookTypography; theme: FlipbookTheme }
> = {
  dyslexia: {
    typography: {
      fontFamily: "opendyslexic",
      fontSize: 20,
      lineHeight: 1.9,
      letterSpacing: 0.05,
      wordSpacing: 0.2,
    },
    theme: "sepia",
  },
  "low-vision": {
    typography: {
      fontFamily: "atkinson",
      fontSize: 26,
      lineHeight: 2.0,
      letterSpacing: 0.04,
      wordSpacing: 0.15,
    },
    theme: "high-contrast",
  },
  "cognitive-ease": {
    typography: {
      fontFamily: "atkinson",
      fontSize: 19,
      lineHeight: 1.8,
      letterSpacing: 0.03,
      wordSpacing: 0.1,
    },
    theme: "sepia",
  },
  "high-contrast": {
    typography: {
      fontFamily: "atkinson",
      fontSize: 20,
      lineHeight: 1.7,
      letterSpacing: 0.02,
      wordSpacing: 0.05,
    },
    theme: "high-contrast",
  },
  "keyboard-only": {
    typography: {
      fontFamily: "system-sans",
      fontSize: 18,
      lineHeight: 1.6,
      letterSpacing: 0.01,
      wordSpacing: 0.05,
    },
    theme: "light",
  },
  "screen-reader": {
    typography: {
      fontFamily: "atkinson",
      fontSize: 18,
      lineHeight: 1.7,
      letterSpacing: 0.02,
      wordSpacing: 0.08,
    },
    theme: "light",
  },
};

export function settingsStorageKey(bookId: string | number): string {
  return `flipbook-settings-${bookId}`;
}

export function loadSettings(bookId: string | number): FlipbookSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(settingsStorageKey(bookId));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<FlipbookSettings> & {
      typography?: Partial<FlipbookTypography>;
    };
    const t: Partial<FlipbookTypography> = parsed.typography ?? {};
    const num = (v: unknown, fallback: number): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const validFont = (v: unknown): FlipbookFontFamily =>
      typeof v === "string" && v in FONT_FAMILY_STACK
        ? (v as FlipbookFontFamily)
        : DEFAULT_TYPOGRAPHY.fontFamily;
    const validTheme = (v: unknown): FlipbookTheme =>
      typeof v === "string" && v in THEME_LABEL
        ? (v as FlipbookTheme)
        : DEFAULT_SETTINGS.theme;
    const validPreset = (v: unknown): FlipbookPreset =>
      typeof v === "string" && v in PRESET_LABEL
        ? (v as FlipbookPreset)
        : "none";
    return {
      typography: {
        fontFamily: validFont(t.fontFamily),
        fontSize: clamp(
          num(t.fontSize, DEFAULT_TYPOGRAPHY.fontSize),
          TYPOGRAPHY_BOUNDS.fontSize.min,
          TYPOGRAPHY_BOUNDS.fontSize.max,
        ),
        lineHeight: clamp(
          num(t.lineHeight, DEFAULT_TYPOGRAPHY.lineHeight),
          TYPOGRAPHY_BOUNDS.lineHeight.min,
          TYPOGRAPHY_BOUNDS.lineHeight.max,
        ),
        letterSpacing: clamp(
          num(t.letterSpacing, DEFAULT_TYPOGRAPHY.letterSpacing),
          TYPOGRAPHY_BOUNDS.letterSpacing.min,
          TYPOGRAPHY_BOUNDS.letterSpacing.max,
        ),
        wordSpacing: clamp(
          num(t.wordSpacing, DEFAULT_TYPOGRAPHY.wordSpacing),
          TYPOGRAPHY_BOUNDS.wordSpacing.min,
          TYPOGRAPHY_BOUNDS.wordSpacing.max,
        ),
      },
      theme: validTheme(parsed.theme),
      activePreset: validPreset(parsed.activePreset),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(
  bookId: string | number,
  settings: FlipbookSettings,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      settingsStorageKey(bookId),
      JSON.stringify(settings),
    );
  } catch {}
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function applyPreset(preset: FlipbookPreset): FlipbookSettings {
  if (preset === "none") return DEFAULT_SETTINGS;
  const cfg = PRESETS[preset];
  return {
    typography: { ...cfg.typography },
    theme: cfg.theme,
    activePreset: preset,
  };
}
