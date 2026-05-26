import { logger } from "../logger";
import { randomUUID } from "node:crypto";

/**
 * Object storage wrapper. The Express version delegates to a sidecar; the
 * Next.js port uses Replit Object Storage (or S3-compatible) via env vars.
 * Real signed-URL minting is deferred to a downstream task — this stub
 * keeps the call shape stable so route handlers don't change.
 */
export interface SignedUploadUrl {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  headers: Record<string, string>;
}

export async function createSignedUploadUrl(opts: {
  prefix: string;
  contentType: string;
  userId: string;
}): Promise<SignedUploadUrl> {
  const key = `${opts.prefix}/${opts.userId}/${randomUUID()}`;
  const base = process.env.OBJECT_STORAGE_BASE_URL;
  if (!base) {
    logger.warn("OBJECT_STORAGE_BASE_URL missing — returning placeholder upload URL");
    return {
      uploadUrl: `https://placeholder.invalid/upload/${encodeURIComponent(key)}`,
      objectKey: key,
      publicUrl: `https://placeholder.invalid/${encodeURIComponent(key)}`,
      headers: { "Content-Type": opts.contentType },
    };
  }
  return {
    uploadUrl: `${base}/upload/${encodeURIComponent(key)}`,
    objectKey: key,
    publicUrl: `${base}/${encodeURIComponent(key)}`,
    headers: { "Content-Type": opts.contentType },
  };
}

export async function deleteObject(objectKey: string): Promise<void> {
  logger.info({ objectKey }, "deleteObject (placeholder)");
}
