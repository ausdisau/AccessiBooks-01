# Vercel Deployment

This project is a pnpm monorepo with a Vite frontend (`@workspace/accessibooks`), an Express API (`@workspace/api-server`), and an Expo mobile app. Only the **Vite frontend** is set up for Vercel here. The API and mobile app must be hosted elsewhere.

## Frontend (Vercel)

The Vite frontend builds to a static bundle and works on Vercel out of the box.

### One-time setup

1. Push the repo to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New Project** → import the repo.
3. **Root Directory**: `artifacts/accessibooks` (Vercel will pick up `vercel.json` from here).
4. Leave Build/Install/Output settings on "default" — `vercel.json` overrides them.
5. Edit `artifacts/accessibooks/vercel.json` and replace `YOUR-API-HOST.example.com` in the `/api/:path*` rewrite with the public hostname of your API server (Railway, Fly, Render, etc.).
6. Deploy.

### Local Vercel CLI

```bash
npm i -g vercel
cd artifacts/accessibooks
vercel link
vercel --prod
```

## API server (NOT on Vercel)

The Express API in `artifacts/api-server` is a long-running Node process with:
- `express-session` + Postgres session store
- Stripe webhook signature verification (raw body)
- Pino structured logging
- Background jobs (catalog seeder, podcast ingestion, daily spend reset cron, runtime book refresh)
- WebSocket connections (listening rooms, notifications)
- TensorFlow lazy imports for recommendations

**None of these port cleanly to Vercel serverless functions.** Cold-start latency, per-request execution limits, and the lack of a long-lived process would break all the above.

### Recommended API hosts

- **Railway**, **Render**, **Fly.io** — Node app hosts that run the existing `pnpm --filter @workspace/api-server run dev` (or `build` + `start`) verbatim.
- Set `DATABASE_URL`, `SESSION_SECRET`, all Stripe / Auth0 / OpenAI keys, etc., on the host.
- Set CORS to allow the Vercel frontend's origin.

### Database

Vercel does not host PostgreSQL. Use:
- **Neon** (serverless Postgres, generous free tier) — set `DATABASE_URL` to the Neon connection string.
- **Supabase**, **Railway Postgres**, **Vercel Postgres**, or any standard Postgres.

The schema is managed by Drizzle: `pnpm --filter @workspace/db run push` to apply.

## Mobile app

The Expo app cannot be deployed to Vercel. Use **Expo Application Services (EAS)** to ship to TestFlight / Play Store.

## If you really want the API on Vercel

That requires rewriting `artifacts/api-server/src/routes/routes.ts` (6788 lines) and supporting modules as individual `api/*.ts` serverless functions, replacing `express-session` with a stateless JWT or signed-cookie scheme, moving background jobs to a separate worker (Vercel Cron / external scheduler), and finding alternative homes for the WebSocket and Stripe-raw-body paths. That work is tracked as a separate follow-up task — it's a multi-week effort.
