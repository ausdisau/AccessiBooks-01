---
name: api-server typecheck
description: Why a clean api-server tsc is not a realistic gate, and how to verify changes instead.
---

The `@workspace/api-server` package does **not** typecheck cleanly — running `tsc -p tsconfig.json --noEmit` (or the root `pnpm run typecheck`) surfaces hundreds of pre-existing errors (e.g. `vastParser.ts` TS2812 DOM-ish property access, and many others) unrelated to any given change.

**Why:** The codebase predates strict settings in places and was migrated; these errors were never cleaned up. They are not caused by your edits.

**How to apply:**
- Do NOT treat api-server tsc failure as a signal your change is broken.
- Verify api-server changes by restarting its workflow and confirming a clean boot + hitting endpoints with curl (through the shared proxy at `localhost:80`, e.g. `localhost:80/api/...`).
- The gates that MUST stay clean are `pnpm run typecheck:libs` (composite libs incl. `@workspace/db`) and the `@workspace/accessibooks` frontend typecheck.
- The accessibooks frontend typecheck is slow (~8–9 min). Running `tsc` on it directly from bash tends to get killed (resource limit, exit -1 / no output); use the `typecheck` workflow and read its log instead.
