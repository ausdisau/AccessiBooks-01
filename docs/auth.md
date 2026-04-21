# Authentication providers

This app supports four sign-in surfaces. Three of them are wired through OAuth
providers and are described below.

| Button on login modal | Backend entry point      | Identity provider                                              |
| --------------------- | ------------------------ | -------------------------------------------------------------- |
| Continue with Google  | `GET /api/auth/google`   | **Replit-managed OIDC** (no Google credentials in this repo)   |
| Continue with Facebook| `GET /api/auth/facebook` | **Auth0 Universal Login** with `connection=facebook`           |
| Continue with Microsoft| `GET /api/auth/microsoft`| **Auth0 Universal Login** with `connection=windowslive`       |
| Continue with Auth0   | `GET /api/auth/auth0`    | Auth0 Universal Login (default DB connection + any social IdPs)|

Local email/password and magic-link flows are unchanged — see `server/auth.ts`.

---

## Google — Replit-managed OIDC

Google sign-in is handled by Replit's managed OIDC provider (the same flow that
powers "Log in with Replit"). There is **no `GOOGLE_CLIENT_ID` or
`GOOGLE_CLIENT_SECRET`** to maintain — Replit owns the OAuth client.

Required environment variables (already injected by Replit in workspaces and
deployments):

- `REPL_ID`
- `REPLIT_DOMAINS`
- `SESSION_SECRET`
- `ISSUER_URL` (optional, defaults to `https://replit.com/oidc`)

The strategy registers itself lazily per-hostname so the absolute callback URL
matches whichever domain the browser arrived on (e.g. `*.replit.dev` in
preview, the custom domain in production). The callback path is
`/api/auth/google/callback` and is registered automatically.

When a user signs in, their OIDC `sub` claim is upserted via
`storage.upsertUser` with the row id `google-<sub>`, preserving compatibility
with rows created by the previous self-managed Google strategy.

---

## Facebook and Microsoft — via Auth0 social connections

Both buttons launch Auth0's Universal Login with a `connection` query
parameter, so Auth0 handles the social handshake. We never see Meta or
Microsoft tokens directly.

### Required environment variables

- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_AUDIENCE` (optional but recommended if you call your own API)
- `AUTH0_FACEBOOK_CONNECTION` (optional, defaults to `facebook`)
- `AUTH0_MICROSOFT_CONNECTION` (optional, defaults to `windowslive`)

### Facebook social connection setup

1. **Meta for Developers** – create an app, add the *Facebook Login* product,
   and copy the *App ID* and *App Secret*.
2. Under *Facebook Login → Settings → Valid OAuth Redirect URIs*, add:

   ```
   https://<AUTH0_DOMAIN>/login/callback
   ```

3. **Auth0 dashboard → Authentication → Social → Facebook** – create a
   connection, paste the Meta App ID and App Secret, and grant the
   `email,public_profile` permissions.
4. **Applications tab on the connection** – enable the Auth0 application
   that backs `AUTH0_CLIENT_ID`.
5. (Optional) If you renamed the connection in Auth0, set
   `AUTH0_FACEBOOK_CONNECTION` to that name.

### Microsoft Account social connection setup

1. **Azure Portal → App registrations** – register a new application. Under
   *Authentication → Web → Redirect URIs*, add:

   ```
   https://<AUTH0_DOMAIN>/login/callback
   ```

2. Generate a *Client secret* and grant the `openid email profile`
   delegated Microsoft Graph permissions.
3. **Auth0 dashboard → Authentication → Social → Microsoft Account** – create
   a connection, paste the Azure *Application (client) ID* and *Client
   secret*. Auth0 names this connection `windowslive` by default.
4. Enable the connection on the Auth0 application that backs
   `AUTH0_CLIENT_ID`.
5. (Optional) If you use the *Microsoft Azure AD* enterprise connection
   instead (commonly named `azuread`), set `AUTH0_MICROSOFT_CONNECTION` to
   that name.

### Callback URL on this app

All Auth0-mediated flows land on the same Express route:

```
GET /api/auth/callback/auth0
```

Make sure that path is listed under *Allowed Callback URLs* on the Auth0
application (one entry per environment, e.g. `https://<APP_URL>/api/auth/callback/auth0`).

---

## Provider availability — important caveat

`/api/auth/providers` reports a provider as available based on **server
configuration**, not on the live state of the upstream identity provider:

| Provider   | Reported `true` when                                              |
|------------|-------------------------------------------------------------------|
| `local`    | always `true`                                                     |
| `google`   | `REPL_ID` and `REPLIT_DOMAINS` are set (Replit OIDC enabled)      |
| `auth0`    | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` are set  |
| `facebook` | Auth0 env vars present **and** `AUTH0_FACEBOOK_ENABLED` ≠ `false` |
| `microsoft`| Auth0 env vars present **and** `AUTH0_MICROSOFT_ENABLED` ≠ `false`|

The endpoint cannot detect whether the matching social connection is actually
enabled inside the Auth0 tenant. If you disable the Facebook or Microsoft
connection in the Auth0 dashboard, set `AUTH0_FACEBOOK_ENABLED=false` or
`AUTH0_MICROSOFT_ENABLED=false` so the corresponding button is hidden in the
login modal — otherwise users will hit an Auth0 error page.

## Smoke testing

After changing any of the above, restart the `Start application` workflow and
hit `GET /api/auth/providers` — `google`, `facebook`, and `microsoft` should
all be `true` whenever the corresponding upstream is configured (subject to
the caveat above). The `tests/google-oauth.test.ts` script exercises the
Google, Facebook, and Microsoft entry-points end-to-end at the HTTP level.
