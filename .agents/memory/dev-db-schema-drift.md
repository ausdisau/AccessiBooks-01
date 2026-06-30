---
name: dev DB schema drift vs Drizzle schema
description: The dev Postgres can lag behind lib/db schema.ts; inserts fail on missing columns.
---

The dev database can be missing columns that exist in the Drizzle source-of-truth
schema (`lib/db/src/schema/schema.ts`), because `drizzle-kit push` is interactive
and often skipped. Example seen: `users.subscription_status` was declared in the
schema but absent in the dev DB, so `POST /api/auth/register` returned 500 with
`column "subscription_status" of relation "users" does not exist`.

**Why:** push is interactive (prompts about unrelated table renames), so schema
changes get applied piecemeal via psql and individual columns/tables drift.

**How to apply:** when a route 500s with a Postgres `42703` (undefined column),
don't assume a code bug — diff the DB against schema.ts and add the missing
column directly: `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>;`. For
brand-new tables, create them with psql rather than fighting the interactive push.

**Which DB / how to connect (dev):** the running api-server uses the LOCAL Replit
Postgres (host `helium`) via `DATABASE_URL` (CUSTOM_DATABASE_URL is unset). The
`PG*` vars are set in the shell, so bare `psql -c "..."` (no conn arg) hits the
exact DB the dev server reads/writes — use that for DDL. The `SUPABASE_*` secrets
are a DIFFERENT database (not the dev server's): `SUPABASE_DB_URL`/`POOLER_URL`
are unreachable from this sandbox and `SUPABASE_DATABASE_URL` has no `postgres://`
scheme so psql misparses it (connects to helium with the host as the dbname).
Don't use the SUPABASE_* URLs for dev migrations.
