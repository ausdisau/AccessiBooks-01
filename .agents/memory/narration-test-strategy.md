---
name: Narration test strategy
description: How to test AI narration (web + api-server) without firing paid TTS; jsdom polling quirk.
---

# Narration test strategy

Test the AI narration surface **offline**. Do NOT write a live/Playwright e2e that
actually calls the generate endpoint.

**Why:** `ELEVENLABS_API_KEY` is configured in this dev environment, so every real
`POST /api/narration/:bookId/generate` fires paid ElevenLabs TTS jobs. A live e2e
burns money on every run and is nondeterministic (real audio + timing).

**How to apply:**
- Backend: exercise the job lifecycle with route tests that mock the elevenlabs
  client. A tts fake that resolves once then rejects proves genuine *mid-book*
  partial failure (chapter 1 persists, a later chapter aborts → job `status="failed"`
  with `completedChapters` preserved and a user-facing error on `/status`). A
  never-resolving ("hang") fake holds jobs open to prove the global + per-user
  concurrency 429 caps. Note the generate handler falls back from the timestamped
  TTS endpoint to plain TTS, so to fail a chapter **both** must throw.
- Web retry path: render the panel under jsdom with mocked hooks + `fetch`; assert
  processing→failed(error+retry)→click retry→generate POST→processing. Gotcha:
  react-query `refetchInterval` polling will not fire under jsdom unless you call
  `focusManager.setFocused(true)` (jsdom visibility state otherwise suppresses it).
- The pure text/timing helpers are isolated (zero runtime deps) so they unit-test
  without touching the DB/storage/ElevenLabs graph.
