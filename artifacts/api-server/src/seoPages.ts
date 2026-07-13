// ─────────────────────────────────────────────────────────────────────────────
// Programmatic SEO + GEO landing pages (Task: server-rendered public pages).
//
// Serves content-rich, crawlable HTML for:
//   /book/:id                 — book detail landing page (published books only)
//   /author/:name             — author landing page (published books only)
//   /accessible               — accessibility hub index
//   /accessible/:feature      — per-feature hubs (dyslexia-friendly, auslan, …)
//   /collections              — genre collection index
//   /collections/:slug        — per-genre collection pages + free-audiobooks
//   /sitemap*.xml             — sitemap index + section sitemaps
//
// Principles:
//   * Real catalogue data only — counts, features, and FAQs are derived from
//     DB fields; nothing is fabricated (no invented ratings/reviews).
//   * Draft books are never exposed (status = 'published' everywhere).
//   * Answer-first intros + FAQ blocks + JSON-LD for generative engines.
//   * Thin hubs (< MIN_INDEXABLE_TITLES titles) render with noindex and are
//     excluded from sitemaps.
//   * Canonical URLs use CANONICAL_ORIGIN (falls back to the request host in
//     development only) so host-header values can't poison sitemaps.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Request, Response } from "express";
import { db } from "./db";
import { books, authors, type Book } from "@workspace/db";
import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { apiCache } from "./apiCache";

const SITE_NAME = "AccessiBooks";
const DEFAULT_ORIGIN = "https://accessibooks.org";
const SEO_HTML_TTL = 15 * 60 * 1000; // hub/collection/sitemap cache
const SITEMAP_TTL = 60 * 60 * 1000;
const MIN_INDEXABLE_TITLES = 5;
const HUB_PAGE_SIZE = 48;
// The sitemap protocol caps a file at 50,000 URLs / 50MB. The catalogue can be
// far larger (seeded public-domain imports run into the millions), so the book
// and author sitemaps advertise a capped, content-rich subset and the rendered
// XML string itself is cached — never rebuilt per request.
const SITEMAP_MAX_BOOK_URLS = 45_000;
const SITEMAP_MAX_AUTHOR_URLS = 10_000;

// ── Text helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeJsonLd(obj: object): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + "...";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip LIKE wildcards so genre names can be interpolated into ILIKE patterns. */
function likeSafe(value: string): string {
  return value.replace(/[%_\\]/g, "");
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
  return `${m} min`;
}

function isoDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `PT${h}H${m}M`;
}

const READING_LEVEL_LABELS: Record<number, string> = {
  1: "Very Easy",
  2: "Easy",
  3: "Moderate",
  4: "Advanced",
};

function contentTypeLabel(contentType: string | null): string {
  if (contentType === "ebook") return "ebook";
  if (contentType === "magazine") return "magazine";
  return "audiobook";
}

// ── Canonical origin ─────────────────────────────────────────────────────────

function originFor(req: Request): string {
  const configured = process.env.CANONICAL_ORIGIN;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return DEFAULT_ORIGIN;
  const host = req.headers.host || "localhost";
  const proto = (String(req.headers["x-forwarded-proto"] || "").split(",")[0] || "http").trim() || "http";
  return `${proto}://${host}`;
}

// ── Accessibility feature derivation (real data only) ───────────────────────

const TAG_LABELS: Record<string, string> = {
  "captioned": "Captioned",
  "audio-described": "Audio described",
  "dyslexia-friendly": "Dyslexia-friendly",
  "easy-read": "Easy Read",
  "auslan": "Auslan",
};

type BookRow = Pick<
  Book,
  | "id" | "title" | "author" | "narrator" | "description" | "duration" | "coverImage"
  | "genre" | "publishedYear" | "language" | "contentType" | "isPremium" | "freeTierAvailable"
  | "transcriptAvailable" | "auslanAvailable" | "narrationType" | "readingLevel" | "accessibilityTags"
>;

const bookListColumns = {
  id: books.id,
  title: books.title,
  author: books.author,
  narrator: books.narrator,
  description: books.description,
  duration: books.duration,
  coverImage: books.coverImage,
  genre: books.genre,
  publishedYear: books.publishedYear,
  language: books.language,
  contentType: books.contentType,
  isPremium: books.isPremium,
  freeTierAvailable: books.freeTierAvailable,
  transcriptAvailable: books.transcriptAvailable,
  auslanAvailable: books.auslanAvailable,
  narrationType: books.narrationType,
  readingLevel: books.readingLevel,
  accessibilityTags: books.accessibilityTags,
};

/** Human-readable accessibility feature list derived from real catalogue fields. */
function featureLabels(book: BookRow): string[] {
  const out: string[] = [];
  if (book.transcriptAvailable) out.push("Transcript available");
  if (book.auslanAvailable) out.push("Auslan video companion");
  if (book.narrationType === "human") out.push("Human-narrated");
  if (book.narrationType === "ai") out.push("AI-narrated");
  for (const tag of book.accessibilityTags || []) {
    const label = TAG_LABELS[tag];
    if (label && !out.includes(label) && !(tag === "auslan" && book.auslanAvailable)) out.push(label);
  }
  if (book.readingLevel && READING_LEVEL_LABELS[book.readingLevel]) {
    out.push(`${READING_LEVEL_LABELS[book.readingLevel]} reading level`);
  }
  return out;
}

/** schema.org accessibilityFeature values — only well-defined vocabulary terms. */
function schemaAccessibilityFeatures(book: BookRow): string[] {
  const out = new Set<string>();
  if (book.transcriptAvailable) out.add("transcript");
  if (book.auslanAvailable) out.add("signLanguage");
  for (const tag of book.accessibilityTags || []) {
    if (tag === "captioned") out.add("captions");
    if (tag === "audio-described") out.add("audioDescription");
    if (tag === "auslan") out.add("signLanguage");
  }
  return Array.from(out);
}

// ── Page layout ──────────────────────────────────────────────────────────────

const PAGE_CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:17px;line-height:1.6;color:#16202c;background:#ffffff}
a{color:#0b5cad}
a:focus-visible,button:focus-visible{outline:3px solid #0b5cad;outline-offset:2px}
.skip-link{position:absolute;left:-9999px;top:0;background:#0b5cad;color:#fff;padding:.5rem 1rem;z-index:10}
.skip-link:focus{left:0}
header.site{border-bottom:1px solid #d8dee6;background:#f6f8fa}
header.site .inner{max-width:60rem;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;align-items:center}
header.site .brand{font-weight:700;font-size:1.1rem;color:#16202c;text-decoration:none}
header.site nav a{margin-right:1rem}
main{max-width:60rem;margin:0 auto;padding:1rem}
nav.breadcrumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:.25rem;padding:0;margin:.75rem 0;font-size:.9rem}
nav.breadcrumbs li+li::before{content:"›";margin:0 .35rem;color:#5a6675}
h1{font-size:1.7rem;line-height:1.25;margin:.5rem 0}
p.lead{font-size:1.05rem;color:#2a3948}
.badges{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem;padding:0;margin:.75rem 0}
.badges li{background:#eef4fb;border:1px solid #c9daee;border-radius:999px;padding:.15rem .7rem;font-size:.85rem}
.cta{display:inline-block;background:#0b5cad;color:#fff;text-decoration:none;font-weight:600;padding:.6rem 1.2rem;border-radius:.5rem;margin:.75rem 0}
.cta:hover{background:#094a8c}
.book-grid{list-style:none;padding:0;margin:1rem 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem}
.book-grid li{border:1px solid #d8dee6;border-radius:.5rem;padding:.75rem}
.book-grid img{width:5rem;height:auto;border-radius:.25rem;float:left;margin:0 .75rem .5rem 0}
.book-grid .meta{font-size:.85rem;color:#4a5666}
dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem;margin:1rem 0}
dl.facts dt{font-weight:600}
dl.facts dd{margin:0}
section{margin:1.75rem 0}
.faq h3{margin-bottom:.25rem}
.faq p{margin-top:0}
footer.site{border-top:1px solid #d8dee6;background:#f6f8fa;margin-top:2rem}
footer.site .inner{max-width:60rem;margin:0 auto;padding:1.25rem 1rem;font-size:.9rem}
footer.site ul{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.4rem 1.25rem}
.cover{max-width:12rem;height:auto;border-radius:.5rem;border:1px solid #d8dee6}
`.trim();

interface Crumb {
  name: string;
  path: string; // site-relative, starts with /
}

interface PageOptions {
  origin: string;
  path: string; // canonical path
  title: string; // <title> without site suffix
  metaDescription: string;
  ogType?: string;
  ogImage?: string | null;
  breadcrumbs: Crumb[];
  jsonLd: object[];
  bodyHtml: string; // trusted HTML built with escaped values
  noindex?: boolean;
}

function breadcrumbJsonLd(origin: string, crumbs: Crumb[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${origin}${c.path}`,
    })),
  };
}

function faqJsonLd(faqs: { q: string; a: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function faqHtml(faqs: { q: string; a: string }[]): string {
  if (faqs.length === 0) return "";
  return `<section class="faq" aria-labelledby="faq-heading">
  <h2 id="faq-heading">Frequently asked questions</h2>
  ${faqs.map((f) => `<h3>${escapeHtml(f.q)}</h3>\n<p>${escapeHtml(f.a)}</p>`).join("\n  ")}
</section>`;
}

const FOOTER_HUB_LINKS: Crumb[] = [
  { name: "Accessible collections", path: "/accessible" },
  { name: "Auslan titles", path: "/accessible/auslan" },
  { name: "Titles with transcripts", path: "/accessible/with-transcripts" },
  { name: "Dyslexia-friendly", path: "/accessible/dyslexia-friendly" },
  { name: "Human-narrated", path: "/accessible/human-narrated" },
  { name: "Browse by genre", path: "/collections" },
  { name: "Free audiobooks", path: "/collections/free-audiobooks" },
];

function renderPage(opts: PageOptions): string {
  const canonical = `${opts.origin}${opts.path}`;
  const fullTitle = `${opts.title} | ${SITE_NAME}`;
  const jsonLdBlocks = opts.jsonLd
    .map((obj) => `<script type="application/ld+json">${safeJsonLd(obj)}</script>`)
    .join("\n  ");
  const crumbsHtml = opts.breadcrumbs.length
    ? `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${opts.breadcrumbs
        .map((c, i) =>
          i === opts.breadcrumbs.length - 1
            ? `<li aria-current="page">${escapeHtml(c.name)}</li>`
            : `<li><a href="${escapeHtml(c.path)}">${escapeHtml(c.name)}</a></li>`,
        )
        .join("")}</ol></nav>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(opts.metaDescription)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${opts.noindex ? `<meta name="robots" content="noindex, follow">` : ""}
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeHtml(opts.title)}">
  <meta property="og:description" content="${escapeHtml(opts.metaDescription)}">
  <meta property="og:type" content="${escapeHtml(opts.ogType || "website")}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${opts.ogImage ? `<meta property="og:image" content="${escapeHtml(opts.ogImage)}">` : ""}
  <meta name="twitter:card" content="${opts.ogImage ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(opts.title)}">
  <meta name="twitter:description" content="${escapeHtml(opts.metaDescription)}">
  ${jsonLdBlocks}
  <style>${PAGE_CSS}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="site">
    <div class="inner">
      <a class="brand" href="/">${SITE_NAME}</a>
      <nav aria-label="Main">
        <a href="/collections">Collections</a>
        <a href="/accessible">Accessibility</a>
        <a href="/pricing">Pricing</a>
      </nav>
    </div>
  </header>
  <main id="main">
    ${crumbsHtml}
    ${opts.bodyHtml}
  </main>
  <footer class="site">
    <div class="inner">
      <h2 style="font-size:1rem">Explore accessible reading</h2>
      <ul>
        ${FOOTER_HUB_LINKS.map((l) => `<li><a href="${escapeHtml(l.path)}">${escapeHtml(l.name)}</a></li>`).join("\n        ")}
      </ul>
      <p>${SITE_NAME} — accessible audiobooks, ebooks and magazines from Australian Disability Ltd.</p>
    </div>
  </footer>
</body>
</html>`;
}

function sendHtml(res: Response, html: string, opts?: { status?: number; noCache?: boolean }): void {
  res.status(opts?.status || 200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    opts?.noCache ? "no-store" : "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
  );
  res.send(html);
}

function notFoundPage(origin: string, kind: string, backPath: string, backLabel: string): string {
  return renderPage({
    origin,
    path: backPath,
    title: `${kind} not found`,
    metaDescription: `This ${kind.toLowerCase()} is not available on ${SITE_NAME}.`,
    breadcrumbs: [{ name: "Home", path: "/" }],
    jsonLd: [],
    noindex: true,
    bodyHtml: `<h1>${escapeHtml(kind)} not found</h1>
<p>The page you are looking for is not available. It may have been removed or is not yet published.</p>
<p><a class="cta" href="${escapeHtml(backPath)}">${escapeHtml(backLabel)}</a></p>`,
  });
}

function bookCardHtml(book: BookRow): string {
  const features = featureLabels(book);
  const type = contentTypeLabel(book.contentType);
  const durationText = type === "audiobook" && book.duration > 0 ? ` · ${formatDuration(book.duration)}` : "";
  return `<li>
  ${book.coverImage ? `<img src="${escapeHtml(book.coverImage)}" alt="" loading="lazy" width="80">` : ""}
  <a href="/book/${encodeURIComponent(book.id)}">${escapeHtml(book.title)}</a>
  <div class="meta">by <a href="/author/${encodeURIComponent(book.author)}">${escapeHtml(book.author)}</a> · ${type}${durationText}</div>
  ${features.length ? `<div class="meta">${escapeHtml(features.join(" · "))}</div>` : ""}
</li>`;
}

// ── Cached data access ───────────────────────────────────────────────────────

/** In-flight promise coalescing so concurrent cold misses share one fetch (no cache stampede). */
const inFlight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = apiCache.get<T>(key);
  if (hit !== null) return hit;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = (async () => {
    try {
      const value = await fetcher();
      apiCache.set(key, value, ttl);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/**
 * Indexes backing the public SEO pages. `books.author` (author pages) and
 * `books.genre` (related-titles lookup) are otherwise sequential scans over a
 * catalogue that can exceed a million rows. Hash indexes (not btree) because
 * some imported rows carry >2.7KB values that exceed the btree row-size cap,
 * and every SEO query on these columns is an exact-equality match.
 */
async function ensureSeoIndexes(): Promise<void> {
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_books_author_hash ON books USING hash (author)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_books_genre_hash ON books USING hash (genre)`);
}

const published = () => eq(books.status, "published");

// ── Feature hub definitions ──────────────────────────────────────────────────

interface FeatureHub {
  slug: string;
  name: string;
  pageTitle: string;
  /** Answer-first definition shown at the top of the page (must stay factual). */
  answer: string;
  condition: () => SQL;
}

const tagCondition = (tag: string): SQL => sql`${books.accessibilityTags} @> ARRAY[${tag}]::text[]`;

const FEATURE_HUBS: FeatureHub[] = [
  {
    slug: "dyslexia-friendly",
    name: "Dyslexia-friendly",
    pageTitle: "Dyslexia-friendly audiobooks and ebooks",
    answer:
      "Dyslexia-friendly titles on AccessiBooks are catalogued for readers with dyslexia, and the AccessiBooks reader adds adjustable fonts (including a dyslexia mode), spacing, and contrast controls on every ebook.",
    condition: () => tagCondition("dyslexia-friendly"),
  },
  {
    slug: "easy-read",
    name: "Easy Read",
    pageTitle: "Easy Read books",
    answer:
      "Easy Read titles use simplified language and structure so people with cognitive or intellectual disabilities can read independently. AccessiBooks also offers an Easy English conversion mode inside the reader.",
    condition: () => tagCondition("easy-read"),
  },
  {
    slug: "captioned",
    name: "Captioned",
    pageTitle: "Captioned audiobooks",
    answer:
      "Captioned titles pair the audio with synchronised text so Deaf and hard-of-hearing listeners, and anyone who prefers reading along, can follow every word.",
    condition: () => tagCondition("captioned"),
  },
  {
    slug: "audio-described",
    name: "Audio described",
    pageTitle: "Audio-described titles",
    answer:
      "Audio-described titles include narration of important visual information, designed for blind and low-vision audiences.",
    condition: () => tagCondition("audio-described"),
  },
  {
    slug: "auslan",
    name: "Auslan",
    pageTitle: "Books with Auslan video companions",
    answer:
      "These titles include a human-produced Auslan (Australian Sign Language) video companion, so Deaf Auslan users can experience the story in their first language alongside the audio or text.",
    condition: () => eq(books.auslanAvailable, true),
  },
  {
    slug: "with-transcripts",
    name: "With transcripts",
    pageTitle: "Audiobooks with transcripts",
    answer:
      "Every title in this collection has a full text transcript available in the player, so you can read along, search the text, or use a screen reader or braille display alongside the audio.",
    condition: () => eq(books.transcriptAvailable, true),
  },
  {
    slug: "human-narrated",
    name: "Human-narrated",
    pageTitle: "Human-narrated audiobooks",
    answer:
      "These audiobooks are narrated by human voice performers rather than synthetic voices — the narration style many listeners find easiest and most natural to follow.",
    condition: () => and(eq(books.narrationType, "human"), eq(books.contentType, "audiobook"))!,
  },
  {
    slug: "very-easy-reading",
    name: "Very Easy reading level",
    pageTitle: "Very Easy reading level books",
    answer:
      "Titles at the Very Easy reading level use short sentences and common words, suited to emerging readers and people who prefer maximum simplicity.",
    condition: () => eq(books.readingLevel, 1),
  },
  {
    slug: "easy-reading",
    name: "Easy reading level",
    pageTitle: "Easy reading level books",
    answer: "Titles at the Easy reading level are straightforward reads with accessible vocabulary and structure.",
    condition: () => eq(books.readingLevel, 2),
  },
  {
    slug: "moderate-reading",
    name: "Moderate reading level",
    pageTitle: "Moderate reading level books",
    answer: "Titles at the Moderate reading level suit confident readers who want everyday fiction and non-fiction.",
    condition: () => eq(books.readingLevel, 3),
  },
  {
    slug: "advanced-reading",
    name: "Advanced reading level",
    pageTitle: "Advanced reading level books",
    answer: "Titles at the Advanced reading level feature complex language and structure for experienced readers.",
    condition: () => eq(books.readingLevel, 4),
  },
];

const FEATURE_HUB_BY_SLUG = new Map(FEATURE_HUBS.map((h) => [h.slug, h]));

async function getFeatureHubData(hub: FeatureHub): Promise<{ count: number; books: BookRow[] }> {
  return cached(`seo:hub:${hub.slug}`, SEO_HTML_TTL, async () => {
    const where = and(published(), hub.condition());
    const [{ value: count }] = await db.select({ value: sql<number>`count(*)::int` }).from(books).where(where);
    const rows = await db
      .select(bookListColumns)
      .from(books)
      .where(where)
      .orderBy(desc(books.publishedYear), books.title)
      .limit(HUB_PAGE_SIZE);
    return { count, books: rows };
  });
}

// ── Genre collections ────────────────────────────────────────────────────────

interface GenreEntry {
  genre: string;
  slug: string;
  count: number;
}

async function getGenreList(): Promise<GenreEntry[]> {
  return cached("seo:genres", SEO_HTML_TTL, async () => {
    const result = await db.execute(sql`
      SELECT trim(g) AS genre, count(*)::int AS count
      FROM books, LATERAL unnest(string_to_array(coalesce(genre, ''), ',')) AS g
      WHERE status = 'published' AND trim(g) <> ''
      GROUP BY trim(g)
      HAVING count(*) >= 2
      ORDER BY count(*) DESC, trim(g)
      LIMIT 150
    `);
    const seen = new Set<string>();
    const entries: GenreEntry[] = [];
    for (const row of result.rows as unknown as { genre: string; count: number }[]) {
      const slug = slugify(row.genre);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      entries.push({ genre: row.genre, slug, count: Number(row.count) });
    }
    return entries;
  });
}

async function getGenreBooks(genre: string): Promise<BookRow[]> {
  return cached(`seo:genre:${slugify(genre)}`, SEO_HTML_TTL, async () => {
    return db
      .select(bookListColumns)
      .from(books)
      .where(and(published(), sql`${books.genre} ILIKE ${"%" + likeSafe(genre) + "%"}`))
      .orderBy(desc(books.publishedYear), books.title)
      .limit(HUB_PAGE_SIZE);
  });
}

async function getFreeAudiobooks(): Promise<{ count: number; books: BookRow[] }> {
  return cached("seo:free-audiobooks", SEO_HTML_TTL, async () => {
    const where = and(
      published(),
      eq(books.isPremium, false),
      eq(books.freeTierAvailable, true),
      eq(books.contentType, "audiobook"),
    );
    const [{ value: count }] = await db.select({ value: sql<number>`count(*)::int` }).from(books).where(where);
    const rows = await db
      .select(bookListColumns)
      .from(books)
      .where(where)
      .orderBy(desc(books.publishedYear), books.title)
      .limit(HUB_PAGE_SIZE);
    return { count, books: rows };
  });
}

// ── Shared hub page renderer ─────────────────────────────────────────────────

function hubPageHtml(opts: {
  origin: string;
  path: string;
  heading: string;
  pageTitle: string;
  answer: string;
  count: number;
  books: BookRow[];
  crumbs: Crumb[];
  faqs: { q: string; a: string }[];
}): string {
  const { origin, path, heading, pageTitle, answer, count, books: rows, crumbs, faqs } = opts;
  const noindex = count < MIN_INDEXABLE_TITLES;
  const shown = rows.length;
  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: pageTitle,
      url: `${origin}${path}`,
      description: truncate(answer, 300),
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: origin },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: pageTitle,
      numberOfItems: count,
      itemListElement: rows.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.title,
        url: `${origin}/book/${encodeURIComponent(b.id)}`,
      })),
    },
    breadcrumbJsonLd(origin, crumbs),
  ];
  if (faqs.length) jsonLd.push(faqJsonLd(faqs));

  const bodyHtml = `<h1>${escapeHtml(heading)}</h1>
<p class="lead">${escapeHtml(answer)} ${SITE_NAME} currently lists ${count} ${count === 1 ? "title" : "titles"} in this collection.</p>
<p><a class="cta" href="/collections">Browse all collections</a></p>
<section aria-labelledby="titles-heading">
  <h2 id="titles-heading">${count > shown ? `Featured titles (${shown} of ${count})` : "Titles in this collection"}</h2>
  ${shown === 0 ? "<p>No titles are listed in this collection yet. Check back soon — the catalogue grows regularly.</p>" : `<ul class="book-grid">\n  ${rows.map(bookCardHtml).join("\n  ")}\n  </ul>`}
</section>
${faqHtml(faqs)}
<section>
  <h2>More accessible collections</h2>
  <ul class="badges">
    ${FOOTER_HUB_LINKS.filter((l) => l.path !== path)
      .map((l) => `<li><a href="${escapeHtml(l.path)}">${escapeHtml(l.name)}</a></li>`)
      .join("\n    ")}
  </ul>
</section>`;

  return renderPage({
    origin,
    path,
    title: pageTitle,
    metaDescription: truncate(`${answer} ${SITE_NAME} lists ${count} titles in this collection.`, 160),
    breadcrumbs: crumbs,
    jsonLd,
    bodyHtml,
    noindex,
  });
}

function hubFaqs(hub: FeatureHub, count: number): { q: string; a: string }[] {
  return [
    { q: `What does "${hub.name}" mean on ${SITE_NAME}?`, a: hub.answer },
    {
      q: `How many ${hub.name.toLowerCase()} titles does ${SITE_NAME} have?`,
      a: `${SITE_NAME} currently lists ${count} ${count === 1 ? "title" : "titles"} in this collection, and the catalogue is updated regularly.`,
    },
    {
      q: `Do I need to pay to access these titles?`,
      a: `${SITE_NAME} has a free tier alongside Plus and Premium subscriptions. Availability varies by title — each title page shows whether it is available on the free tier.`,
    },
  ];
}

// ── Sitemap helpers ──────────────────────────────────────────────────────────

interface SitemapEntry {
  loc: string;
  changefreq?: string;
  priority?: string;
  lastmod?: string;
}

function urlsetXml(entries: SitemapEntry[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
  for (const e of entries) {
    xml += `\n  <url>\n    <loc>${escapeHtml(e.loc)}</loc>`;
    if (e.lastmod) xml += `\n    <lastmod>${e.lastmod}</lastmod>`;
    if (e.changefreq) xml += `\n    <changefreq>${e.changefreq}</changefreq>`;
    if (e.priority) xml += `\n    <priority>${e.priority}</priority>`;
    xml += `\n  </url>`;
  }
  xml += `\n</urlset>`;
  return xml;
}

function sendXml(res: Response, xml: string, maxAge: number): void {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
  res.send(xml);
}

function logError(req: Request, error: unknown, message: string): void {
  const anyReq = req as Request & { log?: { error: (obj: object, msg: string) => void } };
  if (anyReq.log) anyReq.log.error({ error }, message);
  else console.error(message, error);
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerSeoPageRoutes(app: Express): void {
  ensureSeoIndexes().catch((err) =>
    console.warn("[SEO] Failed to ensure books indexes (pages fall back to slower scans):", err?.message),
  );

  // ── Book landing page ──────────────────────────────────────────────────────
  app.get("/book/:id", async (req, res) => {
    try {
      const origin = originFor(req);
      const { id } = req.params;
      // The PK lookup + published gate stay per-request (cheap) so an
      // unpublished book 404s immediately even while its HTML is cached.
      const [book] = await db.select().from(books).where(eq(books.id, id)).limit(1);

      if (!book || book.status !== "published") {
        return sendHtml(res, notFoundPage(origin, "Book", "/collections", "Browse collections"), {
          status: 404,
          noCache: true,
        });
      }

      const html = await cached(`seo:html:${origin}:/book/${book.id}`, SEO_HTML_TTL, async () => {
      const type = contentTypeLabel(book.contentType);
      const verb = type === "audiobook" ? "Listen to" : "Read";
      const primaryGenre = (book.genre || "").split(",")[0].trim();
      const features = featureLabels(book);
      const deepLink = `/?book=${encodeURIComponent(book.id)}`;

      // Exact-match predicates only (both columns are btree-indexed); a
      // leading-wildcard ILIKE here would seq-scan the whole catalogue on
      // every crawler hit. Same genre string first, same author as fallback.
      const related = await db
        .select(bookListColumns)
        .from(books)
        .where(
          and(
            published(),
            ne(books.id, book.id),
            book.genre ? eq(books.genre, book.genre) : eq(books.author, book.author),
          ),
        )
        .limit(6);

      const introBits: string[] = [];
      introBits.push(
        `${book.title} by ${book.author} is ${primaryGenre ? `a ${primaryGenre.toLowerCase()} ` : "an "}${type} available on ${SITE_NAME}`,
      );
      if (type === "audiobook" && book.duration > 0) introBits.push(`running ${formatDuration(book.duration)}`);
      if (features.length) introBits.push(`with ${features.map((f) => f.toLowerCase()).join(", ")}`);
      const intro = introBits.join(", ") + ".";

      const freeAccess = !book.isPremium && book.freeTierAvailable;
      const faqs: { q: string; a: string }[] = [
        {
          q: `Is ${book.title} free on ${SITE_NAME}?`,
          a: freeAccess
            ? `Yes. ${book.title} is available on the ${SITE_NAME} free tier — create a free account to start ${type === "audiobook" ? "listening" : "reading"}.`
            : `${book.title} is part of the ${SITE_NAME} subscription catalogue and requires a Plus or Premium plan.`,
        },
        {
          q: `Does ${book.title} have a transcript?`,
          a: book.transcriptAvailable
            ? `Yes. A full text transcript is available alongside the ${type}, so you can read along or use assistive technology with the text.`
            : `A transcript is not currently listed for this title. ${SITE_NAME} labels transcript availability on every title so you can choose.`,
        },
      ];
      if (book.auslanAvailable) {
        faqs.push({
          q: `Is there an Auslan version of ${book.title}?`,
          a: `Yes. This title has a human-produced Auslan (Australian Sign Language) video companion available in the ${SITE_NAME} player.`,
        });
      }
      if (book.narrationType === "human" || book.narrationType === "ai") {
        faqs.push({
          q: `Who narrates ${book.title}?`,
          a:
            book.narrationType === "human"
              ? `${book.title} is narrated by a human voice performer${book.narrator ? ` (${book.narrator})` : ""}.`
              : `${book.title} uses AI narration, clearly labelled so listeners can choose their preferred narration style.`,
        });
      }
      if (type === "audiobook" && book.duration > 0) {
        faqs.push({
          q: `How long is the ${book.title} audiobook?`,
          a: `The audiobook runs approximately ${formatDuration(book.duration)}.`,
        });
      }

      const bookJsonLd: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": type === "audiobook" ? "Audiobook" : "Book",
        name: book.title,
        author: { "@type": "Person", name: book.author },
        url: `${origin}/book/${encodeURIComponent(book.id)}`,
        description: book.description || intro,
        inLanguage: book.language || "English",
        bookFormat: type === "audiobook" ? "https://schema.org/AudiobookFormat" : "https://schema.org/EBook",
      };
      if (book.coverImage) bookJsonLd.image = book.coverImage;
      if (primaryGenre) bookJsonLd.genre = primaryGenre;
      if (book.publishedYear) bookJsonLd.datePublished = String(book.publishedYear);
      if (type === "audiobook" && book.duration > 0) bookJsonLd.duration = isoDuration(book.duration);
      if (type === "audiobook" && book.narrator) bookJsonLd.readBy = { "@type": "Person", name: book.narrator };
      const a11yFeatures = schemaAccessibilityFeatures(book);
      if (a11yFeatures.length) bookJsonLd.accessibilityFeature = a11yFeatures;

      const crumbs: Crumb[] = [
        { name: "Home", path: "/" },
        { name: "Collections", path: "/collections" },
        { name: book.title, path: `/book/${encodeURIComponent(book.id)}` },
      ];

      const facts: [string, string][] = [];
      facts.push(["Format", type.charAt(0).toUpperCase() + type.slice(1)]);
      if (type === "audiobook" && book.duration > 0) facts.push(["Length", formatDuration(book.duration)]);
      if (book.genre) facts.push(["Genre", book.genre]);
      if (book.language) facts.push(["Language", book.language]);
      if (book.publishedYear) facts.push(["Published", String(book.publishedYear)]);
      if (book.narrator) facts.push(["Narrator", book.narrator]);
      if (book.narrationType) facts.push(["Narration", book.narrationType === "human" ? "Human" : "AI"]);
      if (book.readingLevel && READING_LEVEL_LABELS[book.readingLevel])
        facts.push(["Reading level", READING_LEVEL_LABELS[book.readingLevel]]);
      facts.push(["Access", freeAccess ? "Free tier" : "Plus / Premium subscription"]);

      const bodyHtml = `<h1>${escapeHtml(book.title)}</h1>
<p class="lead">${escapeHtml(intro)}</p>
${book.coverImage ? `<img class="cover" src="${escapeHtml(book.coverImage)}" alt="Cover of ${escapeHtml(book.title)}" width="192">` : ""}
${features.length ? `<ul class="badges" aria-label="Accessibility features">${features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
<p><a class="cta" href="${escapeHtml(deepLink)}">${verb} ${escapeHtml(truncate(book.title, 60))} on ${SITE_NAME}</a></p>
<section aria-labelledby="about-heading">
  <h2 id="about-heading">About this ${escapeHtml(type)}</h2>
  ${book.description ? `<p>${escapeHtml(book.description)}</p>` : `<p>${escapeHtml(`${book.title} by ${book.author} is available to ${type === "audiobook" ? "stream" : "read"} on ${SITE_NAME}, the accessible reading platform.`)}</p>`}
  <dl class="facts">
    ${facts.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("\n    ")}
  </dl>
  <p>More by this author: <a href="/author/${encodeURIComponent(book.author)}">${escapeHtml(book.author)}</a></p>
</section>
${
  related.length
    ? `<section aria-labelledby="related-heading">
  <h2 id="related-heading">Related titles</h2>
  <ul class="book-grid">
  ${related.map(bookCardHtml).join("\n  ")}
  </ul>
</section>`
    : ""
}
${faqHtml(faqs)}`;

      return renderPage({
        origin,
        path: `/book/${encodeURIComponent(book.id)}`,
        title: `${book.title} by ${book.author}`,
        metaDescription: truncate(
          book.description || `${verb} ${book.title} by ${book.author} on ${SITE_NAME}. ${features.join(", ")}`,
          160,
        ),
        ogType: "book",
        ogImage: book.coverImage,
        breadcrumbs: crumbs,
        jsonLd: [bookJsonLd, breadcrumbJsonLd(origin, crumbs), faqJsonLd(faqs)],
        bodyHtml,
      });
      });
      sendHtml(res, html);
    } catch (error) {
      logError(req, error, "Error serving book SEO page");
      res.status(500).send("Internal server error");
    }
  });

  // ── Author landing page ────────────────────────────────────────────────────
  app.get("/author/:name", async (req, res) => {
    try {
      const origin = originFor(req);
      // Express 5 already percent-decodes route params (and 400s malformed
      // sequences itself) — decoding again corrupts/throws on names that
      // legitimately contain "%".
      const decodedName = req.params.name;
      const path = `/author/${encodeURIComponent(decodedName)}`;

      // Cached as rendered HTML; unknown authors return null (never cached) so
      // 404s stay fresh while real pages are served from cache for 15 min.
      const html = await cached<string | null>(`seo:html:${origin}:${path}`, SEO_HTML_TTL, async () => {
      const authorBooks = await db
        .select(bookListColumns)
        .from(books)
        .where(and(published(), eq(books.author, decodedName)))
        .orderBy(desc(books.publishedYear), books.title)
        .limit(100);

      if (authorBooks.length === 0) return null;

      const [authorMeta] = await db.select().from(authors).where(eq(authors.name, decodedName)).limit(1);

      const audiobookCount = authorBooks.filter((b) => contentTypeLabel(b.contentType) === "audiobook").length;
      const ebookCount = authorBooks.length - audiobookCount;
      const withTranscripts = authorBooks.filter((b) => b.transcriptAvailable).length;
      const countsText = [
        audiobookCount ? `${audiobookCount} ${audiobookCount === 1 ? "audiobook" : "audiobooks"}` : "",
        ebookCount ? `${ebookCount} ${ebookCount === 1 ? "ebook or magazine" : "ebooks and magazines"}` : "",
      ]
        .filter(Boolean)
        .join(" and ");
      const intro = `${SITE_NAME} lists ${countsText} by ${decodedName}, all playable with accessible reading tools such as adjustable text, text-to-speech and screen-reader support.`;

      const faqs: { q: string; a: string }[] = [
        {
          q: `How many books by ${decodedName} are on ${SITE_NAME}?`,
          a: `${SITE_NAME} currently lists ${authorBooks.length} ${authorBooks.length === 1 ? "title" : "titles"} by ${decodedName}.`,
        },
        {
          q: `Can I listen to ${decodedName}'s books with a transcript?`,
          a:
            withTranscripts > 0
              ? `Yes — ${withTranscripts} of ${decodedName}'s ${withTranscripts === 1 ? "title has" : "titles have"} a text transcript available alongside the audio.`
              : `Transcripts are not currently listed for ${decodedName}'s titles. ${SITE_NAME} labels transcript availability on every title page.`,
        },
      ];

      const personJsonLd: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Person",
        name: decodedName,
        url: `${origin}${path}`,
      };
      if (authorMeta?.bio) personJsonLd.description = truncate(authorMeta.bio, 500);
      if (authorMeta?.wikipedia) personJsonLd.sameAs = [authorMeta.wikipedia];
      if (authorMeta?.photoUrl) personJsonLd.image = authorMeta.photoUrl;

      const crumbs: Crumb[] = [
        { name: "Home", path: "/" },
        { name: "Collections", path: "/collections" },
        { name: decodedName, path },
      ];

      const itemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Books by ${decodedName} on ${SITE_NAME}`,
        numberOfItems: authorBooks.length,
        itemListElement: authorBooks.slice(0, HUB_PAGE_SIZE).map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: b.title,
          url: `${origin}/book/${encodeURIComponent(b.id)}`,
        })),
      };

      const bodyHtml = `<h1>${escapeHtml(decodedName)}</h1>
<p class="lead">${escapeHtml(intro)}</p>
${authorMeta?.bio ? `<section aria-labelledby="bio-heading"><h2 id="bio-heading">About ${escapeHtml(decodedName)}</h2><p>${escapeHtml(truncate(authorMeta.bio, 1200))}</p></section>` : ""}
<p><a class="cta" href="/?author=${encodeURIComponent(decodedName)}">Explore ${escapeHtml(decodedName)} in the ${SITE_NAME} app</a></p>
<section aria-labelledby="books-heading">
  <h2 id="books-heading">Books by ${escapeHtml(decodedName)}</h2>
  <ul class="book-grid">
  ${authorBooks.slice(0, HUB_PAGE_SIZE).map(bookCardHtml).join("\n  ")}
  </ul>
</section>
${faqHtml(faqs)}`;

      return renderPage({
        origin,
        path,
        title: `${decodedName} — audiobooks & ebooks`,
        metaDescription: truncate(
          `${countsText.charAt(0).toUpperCase() + countsText.slice(1)} by ${decodedName} on ${SITE_NAME}, the accessible reading platform.`,
          160,
        ),
        ogType: "profile",
        ogImage: authorMeta?.photoUrl || null,
        breadcrumbs: crumbs,
        jsonLd: [personJsonLd, itemList, breadcrumbJsonLd(origin, crumbs), faqJsonLd(faqs)],
        bodyHtml,
      });
      });

      if (html === null) {
        return sendHtml(res, notFoundPage(origin, "Author", "/collections", "Browse collections"), {
          status: 404,
          noCache: true,
        });
      }
      sendHtml(res, html);
    } catch (error) {
      logError(req, error, "Error serving author SEO page");
      res.status(500).send("Internal server error");
    }
  });

  // ── Accessibility hub index ────────────────────────────────────────────────
  app.get("/accessible", async (req, res) => {
    try {
      const origin = originFor(req);
      const html = await cached(`seo:html:${origin}:/accessible`, SEO_HTML_TTL, async () => {
        const hubData = await Promise.all(
          FEATURE_HUBS.map(async (hub) => ({ hub, data: await getFeatureHubData(hub) })),
        );
        const crumbs: Crumb[] = [
          { name: "Home", path: "/" },
          { name: "Accessible collections", path: "/accessible" },
        ];
        const answer = `${SITE_NAME} organises its catalogue by accessibility feature, so you can find titles that work for you — Auslan video companions, transcripts, captions, dyslexia-friendly and Easy Read titles, human narration, and graded reading levels.`;
        const faqs = [
          {
            q: `What accessibility features does ${SITE_NAME} support?`,
            a: `Every ${SITE_NAME} title is labelled with its accessibility features, including transcripts, captions, audio description, Auslan video companions, narration type and reading level. The reader also adds adjustable fonts, contrast, dyslexia mode, switch access and screen-reader optimisation on every title.`,
          },
          {
            q: `Are accessibility features free on ${SITE_NAME}?`,
            a: `Accessibility settings — text reflow, font scaling, contrast, switch access and screen-reader support — are available to every account tier, including the free tier, as a matter of policy.`,
          },
        ];
        const bodyHtml = `<h1>Accessible book collections</h1>
<p class="lead">${escapeHtml(answer)}</p>
<section aria-labelledby="collections-heading">
  <h2 id="collections-heading">Browse by accessibility feature</h2>
  <ul class="book-grid">
  ${hubData
    .map(
      ({ hub, data }) => `<li>
    <a href="/accessible/${hub.slug}">${escapeHtml(hub.pageTitle)}</a>
    <div class="meta">${data.count} ${data.count === 1 ? "title" : "titles"}</div>
    <div class="meta">${escapeHtml(truncate(hub.answer, 140))}</div>
  </li>`,
    )
    .join("\n  ")}
  </ul>
</section>
<section>
  <h2>Browse by genre</h2>
  <p>You can also <a href="/collections">browse the catalogue by genre</a> or jump straight to <a href="/collections/free-audiobooks">free audiobooks</a>.</p>
</section>
${faqHtml(faqs)}`;
        return renderPage({
          origin,
          path: "/accessible",
          title: "Accessible book collections",
          metaDescription: truncate(answer, 160),
          breadcrumbs: crumbs,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: "Accessible book collections",
              url: `${origin}/accessible`,
              description: truncate(answer, 300),
            },
            breadcrumbJsonLd(origin, crumbs),
            faqJsonLd(faqs),
          ],
          bodyHtml,
        });
      });
      sendHtml(res, html);
    } catch (error) {
      logError(req, error, "Error serving accessible hub index");
      res.status(500).send("Internal server error");
    }
  });

  // ── Per-feature hub page ───────────────────────────────────────────────────
  app.get("/accessible/:feature", async (req, res) => {
    try {
      const origin = originFor(req);
      const hub = FEATURE_HUB_BY_SLUG.get(req.params.feature);
      if (!hub) {
        return sendHtml(res, notFoundPage(origin, "Collection", "/accessible", "Browse accessible collections"), {
          status: 404,
          noCache: true,
        });
      }
      const html = await cached(`seo:html:${origin}:/accessible/${hub.slug}`, SEO_HTML_TTL, async () => {
        const { count, books: rows } = await getFeatureHubData(hub);
        return hubPageHtml({
          origin,
          path: `/accessible/${hub.slug}`,
          heading: hub.pageTitle,
          pageTitle: hub.pageTitle,
          answer: hub.answer,
          count,
          books: rows,
          crumbs: [
            { name: "Home", path: "/" },
            { name: "Accessible collections", path: "/accessible" },
            { name: hub.name, path: `/accessible/${hub.slug}` },
          ],
          faqs: hubFaqs(hub, count),
        });
      });
      sendHtml(res, html);
    } catch (error) {
      logError(req, error, "Error serving accessible feature hub");
      res.status(500).send("Internal server error");
    }
  });

  // ── Genre collection index ─────────────────────────────────────────────────
  app.get("/collections", async (req, res) => {
    try {
      const origin = originFor(req);
      const html = await cached(`seo:html:${origin}:/collections`, SEO_HTML_TTL, async () => {
        const genres = await getGenreList();
        const free = await getFreeAudiobooks();
        const crumbs: Crumb[] = [
          { name: "Home", path: "/" },
          { name: "Collections", path: "/collections" },
        ];
        const answer = `${SITE_NAME} groups its catalogue of audiobooks, ebooks and magazines into genre collections, every one readable with accessible tools such as adjustable text, text-to-speech, transcripts and screen-reader support.`;
        const bodyHtml = `<h1>Browse books by genre</h1>
<p class="lead">${escapeHtml(answer)}</p>
<section aria-labelledby="free-heading">
  <h2 id="free-heading">Free listening</h2>
  <p><a href="/collections/free-audiobooks">Free audiobooks</a> — ${free.count} ${free.count === 1 ? "title" : "titles"} available on the free tier.</p>
</section>
<section aria-labelledby="genres-heading">
  <h2 id="genres-heading">Genres</h2>
  <ul class="badges">
  ${genres
    .map(
      (g) =>
        `<li><a href="/collections/${escapeHtml(g.slug)}">${escapeHtml(g.genre)}</a> (${g.count})</li>`,
    )
    .join("\n  ")}
  </ul>
</section>
<section>
  <h2>Accessible collections</h2>
  <p>Prefer to browse by accessibility feature? See the <a href="/accessible">accessible collections hub</a>.</p>
</section>`;
        return renderPage({
          origin,
          path: "/collections",
          title: "Browse books by genre",
          metaDescription: truncate(answer, 160),
          breadcrumbs: crumbs,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: "Browse books by genre",
              url: `${origin}/collections`,
              description: truncate(answer, 300),
            },
            breadcrumbJsonLd(origin, crumbs),
          ],
          bodyHtml,
        });
      });
      sendHtml(res, html);
    } catch (error) {
      logError(req, error, "Error serving collections index");
      res.status(500).send("Internal server error");
    }
  });

  // ── Per-genre collection page (+ free-audiobooks special collection) ──────
  app.get("/collections/:slug", async (req, res) => {
    try {
      const origin = originFor(req);
      const { slug } = req.params;

      if (slug === "free-audiobooks") {
        const html = await cached(`seo:html:${origin}:/collections/free-audiobooks`, SEO_HTML_TTL, async () => {
          const { count, books: rows } = await getFreeAudiobooks();
          const answer = `These audiobooks are available on the ${SITE_NAME} free tier — no subscription required. Most come from public-domain collections such as LibriVox and Project Gutenberg, recorded for everyone to enjoy.`;
          return hubPageHtml({
            origin,
            path: "/collections/free-audiobooks",
            heading: "Free audiobooks",
            pageTitle: "Free audiobooks",
            answer,
            count,
            books: rows,
            crumbs: [
              { name: "Home", path: "/" },
              { name: "Collections", path: "/collections" },
              { name: "Free audiobooks", path: "/collections/free-audiobooks" },
            ],
            faqs: [
              {
                q: `Are these audiobooks really free?`,
                a: `Yes. Every title in this collection is available on the ${SITE_NAME} free tier. Create a free account to start listening — no payment details required.`,
              },
              {
                q: `How many free audiobooks does ${SITE_NAME} have?`,
                a: `${SITE_NAME} currently lists ${count} audiobooks on the free tier, and the catalogue is updated regularly.`,
              },
              {
                q: `Why are these titles free?`,
                a: `Most free titles are public-domain works sourced from collections such as LibriVox, Project Gutenberg, Internet Archive and Open Library.`,
              },
            ],
          });
        });
        return sendHtml(res, html);
      }

      const genres = await getGenreList();
      const entry = genres.find((g) => g.slug === slug);
      if (!entry) {
        return sendHtml(res, notFoundPage(origin, "Collection", "/collections", "Browse all genres"), {
          status: 404,
          noCache: true,
        });
      }

      const html = await cached(`seo:html:${origin}:/collections/${entry.slug}`, SEO_HTML_TTL, async () => {
        const rows = await getGenreBooks(entry.genre);
        const answer = `${entry.genre} titles on ${SITE_NAME} — audiobooks, ebooks and magazines you can read or listen to with accessible tools including adjustable text, text-to-speech, transcripts and screen-reader support.`;
        return hubPageHtml({
          origin,
          path: `/collections/${entry.slug}`,
          heading: `${entry.genre} audiobooks & ebooks`,
          pageTitle: `${entry.genre} audiobooks & ebooks`,
          answer,
          count: entry.count,
          books: rows,
          crumbs: [
            { name: "Home", path: "/" },
            { name: "Collections", path: "/collections" },
            { name: entry.genre, path: `/collections/${entry.slug}` },
          ],
          faqs: [
            {
              q: `How many ${entry.genre.toLowerCase()} titles does ${SITE_NAME} have?`,
              a: `${SITE_NAME} currently lists ${entry.count} ${entry.genre.toLowerCase()} ${entry.count === 1 ? "title" : "titles"}, and the catalogue is updated regularly.`,
            },
            {
              q: `Can I listen to ${entry.genre.toLowerCase()} titles for free?`,
              a: `${SITE_NAME} has a free tier alongside Plus and Premium subscriptions. Each title page shows whether that title is available on the free tier.`,
            },
          ],
        });
      });
      sendHtml(res, html);
    } catch (error) {
      logError(req, error, "Error serving genre collection page");
      res.status(500).send("Internal server error");
    }
  });

  // ── Sitemaps ───────────────────────────────────────────────────────────────
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const baseUrl = originFor(req);
      const now = new Date().toISOString().split("T")[0];
      const sections = ["sitemap-static.xml", "sitemap-books.xml", "sitemap-authors.xml", "sitemap-collections.xml"];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sections
        .map((s) => `\n  <sitemap>\n    <loc>${escapeHtml(baseUrl)}/${s}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`)
        .join("")}\n</sitemapindex>`;
      sendXml(res, xml, 3600);
    } catch (error) {
      logError(req, error, "Error generating sitemap index");
      res.status(500).send("Internal server error");
    }
  });

  app.get("/sitemap-static.xml", async (req, res) => {
    try {
      const baseUrl = originFor(req);
      // Only canonical, publicly reachable pages: the SPA's top-level
      // anonymous routes (App.tsx) plus the homepage. Routes that only exist
      // behind auth or the guest catch-all (/library, /search, /clubs, ...)
      // must NOT be advertised — crawlers would land on the app shell.
      // Server-rendered /accessible + /collections hubs are covered by
      // sitemap-collections.xml.
      const staticPages: SitemapEntry[] = [
        { loc: `${baseUrl}/`, priority: "1.0", changefreq: "daily" },
        { loc: `${baseUrl}/pricing`, priority: "0.8", changefreq: "weekly" },
        { loc: `${baseUrl}/trust`, priority: "0.6", changefreq: "monthly" },
        { loc: `${baseUrl}/institutional`, priority: "0.6", changefreq: "monthly" },
        { loc: `${baseUrl}/accessibility`, priority: "0.7", changefreq: "monthly" },
        { loc: `${baseUrl}/privacy`, priority: "0.4", changefreq: "monthly" },
        { loc: `${baseUrl}/terms`, priority: "0.4", changefreq: "monthly" },
        { loc: `${baseUrl}/copyright`, priority: "0.4", changefreq: "monthly" },
      ];
      sendXml(res, urlsetXml(staticPages), 3600);
    } catch (error) {
      logError(req, error, "Error generating static sitemap");
      res.status(500).send("Internal server error");
    }
  });

  // Capped to SITEMAP_MAX_BOOK_URLS (protocol limit is 50k/file). Prefers
  // content-rich titles (description + cover render the strongest landing
  // pages), newest first. The rendered XML string is cached — a request never
  // rebuilds a multi-MB document.
  app.get("/sitemap-books.xml", async (req, res) => {
    try {
      const baseUrl = originFor(req);
      const xml = await cached(`seo:sitemap:books-xml:${baseUrl}`, SITEMAP_TTL, async () => {
        const rows = await db
          .select({ id: books.id })
          .from(books)
          .where(and(published(), sql`coalesce(${books.description}, '') <> '' AND coalesce(${books.coverImage}, '') <> ''`))
          .orderBy(sql`${books.publishedYear} DESC NULLS LAST`, books.id)
          .limit(SITEMAP_MAX_BOOK_URLS);
        const entries: SitemapEntry[] = rows.map((r) => ({
          loc: `${baseUrl}/book/${encodeURIComponent(r.id)}`,
          changefreq: "weekly",
          priority: "0.8",
        }));
        return urlsetXml(entries);
      });
      sendXml(res, xml, 3600);
    } catch (error) {
      logError(req, error, "Error generating books sitemap");
      res.status(500).send("Internal server error");
    }
  });

  // Capped to the SITEMAP_MAX_AUTHOR_URLS authors with the most published
  // titles (their pages have the most content); rendered XML cached.
  app.get("/sitemap-authors.xml", async (req, res) => {
    try {
      const baseUrl = originFor(req);
      const xml = await cached(`seo:sitemap:authors-xml:${baseUrl}`, SITEMAP_TTL, async () => {
        const result = await db.execute(sql`
          SELECT author
          FROM books
          WHERE status = 'published'
            AND author IS NOT NULL AND author <> '' AND author <> 'Unknown Author'
          GROUP BY author
          ORDER BY count(*) DESC, author
          LIMIT ${SITEMAP_MAX_AUTHOR_URLS}
        `);
        const names = (result.rows as unknown as { author: string }[]).map((r) => r.author).filter(Boolean);
        const entries: SitemapEntry[] = names.map((name) => ({
          loc: `${baseUrl}/author/${encodeURIComponent(name)}`,
          changefreq: "monthly",
          priority: "0.6",
        }));
        return urlsetXml(entries);
      });
      sendXml(res, xml, 86400);
    } catch (error) {
      logError(req, error, "Error generating authors sitemap");
      res.status(500).send("Internal server error");
    }
  });

  app.get("/sitemap-collections.xml", async (req, res) => {
    try {
      const baseUrl = originFor(req);
      const entries = await cached(`seo:sitemap:collections:${baseUrl}`, SITEMAP_TTL, async () => {
        const out: SitemapEntry[] = [
          { loc: `${baseUrl}/accessible`, changefreq: "weekly", priority: "0.8" },
          { loc: `${baseUrl}/collections`, changefreq: "weekly", priority: "0.8" },
        ];
        for (const hub of FEATURE_HUBS) {
          const { count } = await getFeatureHubData(hub);
          if (count >= MIN_INDEXABLE_TITLES) {
            out.push({ loc: `${baseUrl}/accessible/${hub.slug}`, changefreq: "weekly", priority: "0.7" });
          }
        }
        const free = await getFreeAudiobooks();
        if (free.count >= MIN_INDEXABLE_TITLES) {
          out.push({ loc: `${baseUrl}/collections/free-audiobooks`, changefreq: "weekly", priority: "0.7" });
        }
        const genres = await getGenreList();
        for (const g of genres) {
          if (g.count >= MIN_INDEXABLE_TITLES) {
            out.push({ loc: `${baseUrl}/collections/${g.slug}`, changefreq: "weekly", priority: "0.6" });
          }
        }
        return out;
      });
      sendXml(res, urlsetXml(entries), 3600);
    } catch (error) {
      logError(req, error, "Error generating collections sitemap");
      res.status(500).send("Internal server error");
    }
  });
}
