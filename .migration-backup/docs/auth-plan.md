# TODO: Replace userId Input with Real Auth

## Goal
Remove the temporary `userId` text input from the Player page and DRM token request. Instead, derive the user's identity server-side from an authenticated session.

## Steps

### 1. Add session-based auth to the DRM service
- Use `express-session` with a signed, HTTP-only cookie (`drm.sid`).
- Store sessions in PostgreSQL (`connect-pg-simple`) to share state across restarts.
- On login, set `req.session.userId` from the identity provider's response.

### 2. Accept OAuth or federated login
- Register an OAuth 2.0 provider (e.g., Google, GitHub, or the main app's Auth0 tenant).
- Add `GET /auth/login` → redirect to provider, `GET /auth/callback` → exchange code, create session.
- Alternatively, trust the main app's session cookie if both services share the same domain (set cookie `Domain=.accessibooks.com`).

### 3. Extract userId server-side in POST /api/playback/token
- Remove `userId` from the request body schema.
- Read `req.session.userId` (or decode a forwarded JWT from the main app).
- Return 401 if no session exists.

```diff
- const { userId, titleId } = req.body;
+ const userId = req.session?.userId;
+ if (!userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
+ const { titleId } = req.body;
```

### 4. Update the Player page
- Remove the userId `<input>`.
- On 401 from `/api/playback/token`, redirect to login.
- Show the logged-in user's name/email in the UI header.

### 5. Secure the cookie
- `secure: true` in production (HTTPS only).
- `sameSite: "strict"` to prevent CSRF.
- Short `maxAge` (e.g., 24h) with sliding expiration.

## Migration checklist
- [ ] Install `express-session`, `connect-pg-simple`
- [ ] Add session middleware to DRM `app.ts`
- [ ] Add OAuth login/callback routes
- [ ] Remove `userId` from `POST /api/playback/token` body
- [ ] Read identity from `req.session.userId`
- [ ] Update Player page to drop userId input
- [ ] Add login redirect on 401
- [ ] Set secure cookie flags for production
