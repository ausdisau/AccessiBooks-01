---
name: Heavy-load installs
description: How to install packages reliably when the machine is under heavy load (parallel task agents)
---

# Installing packages while the machine is loaded

**Rule:** When shell commands are timing out (parallel task agents saturating the box), never run `pnpm add` in the foreground of a tool call. Run it detached and poll:

```bash
nohup pnpm --filter <pkg> add <deps> > /tmp/install.log 2>&1 & IPID=$!
# poll: kill -0 $IPID; on exit, check the log tail + package.json
```

**Why:** Foreground installs get killed by the tool timeout but can leave an ORPHAN pnpm process still holding the pnpm store lock — subsequent installs then queue behind it and also "hang". Check `pgrep -f "pnpm.*add"` before starting another. Once the lock frees, the same install can finish in ~30s.

Also observed: the platform package installer callback can fail with "SERVER unexpectedly disconnected" under the same load, and it reboots all workflows as a side effect (restart what you need afterwards). Verify success by `grep` of the dependency in the target `package.json`, not by the tool's exit status.

**How to apply:** Any dependency add/remove while multiple task agents run. Budget one polling round; if the log shows lock waiting, just wait — do not spawn competing installs.
