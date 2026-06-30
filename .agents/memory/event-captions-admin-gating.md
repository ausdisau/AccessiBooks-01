---
name: Event/club captions are admin-gated by design
description: Why live-caption + transcript-finalize routes on events/clubs are admin-only, not "host"-only — prevents re-litigating a false-positive access-control finding.
---

# Event/club captions are admin-gated by design

`POST /api/events` is `isAuthenticated, requireAdmin` (in `engagement.ts`), so
**every author event is created by an admin — there is no separate non-admin
"host" role for events.** Therefore gating live-caption entry and transcript
finalize on `requireAdmin` fully covers hosts; it is correct, not a gap.

**Why:** code review flagged "non-admin event hosts can't caption" as a missing
capability. That role does not exist in this codebase — the suggested fix would
*loosen* access control. Reading clubs differ: club captions are
creator-OR-admin because clubs do have a non-admin creator/member model.

**How to apply:** if asked to "let hosts caption," confirm whether a non-admin
host role actually exists for that surface before relaxing `requireAdmin`. Also:
one transcript per source (`eventTranscripts` is unique on
`(sourceType, sourceId)`), and cue text is rendered as React text nodes — never
inject caption strings as HTML.
