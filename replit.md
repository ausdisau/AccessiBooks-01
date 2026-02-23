# AccessiBooks

## Overview

AccessiBooks is an audiobook player application designed for accessibility, providing a comprehensive library management system and an advanced audio player. It aggregates audiobooks and ebooks from various external sources, offering features like high contrast mode, dyslexia-friendly fonts, and keyboard navigation. The project aims to deliver an inclusive audiobook experience, targeting the growing market of audiobook consumers, particularly those with accessibility needs, and seeks broad adoption through its feature set and ease of use.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application emphasizes accessible design with high contrast, dark mode, dyslexia-friendly fonts, responsive layouts, comprehensive keyboard navigation, and screen reader support.

### Technical Implementations
- **Frontend**: Built with React and TypeScript, using Tailwind CSS with shadcn/ui for styling, Vite for tooling, and React hooks/TanStack Query for state management.
- **Backend**: Developed with Node.js and Express.js in TypeScript, featuring RESTful APIs and Passport.js for authentication (OAuth and local).
- **Data Storage**: PostgreSQL with Drizzle ORM for main data, and browser-based local storage for user preferences and playback progress.

### Feature Specifications
- **Core Player**: HTML5 audio player with variable speed, skip, progress tracking, bookmarking, sleep timer, and chapter navigation.
- **Content Management**: Aggregation from multiple APIs, personalization features (e.g., "Continue Listening," recommendations), and multi-format support for audiobooks and ebooks with an integrated reader.
- **Monetization**: 3-tier subscription model (Free/$0, Plus/$4.99/mo, Premium/$9.99/mo) with per-title micro-payments ($1.99-$2.99), DRM, ad integration with paid tier exclusion. Plus/Premium get 10%/20% off individual purchases. Database `purchases` table tracks owned titles.
- **Community & Engagement**: User reviews, ratings, gamification (streaks, XP, achievements), push notifications, referral system with referral codes/credits/tracking, and content recommendation engine.
- **Content Creation**: A self-publishing portal for authors to upload and manage content, and a catalog seeder for bulk content import.
- **Advertising**: A programmatic audio ad system with server-side mediation and a self-serve advertising platform for advertisers.
- **Real-time Interaction**: Listening Party for synchronized group listening and Live Streaming Queues for preference-based audiobook radio.
- **Financial Management**: A centralized billing platform for transactions and subscription management.
- **AI Integration**: AI-generated book covers when original covers are unavailable. OpenAI TTS for ebook-to-audiobook conversion with 6 voice options and word-by-word highlighting.
- **Podcasts**: RSS feed ingestion with search, curated popular podcasts, episode listing and playback. Backend at `/api/podcasts/feeds` and `/api/ingest`.
- **Digital Magazines**: Curated catalog of 12 free tech/science/design publications with category filtering (Technology, Web Design, Programming, Science, Engineering).
- **Content Model**: Ad-supported freemium with 3 tiers. Free: ads + 128kbps + 6 skips/hr + 2 devices. Plus ($4.99/mo): ad-free + 192kbps + unlimited skips + 3 devices + 10 TTS pages/day. Premium ($9.99/mo): 320kbps + offline + 5 devices + unlimited TTS. Individual titles buyable for $1.99-$2.99.

## External Dependencies

- **Database**: Neon Database, Drizzle ORM.
- **UI/Styling**: Radix UI, Tailwind CSS.
- **Payment Gateways**: Stripe, PayPal, Coinbase Commerce.
- **Content APIs**: iTunes Search API, LibriVox API, Open Library API, Google Books API, Project Gutenberg API (Gutendex), Internet Archive API, Spotify Web API, Amazon Product Advertising API (PA-API), SoundCloud API, Google Play Books API (via SerpApi).
- **Advertising Platforms**: Google AdSense, Google Ad Manager, AdsWizz, Triton Digital, ad:personam.
- **Content Catalogs**: Nordic APIs eBooks (14 free ebooks on API topics with PDF, EPUB, MOBI, Kindle, LeanPub downloads).
- **Utilities**: TanStack Query (data fetching), Zod (validation), SerpApi.
- **Caching**: In-memory API cache (server/apiCache.ts) with TTL for external API responses, retry logic with exponential backoff for rate-limited APIs.
- **Performance**: React.lazy() code splitting for 13 heavy components, image lazy loading, memoized navigation and event handlers.
- **Offline**: Browser-side IndexedDB-based download manager for Premium users (client/src/hooks/use-offline-downloads.ts).