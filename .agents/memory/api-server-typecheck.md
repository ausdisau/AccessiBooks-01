---
name: api-server typecheck is pre-existing broken
description: Why `tsc --noEmit` fails for artifacts/api-server and how to verify changes there
---
`pnpm --filter @workspace/api-server run typecheck` (tsc --noEmit) does NOT pass — the package ships ~647 pre-existing errors, overwhelmingly `TS7030 "Not all code paths return a value"` across nearly every file (routes.ts alone has hundreds), plus `string | string[]` drizzle `eq()` overload errors from un-narrowed `req.params`/`req.query`, and several `TS2307 Cannot find module './replit_integrations/...'`.

**Why:** The runtime build uses esbuild (`build.mjs`), which does not typecheck, so the server builds and runs fine despite these. tsc strictness (noImplicitReturns) was never satisfied.

**How to apply:** Do not expect a clean api-server tsc. A full run also takes >2 min (sometimes ~30 min when seeders load the machine), so it routinely exceeds the 120s bash timeout. To verify api-server changes: (1) restart the `artifacts/api-server: API Server` workflow and confirm it boots ("Server listening"), (2) curl endpoints via the shared proxy at `localhost:80/api/...` (never the service port). For your own new code, coerce `req.params.x`/`req.query.x` with `String(...)` to avoid the `string | string[]` errors, and `return res....()` in catch blocks.
