# DRM Integration (Deferred)

The monorepo includes a standalone DRM microservice at `services/drm/`, but the **production app** (`client/` + `server/`) does not use it yet. Playback protection today uses HMAC signed stream URLs in `server/drm.ts`.

## Current state

| Component | Path | Role |
|-----------|------|------|
| Main app DRM | `server/drm.ts` | Signed stream URLs, rate limits |
| DRM service | `services/drm/src/app.ts` | Playback tokens, Widevine, JWKS |
| Stub player | `apps/web/src/pages/Player.tsx` | Placeholder; proxies `/api` to port 4000 |
| Shared types | `packages/shared/src/types.ts` | DRM JWT DTOs |

## Integration sequence (when prioritized)

1. **Dev proxy alignment** — Point `apps/web` at the main API (:5000) or add a unified `pnpm dev` script that starts both services.
2. **Session-based auth** — Follow [auth-plan.md](./auth-plan.md): DRM service reads identity from session/JWT; remove `userId` from token request body.
3. **Player wiring** — Integrate Shaka (or extend `client/src/components/audio-player.tsx`) to request playback tokens from `services/drm`.
4. **Architecture decision** — Merge `apps/web` into `client/` or maintain as a separate surface; avoid duplicate UIs.

## References

- [auth-plan.md](./auth-plan.md) — step-by-step DRM auth migration checklist
- [ACCESSIBOOKS.md](./ACCESSIBOOKS.md) — monorepo structure section
