/**
 * validateEnv.ts — Startup environment variable validation
 *
 * Called once at the top of server/index.ts before any route registration.
 * In production: throws a descriptive error if any required var is missing.
 * In development: no-op (relies on fallbacks defined in each auth module).
 */

const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "MAGIC_LINK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "APP_URL",
];

const OPTIONAL_BUT_WARN = [
  { key: "RESEND_API_KEY", note: "email delivery disabled without this" },
  { key: "ELEVENLABS_API_KEY", note: "TTS narration disabled" },
  { key: "PUBLIC_OBJECT_SEARCH_PATHS", note: "object storage reads disabled" },
  { key: "PRIVATE_OBJECT_DIR", note: "object storage writes disabled" },
  { key: "VITE_ADSENSE_CLIENT", note: "Google display ads disabled" },
  { key: "VITE_DFP_NETWORK_CODE", note: "Google DFP ads disabled" },
  { key: "DRM_SIGNING_SECRET", note: "DRM token signing disabled" },
  { key: "AI_INTEGRATIONS_OPENAI_API_KEY", note: "AI features disabled" },
];

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    const missing = REQUIRED_IN_PRODUCTION.filter(
      (key) => !process.env[key] || process.env[key]!.trim() === ""
    );

    if (missing.length > 0) {
      throw new Error(
        `[validateEnv] Missing required environment variables for production:\n` +
          missing.map((k) => `  - ${k}`).join("\n") +
          `\n\nSet these in Replit Secrets before deploying. See .env.example for reference.`
      );
    }

    for (const { key, note } of OPTIONAL_BUT_WARN) {
      if (!process.env[key] || process.env[key]!.trim() === "") {
        console.warn(`[validateEnv] WARN: ${key} not set — ${note}`);
      }
    }

    console.log("[validateEnv] All required environment variables are set.");
  }
}
