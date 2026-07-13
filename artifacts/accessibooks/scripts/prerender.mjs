// Post-build prerender for the public marketing/legal routes.
//
// Vite builds a single index.html whose <head> carries homepage metadata.
// This script writes dist/public/<route>/index.html for each public route
// with route-specific <title>, description, canonical, Open Graph, and
// Twitter tags, plus a page-level JSON-LD block, so non-JavaScript
// crawlers and social preview bots receive correct metadata in the
// initial response. The strings below intentionally mirror what each
// page sets client-side (document.title / meta effects) so the rendered
// head never disagrees with the prerendered one.
//
// Serving: production static hosting serves existing files before
// rewrites, and artifact.toml additionally maps each route explicitly to
// its prerendered file ahead of the /* -> /index.html SPA fallback.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist", "public");
const ORIGIN = "https://accessibooks.org";
const WEBSITE_ID = `${ORIGIN}/#website`;

const routes = [
  {
    path: "/pricing",
    schemaType: "WebPage",
    title: "Pricing — AccessiBooks",
    description:
      "Compare free, Plus, and Premium plans on AccessiBooks — the accessibility-first audiobook and ebook platform from Australian Disability Ltd.",
    ogTitle: "Pricing — AccessiBooks",
    ogDescription:
      "Choose the AccessiBooks plan that fits your needs. Free access to our curated catalog, or unlock everything with Premium — ad-free, offline, and full catalog.",
    twitterTitle: "Pricing — AccessiBooks",
    twitterDescription:
      "Free, Plus, and Premium plans. AccessiBooks — accessible audiobooks and ebooks for everyone.",
  },
  {
    path: "/trust",
    schemaType: "AboutPage",
    title: "Trust & Safety — AccessiBooks",
    description:
      "How AccessiBooks protects your privacy, meets WCAG 2.1 AA accessibility standards, and earns your trust — built by Australian Disability Ltd.",
    ogTitle: "Trust & Safety — AccessiBooks",
    ogDescription:
      "AccessiBooks is built on accessibility, privacy, and community trust. WCAG 2.1 AA compliant, GDPR ready, with open accessibility scores for every title.",
    twitterTitle: "Trust & Safety — AccessiBooks",
    twitterDescription:
      "Accessibility, privacy, and community trust at the heart of AccessiBooks.",
  },
  {
    path: "/institutional",
    schemaType: "WebPage",
    title: "For Institutions — AccessiBooks",
    description:
      "AccessiBooks for schools, libraries, and organisations — accessible audiobooks and ebooks with centralised billing, analytics, and dedicated support from Australian Disability Ltd.",
    ogTitle: "For Institutions — AccessiBooks",
    ogDescription:
      "Empower your school, library, or organisation with AccessiBooks institutional plans. Full catalog access, ad-free for all members, and a dedicated accessibility dashboard.",
    twitterTitle: "For Institutions — AccessiBooks",
    twitterDescription:
      "Institutional plans for schools, libraries, and organisations. Accessible audiobooks and ebooks for every reader.",
  },
  {
    path: "/accessibility",
    schemaType: "WebPage",
    title: "Accessibility Statement — AccessiBooks",
    description:
      "AccessiBooks is an accessibility-first audiobook and e-reading platform. Read about our keyboard navigation, screen-reader support, transcripts, adjustable playback, and visual customisation.",
  },
  {
    path: "/privacy",
    schemaType: "WebPage",
    title: "Privacy Policy — AccessiBooks",
    description:
      "How AccessiBooks collects, uses, and protects your personal information and reading activity.",
  },
  {
    path: "/terms",
    schemaType: "WebPage",
    title: "Terms of Use — AccessiBooks",
    description:
      "The terms that govern your use of the AccessiBooks audiobook and e-reading platform.",
  },
  {
    path: "/copyright",
    schemaType: "WebPage",
    title: "Copyright & Licensing — AccessiBooks",
    description:
      "How AccessiBooks sources content, respects copyright, and handles licensing and takedown requests.",
  },
];

function escapeAttr(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Replace an existing tag's attribute value; throw if the tag is missing so
// a template drift breaks the build loudly instead of shipping stale heads.
function replaceMeta(html, keyAttr, key, content) {
  const pattern = new RegExp(`(<meta\\s+${keyAttr}="${key}"\\s+content=")[^"]*(")`);
  if (!pattern.test(html)) {
    throw new Error(`prerender: <meta ${keyAttr}="${key}"> not found in built index.html`);
  }
  return html.replace(pattern, `$1${escapeAttr(content)}$2`);
}

function renderRoute(baseHtml, route) {
  const canonical = `${ORIGIN}${route.path}`;
  const ogTitle = route.ogTitle ?? route.title;
  const ogDescription = route.ogDescription ?? route.description;
  const twitterTitle = route.twitterTitle ?? route.title;
  const twitterDescription = route.twitterDescription ?? route.description;

  let html = baseHtml;

  const titlePattern = /<title>[^<]*<\/title>/;
  if (!titlePattern.test(html)) {
    throw new Error("prerender: <title> not found in built index.html");
  }
  html = html.replace(titlePattern, `<title>${escapeAttr(route.title)}</title>`);

  const canonicalPattern = /(<link\s+rel="canonical"\s+href=")[^"]*(")/;
  if (!canonicalPattern.test(html)) {
    throw new Error("prerender: canonical link not found in built index.html");
  }
  html = html.replace(canonicalPattern, `$1${canonical}$2`);

  html = replaceMeta(html, "name", "description", route.description);
  html = replaceMeta(html, "property", "og:title", ogTitle);
  html = replaceMeta(html, "property", "og:description", ogDescription);
  html = replaceMeta(html, "property", "og:url", canonical);
  html = replaceMeta(html, "property", "og:image:alt", route.title);
  html = replaceMeta(html, "name", "twitter:title", twitterTitle);
  html = replaceMeta(html, "name", "twitter:description", twitterDescription);
  html = replaceMeta(html, "name", "twitter:image:alt", route.title);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": route.schemaType,
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: route.title,
    description: route.description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
  };
  const jsonLdScript = `    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  </head>`;
  if (!html.includes("</head>")) {
    throw new Error("prerender: </head> not found in built index.html");
  }
  html = html.replace("</head>", jsonLdScript);

  return html;
}

const baseHtml = readFileSync(join(distDir, "index.html"), "utf8");

for (const route of routes) {
  const outDir = join(distDir, route.path.slice(1));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), renderRoute(baseHtml, route));
  console.log(`prerendered ${route.path} -> ${join(outDir, "index.html")}`);
}

console.log(`prerender: ${routes.length} routes written`);
