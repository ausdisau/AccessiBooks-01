---
name: Dual schema sync (lib/db vs shared)
description: This repo has TWO independent Drizzle schemas; a DB table change must be mirrored in both or frontend/backend types drift.
---

The api-server imports DB tables from `@workspace/db` (`lib/db/src/schema/schema.ts`), but the **frontend** (`artifacts/accessibooks/*`) imports the SAME tables from a SEPARATE duplicate file `shared/schema.ts` (resolved via the Vite `@shared` alias). These are two independent `pgTable` definitions of the same tables, not one shared source.

**Rule:** Any column/index change to a battle-pass / shared table must be made in BOTH `lib/db/src/schema/schema.ts` AND `shared/schema.ts`, with matching column names, defaults, and indexes.

**Why:** The frontend's TS types (`BattlePassMilestone`, `BattlePassPurchase`, etc.) come from `shared/schema.ts`. If you only edit `lib/db`, the server compiles with the new fields but the frontend types silently lack them (or vice-versa), and the two can diverge without any typecheck failing — because neither imports the other.

**How to apply:** After editing one schema file, grep the other for the same `pgTable("...")` name and apply the identical change. `shared/` is NOT a pnpm workspace package, so `typecheck:libs` does NOT cover it — verify the frontend separately with `pnpm --filter @workspace/accessibooks run typecheck`.
