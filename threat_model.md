# Threat Model

## Project Overview

AccessiBooks is a full-stack audiobook and e-reading platform with a React web client, an Expo mobile client, an Express 5 API server, PostgreSQL via Drizzle, Passport-based session auth, Stripe billing, and several third-party content and AI integrations. The production security model is centered on the Express API in `artifacts/api-server/src`, which mediates access to user accounts, subscriptions, private uploads, social features, author submissions, ad-platform data, ingestion jobs, and external payment/auth providers.

## Assets

- **User accounts and sessions** — session cookies, local-password credentials, OAuth identities, magic-link tokens, and account profile data. Compromise enables account takeover and unauthorized access to subscriptions, purchases, and social data.
- **Private user and creator content** — uploaded audiobooks, ebooks, covers, ad creatives, author submissions, and draft assets stored through object storage. Exposure can leak unpublished works, private media, or hosted arbitrary attacker content.
- **Subscription and payment state** — Stripe customer IDs, subscription tiers, transaction history, payout state, advertiser balances, and billing workflows. Tampering can grant premium access or trigger unauthorized financial operations.
- **Accessibility and activity data** — listening history, preferences, transcripts, annotations, social activity, moderation reports, and churn analytics. This includes user-sensitive behavioral and operational data that should be tightly scoped by role.
- **Application secrets and integration credentials** — database URL, session secrets, webhook secrets, Auth0 credentials, Stripe secrets, OpenAI keys, and storage-sidecar trust. Leakage or misuse would compromise the whole platform.

## Trust Boundaries

- **Browser/mobile client to API** — all client input is untrusted. The server must authenticate, authorize, validate, and rate-limit requests regardless of any frontend checks.
- **API to PostgreSQL** — the API has broad data access. Injection or missing row-level authorization at the API layer can expose or modify application data.
- **API to object storage** — the API mints upload URLs and serves stored objects. Broken ACL enforcement here can expose private media or let attackers upload arbitrary files.
- **API to external identity/payment providers** — Auth0/OIDC and Stripe callbacks must be validated carefully. Redirect and webhook flows are sensitive to spoofing and tampering.
- **Public vs authenticated vs privileged roles** — the app mixes anonymous browsing with authenticated user features and privileged roles such as admin, advertiser, publisher, and author. These boundaries must be enforced server-side on every route.
- **Public ingestion and admin-operational surfaces** — podcast ingestion and catalog seeding cross into external networks and expensive background work. These routes require strong abuse controls and explicit privilege checks.
- **Production vs dev-only code** — `.migration-backup/` and `artifacts/mockup-sandbox/` are treated as non-production unless reachability is proven. Repeated scans should avoid spending time there.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/routes.ts`
- Highest-risk areas: `auth.ts`, `multiAuth.ts`, `platformRoutes.ts`, `routes/routes.ts`, `selfPublishing.ts`, `replit_integrations/object_storage/**`, `podcastIngestion.ts`, `rss.ts`, `catalogSeeder.ts`, `billing.ts`, `subscriptionService.ts`, `adPlatformRoutes.ts`
- Public surfaces: catalog/search, share links, some ad-serving/click routes, webhook endpoints, object routes, podcast ingestion, seeder controls, health routes
- Authenticated/privileged surfaces: billing, account/activity, ad platform, author portal, admin entitlement/revenue/moderation/analytics flows
- Usually dev-only and ignorable: `.migration-backup/**`, `artifacts/mockup-sandbox/**`

## Threat Categories

### Spoofing

The application supports local auth, OAuth, Auth0, and magic-link login. It must ensure that authentication artifacts are bound to trusted origins and that callbacks, logout flows, and provider-specific routes cannot be steered by attacker-controlled headers or parameters. Webhooks from Stripe and other providers must be accepted only after signature verification.

### Tampering

Clients can submit book metadata, creator assets, ad creatives, billing actions, preferences, social content, and ingestion targets. The server must enforce business rules and ownership server-side, validate all uploaded object references, and ensure that privileged state changes such as entitlement updates, campaign actions, moderation actions, and subscription changes cannot be modified by unauthorized users.

### Information Disclosure

The platform stores sensitive behavioral and uploaded content, not just profile fields. API responses and object-storage routes must ensure users can access only their own private data or explicitly public assets. Error handling and logs must avoid exposing secrets, raw tokens, or internal stack details.

### Denial of Service

The product exposes expensive flows such as login, magic-link delivery, AI-assisted conversions, third-party fetches, file uploads, catalog seeding, and public ingestion endpoints. Production must apply practical abuse controls including request throttling, bounded body sizes, privilege checks, and conservative external-call patterns so unauthenticated or low-cost requests cannot exhaust email, storage, compute, or third-party API budgets.

### Elevation of Privilege

Because the server mixes anonymous, subscriber, author, advertiser, publisher, and admin functionality inside one large route surface, broken access control is a primary risk. Every route that reads or mutates user, creator, payout, entitlement, moderation, or billing state must enforce ownership or role checks on the server, and storage-backed files must not become public merely because a path is guessable.
