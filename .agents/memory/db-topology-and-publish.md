---
name: DB topology & production schema (publish flow)
description: What database the app actually uses, and the ONLY safe way to fix production schema drift. Read before any prod-DB or "missing column in production" work.
---

# DB topology & production schema flow

## What the app connects to
- The app connects **only via `DATABASE_URL`** (`artifacts/api-server/src/db.ts` = `CUSTOM_DATABASE_URL || DATABASE_URL`, `lib/db/src/index.ts`, the `multiAuth.ts` session store, and `lib/db/drizzle.config.ts`). `CUSTOM_DATABASE_URL` is unset.
- `DATABASE_URL` points to **Replit-managed PostgreSQL** (host `helium` / db `heliumdb`), NOT Supabase.
- The `SUPABASE_*` env secrets are a **red herring** — they are NOT referenced by any app/config code (they only appear in an `attached_assets/` paste tied to the untouched `accessibooks-next` scaffold). Do not assume this app uses Supabase.

## Dev vs prod are SEPARATE managed DBs
- Development and production are two separate Replit-managed Postgres databases. `executeSql({environment:"production"})` is a **read-only** replica (SELECT only; DDL is blocked).
- **Verified drift example:** prod `users` was missing exactly `subscription_status` + `subscription_provider` while dev had them — that mismatch is what breaks sign-up (Drizzle `INSERT ... RETURNING` enumerates every schema column → PG 42703 → 500).

## The ONLY safe way to fix production schema drift
**Re-publish.** Replit's Publish flow diffs the dev schema against prod and applies the (additive) diff to production. Purely additive nullable columns publish with no rename prompt and no data loss.

**Never** (per the database skill):
- run DDL against prod (`psql`/`drizzle-kit push` on a prod URL, or `executeSql` prod — it's read-only),
- put `db:push`/`push-force` in the deploy build (`.replit [deployment]` / `artifact.toml`),
- add startup-time DDL to "self-heal" prod.

## Gotcha: existing startup-DDL self-heal pattern
`db.ts` already has many `ensureXxxSchema()` helpers that run `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on every boot (incl. in prod). They self-heal SOME columns but **not** `subscription_status`/`subscription_provider` — which is why only those drifted in prod. Do NOT extend this discouraged pattern to "fix" new columns; use the publish flow.

**Why:** the Supabase secrets make it look like an external DB, and the tempting fixes (manual prod DDL / deploy hook / startup DDL) are all forbidden for Replit-managed Postgres. The supported path is re-publish.
