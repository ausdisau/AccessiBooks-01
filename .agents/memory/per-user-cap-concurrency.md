---
name: Per-user cap concurrency
description: How to enforce "max N rows per user" caps so they hold under concurrent requests
---

**Rule:** A "user may have at most N pending/active rows" cap enforced as SELECT count → INSERT is race-prone: concurrent requests each read N-1 and all insert, busting the cap. Under READ COMMITTED even a single guarded `INSERT … SELECT WHERE (SELECT count(*) …) < N` does not fully serialize. Wrap the count + insert in a transaction that first takes `SELECT pg_advisory_xact_lock(hashtext('scope:' || userId))` — the per-user advisory lock serializes submissions cheaply and releases automatically at commit.

**Why:** Code review flagged the community-annotations 20-pending anti-spam cap as bypassable under concurrency; the advisory-xact-lock transaction was the accepted fix. The same applies to any future quota (e.g. institutional seat grants — a task exists for over-granting protection).

**How to apply:** In drizzle: `db.transaction(async tx => { await tx.execute(sql\`SELECT pg_advisory_xact_lock(hashtext(${'scope:' + userId}))\`); …count…; if (count >= CAP) return null; …insert…; })` and translate a null result into a 429. Key the lock string by feature scope so unrelated caps don't contend.
