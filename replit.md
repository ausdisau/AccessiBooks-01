# AccessiBooks

AccessiBooks is a fullstack accessible audiobooks and e-reading platform — audiobooks, ebooks, and magazines designed for users with disabilities, from Australian Disability Ltd.

## Run & Operate

- `pnpm --filter @workspace/accessibooks run dev` — run the frontend (Vite, auto-assigned port)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only, interactive prompt)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v3, wouter router, TanStack Query
- API: Express 5 + pino logging
- DB: PostgreSQL + Drizzle ORM (node-postgres driver)
- Auth: Passport.js (local + Auth0/Google/Facebook/Microsoft OAuth)
- Payments: Stripe
- Build: esbuild (ESM bundle) for api-server, Vite for frontend

## Where things live

- `artifacts/accessibooks/` — React/Vite frontend; all UI in `src/App.tsx` (large single-file component) and `src/components/`
- `artifacts/api-server/src/` — Express server; `routes/routes.ts` is the main route file (6000+ lines)
- `artifacts/api-server/src/db.ts` — DB connection (node-postgres pool) + schema migration helpers
- `artifacts/api-server/src/storage.ts` — Data access layer (ExternalAPIStorage class)
- `lib/db/src/schema/schema.ts` — Drizzle ORM schema (source of truth for all DB tables)
- `shared/` — Types shared between frontend and backend (`schema.ts`, `rewardConfig.ts`)

## Architecture decisions

- **No OpenAPI spec**: The migration preserved the original fetch-based API client (`src/lib/queryClient.ts`) rather than generating hooks from an OpenAPI spec — the original had no spec.
- **DB driver**: api-server uses `drizzle-orm/node-postgres` (standard pg pool), not the Neon HTTP driver that ships with the workspace template — this project uses a standard Postgres DB.
- **@shared alias**: Frontend resolves `@shared/*` via Vite alias pointing to `shared/` at workspace root; `drizzle-orm` and `zod` are installed at workspace root devDeps so Vite can resolve them.
- **TensorFlow ML**: The CF recommender model (`recommendation/cfModel.ts`) lazy-imports `@tensorflow/tfjs-node` with a try/catch so the server starts without it.
- **Express 5 routes**: Wildcard routes use `/*name` syntax (not the Express 4 `/*` or `/:param(*)` syntax).

## Product

AccessiBooks provides:
- Browse and stream 3000+ audiobooks and ebooks from LibriVox, Project Gutenberg, Internet Archive, Open Library, iTunes
- Accessible reading modes: Easy English, visual reading, text-to-speech, adjustable fonts/contrast
- User accounts with subscriptions (Free, Plus, Premium) via Stripe
- Battle pass gamification, reading challenges, streaks, XP, achievements
- Listening rooms (social co-listening), reading clubs, author profiles
- Ad platform for publishers and advertisers
- Accessibility features: switch access, screen reader optimizations, dyslexia mode

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
