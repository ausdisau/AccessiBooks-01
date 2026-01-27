# AccessiBooks

## Overview

AccessiBooks is an audiobook player application focused on accessibility. It offers a library management system to browse audiobooks from multiple sources and an audio player with advanced controls, bookmarking, and accessibility features like high contrast mode, dyslexia-friendly fonts, and keyboard navigation. The platform aggregates content from various external APIs to provide access to a wide range of audiobooks and ebooks. The project aims to provide an inclusive and rich audiobook experience, with market potential in the growing audiobook consumption demographic, especially among users requiring enhanced accessibility.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript.
- **Styling**: Tailwind CSS with shadcn/ui.
- **State Management**: React hooks for local state, TanStack Query for server state and caching.
- **Build Tool**: Vite.

### Backend Architecture
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **API Design**: RESTful endpoints for book management and audio streaming.
- **Middleware**: Express middleware for CORS, JSON parsing, and request logging.

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations.
- **Schema**: `Books` table for metadata.
- **Local Storage**: Browser localStorage for user preferences, bookmarks, and playback progress.
- **In-Memory Storage**: Fallback with sample data for development.

### Authentication and Authorization
- **System**: Passport.js supporting Google, Facebook, Microsoft OAuth, and local email/password.
- **Session Management**: PostgreSQL-backed sessions (30-day duration, rolling expiry).
- **Security**: sameSite cookies, httpOnly, secure in production, bcrypt password hashing.

### Accessibility Features
- **Visual**: High contrast mode, dyslexia-friendly fonts, dark mode.
- **Navigation**: Comprehensive keyboard shortcuts and screen reader support (semantic HTML, ARIA labels).
- **Responsiveness**: Mobile-friendly interface.

### Audio Player System
- **Engine**: HTML5 audio with custom React hooks.
- **Features**: Variable speed, skip, progress tracking, bookmarking, sleep timer, chapter navigation.
- **Persistence**: Automatic playback position saving (local storage + database).

### Personalization Features
- "Continue Listening" section for in-progress books.
- "For You" recommendations based on listening history.
- Genre browsing and listening history tracking.

### Monetization System
- **Subscription Tiers**: Free (ad-supported) and Premium (ad-free, unlimited features).
- **DRM and Content Protection**: Auth-gated streaming, signed URLs (15 min), rate limiting, premium content gating, session enforcement.
- **Spotify-like Controls**: Skip limits, audio quality tiers, shuffle mode limitations, device limits, session-based playback, interstitial ads for free users.
- **Advertising**: Integration with Google AdSense and Google Ad Manager for ad placements, with automatic exclusion for premium users.

## External Dependencies

- **Database**:
    - `@neondatabase/serverless`: Neon Database serverless driver.
    - `drizzle-orm`: Type-safe ORM for PostgreSQL.
- **Data Fetching & Caching**:
    - `@tanstack/react-query`: For server state management.
- **UI & Styling**:
    - `@radix-ui/react-*`: Accessible UI primitives.
    - `tailwindcss`: Utility-first CSS framework.
- **Validation**:
    - `zod`: Schema validation.
- **Payment Gateways**:
    - **Stripe**: For subscription management and one-time donations.
    - **PayPal**: Alternative payment method for subscriptions and donations.
    - **Coinbase Commerce**: For cryptocurrency payments (Bitcoin, Ethereum, USDC, etc.).
- **Content APIs**:
    - **iTunes Search API**: Commercial audiobooks (premium).
    - **LibriVox API**: Free public domain audiobooks.
    - **Open Library API**: Comprehensive book metadata.
    - **Google Books API**: Enhanced search and discovery.
    - **Project Gutenberg API (Gutendex)**: Free public domain ebooks.
    - **Internet Archive API**: Free audiobooks, ebooks, and magazines.
- **Advertising Platforms**:
    - **Google AdSense**: Simple ad integration.
    - **Google Ad Manager (DFP)**: Advanced ad serving.

## Audio Ad System

### Components
- **AudioAdInterstitial**: Full-screen interstitial ad shown between tracks for free users
- **AdBanner**: Banner ads displayed in library for free users
- **ResponsiveAd**: Multi-size responsive ad component
- **GoogleAd**: Base component for AdSense/DFP integration

### Implementation
- **Track End Callback**: AudioContext fires onTrackEndCallback when audio finishes
- **Books Played Counter**: Player increments booksPlayed count on track completion
- **Backend Logic**: /api/monetization/should-show-ad determines ad display (every 3 books)
- **Premium Exclusion**: All ads automatically hidden for premium subscribers

### Hooks
- **useAudioAds**: Manages booksPlayed state and increment/dismiss callbacks
- **useShouldShowAd**: Queries backend to determine if ad should display
- **useShouldShowBannerAd**: Controls banner ad visibility

### Environment Variables (optional)
- VITE_ADSENSE_CLIENT: Google AdSense publisher ID
- VITE_ADSENSE_SLOT_BANNER: AdSense slot ID for banner ads
- VITE_ADSENSE_SLOT_INTERSTITIAL: AdSense slot ID for interstitial ads
- VITE_GPT_NETWORK_CODE: Google Ad Manager network code
## Social Review System

### Database Schema
- **reviews**: User reviews with ratings (1-5), title, content, timestamps
- **review_likes**: Helpful votes on reviews
- **user_follows**: Social following relationships
- **external_ratings**: Cached ratings from external sources
- **authors**: Cached author metadata from Open Library

### External Ratings Aggregation
- **Google Books API**: Ratings and review counts
- **iTunes Search API**: Audiobook ratings from Apple
- **Weighted Average**: Combines all sources based on review count

### Author Data (Open Library)
- Biography and personal info
- Birth/death dates
- Author photos
- Complete bibliography/works
- Wikipedia links

### API Endpoints
- GET /api/books/:bookId/reviews - Get reviews for a book
- GET /api/books/:bookId/ratings - Get aggregated ratings
- POST /api/reviews - Create a review (auth required)
- PUT /api/reviews/:id - Update a review (auth required)
- DELETE /api/reviews/:id - Delete a review (auth required)
- POST /api/reviews/:id/like - Toggle helpful vote
- POST /api/users/:userId/follow - Follow a user
- DELETE /api/users/:userId/follow - Unfollow a user
- GET /api/feed - Get reviews from followed users
- GET /api/authors/:name - Get author details
- GET /api/authors/:name/works - Get author's bibliography

### Frontend Components
- **BookReviews**: Full review section with ratings and user reviews
- **AuthorPage**: Author bio, photo, and complete works
- **SocialFeed**: Reviews from followed users
- **StarRating**: Reusable star rating component
- **useReviews hook**: React hooks for review operations

## Multi-Format Content System

### Content Types
- **Audiobooks**: Audio-based content with playback controls
- **Ebooks**: Text-based content with dedicated reader
- **Magazines**: Periodical content (in progress)

### Database Schema Updates
- `contentType`: Enum field (audiobook/ebook/magazine)
- `isPremium`: Boolean flag for premium content gating
- `contentUrl`: URL to text content for ebooks
- `pageCount`: Number of pages for ebooks/magazines

### Premium Content Gating
- Free content: LibriVox, Project Gutenberg, Internet Archive
- Premium content: iTunes audiobooks, commercial Google Books
- Premium upgrade modal with Stripe integration
- Content access hook for consistent gating across app

### Ebook Reader Features
- Variable font size (12-32px)
- Light/dark theme toggle
- Font family selection (serif, sans-serif, mono)
- Page navigation with progress tracking
- Bookmarks saved to localStorage
- Reading progress persistence

### UI Components
- **BookCard**: Content type badges and premium lock icons
- **EbookReader**: Full-featured text reader component
- **PremiumUpgradeModal**: Subscription upsell modal
- **useContentAccess hook**: Content access gating logic
