---
name: Mobile voice + offline (AccessiBooks Expo app)
description: Non-obvious constraints for the accessibooks-mobile hands-free voice mode and offline downloads.
---

# Mobile voice + offline constraints

## Native modal can't be covered by a global overlay
The player screen (`app/player/[id].tsx`) is `presentation: "modal"`. A native
iOS modal sits ABOVE the JS view tree, so any overlay rendered in `app/_layout.tsx`
(e.g. the floating mic) is invisible while the player is open.
**How to apply:** any always-on-top control (mic, banner, toast) that must be
reachable inside the player has to be rendered inside the player screen itself,
not only in `_layout`. The app deliberately renders an in-player mic for this
reason.

## Voice STT is a paid endpoint → auth-gated by design
`POST /api/voice/transcribe` calls a paid OpenAI STT model on every request, so
it is intentionally `isAuthenticated` + per-user rate-limited + body-size capped
+ content-type allowlisted (415 on unsupported audio).
**Why:** unauthenticated or unbounded access would let anyone burn the AI budget.
**How to apply:** keep voice (and any similar paid AI mobile feature) behind
sign-in + rate limiting; don't relax the auth gate to "make voice work logged-out".
Note: because `isAuthenticated` runs first, an unauthenticated curl returns 401
before the 415 check — verify the 415 path by code/build, not by anonymous curl.

## Mobile progress + downloads are local-only (drift from a "sync" assumption)
There is NO server progress-sync endpoint. Downloaded-title playback position is
persisted on-device only (AsyncStorage). Offline audio lives under
`documentDirectory/downloads/` with metadata in AsyncStorage.
**How to apply:** don't assume a server sync API exists for reading positions;
if cross-device sync is ever wanted it's net-new backend work. When deleting a
download, delete the file at its canonical target path (tracked as `fileUri`),
not just `localUri`, so partial/interrupted downloads don't leak storage.
