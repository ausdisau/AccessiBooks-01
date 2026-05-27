# Deploying AccessiBooks (Next.js) to Vercel

This guide walks through a fresh Vercel deployment of
`artifacts/accessibooks-next`. The legacy Replit app
(`artifacts/accessibooks` + `artifacts/api-server`) keeps running during
the migration window — this deploy is **additive**.

## Prerequisites

- A Vercel account with the [Vercel CLI](https://vercel.com/docs/cli) installed (`npm i -g vercel`).
- A reachable Postgres instance (the same one the legacy Express server uses).
- Stripe account in test mode with at least one Plus and one Premium price.
- Auth0 application configured (Replit-managed tenant works; see `.local/skills/clerk-auth` for the alternative).
- A Resend account with a verified sending domain (magic-link login).

## 1. Create the Vercel project

From the repo root:

```sh
cd artifacts/accessibooks-next
vercel link            # link this directory to a new or existing Vercel project
```

When prompted, accept the detected Next.js framework and the default build
command (`next build`). The `vercel.json` in this directory pins the region
to `iad1` and declares cron schedules + function runtimes — do not override
those in the dashboard.

## 2. Configure environment variables

Open the Vercel dashboard → **Settings → Environment Variables** and add
every variable from `.env.example`. Group them by environment:

| Scope            | Use for                                     |
|------------------|---------------------------------------------|
| **Production**   | Real Stripe live keys, prod OAuth callbacks |
| **Preview**      | Stripe test keys, OAuth apps in test mode   |
| **Development**  | `vercel dev` local runs (rarely needed)     |

Critical ones that have no sensible default:

- `DATABASE_URL` — pooled connection string. Vercel functions are
  serverless, so use the **pooled** endpoint, not the direct one.
- `JWT_SECRET` — must equal the legacy Express server's `JWT_SECRET` so
  bearer tokens are bit-compatible during cutover.
- `STRIPE_WEBHOOK_SECRET` — set after step 4 below.
- `CRON_SECRET` — Vercel generates this automatically when you enable
  cron in the dashboard; copy the value here so local `curl` testing
  works too.
- `LEGACY_API_URL` + `INTERNAL_CRON_TOKEN` — leave unset on the very
  first deploy. Cron jobs will no-op (returning `status: "skipped"`)
  until the legacy backend exposes `/api/internal/cron/*` endpoints.

## 3. Point at the existing Postgres

No schema changes are needed — this app reads/writes the same Drizzle
schema via `@workspace/db`. Verify connectivity from your local shell:

```sh
psql "$DATABASE_URL" -c "select count(*) from users;"
```

If the legacy app uses Replit's built-in Postgres, expose it to Vercel
either by promoting it to a managed provider (Neon, Supabase, Vercel
Postgres) or by tunnelling through a public endpoint. See `replit.md`
for the current DB host.

## 4. Configure the Stripe webhook

1. After the first deploy succeeds, copy the production URL
   (`https://<your-project>.vercel.app`).
2. In the Stripe dashboard → **Developers → Webhooks → Add endpoint**,
   set the URL to:
   `https://<your-project>.vercel.app/api/billing/webhook`
3. Subscribe to these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
4. Copy the signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`
   on Vercel and redeploy.

## 5. Configure OAuth callbacks

For each provider, add the redirect URL to the provider's app config:

| Provider   | Callback URL                                                 |
|------------|--------------------------------------------------------------|
| Auth0      | `https://<your-domain>/api/auth/callback/auth0`              |
| Google     | `https://<your-domain>/api/auth/callback/google`             |
| Facebook   | `https://<your-domain>/api/auth/callback/facebook`           |
| Microsoft  | `https://<your-domain>/api/auth/callback/microsoft`          |

For Auth0 specifically, also add the URL to **Allowed Logout URLs** and
**Allowed Web Origins**.

## 6. Verify Resend DNS

In Resend, your sending domain (e.g. `accessibooks.example`) must show
**Verified** for SPF, DKIM, and the return-path CNAME. Magic-link emails
silently fail if DKIM is missing. Set `MAGIC_LINK_FROM` to an address on
that verified domain.

## 7. First deploy

```sh
cd artifacts/accessibooks-next
vercel --prod
```

Expected output (abridged):

```
Vercel CLI 32.x
🔍  Inspect: https://vercel.com/<team>/accessibooks-next/<id>
✅  Production: https://<your-project>.vercel.app  [~90s]
```

## 8. Smoke test

```sh
pnpm --filter @workspace/accessibooks-next smoke https://<your-project>.vercel.app
```

Expected: every line ends in `OK` and the script exits 0. Any non-2xx
response prints `FAIL` with the status code and exits 1.

## 9. Verify crons

In the Vercel dashboard → **Cron Jobs**, all four jobs should appear
with their schedules. Trigger one manually with **Run Now** and confirm
the function log shows either `status: "forwarded"` (if the legacy URL
is set) or `status: "skipped"` (if not). Either is success.

## Out of scope

- **Custom domain** — add via Vercel dashboard → Domains. Update OAuth
  callbacks and `STRIPE_WEBHOOK_SECRET` afterwards.
- **Alerting** — Vercel's default function-error notifications are
  enabled by default; integrate Sentry / Datadog separately if needed.
- **Production Postgres provisioning** — assumed to already exist.
