# AccessiBooks

## Overview

AccessiBooks is an audiobook player application designed for accessibility, providing a comprehensive library management system and an advanced audio player. It aggregates audiobooks and ebooks from various external sources, offering features like high contrast mode, dyslexia-friendly fonts, keyboard navigation, Bionic Reading, Colour Overlay (Irlen tint), Symbol Overlay, Session Pacing, AI Comprehension Coach, Switch Access Scanning, DAISY export, and AI Image Descriptions. The project aims to deliver an inclusive audiobook experience, targeting the growing market of audiobook consumers, particularly those with accessibility needs, and seeks broad adoption through its feature set and ease of use.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application emphasizes accessible design with high contrast, dark mode, dyslexia-friendly fonts, responsive layouts, comprehensive keyboard navigation, and screen reader support.

### Technical Implementations
- **Frontend**: Built with React and TypeScript, using Tailwind CSS with shadcn/ui for styling, Vite for tooling, and React hooks/TanStack Query for state management. Client-side routing via `wouter` with `<Route>`, `<Switch>`, `<Link>`, and `useLocation`. All views have URL paths (/, /player, /reader, /stats, /billing, /enterprise, etc.) enabling browser back/forward and direct URL access.
- **Backend**: Developed with Node.js and Express.js in TypeScript, featuring RESTful APIs and Passport.js for authentication (OAuth and local).
- **Data Storage**: PostgreSQL with Drizzle ORM for main data, and browser-based local storage for user preferences and playback progress.

### Feature Specifications
- **Core Player**: HTML5 audio player with variable speed, skip, progress tracking, bookmarking, sleep timer, and chapter navigation.
- **Content Management**: Aggregation from multiple APIs, personalization features (e.g., "Continue Listening," recommendations), and multi-format support for audiobooks and ebooks with an interactive reader.
- **Interactive Ebook Reader**: Full-featured text reader with 3 themes (light/sepia/dark), 4 fonts (serif/sans/mono/dyslexia), text highlighting/annotations with 5 colors and notes (localStorage persisted), in-book search with prev/next navigation, auto-detected table of contents sidebar, reading statistics (time/words/ETA), swipe gestures for mobile, smooth page transitions, fullscreen mode, adjustable line spacing and margins, keyboard shortcuts (arrows/PgUp/PgDown/Ctrl+F). Component: `client/src/components/ebook-reader.tsx`.
- **Monetization**: 3-tier subscription model (Free/$0, Plus/$4.99/mo, Premium/$9.99/mo) with per-title micro-payments ($1.99-$2.99), DRM, ad integration with paid tier exclusion. Plus/Premium get 10%/20% off individual purchases. Database `purchases` table tracks owned titles. 10 revenue expansion features (Feb 2026): author revenue share (70/30 split, `author_earnings` table, payout requests), 3 premium AI voice packs (Storyteller/Professional/Celebrity, auto-seeded, Premium included), podcast ad insertion (pre-roll + mid-roll for free users), seasonal battle pass ($2.99 with 10 milestones/XP thresholds), annotation sync (Plus/Premium cross-device sync), listening party premium gating (Free=join only, Plus=10 listeners, Premium=50+co-host), gift cards (subscription + credit types via Stripe, 16-char codes), enterprise/education tier ($99/$299 mo with seat management), magazine tier-locking (5 free / all for paid), streaming queue sponsorships (branded banners + impression/click tracking). Schema: `author_earnings`, `voice_packs`, `voice_pack_purchases`, `battle_passes`, `battle_pass_milestones`, `battle_pass_purchases`, `annotation_sync`, `gift_cards`, `enterprise_accounts`, `enterprise_members`, `sponsored_queues`. Routes: `server/revenueRoutes.ts`. Components: `battle-pass.tsx`, `gift-cards.tsx`, `author-dashboard.tsx`, `enterprise.tsx`.
- **Community & Engagement**: User reviews, ratings, gamification (streaks, XP, achievements), push notifications, referral system with referral codes/credits/tracking, and content recommendation engine.
- **Content Creation**: A self-publishing portal for authors to upload and manage content, and a catalog seeder for bulk content import.
- **Advertising**: A programmatic audio ad system with server-side mediation and a self-serve advertising platform for advertisers.
- **Ad Bidding Platform (Task #15)**: A standalone real-time display ad bidding platform layered on top of AccessiBooks. Users can register with role 'advertiser', 'publisher', or 'admin'. Advertiser dashboard: campaign + display ad creation, wallet balance, impression/click stats. Publisher dashboard: ad slot registration (with floor CPM), toggle active/inactive, earnings display. Admin dashboard: pending ad review (approve/reject), user list, platform stats. Second-price auction engine at `POST /api/ad/auction/:slotId`. Role-based routing in App.tsx: authenticated users with adRole get their dashboard, no-role users get the existing AccessiBooks MainApp. Landing page at `/ad-platform` route. Schema tables: `display_ads`, `ad_slots`, `ad_auctions`, `slot_impressions`, `slot_clicks`, `advertiser_wallets`, `publisher_earnings`, `payout_requests`. New user columns: `role`, `company_name`, `website`. Routes: `server/adPlatformRoutes.ts`. Pages: `client/src/pages/ad-platform/`.
- **Real-time Interaction**: Listening Party for synchronized group listening and Live Streaming Queues for preference-based audiobook radio.
- **Financial Management**: A centralized billing platform for transactions and subscription management.
- **AI Integration**: AI-generated book covers when original covers are unavailable. OpenAI TTS for ebook-to-audiobook conversion with 6 voice options and word-by-word highlighting. Visual Reading mode: AI extracts scene descriptions from book text passages, generates cinematic video prompts, and displays looping scene videos behind the text as users read. 4 pre-generated demo videos (library, forest, ocean storm, meadow) serve as fallbacks. Backend: `server/visualReading.ts`, API: `GET /api/books/:id/visuals`, `POST /api/books/:id/generate-visuals`. Frontend: `client/src/components/visual-reader.tsx` integrated in ebook reader. Schema: `book_visuals` table.
- **Podcasts**: RSS feed ingestion with search, curated popular podcasts, episode listing and playback. Backend at `/api/podcasts/feeds` and `/api/ingest`.
- **Digital Magazines**: Curated catalog of 12 free tech/science/design publications with category filtering (Technology, Web Design, Programming, Science, Engineering).
- **Content Model**: Ad-supported freemium with 3 tiers. Free: ads + 128kbps + 6 skips/hr + 2 devices. Plus ($4.99/mo): ad-free + 192kbps + unlimited skips + 3 devices + 10 TTS pages/day. Premium ($9.99/mo): 320kbps + offline + 5 devices + unlimited TTS. Individual titles buyable for $1.99-$2.99.
- **Library Loan System**: Library-style borrow/return with tier-based limits. Free: 1 loan/7 days/2 downloads. Plus: 3 loans/14 days/5 downloads. Premium: 5 loans/21 days/10 downloads. Max 5 concurrent loans per book (limited copies). Waitlist for unavailable titles. Background expiration job every 5 min. Early return awards 25 XP. Backend: `server/loanSystem.ts`. API: `POST /api/loans/borrow`, `POST /api/loans/return/:id`, `GET /api/loans/active`, `GET /api/loans/history`, `POST /api/loans/waitlist/:bookId`, `GET /api/loans/download/:id`, `GET /api/loans/book/:id/status`. Frontend: `client/src/components/my-loans.tsx`. Schema: `book_loans`, `loan_waitlist` tables. Offline: IndexedDB loan downloads with auto-cleanup on expiry via `use-offline-downloads.ts`.

### Monorepo Structure (Feb 2026)
The project includes a monorepo scaffold alongside the main app:
- `pnpm-workspace.yaml`: workspace config for `apps/*`, `services/*`, `packages/*`
- `packages/shared/`: shared TypeScript types (`src/types.ts`) for cross-service use
- `apps/web/`: future standalone web app (Vite+React+Tailwind)
- `services/drm/`: DRM microservice with:
  - `src/db/neon.ts`: pg Pool for Neon Postgres
  - `src/db/migrations/`: 5 SQL migrations (schema_migrations, titles, drm_keys, entitlements, stream_sessions)
  - `scripts/migrate.ts`: transactional migration runner
  - `scripts/seed.ts`: test data seeder (idempotent)
  - Run: `pnpm -C services/drm migrate` / `pnpm -C services/drm seed`

## External Dependencies

- **Database**: Neon Database, Drizzle ORM.
- **UI/Styling**: Radix UI, Tailwind CSS.
- **Payment Gateways**: Stripe, PayPal, Coinbase Commerce.
- **Content APIs**: iTunes Search API, LibriVox API, Open Library API, Google Books API, Project Gutenberg API (Gutendex), Internet Archive API, Spotify Web API, Amazon Product Advertising API (PA-API), SoundCloud API, Google Play Books API (via SerpApi) — supports both audiobooks and ebooks.
- **Advertising Platforms**: Google AdSense, Google Ad Manager, AdsWizz, Triton Digital, ad:personam.
- **Content Catalogs**: Nordic APIs eBooks (14 free ebooks on API topics with PDF, EPUB, MOBI, Kindle, LeanPub downloads).
- **Utilities**: TanStack Query (data fetching), Zod (validation), SerpApi.
- **Caching**: In-memory API cache (server/apiCache.ts) with LRU eviction, tiered TTL for external API responses, retry logic with exponential backoff for rate-limited APIs. Max 5000 entries / 100MB.
- **Performance**: React.lazy() code splitting for 13 heavy components, image lazy loading, memoized navigation and event handlers. gzip compression middleware (level 6, threshold 1KB).
- **Offline**: Browser-side IndexedDB-based download manager for Premium users (client/src/hooks/use-offline-downloads.ts).
- **Scaling Infrastructure** (Feb 2026):
  - **Database-first architecture**: All book queries go through PostgreSQL with pagination. No full-table scans or in-memory loading.
  - Database indexes on books (title, author, genre, source, contentType, publishedYear, language, isPremium) + composite indexes
  - PostgreSQL full-text search with tsvector column (`search_tsv`), weighted columns (title=A, author=B, genre=C, description=D), GIN index (`idx_books_search_tsv`), auto-update trigger (`trg_books_search_tsv`). Setup runs on server startup via `setupFullTextSearch()` in `server/db.ts`.
  - Cursor-based pagination API: `GET /api/books?cursor=&limit=&source=&contentType=&genre=&search=` returns `{data, nextCursor, hasMore, total}`
  - Frontend `useInfiniteQuery` with IntersectionObserver for progressive loading of large catalogs
  - `searchBooksDB()` method for instant full-text search across millions of database rows using `ts_rank` and `to_tsquery`
  - **Background runtime API refresh**: `refreshRuntimeBooks()` fetches from external APIs and upserts to DB every 30 minutes (starts 10s after boot). No runtime merging at request time.
  - **Batch inserts**: Seeder uses chunk-based `INSERT ... ON CONFLICT DO NOTHING` for 50x faster ingestion.
  - Catalog seeder (`server/catalogSeeder.ts`): auto-starts 30s after server boot. 4 sources: LibriVox (target 30K), Gutenberg (target 100K), Open Library (target 40K), Internet Archive (target 30K). Admin API: `GET /api/admin/seed/status`, `POST /api/admin/seed/start`, `POST /api/admin/seed/stop`, `GET /api/admin/seed/metrics`.
  - **Seeder optimizations**: In-memory Set deduplication per source, per-source AbortControllers for independent start/stop, DB-persisted progress (`seeder_progress` table) for exact resume on restart, data quality filtering (title validation, URL validation, IA non-book filtering), efficiency metrics (rate/min, ETA, dedup rate).
  - Gutenberg seeder: follows API `next` URL pagination, adaptive delays (1-4s based on response time), exponential backoff to 180s with jitter for 429 rate limits, separate rate-limit vs empty-page counters.
  - Open Library seeder: browses 60 subjects (fiction, science_fiction, mystery, nature, sports, architecture, business, sociology, computer_science, true_crime, memoir, etc.), cross-subject deduplication.
  - Internet Archive seeder: 25 queries across texts and audio (fiction, science, history, adventure, fantasy, romance, mystery, horror, children, education, religion, art, music, psychology, economics, law, medicine, poetry audio), non-book subject filtering.
  - Total catalog target: **200,000+ titles** across all seeder sources + runtime API ingestion