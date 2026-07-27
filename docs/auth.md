# Authentication

## Google sign-in (Replit-managed OIDC)

"Continue with Google" is served by Replit-managed OIDC (`server/multiAuth.ts`,
`ensureGoogleOidcStrategy`). The strategy only accepts Google upstream
identities: if the `idp` claim is present and is not `google` /
`google-oauth2`, the login is refused.

### Legacy account linking policy

Before Replit-managed OIDC, Google logins used self-managed Google OAuth and
user rows were keyed by the Google profile id (`google-<profileId>`). The
Replit OIDC subject is different, so a returning user would otherwise get a
brand-new empty account. The verify callback therefore resolves the account in
this order:

1. **Exact id match** — a row with id `google-<oidcSub>` (accounts created
   through the new flow).
2. **Linked providerId match** — a row with `authProvider = 'google'` and
   `providerId = <oidcSub>` (accounts linked previously; their original id is
   preserved).
3. **Automatic email link** — if the OIDC claims include an email **and**
   `email_verified === true` (a missing claim counts as NOT verified), and an
   existing account has that exact email:
   - If the account has a **local password** (`passwordHash` set), we do NOT
     auto-link. This prevents email-collision hijacking of password accounts;
     the user must sign in with the password (an explicit link flow is a
     follow-up). The login is denied deterministically — the callback
     redirects to `/?auth=failed&reason=password_account_exists` (no duplicate
     account is attempted; `users.email` is unique). A
     `skipped_local_password` audit row is written.
   - Otherwise the existing row is linked in place: `authProvider` is set to
     `google`, `providerId` to the OIDC subject, and the row's original id
     (and therefore all libraries, preferences, history, purchases) is kept.
     A `linked` audit row is written.
4. **New account** — no match: a new row `google-<oidcSub>` is created. If
   the claimed email is unverified and collides with an existing account, the
   new row is created without an email (unique constraint + spoofing guard).

The resolution logic lives in `server/googleAccountLinking.ts` (unit-tested in
`__tests__/googleAccountLinking.test.ts`); audit writes are best-effort and
never block sign-in. The `account_link_audits` table is created by drizzle
migration `0001_account_link_audits.sql` (and applied via the normal
`drizzle-kit push` publish flow).

On every subsequent login the account resolves through step 1 or 2, so the
email comparison only happens once per legacy account.

### Audit log

Each automatic link (or refusal) is recorded in the `account_link_audits`
table (`user_id`, `provider`, `provider_sub`, `email`,
`previous_auth_provider`, `outcome`, `created_at`). Admins can review it via
`GET /api/admin/account-link-audits?limit=100` (requires an authenticated
admin session; max limit 500, newest first).
