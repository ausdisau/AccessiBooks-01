/**
 * auth0CallbackClassifier.ts — Classify errors thrown by passport-auth0
 * inside the /api/auth/callback/auth0 custom callback (Task #145).
 *
 * Extracted from server/multiAuth.ts so it can be unit-tested in isolation
 * (multiAuth.ts has heavy side effects on import: DB pool, sessions, etc.).
 *
 * passport-auth0 surfaces upstream OAuth errors in several shapes:
 *   - err.oauthError.data is a JSON string body from the token endpoint
 *   - err.oauthError.data is already parsed (object form)
 *   - err.oauthError.error is the bare error code (no body)
 *   - err.error is the bare error code (some passport-auth0 versions)
 *   - err.code is the bare error code (older versions / wrapped errors)
 *
 * The "unauthorized_client" code specifically means the Auth0 application
 * does not allow the `authorization_code` grant — the same misconfig the
 * boot probe in server/auth0Health.ts catches. Detecting it here lets us
 * (a) flip the cached health flag so subsequent /api/auth/auth0 starts
 * short-circuit immediately, and (b) redirect the user to the friendly
 * /?auth=unavailable page instead of the generic /?auth=failed.
 */

export type Auth0CallbackErrorClassification =
  | { kind: "unauthorized_client"; reason: string }
  | { kind: "other"; code: string | null };

export function classifyAuth0CallbackError(
  err: unknown,
): Auth0CallbackErrorClassification {
  const e = err as any;
  const oauthErr = e?.oauthError || e;

  // err.oauthError.data may be a raw JSON string from the token endpoint
  // body, or it may already be parsed. Handle both shapes safely.
  const data = (() => {
    try {
      if (typeof oauthErr?.data === "string") {
        return JSON.parse(oauthErr.data);
      }
      return oauthErr?.data ?? null;
    } catch {
      return null;
    }
  })();

  const code: string | null =
    (typeof data?.error === "string" && data.error) ||
    (typeof oauthErr?.error === "string" && oauthErr.error) ||
    (typeof e?.code === "string" && e.code) ||
    null;

  if (code === "unauthorized_client") {
    const description =
      (typeof data?.error_description === "string" && data.error_description) ||
      (typeof oauthErr?.error_description === "string" && oauthErr.error_description) ||
      "unauthorized_client (authorization_code grant disabled)";
    return { kind: "unauthorized_client", reason: description };
  }

  return { kind: "other", code };
}
