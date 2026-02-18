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

## External Dependencies

- **Database**: `@neondatabase/serverless`, `drizzle-orm`.
- **Data Fetching & Caching**: `@tanstack/react-query`.
- **UI & Styling**: `@radix-ui/react-*`, `tailwindcss`.
- **Validation**: `zod`.
- **Payment Gateways**: Stripe, PayPal, Coinbase Commerce.
- **Content APIs**: iTunes Search API, LibriVox API, Open Library API, Google Books API, Project Gutenberg API (Gutendex), Internet Archive API.
- **Advertising Platforms**: Google AdSense, Google Ad Manager.