export type FlipbookFontFamily = "system-sans" | "serif" | "atkinson" | "opendyslexic";

export type FlipbookTheme = "light" | "sepia" | "dark" | "high-contrast";

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

export const TYPOGRAPHY_BOUNDS = {
  fontSize: { min: 14, max: 32, step: 1 },
  lineHeight: { min: 1.2, max: 2.4, step: 0.1 },
  letterSpacing: { min: 0, max: 0.2, step: 0.01 },
  wordSpacing: { min: 0, max: 0.5, step: 0.02 },
} as const;

export const FONT_FAMILY_LABEL: Record<FlipbookFontFamily, string> = {
  "system-sans": "System sans",
  serif: "Serif",
  atkinson: "Atkinson Hyperlegible",
  opendyslexic: "OpenDyslexic",
};

export const FONT_FAMILY_STACK: Record<FlipbookFontFamily, string> = {
  "system-sans":
    "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  serif: "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
  atkinson: "'Atkinson Hyperlegible', 'Inter', system-ui, sans-serif",
  opendyslexic: "'OpenDyslexic', 'Atkinson Hyperlegible', system-ui, sans-serif",
};

export const THEME_LABEL: Record<FlipbookTheme, string> = {
  light: "Light",
  sepia: "Sepia",
  dark: "Dark",
  "high-contrast": "High contrast",
};

export const PRESET_LABEL: Record<Exclude<FlipbookPreset, "none">, string> = {
  dyslexia: "Dyslexia support",
  "low-vision": "Low vision",
  "cognitive-ease": "Cognitive ease",
  "high-contrast": "High contrast",
  "keyboard-only": "Keyboard only",
  "screen-reader": "Screen reader",
};

export const PRESET_DESCRIPTION: Record<Exclude<FlipbookPreset, "none">, string> = {
  dyslexia: "OpenDyslexic with extra spacing on a sepia page",
  "low-vision": "Larger Atkinson text on a high-contrast page",
  "cognitive-ease": "Generous line height with a warm sepia background",
  "high-contrast": "Pure black on white for maximum legibility",
  "keyboard-only": "Compact controls and a calm sans-serif",
  "screen-reader": "Calm visual layout that prioritises landmarks",
};

export const DEFAULT_TYPOGRAPHY: FlipbookTypography = {
  fontFamily: "system-sans",
  fontSize: 18,
  lineHeight: 1.6,
  letterSpacing: 0,
  wordSpacing: 0,
};

export const DEFAULT_SETTINGS: FlipbookSettings = {
  typography: DEFAULT_TYPOGRAPHY,
  theme: "light",
  activePreset: "none",
};

const PRESET_SETTINGS: Record<Exclude<FlipbookPreset, "none">, FlipbookSettings> = {
  dyslexia: {
    typography: {
      fontFamily: "opendyslexic",
      fontSize: 20,
      lineHeight: 1.8,
      letterSpacing: 0.05,
      wordSpacing: 0.16,
    },
    theme: "sepia",
    activePreset: "dyslexia",
  },
  "low-vision": {
    typography: {
      fontFamily: "atkinson",
      fontSize: 26,
      lineHeight: 1.8,
      letterSpacing: 0.04,
      wordSpacing: 0.18,
    },
    theme: "high-contrast",
    activePreset: "low-vision",
  },
  "cognitive-ease": {
    typography: {
      fontFamily: "atkinson",
      fontSize: 19,
      lineHeight: 2.0,
      letterSpacing: 0.02,
      wordSpacing: 0.12,
    },
    theme: "sepia",
    activePreset: "cognitive-ease",
  },
  "high-contrast": {
    typography: {
      fontFamily: "system-sans",
      fontSize: 20,
      lineHeight: 1.7,
      letterSpacing: 0.02,
      wordSpacing: 0.08,
    },
    theme: "high-contrast",
    activePreset: "high-contrast",
  },
  "keyboard-only": {
    typography: {
      fontFamily: "system-sans",
      fontSize: 18,
      lineHeight: 1.6,
      letterSpacing: 0,
      wordSpacing: 0.06,
    },
    theme: "light",
    activePreset: "keyboard-only",
  },
  "screen-reader": {
    typography: {
      fontFamily: "system-sans",
      fontSize: 18,
      lineHeight: 1.7,
      letterSpacing: 0,
      wordSpacing: 0.08,
    },
    theme: "light",
    activePreset: "screen-reader",
  },
};

export function applyPreset(preset: FlipbookPreset): FlipbookSettings {
  if (preset === "none") return { ...DEFAULT_SETTINGS };
  return {
    typography: { ...PRESET_SETTINGS[preset].typography },
    theme: PRESET_SETTINGS[preset].theme,
    activePreset: preset,
  };
}

const STORAGE_PREFIX = "accessibooks:flipbook-settings:v1:";

export function loadSettings(bookId: string | number): FlipbookSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + String(bookId));
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<FlipbookSettings>;
    return {
      typography: { ...DEFAULT_TYPOGRAPHY, ...(parsed.typography ?? {}) },
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
      activePreset: parsed.activePreset ?? "none",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(bookId: string | number, settings: FlipbookSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + String(bookId), JSON.stringify(settings));
  } catch {
    /* ignore quota / unavailable storage */
  }
}
