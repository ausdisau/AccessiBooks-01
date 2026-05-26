/**
 * magicLink.ts — HMAC-signed magic-link tokens.
 *
 * Mirrors the format used by the legacy Express server
 * (api-server/src/auth.ts), so links issued by either side validate on the
 * other. A token is `<base64url-payload>.<hex-hmac-sha256>` where the
 * payload encodes `{ email, expiresAt }`.
 *
 * The verify route consumes these tokens server-side and then calls
 * NextAuth's signIn("magic-link", { token }) to flip the session.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function getMagicLinkSecret(): string {
  const secret = process.env.MAGIC_LINK_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MAGIC_LINK_SECRET must be set in production");
  }
  console.warn(
    "[WARN] MAGIC_LINK_SECRET not set — using insecure default. Set this before deploying.",
  );
  return "magic-link-dev-secret-change-in-prod";
}

export function createMagicToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      email: email.toLowerCase().trim(),
      expiresAt: Date.now() + MAGIC_LINK_TTL_MS,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", getMagicLinkSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyMagicToken(token: string): { email: string } | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = createHmac("sha256", getMagicLinkSecret())
    .update(payload)
    .digest("hex");
  try {
    if (
      sig.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const { email, expiresAt } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    if (!email || typeof email !== "string" || typeof expiresAt !== "number") {
      return null;
    }
    if (Date.now() > expiresAt) return null;
    return { email };
  } catch {
    return null;
  }
}
