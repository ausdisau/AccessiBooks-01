---
name: Schema change rebuild
description: Steps required after adding a table to the lib/db drizzle schema
---
Rule: after editing `lib/db/src/schema/schema.ts`, (1) mirror the change in `shared/schema.ts` (dual schema), (2) run `npx tsc -b` inside `lib/db` so dist declaration files regenerate, (3) create the table in the dev DB via `psql "$DATABASE_URL"` DDL.

**Why:** api-server consumes `@workspace/db` through TypeScript project references — stale dist .d.ts makes tsc report "has no exported member" even though src exports it. drizzle push hangs on interactive prompts post-merge. Runtime (tsx) uses src directly, so the server can work while typecheck fails.

**How to apply:** any new table/column in the drizzle schema.

**Heavy-load caveat (July 2026):** when the box is saturated (task agents + seeders, <200Mi free), `tsc -b` in lib/db gets OOM-killed SILENTLY — empty log, no exit code, no dist update. `npx` can also hang before tsc even starts (use `node node_modules/typescript/lib/tsc.js -b` directly). Retry when memory frees (seeders finishing). Stale dist only breaks api-server tsc/LSP typings for new exports — esbuild runtime bundles from src and is unaffected, so this is never boot-blocking.
