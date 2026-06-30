---
name: api-server workflow restart times out
description: Why restart_workflow times out for the AccessiBooks api-server and how to verify the server instead
---

# api-server: restart_workflow times out; verify via single-call background boot

`restart_workflow "artifacts/api-server: API Server"` reliably TIMES OUT even though the server boots fine. The dev command is `build && start`; `server.listen()` fires early and logs `Server listening`, but the listen callback then kicks off heavy background work (RuntimeRefresh ingesting ~1100 books + catalog seeders for librivox/gutenberg/openlibrary/internetarchive). That churn starves the workflow readiness probe, so the restart reports TIMED_OUT and tears the process back down ("finished").

**Why:** the timeout is an environment/readiness-probe artifact of the slow startup ingestion, NOT a code error. Do not keep retrying restart — verify the server a different way.

**How to apply (verifying backend changes without the workflow):**
- The service port is 8080 (`artifact.toml` localPort 8080, paths `/api`,`/objects`). Build with `pnpm --filter @workspace/api-server run build` (esbuild → `dist/index.mjs`).
- Background processes do NOT survive across separate bash tool calls — start, wait, curl, and kill must all be in ONE bash invocation.
- Pattern: `NODE_ENV=development PORT=8080 node dist/index.mjs > /tmp/log 2>&1 &` → poll log for `Server listening` (≈5s) → `curl localhost:8080/api/...` → `kill`.
- Pre-existing ignorable boot noise: express-rate-limit IPv6 `ValidationError` (auth.ts/multiAuth.ts), seedPlans fail, monthly allowance sweep "subscription_status does not exist", Auth0 grant-type warning.
