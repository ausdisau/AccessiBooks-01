// Theme font registry + lazy loader.
//
// 25 self-hosted families a user can pick as the app-wide "theme font".
// Three ship with the app bundle (Inter, Fraunces, Atkinson Hyperlegible via
// @font-face rules in index.css); the other 22 are @fontsource packages whose
// CSS (and woff2 files) are code-split per family — loadThemeFont(slug)
// fetches only the active family's chunk, so picking one font never downloads
// the other 24.

export interface ThemeFontOption {
  slug: string;
  label: string;
  /** CSS font-family stack applied when this font is active. */
  family: string;
}

export const THEME_FONTS = [
  { slug: "inter", label: "Inter", family: "'Inter', sans-serif" },
  { slug: "fraunces", label: "Fraunces", family: "'Fraunces', serif" },
  {
    slug: "atkinson-hyperlegible",
    label: "Atkinson Hyperlegible",
    family: "'Atkinson Hyperlegible', sans-serif",
  },
  { slug: "dm-sans", label: "DM Sans", family: "'DM Sans', sans-serif" },
  { slug: "plus-jakarta-sans", label: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', sans-serif" },
  { slug: "lora", label: "Lora", family: "'Lora', serif" },
  { slug: "merriweather", label: "Merriweather", family: "'Merriweather', serif" },
  { slug: "roboto", label: "Roboto", family: "'Roboto', sans-serif" },
  { slug: "open-sans", label: "Open Sans", family: "'Open Sans', sans-serif" },
  { slug: "lato", label: "Lato", family: "'Lato', sans-serif" },
  { slug: "montserrat", label: "Montserrat", family: "'Montserrat', sans-serif" },
  { slug: "poppins", label: "Poppins", family: "'Poppins', sans-serif" },
  { slug: "raleway", label: "Raleway", family: "'Raleway', sans-serif" },
  { slug: "nunito", label: "Nunito", family: "'Nunito', sans-serif" },
  { slug: "work-sans", label: "Work Sans", family: "'Work Sans', sans-serif" },
  { slug: "source-serif-4", label: "Source Serif 4", family: "'Source Serif 4', serif" },
  { slug: "playfair-display", label: "Playfair Display", family: "'Playfair Display', serif" },
  { slug: "eb-garamond", label: "EB Garamond", family: "'EB Garamond', serif" },
  { slug: "ibm-plex-sans", label: "IBM Plex Sans", family: "'IBM Plex Sans', sans-serif" },
  { slug: "ibm-plex-serif", label: "IBM Plex Serif", family: "'IBM Plex Serif', serif" },
  { slug: "jetbrains-mono", label: "JetBrains Mono", family: "'JetBrains Mono', monospace" },
  { slug: "fira-sans", label: "Fira Sans", family: "'Fira Sans', sans-serif" },
  { slug: "karla", label: "Karla", family: "'Karla', sans-serif" },
  { slug: "rubik", label: "Rubik", family: "'Rubik', sans-serif" },
  { slug: "libre-franklin", label: "Libre Franklin", family: "'Libre Franklin', sans-serif" },
] as const;

export type ThemeFontSlug = (typeof THEME_FONTS)[number]["slug"];

// Static import() literals so the bundler emits one lazy chunk per family.
// 400 + 700 keeps body text and headings covered without pulling every weight.
const FONT_LOADERS: Record<string, () => Promise<unknown>> = {
  "dm-sans": () => Promise.all([import("@fontsource/dm-sans/400.css"), import("@fontsource/dm-sans/700.css")]),
  "plus-jakarta-sans": () => Promise.all([import("@fontsource/plus-jakarta-sans/400.css"), import("@fontsource/plus-jakarta-sans/700.css")]),
  "lora": () => Promise.all([import("@fontsource/lora/400.css"), import("@fontsource/lora/700.css")]),
  "merriweather": () => Promise.all([import("@fontsource/merriweather/400.css"), import("@fontsource/merriweather/700.css")]),
  "roboto": () => Promise.all([import("@fontsource/roboto/400.css"), import("@fontsource/roboto/700.css")]),
  "open-sans": () => Promise.all([import("@fontsource/open-sans/400.css"), import("@fontsource/open-sans/700.css")]),
  "lato": () => Promise.all([import("@fontsource/lato/400.css"), import("@fontsource/lato/700.css")]),
  "montserrat": () => Promise.all([import("@fontsource/montserrat/400.css"), import("@fontsource/montserrat/700.css")]),
  "poppins": () => Promise.all([import("@fontsource/poppins/400.css"), import("@fontsource/poppins/700.css")]),
  "raleway": () => Promise.all([import("@fontsource/raleway/400.css"), import("@fontsource/raleway/700.css")]),
  "nunito": () => Promise.all([import("@fontsource/nunito/400.css"), import("@fontsource/nunito/700.css")]),
  "work-sans": () => Promise.all([import("@fontsource/work-sans/400.css"), import("@fontsource/work-sans/700.css")]),
  "source-serif-4": () => Promise.all([import("@fontsource/source-serif-4/400.css"), import("@fontsource/source-serif-4/700.css")]),
  "playfair-display": () => Promise.all([import("@fontsource/playfair-display/400.css"), import("@fontsource/playfair-display/700.css")]),
  "eb-garamond": () => Promise.all([import("@fontsource/eb-garamond/400.css"), import("@fontsource/eb-garamond/700.css")]),
  "ibm-plex-sans": () => Promise.all([import("@fontsource/ibm-plex-sans/400.css"), import("@fontsource/ibm-plex-sans/700.css")]),
  "ibm-plex-serif": () => Promise.all([import("@fontsource/ibm-plex-serif/400.css"), import("@fontsource/ibm-plex-serif/700.css")]),
  "jetbrains-mono": () => Promise.all([import("@fontsource/jetbrains-mono/400.css"), import("@fontsource/jetbrains-mono/700.css")]),
  "fira-sans": () => Promise.all([import("@fontsource/fira-sans/400.css"), import("@fontsource/fira-sans/700.css")]),
  "karla": () => Promise.all([import("@fontsource/karla/400.css"), import("@fontsource/karla/700.css")]),
  "rubik": () => Promise.all([import("@fontsource/rubik/400.css"), import("@fontsource/rubik/700.css")]),
  "libre-franklin": () => Promise.all([import("@fontsource/libre-franklin/400.css"), import("@fontsource/libre-franklin/700.css")]),
};

const loadedFonts = new Set<string>();

/** Lazily fetch the CSS/woff2 chunk for one family. No-op for "system" and
 *  the three families bundled via index.css @font-face rules. */
export async function loadThemeFont(slug: string | undefined | null): Promise<void> {
  if (!slug || slug === "system" || loadedFonts.has(slug)) return;
  const loader = FONT_LOADERS[slug];
  loadedFonts.add(slug); // mark before awaiting so concurrent calls dedupe
  if (!loader) return; // bundled family (inter / fraunces / atkinson-hyperlegible)
  try {
    await loader();
  } catch (err) {
    loadedFonts.delete(slug); // allow a retry on transient network failure
    console.error(`[ThemeFont] Failed to load font "${slug}"`, err);
  }
}

export function themeFontFamily(slug: string | undefined | null): string | null {
  if (!slug || slug === "system") return null;
  return THEME_FONTS.find((f) => f.slug === slug)?.family ?? null;
}

/** Point the app-wide font at the chosen family (or back to the default). */
export function applyThemeFont(slug: string | undefined | null): void {
  if (typeof document === "undefined") return;
  const family = themeFontFamily(slug);
  const root = document.documentElement;
  if (family) {
    root.style.setProperty("--theme-font", family);
    root.classList.add("theme-font-active");
  } else {
    root.style.removeProperty("--theme-font");
    root.classList.remove("theme-font-active");
  }
}

declare global {
  interface Window {
    __loadThemeFont?: (slug: string) => Promise<void>;
  }
}

if (typeof window !== "undefined") {
  window.__loadThemeFont = loadThemeFont;
}
