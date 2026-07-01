---
name: post-merge drizzle push hang
description: Why post-merge setup hangs on drizzle-kit push for new tables, and the reliable non-interactive fix.
---

# Post-merge `drizzle-kit push` hang on new tables

`scripts/post-merge.sh` runs `pnpm --filter @workspace/db run push-force`
(`drizzle-kit push --force`). Post-merge setup runs with **stdin closed**
(`/dev/null`). When the schema adds a NEW table, drizzle-kit shows an interactive
create-vs-rename SELECT prompt ("Is <table> created or renamed from another
table?"). With no stdin it hangs until the setup timeout (was 120s) → merge
post-setup FAILS and blocks the next merges.

**Why `--force` isn't enough:** `--force` only auto-accepts *data-loss*
statements. It does NOT answer the create/rename SELECT prompt — that's a
separate question.

**The fix (proven):** feed a FINITE burst of carriage returns into the command
so each prompt accepts its default highlighted option ("create table"):
`printf '\r%.0s' $(seq 200) | pnpm --filter @workspace/db run push-force`.

**Why:**
- Enter in drizzle-kit's raw-mode TUI is `\r` (carriage return), not `\n`.
- An INFINITE stream (`yes '' | push`) HANGS at introspection — continuous
  stdin floods the "Pulling schema..." spinner's raw reader. A finite burst is
  written once then EOFs; buffered extra newlines are harmless when there are no
  prompts (schema already in sync → clean no-op).
- Alternative "generate + psql" doesn't help: `drizzle-kit generate` shows the
  SAME rename prompt.

**How to apply:** validate any change with the real path via code_execution
`runPostMergeSetup()` (it runs the script with stdin=/dev/null; the script's own
`printf` pipe supplies drizzle's stdin, so the mechanism is identical). A healthy
run is ~20s. Timeout is set in `.replit` `[postMerge]`; bumped to 180000ms as a
buffer, but a synced no-op finishes far under that.
