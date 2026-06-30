---
name: Consent-bounded caregiver reports
description: Every data section in a scoped/shared activity report must be date-bounded to the share range, not just the newest feature/metric.
---

# Consent-bounded caregiver reports

When a report can be shared via a scoped link (a date-range share token), EVERY
data section it renders must be bounded to that range — not only the headline
feature you just added.

**Why:** A caregiver/therapist share in AccessiBooks is consent-scoped to a date
range. Goal trends were correctly bounded, but the per-book listening-history
section queried all-time history (filtered only by userId), so a narrow share
still leaked titles / positions / last-played from outside the consented
window. Caught in architect review of the progress-reports feature.

**How to apply:** In the shared report builder (api-server `userActivity.ts`
`buildReport`), bound each query that backs a rendered section to the report
range. For `listening_history` that means filtering `lastPlayedAt` within
`[from, to]` (rows with a null `lastPlayedAt` are excluded — they can't be
date-placed). The self-report uses the same bounded path, which is fine. When
adding ANY new section to a shareable report, ask "does this query restrict to
the share range?" before shipping.
