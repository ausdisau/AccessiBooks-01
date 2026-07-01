---
name: WebSocket security (CSWSH + proxy routing)
description: How cookie-auth WS upgrade handlers must be secured against Cross-Site WebSocket Hijacking, and why /ws is tested directly at the api-server port.
---

# WebSocket security

## /ws is NOT routed by the shared proxy
The api-server artifact only proxies `/api` and `/objects` (see its `artifact.toml`). The `server.on("upgrade")` handler serves `/ws/listening-party` and `/ws/streaming-queue`, but those paths are **not** in the proxy allowlist.
**How to apply:** verify the WebSocket upgrade handler by curling the api-server dev port **directly** (`http://localhost:8080/ws/...`), NOT through `localhost:80`. A WS handshake curl needs `Connection: Upgrade`, `Upgrade: websocket`, `Sec-WebSocket-Version: 13`, `Sec-WebSocket-Key: <base64>`.
**Why:** the proxy would send `/ws` to the wrong service, so a through-proxy test gives misleading results. Do not "fix" this by editing proxy routing — it's pre-existing and out of scope for security work.

## Cookie-auth WS handshakes MUST validate Origin (CSWSH)
The listening-party / streaming-queue upgrade handler authenticates purely from the session cookie. Browsers auto-attach cookies to **cross-origin** WS handshakes and cannot script-spoof `Origin`, so without an Origin check any website can open an authenticated socket as the visiting victim (Cross-Site WebSocket Hijacking).
**Rule:** validate `Origin` **before** running auth. Reject (403) when Origin is present-but-untrusted. A *missing* Origin implies a non-browser client and is allowed through to session auth (browsers always send Origin, so this doesn't weaken CSWSH protection). Also bound `maxPayload` on every `WebSocketServer` (ws defaults to 100 MiB) and coerce inbound state objects (e.g. playback) to known fields instead of spreading `{...msg.x}`.
**Trusted-origin allowlist:** build it from the same sources the rest of the app uses — `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`, `APP_URL`, `ALLOWED_ORIGIN` — plus a same-origin (Origin host === Host header host) fallback, plus a `*.replit.dev|repl.co|replit.app` + localhost regex gated to `NODE_ENV !== "production"`. Mirrors `ALLOWED_OIDC_HOSTS` in `multiAuth.ts` and the CORS allowlist in `routes/routes.ts`.
**Why:** cookie auth alone is not a CSRF/CSWSH defense; the browser sends the cookie regardless of who opened the socket.
