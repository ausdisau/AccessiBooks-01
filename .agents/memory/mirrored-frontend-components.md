---
name: Mirrored frontend components (accessibooks ↔ accessibooks-next)
description: The Vite and Next.js web apps share byte-identical component files that must be kept in sync manually.
---

# Mirrored frontend components

`artifacts/accessibooks-next/src/components/` mirrors many files from
`artifacts/accessibooks/src/components/` **byte-identically** (e.g.
`onboarding-flow.tsx`). There is no shared package or build step keeping them
aligned.

**Why:** The Next.js migration copied components wholesale. Editing only one
side silently forks the UX between the two apps; past task agents (and this
one) kept parity by copying.

**How to apply:** Before editing a component in either web app, check whether
the same file exists in the other app (`diff` them). If they were identical
before your change, apply the edit once and `cp` the file across, then `diff`
to confirm sync. If they had already diverged, port the change deliberately
instead of copying.
