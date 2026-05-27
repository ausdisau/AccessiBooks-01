# AccessiBooks (Next.js)

The Next.js + Vercel-bound port of AccessiBooks. The original React + Vite
client lives in `artifacts/accessibooks/` and the Express API in
`artifacts/api-server/`; both remain the source of truth until this app
reaches feature parity.

## Run

```sh
pnpm --filter @workspace/accessibooks-next run dev        # next dev
pnpm --filter @workspace/accessibooks-next run typecheck  # tsc --noEmit
pnpm --filter @workspace/accessibooks-next run build      # next build
```

Required env: `DATABASE_URL`, `JWT_SECRET` (or `SESSION_SECRET`). Optional
Stripe + OAuth keys are documented in `.env.example`.

## Stack notes

- **DB**: Drizzle via `@workspace/db` (same Postgres schema as the legacy
  Express server). The migration spec mentioned Prisma; we kept Drizzle so
  the schema doesn't fork between the two apps during cutover.
- **Auth**: NextAuth v5 with HS256 JWTs that are bit-compatible with the
  legacy server's `signAccessToken()` tokens — the React client's
  `Authorization: Bearer …` bootstrap keeps working across both backends.
- **Billing**: Stripe routes under `app/api/billing/{checkout,portal,webhook}`.
  The webhook route is `runtime = "nodejs"` and reads the raw body via
  `request.text()` so signature verification works.

## Battle pass: removed during Next.js migration

The Battle Pass feature (seasons, tier milestones, paid season pass,
season leaderboard, claimable rewards) is **intentionally not ported** to
this app. The legacy implementation is still available in:

- `artifacts/accessibooks/src/components/battle-pass.tsx` — UI
- `artifacts/api-server/src/routes/routes.ts` — `/api/battle-pass/*` routes
- `lib/db/src/schema/schema.ts` — `battle_passes`, `battle_pass_milestones`,
  `battle_pass_purchases` tables (still used by the legacy server)

The shared `@workspace/db` package therefore still exports
`battlePasses`, `BattlePass`, etc. — these are deliberately not imported
anywhere in `artifacts/accessibooks-next/`. A repo-wide grep confirms it:

```sh
rg -i 'battle.?pass|seasonPass|battlePass' artifacts/accessibooks-next/
# → no matches
```

XP, streaks, daily goals and the achievement catalogue are preserved
(those flow through the existing `/api/gamification/*` routes that this
app still calls on the legacy server during the migration window).
