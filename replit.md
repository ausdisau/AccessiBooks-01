# AccessiBooks — Agent Guide

## Project Identity

AccessiBooks is an **accessibility-first audiobook platform**. Accessibility is the primary product differentiator, not an afterthought. Every feature must work with a keyboard, a screen reader, and high-contrast mode before it is considered done.

**Business model**: Ad-supported free tier → Plus ($4.99/mo, ad-free) → Premium ($9.99/mo, HD + offline) → future institutional/enterprise tier. Per-title micro-purchases ($1.99–$2.99) run alongside subscriptions. The advertising system (audio pre-roll, mid-roll, display RTB) is active for free users only.

---

## How to Work in This Codebase

### Before changing anything
- Read the relevant file(s) first. Never guess at structure.
- Check `shared/schema.ts` before touching any data shape — it is the single source of truth for all types.
- Check existing routes in `server/routes.ts` and adjacent route files before adding new ones.
- If a feature seems missing, search for it — this codebase is large and features are often partially implemented.

### Change style
- **Prefer small, targeted edits** over rewrites. Change what needs changing; leave the rest alone.
- **No destructive refactors** unless explicitly requested. Renaming, restructuring, or consolidating files requires a clear reason.
- **Explain what you changed and why** at the end of any implementation. List the files modified.
- If a fix requires touching more than three files, pause and confirm the scope is correct.

### When adding new fields
- `accessibility_preferences.profile` is a `jsonb` column — extend it with new keys rather than adding columns. No migration needed.
- For structured new data, add to `shared/schema.ts` first, then storage, then routes, then frontend. In that order.
- Use `createInsertSchema` from `drizzle-zod` and export both insert type and select type for every new table.

### Feature Specifications
- **Core Player**: HTML5 audio player with variable speed, skip, progress tracking, bookmarking, sleep timer, and chapter navigation.
- **Content Management**: Aggregation from multiple APIs, personalization features (e.g., "Continue Listening," recommendations), and multi-format support for audiobooks and ebooks with an interactive reader.
- **Interactive Ebook Reader**: Full-featured text reader with 3 themes (light/sepia/dark), 4 fonts (serif/sans/mono/dyslexia), text highlighting/annotations with 5 colors and notes (localStorage persisted), in-book search with prev/next navigation, auto-detected table of contents sidebar, reading statistics (time/words/ETA), swipe gestures for mobile, smooth page transitions, fullscreen mode, adjustable line spacing and margins, keyboard shortcuts (arrows/PgUp/PgDown/Ctrl+F). Component: `client/src/components/ebook-reader.tsx`.
- **Account & Settings (Task #51)**: Unified `/settings` route at `client/src/pages/account-settings.tsx` with 5 sections: Plan (tier comparison + upgrade/manage), Ad Preferences (free-only: static-ads-only toggle + rewarded-ad preference), Listening Defaults (speed, skip-forward 10/15/30s, skip-back 5/10/15s, auto-advance, sleep timer default), Focus & Distraction (transcript open by default, reduce-distraction CSS class on `<html>`), and an Accessibility Preferences link that opens the existing PreferencesKernel modal. Backed by extended `accessibility_preferences.profile` jsonb (8 new fields in `A11yProfile` in `shared/schema.ts`), a deep-merge `PUT /api/a11y/preferences`, and a new aggregation endpoint `GET /api/settings/summary` returning `{ user, preferences, billing }`. The audio player reads `preferredSkipForward/Back` for skip buttons + ARIA labels, `transcriptOpenByDefault` for initial transcript visibility, and `AudioContext` reads `playbackSpeed` and auto-applies `sleepTimerDefault` when starting a book. Ad mediation (`server/adMediation.ts`) filters animated companion images when `suppressAnimatedAds` is enabled. New `client/src/components/plan-badge.tsx` is rendered next to the sidebar "Settings" item.
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
>>>>>>> d39aed3 (Task #51: Account & Settings page)

---

## Accessibility Rules (Non-negotiable)

**Every interactive element must have:**
- A visible focus ring (`focus-visible:ring-2` or equivalent)
- An `aria-label` or visible label associated via `htmlFor` / `aria-labelledby`
- Keyboard operability — if it works with a mouse click, it must also work with Enter/Space

**Screen reader support:**
- Use semantic HTML (`<button>`, `<nav>`, `<main>`, `<section>`, `<h1>`–`<h6>`) before reaching for `role=` attributes
- Dynamic content changes must use `aria-live` regions or `role="status"` / `role="alert"` where appropriate
- Never convey information through color alone — always pair with text or icon

**High contrast and distraction reduction:**
- The `dark` class is toggled on `document.documentElement`; the `reduce-distraction` class follows the same pattern
- Decorative images use `aria-hidden="true"` and `alt=""`
- Animated content must respect `prefers-reduced-motion` — check `reducedMotion` in user preferences before animating

**Transcripts:**
- Transcript panel must remain fully accessible during ad loading and ad playback
- Never hide or disable the transcript toggle while an ad is showing

---

## UI Priorities

1. Keyboard navigation — tab order must be logical; no keyboard traps outside modals
2. Screen reader announcements — state changes (playing, paused, chapter changed, ad starting) must be announced
3. High contrast — test with `highContrast: true` in accessibility profile; never use low-contrast placeholder text as real text
4. Low-distraction options — `reduceDistractionMode` hides decorative elements; never hide navigation or player controls under this mode
5. Touch and mobile — player controls must have adequate tap target size (44×44px minimum)

---

## Backend Priorities

### Entitlement logic
- Tier checks must be **server-side**. Client-side tier checks are UI hints only, never security boundaries.
- Use the centralized entitlement service (when merged) rather than inline `subscriptionTier === "premium"` comparisons.
- Subscription tier values: `"free"` | `"plus"` | `"premium"` | `"institutional"`. Handle all four; do not assume a binary free/paid split.
- Grace period logic (for lapsed subscriptions) must be applied before denying access.

### Billing safety
- Never write billing state directly to the `users` table from a route handler. Billing state must only be updated by the Stripe webhook handler.
- The webhook handler is the source of truth for subscription status. Do not duplicate its logic elsewhere.
- Always validate Stripe webhook signatures before processing events.
- Canceled subscriptions get a grace period — do not hard-cut access on cancellation.

### Graceful failure
- External API failures (Stripe, ad servers, content APIs) must never crash a request or leave the user stuck. Catch errors, log them, return a safe fallback or a clear error response.
- Ad serving failures must resume playback, not pause it indefinitely. If an ad cannot load within 3 seconds, continue without it.
- Database errors in non-critical paths (gamification, analytics, impression logging) should be caught silently — they must not surface as 500 errors to users.

### Analytics
- The `product_events` table stores aggregate signals (tier + event type, no user ID). Use `analyticsService.track()` for new events — fire-and-forget, never await in the request path.
- Do not add PII (user ID, email, IP) to analytics tables.

---

## Ad System Rules

- **Premium and Plus users never see ads.** Check tier server-side before serving any ad decision.
- **Audio ads must not interrupt transcripts.** Before triggering a mid-roll, check transcript segment timing and defer to the next sentence boundary if within a sentence.
- **Chapter-boundary mid-rolls only.** Mid-roll ads trigger at chapter transitions, not at arbitrary time intervals.
- **Accessible ad placement only.** Ad overlays must not cover the transcript panel, chapter nav, or playback controls. They must be dismissible by keyboard.
- **`suppressAnimatedAds` preference** is enforced server-side when filtering ad candidates — if the user has set this, serve static display only.
- **Pre-roll failures are silent.** If the ad server returns no fill or errors, start playback immediately. Log the miss; do not block the user.
- **Rewarded ads are opt-in.** Check `rewardedAdPreference` before offering. Never show a rewarded ad to a user who has set preference to `"never"`.

---

## Key Files Reference

| Area | File |
|---|---|
| Data model (source of truth) | `shared/schema.ts` |
| Server entry | `server/index.ts` |
| Route registration | `server/routes.ts` |
| Storage layer | `server/storage.ts` |
| Auth | `server/auth.ts`, `server/multiAuth.ts` |
| Billing / Stripe webhooks | `server/stripe.ts` |
| Ad mediation | `server/adMediation.ts` |
| Accessibility preferences API | `server/accessibilityKernel.ts` |
| Audio player state | `client/src/contexts/AudioContext.tsx` |
| Ad service (client) | `client/src/services/audio-ad-service.ts` |
| App routing | `client/src/App.tsx` |
| Accessibility modal | `client/src/components/preferences-kernel.tsx` |
| Player bar | `client/src/components/audio-player.tsx` |
| Transcript | `client/src/components/interactive-transcript.tsx` |

---

## Tech Stack Summary

- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS + shadcn/ui (Radix), TanStack Query, Wouter routing
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (Neon) via Drizzle ORM
- **Auth**: Passport.js (local + OAuth), Replit Auth
- **Payments**: Stripe (primary), PayPal, Coinbase
- **Ads**: AdsWizz, Triton Digital, house ads, self-serve RTB platform
- **AI**: OpenAI (TTS, comprehension, image description)
- **Build**: `npm run dev` starts both Express (port 5000) and Vite (proxied) via a single workflow

## Development Notes

- The Vite config and `server/vite.ts` must not be modified — they handle frontend/backend co-hosting on a single port.
- Do not edit `package.json` scripts or `drizzle.config.ts`.
- Environment variables and secrets are managed by Replit — never hardcode them or write them to files.
- The catalog seeder auto-starts 30 seconds after boot — this is expected behavior, not a bug.
- `shared/schema.ts` is imported by both client and server — changes there affect both sides simultaneously.
