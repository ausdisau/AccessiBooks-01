# AccessiBooks

An accessible multi-format content platform for audiobooks, ebooks, podcasts, and magazines — with a 3-tier subscription model, library loans, and comprehensive accessibility features.

## Quick start

```bash
npm install
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and SESSION_SECRET
npm run db:push    # sync schema to PostgreSQL (Neon)
npm run dev        # http://localhost:5000
```

The dev server loads environment variables from `.env` automatically (via `dotenv`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express + Vite on port 5000 |
| `npm run build` | Build client (`dist/public`) and server (`dist/index.js`) |
| `npm start` | Run production build |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Push Drizzle schema to PostgreSQL |

## Documentation

- **[Product spec & architecture](docs/ACCESSIBOOKS.md)** — canonical overview, features, and implementation status
- **[Environment variables](.env.example)** — all supported config keys
- **[DRM integration (deferred)](docs/DRM-INTEGRATION.md)** — monorepo DRM service roadmap
- **[Cursor dev guide](.cursorrules)** — engineering conventions for agents and contributors

## Tech stack

React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, wouter, Express, Passport.js, Drizzle ORM, PostgreSQL (Neon), Stripe.

## Project layout

```
client/src/     Frontend (React)
server/         Backend (Express API)
shared/         Drizzle schema + shared types
services/drm/   DRM microservice (deferred integration)
apps/web/       Future standalone web app (stub)
```
