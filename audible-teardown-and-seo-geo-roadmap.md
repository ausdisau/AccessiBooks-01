# Audible AU Teardown & SEO/GEO Roadmap for AccessiBooks

_Research & strategy deliverable. No code changes here — this document is the input for the "Programmatic SEO + GEO landing pages" build task._

---

## 1. Executive summary

**Do not try to out-Audible Audible.** They have a decade of domain authority, ~hundreds of thousands of indexed product/author/narrator/series/category pages, and a mature server-rendered SEO machine. Beating them head-to-head on "the harry potter audiobook" is a losing game.

**Win the ground they don't contest.** Audible is structurally invisible for *accessibility-intent* search and, critically, for *AI-answer citations* on accessibility questions. When we asked AI engines "best accessible audiobooks for dyslexia", "audiobooks with Auslan / sign language", "public-domain audiobooks with transcripts for the visually impaired", and "easy-English audiobooks for intellectual disability", the cited sources were specialist and nonprofit sites (Speechify, DyslexiaBuddy, Bookshare, Learning Ally, Braille Institute, NLS/Library of Congress) — **Audible appeared in none of them.**

AccessiBooks holds first-party data Audible does not expose: per-title `transcriptAvailable`, `auslanAvailable`, `narrationType` (human vs AI), `accessibilityTags` (`dyslexia-friendly`, `easy-read`, `captioned`, `audio-described`, `auslan`), and `readingLevel` (1–4), sitting on top of a large free/public-domain catalogue (LibriVox, Gutenberg, Internet Archive, Open Library). **That metadata is our "information gain"** — the reason a programmatic page from us deserves to rank and be cited instead of being a thin competitor clone.

**The strategy in one line:** build programmatic pages around *accessibility facets Audible can't answer*, render them so crawlers and AI engines can actually read them, and structure every page answer-first with the schema and FAQ coverage that earns AI citations.

> ⚠️ **Foundational blocker (must be Phase 0):** on the production domain, marketing/SEO paths currently resolve to the client-only Vite SPA, and the existing `/book/:id` and `/author/:name` SSR routes emit meta tags + JSON-LD followed by a `<meta http-equiv="refresh">` redirect, with **no substantive crawlable body** (just a "redirecting…" link). As shipped, our "SEO pages" contain no citable body text. This must be fixed before any programmatic page work has value. Details in §7.

---

## 2. Audible AU teardown (audible.com.au)

### 2.1 Programmatic page-type architecture

Audible's `robots.txt` declares **nine sitemap indexes**, which map one-to-one to their programmatic page types. This is the clearest possible x-ray of their SEO model:

| Sitemap index | Page type it feeds | Notes |
|---|---|---|
| `productDetail_sitemap_index.xml` | **Product / audiobook detail** (`/pd/...`) | The core money page |
| `author_sitemap_index.xml` | **Author** pages | One page per author |
| `narrator_sitemap_index.xml` | **Narrator** pages | Audible builds a page *per narrator* — a facet most competitors ignore |
| `series_sitemap_index.xml` | **Series** pages | Groups multi-book series |
| `category_sitemap_index.xml` + `au_worldtree_catories_sitemap.xml` | **Category / browse** pages | The programmatic hub-and-spoke backbone |
| `sitemap_index.xml` | General/marketing | |
| `secure_sitemap_index.xml` | Logged-in-adjacent surfaces | |
| `help.audible.com.au/s/sitemap.xml` | Help/support content | Separate Salesforce help domain |

Each index points to **many gzipped shard sitemaps** (e.g. `series_sitemap1.xml.gz … series_sitemap7.xml.gz`, and product shards run far larger). This is how they publish page counts in the hundreds of thousands without a monolithic sitemap.

**Takeaway for us:** the winning page-type primitives are **detail, author, narrator, series, category** — plus, for us, **accessibility-facet hubs** that Audible has no equivalent for.

### 2.2 URL patterns (real, observed)

- Product: `/pd/<Human-Readable-Slug>-Audiobook/<ASIN>`
  e.g. `/pd/Tales-of-Polynesia-Audiobook/B0BHXJZMV7`
- Category: `/cat/<Parent>/<Descriptive-Name>-Audiobooks/<numericId>`
  e.g. `/cat/World-Literature/Australia-New-Zealand-Oceania-Audiobooks/8170706051`
- Category hub: `/categories`
- Author / narrator / series: analogous `<name-slug>/<id>` pattern.

Design notes: URLs are **keyword-rich, human-readable slugs with a stable numeric/ASIN suffix**. The slug carries the SEO keywords ("...-Audiobooks", "...-Audiobook"); the ID guarantees a stable canonical even if the slug changes. Every page self-canonicalises to this exact form.

### 2.3 On-page content anatomy (category page)

A single category page (`.../Australia-New-Zealand-Oceania-Audiobooks/8170706051`) is **~800 KB of fully server-rendered HTML** and contains:

- `<h1>` = the category name ("Australia, New Zealand & Oceania").
- Templated `<title>`: `"<Name> Audiobooks in <Parent> | Audible.com.au"`.
- Templated meta description: _"<Name> audiobooks from Audible including best sellers, new releases and customer picks. Your first audiobook is free on a 30-day trial…"_ — same skeleton across categories, variable filled in.
- A product grid sorted "Most Popular", with each title, author, narrator, length, rating.
- **Real user-review headlines rendered inline** (e.g. "Too miserable for words", "vivid depiction of what happened…") — genuine unique text per page, not boilerplate.
- Breadcrumb navigation.

**Why it ranks:** the page is (a) crawlable (SSR, no JS needed), (b) genuinely unique (real product mix + real review snippets), and (c) internally well-linked (to products, parent category, sibling categories).

### 2.4 Structured data (schema.org)

| Page | JSON-LD observed |
|---|---|
| Homepage | `Organization` (+ `PostalAddress`, `ContactPoint`) and `WebSite` + `SearchAction` (enables the Google sitelinks search box) |
| Category | `BreadcrumbList` + `ListItem` (breadcrumb rich result) on top of the org markup |
| Product | `Product` / `Audiobook` with `aggregateRating`, `Review`, and `Offer` (price/availability) — this is what powers star-rating and price rich results (well-established Audible pattern; product HTML is bot-gated to a 503 on direct fetch, but review data surfaces on category pages) |

**Notable gap:** across the pages we sampled (homepage, categories hub, category page) we found **no `FAQPage` schema and no on-page FAQ** — product pages were bot-gated (503) so not directly confirmed there. Audible answers *transactional* questions ("how do credits work") only inside its help subdomain, not on catalogue pages. This is a **direct GEO opening** for us (see §6).

### 2.5 Sitemaps & robots.txt posture

- **robots.txt** aggressively `Disallow`s every account, cart, membership, purchase, gift, offer, and personalization path (`/account/`, `/mycart`, `/membership*`, `/purchase-history`, `/library `, `/offers`, `/oneclick`, …) while leaving the entire catalogue open. Crawl budget is deliberately concentrated on indexable catalogue pages.
- **Nine sitemap indexes**, gzipped shards, `lastmod` per entry.
- Heavy **internationalisation**: the homepage ships 11 `hreflang` alternates (`en-au`, `en-us`, `en-ca`, `en-ie`, `en-in`, `en-nc`, `de-at`, `nl-nl`, `nl-be`, `x-default`, …) so each storefront ranks in its own market without duplicate-content penalties.

### 2.6 Internal linking (hub-and-spoke)

`/categories` (flat hub listing every top category as `<h2>`s) → category page → product page → author / narrator / series pages → back to categories. Every leaf links "up" (breadcrumb) and "sideways" (related titles, same author/narrator/series). Authority flows from the hub outward and pools back via breadcrumbs.

### 2.7 Design / UX & conversion patterns

_(Kept brief — the user explicitly declined a design refresh/clone. These are observations, not a recommendation to copy the look.)_

- Single dominant conversion hook repeated everywhere: **"Try Audible free for 30 days"** / first-audiobook-free — a membership + credits model, not per-title browsing.
- Content-forward homepage built from horizontally-scrolling **carousels** (best-sellers, new releases, originals) — merchandising over search.
- Consistent product cards (cover, title, author, narrator, length, star rating) that double as the category-grid unit.
- Persistent search with the `SearchAction` schema wiring the browser + Google sitelinks box.

**What we should take (structure, not skin):** the product-card-as-atomic-unit, the carousel-driven merchandising for internal linking, and the single-clear-CTA discipline. **What we should not take:** the brand look/colour/copy (trademark + differentiation risk) or the membership-credit framing (our model is subscription tiers + free public-domain access).

### 2.8 Scorecard — what Audible does well vs. where they're exposed

**Does well**
- Exhaustive programmatic coverage (product/author/narrator/series/category) at massive scale.
- Every catalogue page is server-rendered and genuinely unique (real reviews inline).
- Clean, keyword-rich, self-canonicalising URLs.
- Disciplined crawl budget (robots blocks all non-indexable surfaces).
- Correct rich-result schema (breadcrumb, product rating, org/search).
- Proper multi-market hreflang.

**Exposed / gaps we can exploit**
- **Zero accessibility-facet discovery.** No "dyslexia-friendly", "signed/Auslan", "transcript available", "easy-read", "human-narrated vs AI" browse or landing pages. No accessibility metadata in their schema.
- **No FAQ / answer-first content** on catalogue pages → weak for AI Overviews / ChatGPT / Perplexity citations.
- **Paywalled by design** — most value is behind membership; there is no strong free/public-domain story, which is exactly the "free audiobooks with transcripts" intent that nonprofits currently own.
- **Generic, commercial meta copy** — no informational depth for the caregiver/educator/therapist audience.

---

## 3. Keyword & AI-prompt landscape (accessible audiobooks/ebooks)

Observed from live AI-engine answers + search results. The pattern is consistent: **commercial audiobook intent → Audible/Amazon win; accessibility intent → specialist & nonprofit sites win; Audible is absent from the accessibility set.**

| Intent cluster | Example queries / AI prompts | Who currently ranks / is cited | Audible present? | AccessiBooks advantage |
|---|---|---|---|---|
| Dyslexia reading/listening | "best accessible audiobooks for dyslexia", "dyslexia-friendly ebook app Australia", "adjustable font reading app" | Speechify, DyslexiaBuddy, goodsensorylearning, OpenDyslexic | ❌ | `accessibilityTags: dyslexia-friendly`, dyslexia mode, adjustable fonts/contrast, `readingLevel` |
| Deaf / Auslan / signed books | "audiobooks with sign language for deaf users", "Auslan signed stories" | Fragmented — YouGlish, course sites, Amazon dead-ends; **no dedicated platform** | ❌ | `auslanAvailable` + human-produced Auslan video companions + captioned events. **Near-empty SERP/AI space.** |
| Blind / low-vision + transcripts | "free public-domain audiobooks with transcripts for visually impaired" | Braille Institute, NLS/Library of Congress, Bookshare | ❌ | `transcriptAvailable` + large free LibriVox/Gutenberg catalogue + screen-reader optimisation |
| Intellectual disability / easy English | "easy-English simplified audiobooks", "simple audiobooks for learning disability" | Bookshare, Learning Ally, special-needs sites | ❌ | Easy English mode, `accessibilityTags: easy-read`, `readingLevel 1–2` |
| Free / public-domain audiobooks | "free classic audiobooks legal", "librivox alternatives" | LibriVox, Gutenberg, Internet Archive | ❌ (paywalled) | Same catalogue, but **enriched** with accessibility metadata + modern reader |
| Human vs AI narration | "audiobooks with real human narrators not AI" | Blogs, Reddit-style discussion | Partial | `narrationType: human` filter → a page Audible doesn't offer |
| Caregiver / educator / therapist | "audiobooks for students with disabilities", "reading tools for special-needs classroom" | Nonprofits, edu blogs | ❌ | Caregiver/therapist progress reports, reading levels, institutional tier |

**Conclusion:** every accessibility cluster is either owned by low-authority specialist content or genuinely underserved (Auslan). These are winnable, and they're exactly where our unique data lives.

---

## 4. The AccessiBooks first-party data moat (information-gain inventory)

Every programmatic page below must be justified by a *real column*, or it's a thin page. What we actually have on `books`:

- `transcriptAvailable` (bool) — transcript hint
- `auslanAvailable` (bool) — Auslan companion exists
- `narrationType` — `human` | `ai` | null
- `accessibilityTags` (text[]) — `captioned`, `audio-described`, `dyslexia-friendly`, `easy-read`, `auslan`
- `readingLevel` (int 1–4) — Very Easy → Advanced
- `language`, `genre` (comma-separated text), `contentType` (`audiobook`/`ebook`/`magazine`)
- `narrator`, `author`, `publishedYear`, `duration`, `source` (LibriVox/Gutenberg/…)
- `isPremium` / `freeTierAvailable` (free story), `status` (`published` gate)
- `authors` table (cache): `bio`, `birthDate`/`deathDate`, `photoUrl`, `wikipedia`

**Authoritative accessibility asset tables — prefer these over the boolean hints:**
- `book_transcripts` — real transcript content with a `qualityStatus` lifecycle (`missing → pending → draft → reviewed → published`).
- `book_auslan_companions` — Auslan video companions with a `status` (use `status='published'`).
- `accessibility_metadata` — richer per-title accessibility detail.
- The `books.transcriptAvailable` / `auslanAvailable` booleans are **display hints only**. For a *transcript* or *Auslan* hub, **join to these tables and require a real published asset**, or the page will list titles that don't actually deliver the feature (misleading + thin).

**Constraints to design around (honest):**
- **No slug column** on `books`; author is a free-text field (authors table is a cache, not a spine). Slugs must be generated deterministically from title/name + a stable ID suffix (mirror Audible's `slug/<id>`).
- **`genre` is comma-separated text**, not normalised — genre hubs need parsing/canonicalising.
- **No series model** — series pages are *out of scope* until one exists (future parity item, not Phase 1). A `chapters` table **does** exist, but chapter coverage is uneven and chapter-level pages are not a priority SEO primitive.
- **Data completeness varies** — external-provider titles may lack accessibility metadata; pages must label per-title honestly and only *build* facet hubs where enough titles carry the tag / real asset.

---

## 5. Prioritized programmatic page-type plan

Ordered by (information-gain × winnability × effort). Each type lists URL, data source, why it's unique, schema, and the thin-content guardrail.

### P1 — Accessibility-feature hubs ⭐ (our signature, no Audible equivalent)
- **URL:** `/accessible/<feature>` e.g. `/accessible/dyslexia-friendly`, `/accessible/auslan`, `/accessible/with-transcripts`, `/accessible/easy-read`, `/accessible/human-narrated`, `/accessible/captioned`
- **Data:** filter `books` by `accessibilityTags` / `narrationType` (`status='published'`). For the **transcripts** and **Auslan** hubs, join to `book_transcripts` (`qualityStatus='published'`) and `book_auslan_companions` (`status='published'`) so the hub only lists titles with a *real* published asset — not just the `books.*Available` boolean hint.
- **Unique value:** the exact page the dyslexia/Auslan/transcript AI prompts want and no one authoritative currently serves. Answer-first intro ("What makes an audiobook dyslexia-friendly?") + curated real titles + FAQ.
- **Schema:** `ItemList` (the titles) + `FAQPage` + `BreadcrumbList`.
- **Guardrail:** only publish a hub once it has ≥ N (e.g. 10) qualifying published titles; otherwise leave it out of the sitemap.

### P1 — Enriched book detail pages
- **URL:** `/book/<title-slug>/<id>` (upgrade the existing `/book/:id`).
- **Data:** the book row + `authors` cache + reviews/aggregateRating already in the app.
- **Unique value vs Audible:** show the *accessibility facts Audible omits* — transcript availability, Auslan companion, human/AI narration, reading level, easy-English support — as first-class, answerable content.
- **Schema:** `Audiobook`/`Book` + `aggregateRating` + `Review` + `BreadcrumbList`; add accessibility properties (`accessibilityFeature`, `accessibilityHazard`, `accessMode`) — schema.org fields Audible doesn't populate.
- **Guardrail:** must render a real body (see §7); `status='published'` only.

### P2 — Genre × accessibility crossings
- **URL:** `/genre/<genre-slug>` and `/genre/<genre-slug>/<feature>` (e.g. `/genre/fiction/dyslexia-friendly`).
- **Data:** parsed/normalised `genre` + facet filter.
- **Unique value:** long-tail intent ("dyslexia-friendly fiction audiobooks") with a real, filtered title list.
- **Schema:** `ItemList` + `BreadcrumbList` (+ `FAQPage` on the crossing).
- **Guardrail:** generate a crossing page only when the intersection has enough titles; never emit empty permutations.

### P2 — Author pages (enriched)
- **URL:** `/author/<name-slug>/<id-or-hash>` (upgrade existing `/author/:name`).
- **Data:** distinct `books.author` + `authors` cache (bio, dates, wikipedia, photo).
- **Unique value:** their complete works on AccessiBooks + which titles are accessible/free.
- **Schema:** `Person` + `ItemList` of works + `BreadcrumbList`.
- **Guardrail:** dedupe author name variants; skip "Unknown Author" (already excluded in the current authors sitemap).

### P2 — Narrator pages (human-narration angle)
- **URL:** `/narrator/<name-slug>`
- **Data:** `books.narrator` (present) filtered to `narrationType='human'`.
- **Unique value:** matches "real human narrator, not AI" intent — a facet Audible has pages for but doesn't frame around human-vs-AI.
- **Schema:** `Person` + `ItemList`.
- **Guardrail:** only for narrators with ≥ N titles.

### P3 — Free / public-domain hubs
- **URL:** `/free`, `/free/<genre>`, `/source/librivox`, `/source/gutenberg`
- **Data:** `freeTierAvailable` / `source`.
- **Unique value:** the "free legal classic audiobooks with transcripts" intent, enriched beyond LibriVox/Gutenberg's own bare listings.
- **Schema:** `ItemList` + `FAQPage`.

### P3 — Comparison / "accessible alternative" pages
- **URL:** `/compare/<topic>` e.g. `/compare/accessible-audiobook-apps`, `/audible-alternative-for-dyslexia`
- **Data:** editorial + our catalogue facts.
- **Unique value:** high-CTR informational/AI-citation intent; answer-first comparison tables. (Keep factual and neutral about competitors — no trademark misuse.)
- **Schema:** `FAQPage` + `ItemList`.

### Out of scope (for now)
- **Series pages** — no series data model exists. Note as a future parity item if/when a model is added.

---

## 6. GEO plan (get cited by ChatGPT / Perplexity / Google AI Overviews)

AI engines cite pages that (a) they can fetch as text, (b) answer the question in the first sentence, and (c) are corroborated by structured data. Audible fails (a) partially and (b)/(c) on accessibility. We can win all three.

### Target AI prompts (build a page whose H1/first paragraph directly answers each)
- "What are the best dyslexia-friendly audiobook apps?"
- "Where can I find audiobooks with Auslan / sign-language companions?"
- "Which audiobook services offer transcripts for the visually impaired?"
- "Are there easy-English / simplified audiobooks for people with intellectual disability?"
- "What audiobook apps use real human narrators instead of AI?"
- "Where can I get free public-domain audiobooks with transcripts (legally)?"
- "What audiobook platform is best for special-needs students / a caregiver?"

### Answer-first content pattern (every hub + comparison page)
1. **Direct answer in the first 1–2 sentences** (the "snippet" the LLM lifts).
2. **A scannable list/table** of qualifying real titles from our catalogue (the evidence).
3. **A short "How we define X" section** (e.g. what makes a title dyslexia-friendly here) — this is the *information gain* that makes us the authoritative source.
4. **FAQ block** (3–6 Q&As) with `FAQPage` schema.
5. Internal links to related hubs (dyslexia → easy-read → transcripts).

### Recommended schema.org types
- `FAQPage` — on every hub/comparison page (Audible has none → instant differentiation).
- `ItemList` — the curated title lists (helps AI enumerate "here are N options").
- `Audiobook` / `Book` with **accessibility properties** `accessibilityFeature` (e.g. `transcript`, `signLanguage`, `alternativeText`, `readingOrder`), `accessMode`, `accessibilityHazard=none` — machine-readable proof of accessibility that Audible does not emit.
- `Person` (author/narrator), `BreadcrumbList`, `Organization` + `WebSite`/`SearchAction` (already on homepage-equivalent — ensure ours matches).

### FAQ coverage to author
Per accessibility feature: "What does <feature> mean?", "How do I turn it on?", "Is it free?", "Which titles support it?", "Does it work with a screen reader / VoiceOver / TalkBack?". These map 1:1 to the AI prompts above.

### llms.txt guidance
`artifacts/accessibooks/public/llms.txt` already exists and is good. Extend it once the hubs ship:
- Add an **"Accessibility hubs"** section linking each `/accessible/<feature>` page.
- Add a one-line **definition** of each accessibility feature (LLMs quote these definitions directly).
- Keep it in sync with the sitemap (only list pages that render real content).

### Crawlability / rendering requirement (the make-or-break)
The current `/book/:id` and `/author/:name` routes emit meta tags then a `<meta http-equiv="refresh">` redirect to the SPA with **no substantive body** (only a "redirecting…" link) — AI crawlers and Google see effectively no readable content. **Every citable page must server-render its actual answer text and title list**, not redirect. The api-server is the right place for this (it already owns the SEO bridge routes and sitemaps). See §7 Phase 0.

---

## 7. Phased roadmap (quick wins first)

### Phase 0 — Crawlability foundations _(blocker; do first)_
1. **Fix routing so SEO paths reach Express.** The api-server artifact currently serves only `/api` and `/objects`; `/book`, `/author`, `/sitemap*.xml`, and any new `/accessible`, `/genre`, `/cat` paths must be routed to the api-server (or whichever surface renders them) instead of falling through to the static SPA. Without this, the SSR routes are unreachable in production.
2. **Replace the meta-refresh stubs with real SSR bodies** for `/book` and `/author` (H1, description, accessibility facts, title lists, breadcrumb) while keeping a progressive-enhancement link into the SPA.
3. **Canonical + slug discipline:** adopt `slug/<id>` URLs, self-canonicalise, 301 the old id-only URLs.
4. Confirm `robots.txt` + `sitemap.xml` are served from the same origin and reachable.

### Phase 1 — Quick wins (high gain, low effort)
5. **Ship 4–6 accessibility-feature hubs** (`dyslexia-friendly`, `auslan`, `with-transcripts`, `easy-read`, `human-narrated`, `free`) with answer-first copy + `ItemList` + `FAQPage`.
6. **Enrich book detail SSR** with accessibility schema properties (`accessibilityFeature`, `accessMode`) — unique data Audible lacks.
7. **Add FAQ schema + on-page FAQ** to hubs (immediate GEO edge).
8. **Extend `llms.txt`** with the accessibility hubs + feature definitions.
9. **Add these pages to the sitemap** (new `sitemap-accessibility.xml`, `sitemap-genres.xml`).

### Phase 2 — Programmatic scale
10. **Genre normalisation** (parse comma-separated `genre`) → `/genre/<slug>` hubs.
11. **Genre × accessibility crossings** (guarded by minimum title counts).
12. **Narrator pages** (`narrationType='human'`).
13. **Enriched author pages** with works `ItemList` + bio schema.
14. **Sitemap sharding** if any section exceeds ~50k URLs (mirror Audible's index-of-shards model).

### Phase 3 — GEO depth & moat
15. **Comparison / "accessible alternative" pages** targeting high-intent AI prompts.
16. **Caregiver/educator informational content** (leverages the progress-reports story).
17. **hreflang / language variants** if AU + other English markets are targeted (Audible runs 11 locales — we likely only need `en-au` + `x-default` initially).
18. **Citation & indexation monitoring** (below).

---

## 8. Measurement & guardrails

- **Thin-content guardrail:** never emit a hub/crossing page (or its sitemap entry) below a minimum qualifying-title threshold; every page must have unique intro copy + a real, non-empty list.
- **Indexation tracking:** Search Console coverage per page type; watch for "Crawled — not indexed" (the signal a page is too thin).
- **GEO/citation tracking:** periodically re-run the target AI prompts (as in §3) and record whether AccessiBooks is cited; treat first citations as the north-star metric for this initiative.
- **Rich-result validation:** validate `FAQPage`, `ItemList`, `Audiobook`, `BreadcrumbList` markup on representative pages.
- **Freshness:** keep `lastmod` accurate; regenerate hub lists as the catalogue grows.

---

### Appendix — evidence captured during teardown
- Audible AU homepage: `Organization` + `WebSite`/`SearchAction` JSON-LD; 11 `hreflang` alternates; canonical `https://www.audible.com.au`.
- `robots.txt`: 9 sitemap indexes declared; all account/cart/membership/purchase paths disallowed.
- Category page (`.../Australia-New-Zealand-Oceania-Audiobooks/8170706051`): SSR ~800 KB, templated title/description, `BreadcrumbList` schema, real review headlines inline.
- Category hub `/categories`: flat H2 list of all top categories (hub-and-spoke anchor).
- Product page: bot-gated (503 on direct fetch); rating/review data corroborated via category-page render.
- AI-prompt probes across dyslexia / Auslan / transcripts / easy-English: Audible cited in none; specialist & nonprofit sites dominate.
