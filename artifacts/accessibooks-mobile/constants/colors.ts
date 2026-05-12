/**
 * AccessiBooks brand tokens — exact hex conversions of the HSL values
 * declared in `artifacts/accessibooks/src/index.css`. Keep in sync with
 * the web `:root` and `.dark` blocks (and the brand-surface overrides).
 */

const colors = {
  light: {
    // Semantic tokens (mirror :root in index.css)
    text: "#020817",
    tint: "#f95610",

    background: "#f8fafc",
    foreground: "#020817",

    card: "#ffffff",
    cardForeground: "#020817",

    primary: "#f95610",
    primaryForeground: "#ffffff",

    secondary: "#eaf0f6",
    secondaryForeground: "#020817",

    muted: "#eaf0f6",
    mutedForeground: "#5e6d82",

    accent: "#f95610",
    accentForeground: "#ffffff",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: "#d7dfea",
    input: "#d7dfea",

    // Brand foundation (mirror --brand-* tokens in index.css)
    brandCream: "#f9f4eb",
    brandCreamDeep: "#f1e7da",
    brandInk: "#0d213b",
    brandInkSoft: "#364963",
    brandNavy: "#14335c",
    brandNavyStrong: "#0c2545",
    brandOrange: "#ff6929",
    brandOrangeDeep: "#e6410f",
    brandMuted: "#c6b59f",
    brandLine: "#d7cdc1",
  },

  dark: {
    // Semantic tokens (mirror .dark in index.css — Spotify-grade neutrals)
    text: "#f2f2f2",
    tint: "#fa6b2e",

    background: "#171717",
    foreground: "#f2f2f2",

    card: "#212121",
    cardForeground: "#f2f2f2",

    primary: "#fa6b2e",
    primaryForeground: "#ffffff",

    secondary: "#303030",
    secondaryForeground: "#e6e6e6",

    muted: "#303030",
    mutedForeground: "#9e9e9e",

    accent: "#fa6b2e",
    accentForeground: "#ffffff",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: "#333333",
    input: "#333333",

    // Brand foundation in dark surface (mirror .dark .brand-surface)
    brandCream: "#171717",
    brandCreamDeep: "#1f1f1f",
    brandInk: "#efebe7",
    brandInkSoft: "#bfb9b0",
    brandNavy: "#fb8451",
    brandNavyStrong: "#fca783",
    brandOrange: "#ff773d",
    brandOrangeDeep: "#f9521f",
    brandMuted: "#737373",
    brandLine: "#333333",
  },

  radius: 8,
};

export default colors;
