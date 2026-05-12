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
 */

export type Auth0CallbackErrorClassification =
  | { kind: "unauthorized_client"; reason: string }
  | { kind: "other"; code: string | null };

interface OAuthErrorBody {
  error?: unknown;
  error_description?: unknown;
}

interface OAuthErrorShape {
  data?: unknown;
  error?: unknown;
  error_description?: unknown;
}

interface PassportAuth0ErrorShape {
  oauthError?: OAuthErrorShape;
  error?: unknown;
  code?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseDataField(data: unknown): OAuthErrorBody | null {
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return isObject(parsed) ? (parsed as OAuthErrorBody) : null;
    } catch {
      return null;
    }
  }
  return isObject(data) ? (data as OAuthErrorBody) : null;
}

export function classifyAuth0CallbackError(
  err: unknown,
): Auth0CallbackErrorClassification {
  const errObj: PassportAuth0ErrorShape = isObject(err) ? err : {};
  const oauthErr: OAuthErrorShape = isObject(errObj.oauthError)
    ? errObj.oauthError
    : (errObj as OAuthErrorShape);

  const data = parseDataField(oauthErr.data);

  const code: string | null =
    asString(data?.error) ??
    asString(oauthErr.error) ??
    asString(errObj.code) ??
    null;

  if (code === "unauthorized_client") {
    const reason =
      asString(data?.error_description) ??
      asString(oauthErr.error_description) ??
      "unauthorized_client (authorization_code grant disabled)";
    return { kind: "unauthorized_client", reason };
  }

  return { kind: "other", code };
}
