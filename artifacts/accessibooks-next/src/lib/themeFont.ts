// Lazy loader for the self-hosted theme-picker font families.
//
// Inter, Fraunces, and Atkinson Hyperlegible are always loaded via
// `src/index.css` (they back core typography and the Atkinson accessibility
// preset). Every other family lives in its own per-family CSS file under
// `src/assets/fonts/<slug>/<slug>.css` and is registered with the browser only
// when something actually asks for it via `loadThemeFont(slug)`.
//
// This keeps first paint cheap (we no longer parse a ~3,000 line monolithic
// vendor stylesheet on every visit) and makes a theme switch a single CSS
// fetch instead of a no-op (browsers won't re-parse what's already there).

// Vite's import.meta.glob produces a record of "module path -> dynamic
// import()". Importing a CSS module for its side effects appends a <style>
// (dev) or <link rel="stylesheet"> (build) tag, which registers the
// @font-face rules without us touching the DOM directly.
const cssLoaders = import.meta.glob("../assets/fonts/*/*.css");

// Resolved URLs for the first woff2 in each family. Used for optional
// `<link rel="preload">` hints to avoid FOFT on theme switch.
const woff2Urls = import.meta.glob("../assets/fonts/*/*-01.woff2", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type ThemeFontSlug =
  | "architects-daughter"
  | "dm-sans"
  | "fira-code"
  | "geist"
  | "geist-mono"
  | "ibm-plex-mono"
  | "ibm-plex-sans"
  | "jetbrains-mono"
  | "libre-baskerville"
  | "lora"
  | "merriweather"
  | "montserrat"
  | "open-sans"
  | "opendyslexic"
  | "outfit"
  | "oxanium"
  | "playfair-display"
  | "plus-jakarta-sans"
  | "poppins"
  | "roboto"
  | "roboto-mono"
  | "source-code-pro"
  | "source-serif-4"
  | "space-grotesk"
  | "space-mono";

// Families bundled into src/index.css — calling loadThemeFont() for these is
// a no-op so callers don't need to special-case them.
const ALWAYS_ON: ReadonlySet<string> = new Set([
  "inter",
  "fraunces",
  "atkinson-hyperlegible",
]);

const inflight = new Map<string, Promise<void>>();
const loaded = new Set<string>();

function findLoader(slug: string): (() => Promise<unknown>) | undefined {
  // Slug matches the directory name, which is also the CSS filename.
  const key = `../assets/fonts/${slug}/${slug}.css`;
  return cssLoaders[key];
}

function findFirstWoff2Url(slug: string): string | undefined {
  // Some families (e.g. opendyslexic) ship distinct files; only families
  // generated from the Google Fonts vendor CSS follow the `-01.woff2`
  // convention. That's the set we care about for preload anyway.
  return woff2Urls[`../assets/fonts/${slug}/${slug}-01.woff2`];
}

function preloadFirstFace(slug: string): void {
  if (typeof document === "undefined") return;
  const href = findFirstWoff2Url(slug);
  if (!href) return;
  if (document.head.querySelector(`link[rel="preload"][href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "font";
  link.type = "font/woff2";
  link.href = href;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

/**
 * Ensure the @font-face rules for `slug` are registered with the browser.
 * Safe to call repeatedly; resolves immediately on subsequent calls.
 */
export function loadThemeFont(slug: string): Promise<void> {
  if (ALWAYS_ON.has(slug)) return Promise.resolve();
  if (loaded.has(slug)) return Promise.resolve();
  const cached = inflight.get(slug);
  if (cached) return cached;

  const loader = findLoader(slug);
  if (!loader) {
    return Promise.reject(new Error(`Unknown theme font: ${slug}`));
  }

  preloadFirstFace(slug);
  const promise = loader().then(
    () => {
      loaded.add(slug);
      inflight.delete(slug);
    },
    (err) => {
      inflight.delete(slug);
      throw err;
    },
  );
  inflight.set(slug, promise);
  return promise;
}

/** True once the @font-face rules for `slug` have been registered. */
export function isThemeFontLoaded(slug: string): boolean {
  return ALWAYS_ON.has(slug) || loaded.has(slug);
}

// Expose on `window` so the theme picker (and any other ad-hoc caller) can
// reach the lazy loader without needing to import this module. The side
// effect of this assignment also prevents tree-shaking from dropping the
// per-family glob and its lazy CSS chunks from the production bundle.
declare global {
  interface Window {
    __loadThemeFont?: typeof loadThemeFont;
  }
}
if (typeof window !== "undefined") {
  window.__loadThemeFont = loadThemeFont;
}
