---
name: api-server workflow restart
description: How restart_workflow behaves for the AccessiBooks api-server and how to verify the server.
---

# api-server: restart_workflow works with a 60s timeout

`restart_workflow "artifacts/api-server: API Server"` **succeeds when given `workflow_timeout: 60`** (observed multiple times). The dev command is `build && start`: esbuild build ~6s, then `server.listen()` fires and logs `Server listening port: 8080`. With 60s the readiness probe passes before the heavy post-listen background work (RuntimeRefresh ingesting ~1100 books + librivox/gutenberg/openlibrary/internetarchive seeders) can starve it.

**Why:** earlier sessions reported reliable TIMED_OUT, but that was at the default 30s timeout; the slow startup ingestion needs more headroom. Give 60s rather than assuming it will fail.

**How to apply (verifying backend changes):**
- Preferred: `restart_workflow` with `workflow_timeout: 60`, then `refresh_all_logs` and `curl localhost:80/api/...` through the shared proxy.
- The service port is 8080; the proxy routes `/api`,`/objects` to it. Build with `pnpm --filter @workspace/api-server run build` (esbuild → `dist/index.mjs`).
- DB URL is workflow-injected (`CUSTOM_DATABASE_URL || DATABASE_URL`); it is NOT in the bash shell env, so a manual `node dist/index.mjs` from bash throws "DATABASE_URL required". Use the workflow, not a manual boot.
- Pre-existing ignorable boot noise: express-rate-limit IPv6 `ValidationError` (auth.ts/multiAuth.ts), seedPlans fail, `bulletin_topics`/`subscription_status` seed errors, Auth0 grant-type warning.
