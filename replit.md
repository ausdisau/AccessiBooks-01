# AccessiBooks

AccessiBooks is a fullstack accessible audiobooks and e-reading platform — audiobooks, ebooks, and magazines designed for users with disabilities, from Australian Disability Ltd.

## Run & Operate

- `pnpm --filter @workspace/accessibooks run dev` — run the frontend (Vite, auto-assigned port)
- `pnpm --filter @workspace/accessibooks-mobile run dev` — run the Expo mobile app
- `pnpm --filter @workspace/accessibooks-mobile run typecheck` — typecheck the mobile app (its `tsc` is clean; api-server `tsc` is not — see Gotchas)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only, interactive prompt)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `ADMIN_EMAILS` — comma/semicolon/space-separated allow-list of admin emails (see Developer notes → Admin security)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v3, wouter router, TanStack Query
- API: Express 5 + pino logging
- DB: PostgreSQL + Drizzle ORM (node-postgres driver)
- Auth: Passport.js (local + Auth0/Google/Facebook/Microsoft OAuth)
- Payments: Stripe
- Build: esbuild (ESM bundle) for api-server, Vite for frontend

## Where things live

- `artifacts/accessibooks/` — React/Vite frontend; all UI in `src/App.tsx` (large single-file component) and `src/components/`. Caregiver/therapist progress-report UI (literacy/listening goals + progress) is in `src/pages/my-activity.tsx`
- `artifacts/accessibooks-mobile/` — Expo (React Native) app. Hands-free voice mode in `lib/voice.tsx`; offline downloads in `lib/downloads.tsx`; local playback-progress persistence in `lib/progress.ts`; downloads management screen at `app/downloads.tsx`; mobile API client in `lib/api.ts`
- `artifacts/api-server/src/` — Express server; `routes/routes.ts` is the main route file (6000+ lines); `voiceRoutes.ts` is the mobile voice STT endpoint (`POST /api/voice/transcribe`)
- `artifacts/api-server/src/db.ts` — DB connection (node-postgres pool) + schema migration helpers
- `artifacts/api-server/src/storage.ts` — Data access layer (ExternalAPIStorage class)
- `lib/db/src/schema/schema.ts` — Drizzle ORM schema (source of truth for all DB tables)
- `shared/` — Types shared between frontend and backend (`schema.ts`, `rewardConfig.ts`)
- Auslan companions + live captions: API in `artifacts/api-server/src/auslanCompanions.ts` (companion CRUD + object-storage ACL lifecycle + `accessibility` browse filter helper) and `artifacts/api-server/src/eventTranscripts.ts` (shared transcript helper: get/append/finalize); event caption routes live in `engagement.ts`, club caption routes in `platformRoutes.ts`. Frontend: `artifacts/accessibooks/src/components/auslan-companion.tsx` (viewer + admin manager, surfaced in `pages/player.tsx` and `components/ebook-reader.tsx`), browse filter in `pages/library.tsx`, event captions UI in `pages/events.tsx`

## Architecture decisions

- **No OpenAPI spec**: The migration preserved the original fetch-based API client (`src/lib/queryClient.ts`) rather than generating hooks from an OpenAPI spec — the original had no spec.
- **DB driver**: api-server uses `drizzle-orm/node-postgres` (standard pg pool), not the Neon HTTP driver that ships with the workspace template — this project uses a standard Postgres DB.
- **@shared alias**: Frontend resolves `@shared/*` via Vite alias pointing to `shared/` at workspace root; `drizzle-orm` and `zod` are installed at workspace root devDeps so Vite can resolve them.
- **TensorFlow ML**: The CF recommender model (`recommendation/cfModel.ts`) lazy-imports `@tensorflow/tfjs-node` with a try/catch so the server starts without it.
- **Express 5 routes**: Wildcard routes use `/*name` syntax (not the Express 4 `/*` or `/:param(*)` syntax).
- **Mobile voice mode**: STT is server-side (`POST /api/voice/transcribe`, gpt-4o-mini-transcribe) but intent parsing is client-side keyword matching in `lib/voice.tsx`. The route is `isAuthenticated` + a dedicated per-user voice rate limiter + a 3MB raw-body cap + a 415 content-type allowlist, because every call hits a paid AI model — **voice requires sign-in by design** (cost/DoS control). Screens register handlers via `useVoiceCommands`; navigation handlers are global. Audio bytes and transcripts are never logged.
- **Mobile player is a native modal**: `app/player/[id].tsx` is `presentation: "modal"`, so the global mic overlay rendered in `_layout.tsx` cannot cover it — the player renders its own in-screen mic/download controls. Any new always-on-top control must be rendered inside the modal screen, not just in `_layout`.
- **Mobile progress is local-only (drift)**: there is no server progress-sync endpoint, so downloaded-title playback position is persisted on-device (AsyncStorage via `lib/progress.ts`). Do not assume a sync API exists.
- **No chapter model (drift)**: there is no chapter data model, so voice "next/previous chapter" maps to skip-forward/back and "chapter N" gives honest "no chapters" feedback.
- **Progress goals + consent-bounded reports**: `progress_goals` table (metrics: listening_minutes, books_completed, active_days, transcript_opens; periods: week/month) drives caregiver/therapist progress reports built on the #67 activity-sharing infra. Goal CRUD is auth-only (goals are config); progress aggregation + reports stay opt-in-gated. A partial unique index `(user_id, metric, period) WHERE archived_at IS NULL` enforces one active goal per measure/period. In a shared/scoped report EVERY section (goal trends AND per-book listening history) is date-bounded to the share range so a narrow share cannot leak out-of-range history — see `.agents/memory/consent-bounded-reports.md`. Aggregation in `artifacts/api-server/src/userActivity.ts` (`computeGoalProgress`, `buildReport`).
- **Auslan companion ACL lifecycle**: companion videos are uploaded to object storage and the object ACL is kept in lockstep with publication status — public **only** when `status='published'`, private otherwise, and public read is revoked on unpublish/archive/delete. Create validates the path-encoded uploader and the **real** storage metadata (content-type allowlist + 500MB size cap), not client-declared values. ACL/DB writes are sequenced fail-closed (make-public after the DB commit, make-private before it) so a failure never leaves unpublished/deleted media publicly fetchable. See `.agents/memory/public-media-acl-lifecycle.md`.
- **Event/club transcripts**: `POST /api/events` is `requireAdmin`, so event hosts are always admins — caption entry + finalize are admin-gated by design (no separate host role); reading-club captions are creator-OR-admin. One transcript per source (`eventTranscripts` unique on `(sourceType, sourceId)`); cue text is rendered as React text nodes, never HTML. See `.agents/memory/event-captions-admin-gating.md`.
- **SEO/GEO landing pages (server-rendered)**: `artifacts/api-server/src/seoPages.ts` (`registerSeoPageRoutes`) serves crawler-facing HTML at `/book/:id`, `/author/:name`, `/accessible[/:feature]`, `/collections[/:slug]` plus `/sitemap*.xml` — published-only data everywhere (draft books 404 with noindex), JSON-LD (Audiobook/Book, Person, ItemList, BreadcrumbList, FAQPage), no fabricated reviews/metrics. Hubs with <5 titles render `noindex, follow` and are excluded from sitemaps. Canonical origin from `CANONICAL_ORIGIN` env (prod default `https://accessibooks.org`; dev falls back to request host). HTML cached 15min (book/author pages too — the published gate stays per-request so unpublishing 404s immediately), sitemaps cache the rendered XML 1h. Scale guards (catalogue is seeder-inflated to 1M+ rows): book sitemap capped at 45k content-rich titles and author sitemap at top 10k authors (sitemap protocol caps files at 50k URLs); related-titles/author queries are exact-equality served by `idx_books_author_hash`/`idx_books_genre_hash` **hash** indexes (btree fails — some imported rows exceed its 2.7KB row cap), auto-created at startup via `ensureSeoIndexes()`; `cached()` coalesces in-flight fetches to prevent cold-cache stampedes. The proxy routes these path prefixes to api-server (see `artifacts/api-server/.replit-artifact/artifact.toml`); prefix matching is segment-safe — SPA routes like `/accessible-picks` still reach the frontend. Pages link into the app via `/?book=<id>` / `/?author=<name>` deep links handled by a mount-only effect in `App.tsx`; footer "Browse" column + `llms.txt` + `vercel.json` rewrites point at them.
- **Narration read-along (web)**: word-by-word highlight as AI narration plays is a frontend-only consumer (`NarrationReadAlong` in `accessibooks/src/components/ai-narration-panel.tsx`). It renders text FROM the manifest `chapters[].timing` (real per-word ElevenLabs marks, chapter-relative seconds), highlights the active word via an rAF loop on the shared `<audio>`, supports tap-to-seek + an On/Off toggle, and falls back to plain playback when a chapter has no timing. It does not touch `book_transcripts` or the book DOM. See `.agents/memory/read-along-timing.md`.

## Developer notes (accessibility-first upgrade)

- **Transcript data model**: `book_transcripts` (`lib/db/src/schema/schema.ts`) holds per-book transcript content with a `qualityStatus` lifecycle (`missing | pending | draft | reviewed | published`). The `books.transcriptAvailable` boolean is a **display/search hint only** — it is NOT an access gate. Word-by-word narration read-along timing is separate: it comes from the narration manifest (`chapters[].timing`), not from `book_transcripts` (see Architecture decisions → Narration read-along).
- **Accessibility metadata**: on `books` — `accessibilityTags` (text array; search/browse facet, e.g. `captioned`, `audio-described`, `dyslexia-friendly`, `easy-read`, `auslan`), `narrationType` (`human | ai | null`), `transcriptAvailable` (boolean). All are display/search hints, never access gates. The search API (`GET /api/books/search`) filters by `transcriptAvailable`, `language`, `narrationType`, `genre`, `chapterLength` (short<5h / medium 5–15h / long>15h, audiobooks only), and `accessibilityTags` (comma-separated, ALL must match).
- **Admin security assumptions**: admin authority is server-enforced only. `isAdminUser(user)` in `multiAuth.ts` returns true if `user.role === 'admin'` **OR** the user's email is in the `ADMIN_EMAILS` allow-list (backward-compat deviation — the original app had role-only; email allow-list was added additively). `requireAdmin` middleware guards every privileged route; the frontend also hides admin nav/routes (`AdminOnly` guard in `App.tsx`) but that is UX only — never a security boundary.
- **How to configure `ADMIN_EMAILS`**: set the env var to a list of admin emails separated by comma, semicolon, or whitespace (e.g. `ADMIN_EMAILS="a@x.com, b@y.com"`). `parseAdminEmails()` fail-closes: it lowercases, dedupes, and drops entries without an `@`/`.` or shorter than 4 chars. If unset in production, email-based admin is disabled and a startup warning is logged (only `role='admin'` users are admins). A malformed/empty value grants nothing.
- **How to create/publish a book safely**: new books default to `status='draft'` when incomplete; `draft` books are excluded from public catalog/search queries and their detail is gated. Only publish (`status='published'`) once required fields validate. Existing/seeded rows default to `published` for backward-compat. Never rely on path/ID guessability for privacy — the status gate is enforced server-side.
- **Known limitations & next steps**: (1) `chapterLength` is derived from total audiobook duration — there is no chapter data model yet. (2) Some external-provider catalogue results lack transcripts/accessibility metadata; features are labelled per title so users can choose. (3) Public legal/accessibility pages ship with concise placeholder copy and a placeholder contact (`accessibility@accessibooks.org`) — finalise before general release. (4) Mobile playback progress is local-only (no server sync endpoint).

## Product

AccessiBooks provides:
- Browse and stream 3000+ audiobooks and ebooks from LibriVox, Project Gutenberg, Internet Archive, Open Library, iTunes
- Accessible reading modes: Easy English, visual reading, text-to-speech, adjustable fonts/contrast
- User accounts with subscriptions (Free, Plus, Premium) via Stripe
- Battle pass gamification, reading challenges, streaks, XP, achievements
- Listening rooms (social co-listening), reading clubs, author profiles
- Ad platform for publishers and advertisers
- Accessibility features: switch access, screen reader optimizations, dyslexia mode
- Caregiver/therapist progress reports: users set literacy/listening goals and share a consent-based, read-only, print-to-PDF progress report (goals + per-period trends bounded to the shared date range)
- Accessible live events & Auslan: human-entered live captions on author events and reading-club sessions, saved as a transcript; human-produced Auslan video companions linked to titles and surfaced in the reader/player; "Auslan / Captioned / Accessible" browse filter for discovery

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm --filter @workspace/db run push` is interactive — it asks about potential table renames; always choose "create table" for new tables. To apply schema non-interactively, use `drizzle-kit generate` then `psql $DATABASE_URL -f lib/db/drizzle/<migration>.sql`.
- The api-server dev workflow builds then starts (`pnpm run build && pnpm run start`) — build takes ~1s via esbuild.
- Auth0, Stripe price IDs, PayPal, Coinbase, etc. all show startup warnings in dev — these are expected without those API keys configured.
- The `shared/` directory at workspace root is NOT a pnpm workspace package; it's accessed via Vite alias (`@shared`) on the frontend and direct imports on the backend.

## Editor config (Cursor / VS Code)

- `.cursor/rules/*.mdc` and `.vscode/settings.json` mirror stack/convention facts from this file and `threat_model.md` so editors give accurate AI context.
- **Keep them in sync:** when stack facts change (new package, auth provider, route pattern, moved file, renamed convention), update the matching `.cursor/rules/*.mdc` rule alongside `replit.md`.
- Run `pnpm --filter @workspace/scripts run check:cursor-rules` to catch drift — it fails if a rule references a workspace package or repo path that no longer exists.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
