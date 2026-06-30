---
name: Read-along (karaoke) timing architecture
description: How word/sentence timing flows to read-along clients, the precision honesty rule, and why narration timing must not be folded into book_transcripts.
---

# Read-along timing

## Contract
`GET /api/books/:id/word-alignment` → `{ available, precision: "exact"|"estimated"|"none", words:[{word,startMs,endMs,wordIndex,segmentIndex}], segments:[{text,startMs,endMs,segmentIndex,firstWordIndex,wordCount}] }`.
Built from `book_transcripts` rows (segments jsonb). `words[i].wordIndex === i` (sequential), so `words.slice(firstWordIndex, firstWordIndex+wordCount)` yields a segment's words.

## Precision honesty rule (no fabricated timing)
- `exact` = real per-word marks from the source → render per-WORD highlight + word tap-to-seek.
- `estimated` = words evenly interpolated within a REAL sentence window (sentence has timing, words don't) → render SENTENCE-level read-along only (whole-sentence highlight + sentence tap-to-seek). Do NOT show per-word highlight.
- `none` → hide read-along entirely.

**Why:** task #218 forbids fabricating timing. Interpolated word positions are fabricated at word granularity; sentence boundaries are real. Clients must gate per-word UI on `precision === "exact"`, not on `available`.

**How to apply:** web word karaoke via `use-karaoke-alignment` (`isAvailable = precision==="exact"`) + `audio-player` Follow-Along toggle (`alignmentAvailable = precision==="exact"`). Sentence-level read-along on web is a separate component (InteractiveTranscript, reads `/transcript`). Mobile player tokenizes the active segment into words only when `precision==="exact"`, else whole-sentence highlight.

## Narration timing is per-chapter — do NOT fold into book_transcripts
Narration assets are per-chapter AND per-voice, each a SEPARATE audio file with CHAPTER-RELATIVE timing, exposed via `GET /api/narration/:bookId/manifest` (`chapters[].timing`). `/word-alignment` is book-level/single-stream (concatenates `book_transcripts` segments, assumes monotonic startMs).

**Why:** writing per-chapter narration timing into `book_transcripts` produces non-monotonic/overlapping timestamps across chapters → breaks the read-along binary search. The narration capture path persists timing to `narration_assets.timingJson` and exposes it via the manifest; it intentionally does NOT upsert `book_transcripts`.

**How to apply:** the live narration read-along (word-by-word as narration plays) is its OWN consumer — `NarrationReadAlong` in `artifacts/accessibooks/src/components/ai-narration-panel.tsx`. It renders words FROM the manifest `chapters[].timing` segments and highlights the active word via an rAF loop on the shared `<audio>` element (binary search mirroring `use-karaoke-alignment`), with tap-to-seek + an On/Off toggle and auto-scroll. It does NOT call `/word-alignment` and does NOT map onto the paginated book DOM. Falls back to plain playback when a chapter's `timing` is null/empty. Don't "fix" the chapter-vs-book disconnect by mutating book_transcripts. (Open accessibility gap: per-word seek is pointer-only — keyboard/switch users can't invoke it yet.)

## Transcript write authz
`POST /api/books/:id/transcript` flips public read-along output + `accessibility_metadata.hasTranscript`, so it requires `requireAdmin` (after `isAuthenticated`). Trusted server paths (narration, seeder) write via DB directly, not this route — so admin-gating it breaks no legitimate user flow.
