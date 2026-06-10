/**
 * Boot-time environment validation. Fails fast in production when required secrets are missing.
 */

const DEV_SESSION_SECRET = "development-secret-change-in-production";
const DEV_DRM_SECRET = "dev-signing-secret-not-for-production";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (isProduction()) {
    throw new Error("SESSION_SECRET is required in production");
  }
  console.warn("[env] SESSION_SECRET not set — using development fallback");
  return DEV_SESSION_SECRET;
}

export function getDrmSigningSecret(): string {
  const secret = process.env.DRM_SIGNING_SECRET;
  if (secret) return secret;
  if (isProduction()) {
    throw new Error("DRM_SIGNING_SECRET is required in production");
  }
  console.warn("[env] DRM_SIGNING_SECRET not set — using development fallback");
  return DEV_DRM_SECRET;
}

export function validateBootEnv(): void {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required");
  }

  if (isProduction()) {
    if (!process.env.SESSION_SECRET) {
      errors.push("SESSION_SECRET is required in production");
    }
    if (!process.env.DRM_SIGNING_SECRET) {
      errors.push("DRM_SIGNING_SECRET is required in production");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join("\n- ")}`);
  }
}

export function isCatalogSeederEnabled(): boolean {
  return process.env.ENABLE_CATALOG_SEEDER === "true";
}
