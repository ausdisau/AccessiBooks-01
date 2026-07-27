---
name: Public display names
description: Rule for any user-attributed content served on public endpoints (community annotations, reviews, etc.)
---

**Rule:** A display name that is persisted and later served on a *public* (unauthenticated) endpoint must be non-PII by construction: first name + last initial only. If the user has no first name, store `null` and let the UI render a neutral label (e.g. "Approved community contribution"). Never fall back to the email local-part or any email-derived string.

**Why:** An email local-part is PII and often the full identity of the user (jane.doe@…). Code review flagged exactly this leak in the community-annotations submit path — the fallback looked harmless but would have published emails on a public book endpoint.

**How to apply:** Whenever snapshotting a contributor/author/reviewer name into a table that any public GET reads, route it through a pure formatter with the null fallback (see `contributorDisplayName` in the api-server community annotations module for the reference shape) and never select `email` into that code path at all.
