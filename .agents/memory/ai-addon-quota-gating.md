---
name: AI add-on quota gating
description: How paywalled AI features (narration / comprehension / translation) are metered + enforced, and the apiRequest 402 trap on the frontend.
---

# AI add-on quota gating

Paywalled AI features are centrally metered/enforced in `artifacts/api-server/src/aiAddons.ts`
(features: `ai_narration`, `comprehension_companion`, `ai_translation`). Per-tier monthly
quotas live in `lib/db/src/schema/schema.ts` `AI_ADDON_QUOTAS` (null = unlimited, 0 = upsell-only, N = N/month).

**Server pattern (do not weaken):** gate with `getAiAddonStatus(userId, feature)` → return
`402 buildUpsellPayload(status)` when `!allowed`; consume with `incrementAiAddonUsage` **only after**
the work actually queues/succeeds, so cached or failed requests are free. Cached/already-running
narrations + the manifest/status/voices reads are served free/unauthenticated, so completed media
stays playable for everyone. Status for the UI: `GET /api/ai-addons/status` (frontend hook
`useAiAddons` in `artifacts/accessibooks/src/hooks/use-ai-addons.ts`).

**Why this matters:** "stop free users running up AI costs" is satisfied at the server. A frontend
task on top of this is UI-only — show the allowance + upsell, never re-implement enforcement client-side.

## Frontend trap: apiRequest throws on ANY non-2xx

`apiRequest()` (in `artifacts/accessibooks/src/lib/queryClient.ts`) calls `throwIfResNotOk`, which
throws `Error("<status>: <body>")` for every non-ok response **before returning**. So the common
pattern `const res = await apiRequest(...); if (res.status === 402) {...}` is **unreachable dead code**
— the 402 instead surfaces as an opaque red toast with a raw JSON string.

**How to apply:** any paywall-aware surface must use a controlled `fetch` (with
`credentials: "include"` + optional `Authorization: Bearer ${getAuthToken()}`) so it can read the
402 upsell body and branch on it. The AI narration panel does this correctly. The
`easy-english/convert` mutation in `ebook-reader.tsx` still has the dead-code version, so Easy English
quota exhaustion currently fails opaquely (latent bug).
