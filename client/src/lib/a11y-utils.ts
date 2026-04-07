import type { AccessibilitySettings } from "@/lib/storage";

export function getDefaultA11ySettings(): AccessibilitySettings {
  return {
    highContrast: false,
    dyslexiaFont: false,
    darkMode: false,
    fontSize: 100,
    letterSpacing: 0,
    lineHeight: 100,
    saturation: 100,
    invertColors: false,
    highlightLinks: false,
    highlightFocus: false,
    readingGuide: false,
    pauseAnimations: false,
    largerCursor: false,
    readingMask: false,
    activeProfile: null,
    wordSpacing: 0,
    colorVisionMode: "none",
  };
}

export function applyA11ySettings(s: AccessibilitySettings) {
  const root = document.documentElement;
  root.classList.toggle("high-contrast", s.highContrast);
  root.classList.toggle("dyslexia-font", s.dyslexiaFont);
  root.classList.toggle("dark", s.darkMode);
  root.classList.toggle("invert-colors", s.invertColors);
  root.classList.toggle("highlight-links", s.highlightLinks);
  root.classList.toggle("highlight-focus", s.highlightFocus);
  root.classList.toggle("pause-animations", s.pauseAnimations);
  root.classList.toggle("larger-cursor", s.largerCursor);
  const clampedSize = Math.min(150, Math.max(80, s.fontSize));
  root.style.setProperty("--a11y-font-size", `${clampedSize}%`);
  root.style.setProperty("--a11y-letter-spacing", `${s.letterSpacing * 0.05}em`);
  root.style.setProperty("--a11y-line-height", `${s.lineHeight}%`);
  root.style.setProperty("--a11y-word-spacing", `${(s.wordSpacing || 0) * 0.05}em`);
  const filters: string[] = [];
  if (s.invertColors) filters.push("invert(1) hue-rotate(180deg)");
  filters.push(`saturate(${s.saturation}%)`);
  const cvdMode = s.colorVisionMode && s.colorVisionMode !== "none" ? s.colorVisionMode : null;
  if (cvdMode) filters.push(`url(#a11y-cvd-${cvdMode})`);
  root.style.filter = filters.join(" ");
}
