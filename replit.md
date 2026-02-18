# AccessiBooks

## Overview

AccessiBooks is an audiobook player application designed for accessibility, offering a comprehensive library management system and an advanced audio player. It aggregates audiobooks and ebooks from various external sources, providing features like high contrast mode, dyslexia-friendly fonts, and keyboard navigation. The project's vision is to deliver an inclusive audiobook experience, targeting the growing market of audiobook consumers, particularly those with accessibility needs, and aims for broad adoption through its feature set and ease of use.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript.
- **Styling**: Tailwind CSS with shadcn/ui.
- **State Management**: React hooks for local state, TanStack Query for server state.
- **Build Tool**: Vite.
- **UI/UX**: Focus on accessible design with high contrast, dark mode, dyslexia-friendly fonts, and responsive layouts. Comprehensive keyboard navigation and screen reader support are integral.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript.
- **API Design**: RESTful endpoints.
- **Authentication**: Passport.js with OAuth (Google, Facebook, Microsoft) and local email/password, using PostgreSQL-backed sessions.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM for main data like book metadata, reviews, and user-related gamification data.
- **Local Storage**: Browser-based for user preferences, bookmarks, and playback progress.

### Core Features
- **Audio Player**: HTML5 audio with variable speed, skip, progress tracking, bookmarking, sleep timer, and chapter navigation. Playback position is persisted.
- **Content Aggregation**: Integrates multiple APIs to offer a wide range of audiobooks and ebooks.
- **Personalization**: "Continue Listening", recommendations, genre browsing, and listening history.
- **Monetization**: Subscription tiers (Free/Premium), DRM, content protection, and ad integration (Google AdSense, Ad Manager) with premium user exclusion. Includes Spotify-like controls for free users.
- **Social & Review System**: User reviews with ratings, helpful votes, user following, and aggregated external ratings. Author details from Open Library.
- **Multi-Format Content**: Supports audiobooks and ebooks with an integrated ebook reader featuring customizable display options (font size, theme, family) and reading progress persistence.
- **Chapter Navigation**: Database-driven chapter metadata for both audiobooks and ebooks, with automatic chapter tracking for audio.
- **AI-Generated Book Covers**: System to generate covers using AI prompts based on book metadata when original covers are unavailable.
- **Gamification**: Tracks user activity (listening streaks, XP, levels, achievements), daily listening goals, and reading challenges to encourage engagement.
- **Catalog Seeder**: A background service for batch importing large catalogs from sources like LibriVox and Project Gutenberg, handling rate limits and ensuring data deduplication.
- **Self-Publishing Portal**: Author dashboard (Publish tab) for uploading audiobooks/ebooks via Object Storage presigned URLs, managing metadata, and viewing analytics (plays, reads, listeners, completions). Routes in `server/selfPublishing.ts`, frontend in `client/src/components/author-dashboard.tsx`. DB tables: `authorProfiles`, `contentAnalytics`, extended `userSubmissions`.
- **Programmatic Audio Ad System**: Server-side ad mediation with waterfall logic across three providers: AdsWizz, Triton Digital, ad:personam, with house ads as fallback. VAST/DAAST XML parsing (`server/vastParser.ts`) extracts audio creatives, companion ads, and tracking pixels. Mediation service (`server/adMediation.ts`) handles provider priority, timeouts, and fill rates. Frontend (`client/src/services/audio-ad-service.ts`, `client/src/components/audio-ad-overlay.tsx`) plays real audio creatives via HTML5 Audio with quartile tracking, companion ad display, and mute/skip controls. Endpoints: GET `/api/ads/request?type=preroll|midroll`, POST `/api/ads/tracking`, GET `/api/ads/providers`, GET `/api/ads/analytics`. Env vars: `ADSWIZZ_TAG_URL`, `TRITON_TAG_URL`, `ADPERSONAM_TAG_URL` (with optional `_TIMEOUT` suffixes). Pre-roll/mid-roll frequency capping, Premium bypass, and impression tracking retained.
- **Podcast Ingestion Service**: RSS feed ingestion pipeline (`server/rss.ts` for parsing, `server/podcastIngestion.ts` for API routes). Supports any standard podcast RSS. Endpoints: POST `/api/ingest` (single), POST `/api/ingest/batch` (multiple), GET `/api/podcasts/feeds`, GET `/api/podcasts/feeds/:id`, GET `/api/podcasts/feeds/:id/episodes`, GET `/api/podcasts/episodes/:id`. Features: idempotent upsert, conditional requests (etag/last-modified), rate limiting, accessibility fields (transcriptUrl, transcriptStatus, contentWarnings). DB tables: `podcastFeeds`, `podcastEpisodes`.
- **Push Notifications**: Web Push API with Service Worker for engagement-boosting notifications. Backend in `server/pushNotifications.ts` (subscription management, send logic, templates). Trigger service in `server/notificationTriggers.ts` (streak reminders, goal nudges, achievements, re-engagement). Frontend: `client/src/components/notification-center.tsx` (bell icon, preferences panel, history), `client/src/hooks/use-push-notifications.ts`. Service Worker at `client/public/sw.js`. DB tables: `pushSubscriptions`, `notificationLog`. VAPID keys in env vars. Endpoints: POST/DELETE `/api/push/subscribe`, GET/PUT `/api/push/preferences`, GET `/api/push/history`, POST `/api/push/test`, GET `/api/push/vapid-key`.
- **Spotify Audiobook Browsing**: Integration via Replit Spotify connector (`server/spotifyClient.ts`). Endpoints: GET `/api/spotify/status`, GET `/api/spotify/search?q=`, GET `/api/spotify/audiobook/:id`, GET `/api/spotify/library`. Frontend: `client/src/components/commercial-audiobooks.tsx` SpotifySection with search, category browsing, and "Listen on Spotify" links. Uses `@spotify/web-api-ts-sdk`.
- **Amazon Affiliate / Audible**: Backend in `server/amazon.ts` using Amazon Product Advertising API (PA-API 5.0) with AWS v4 signature authentication. Endpoints: GET `/api/amazon/status`, GET `/api/amazon/search?q=`, GET `/api/amazon/audiobook/:asin`. Returns audiobook metadata with affiliate links (partner tag). Frontend: `client/src/components/commercial-audiobooks.tsx` AmazonSection with search, ratings, pricing, and "Get on Audible" affiliate links. Requires env vars: `AMAZON_ACCESS_KEY`, `AMAZON_SECRET_KEY`, `AMAZON_PARTNER_TAG`, optional `AMAZON_REGION`.
- **SoundCloud Integration**: Backend in `server/soundcloud.ts` using SoundCloud OAuth 2.1 client credentials with token caching/refresh and rate limit awareness. Endpoints: GET `/api/soundcloud/status`, GET `/api/soundcloud/search?q=&genre=`, GET `/api/soundcloud/track/:id`, GET `/api/soundcloud/track/:id/stream`, GET `/api/soundcloud/track/:id/related`, GET `/api/soundcloud/user/:id`, GET `/api/soundcloud/user/:id/tracks`, GET `/api/soundcloud/genres`, GET `/api/soundcloud/genres/:genre`. Frontend: `client/src/components/commercial-audiobooks.tsx` SoundCloudSection with search, genre browsing (audiobook, podcast, spoken word, etc.), play counts, duration display, and "Listen on SoundCloud" links. SoundCloud content also augments global book search via `?includeSoundCloud=true`. Author dashboard includes SoundCloud profile URL field in social links. Requires env vars: `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET`.
- **Listening Party**: Real-time synchronized listening rooms using WebSockets (`ws`). Backend in `server/listeningParty.ts` (REST routes + WS server). Users create rooms for a specific book, get a 6-char room code to share, and others join. Host controls playback (play/pause/seek/speed) which syncs to all participants with drift correction. Live chat via WebSocket with DB-persisted messages. DB tables: `listeningRooms`, `listeningRoomParticipants`, `listeningRoomMessages`. REST endpoints: POST `/api/listening-party/rooms` (create), GET `/api/listening-party/rooms/join/:code` (lookup by code), GET `/api/listening-party/rooms/:id`, GET `/api/listening-party/rooms/:id/participants`, GET `/api/listening-party/rooms/:id/messages`, POST `/api/listening-party/rooms/:id/close`, GET `/api/listening-party/my-rooms`. WebSocket at `ws://host/ws/listening-party`. Frontend: `client/src/components/listening-party.tsx` (Party tab in main nav).
- **Live Streaming Queue**: Preference-based audiobook radio stations. Backend in `server/streamingQueue.ts` (REST routes + WS handlers via `listeningParty.ts` upgrade). Users create named queues optionally focused on a genre; the system auto-populates with audiobooks from the library based on genre preference and user listening history. Listeners vote on upcoming books (highest votes play next). Host can skip or close. Auto-advance fills new books when queue empties. DB tables: `streamingQueues`, `streamingQueueItems`, `queueVotes`. REST endpoints: GET `/api/streaming-queue/active`, POST `/api/streaming-queue/create`, GET `/api/streaming-queue/:id`, GET `/api/streaming-queue/:id/items`, POST `/api/streaming-queue/:id/add-book`, POST `/api/streaming-queue/:id/vote/:itemId`, POST `/api/streaming-queue/:id/skip`, POST `/api/streaming-queue/:id/close`, GET `/api/streaming-queue/:id/suggestions`, GET `/api/streaming-queue/:id/my-votes`. WebSocket at `ws://host/ws/streaming-queue`. Frontend: `client/src/components/streaming-queue.tsx` (Live Queue tab in main nav).

- **Self-Serve Advertising Platform**: Advertiser dashboard (Advertise tab) for creating CPM-based audio ad campaigns. Backend in `server/selfServeAds.ts` (campaign CRUD, creative management, presigned audio upload via Object Storage, CPM bidding engine, impression/click tracking with quartile events, budget deduction, auto-completion). Integrated into ad mediation waterfall in `server/adMediation.ts` (checked after external VAST providers, before house ads; highest CPM bid wins). Frontend: `client/src/components/advertiser-dashboard.tsx` with campaign form, in-browser MediaRecorder audio recording, file upload, audio preview, creative management, and performance stats (impressions, clicks, CTR, completion rate, listen-through funnel). DB tables: `adCampaigns`, `adCreatives`, `adImpressions`. REST endpoints: GET/POST `/api/self-serve-ads/campaigns`, GET/PATCH/DELETE `/api/self-serve-ads/campaigns/:id`, POST `/api/self-serve-ads/campaigns/:id/submit`, POST `/api/self-serve-ads/campaigns/:id/pause`, GET/POST/DELETE `/api/self-serve-ads/campaigns/:id/creatives`, POST `/api/self-serve-ads/upload-url`, GET `/api/self-serve-ads/audio/*`, GET `/api/self-serve-ads/campaigns/:id/stats`.

- **Centralized Billing Platform**: Unified payment history dashboard (Billing tab) consolidating transactions across Stripe, PayPal, and Coinbase Commerce. Backend in `server/billing.ts` (transaction recording, billing summary, invoice retrieval, Stripe billing portal). Transaction recording integrated into Stripe webhook handlers in `server/routes.ts` for checkout completions, subscription renewals, cancellations, and payment failures. Frontend: `client/src/components/billing-dashboard.tsx` with spending summary cards (plan, total spent, subscriptions, donations), payment methods display, upcoming invoice alert, paginated transaction history, and downloadable Stripe invoices. DB table: `paymentTransactions`. REST endpoints: GET `/api/billing/transactions`, GET `/api/billing/transactions/:id`, GET `/api/billing/summary`, GET `/api/billing/invoices`, POST `/api/billing/create-portal-session`.

## External Dependencies

- **Database**: `@neondatabase/serverless`, `drizzle-orm`.
- **Data Fetching & Caching**: `@tanstack/react-query`.
- **UI & Styling**: `@radix-ui/react-*`, `tailwindcss`.
- **Validation**: `zod`.
- **Payment Gateways**: Stripe, PayPal, Coinbase Commerce.
- **Content APIs**: iTunes Search API, LibriVox API, Open Library API, Google Books API, Project Gutenberg API (Gutendex), Internet Archive API, Spotify Web API, Amazon Product Advertising API, SoundCloud API.
- **Advertising Platforms**: Google AdSense, Google Ad Manager.