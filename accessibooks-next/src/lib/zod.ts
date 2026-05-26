import { z } from "zod";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "./auth";
import { logger } from "./logger";

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: z.string().optional(),
});

export const idSchema = z.string().min(1);

export const tierSchema = z.enum(["free", "plus", "premium"]);

export const subscriptionPlanSchema = z.enum(["monthly", "annual"]);

export const checkoutSchema = z.object({
  tier: z.enum(["plus", "premium"]),
  plan: subscriptionPlanSchema,
});

export const borrowSchema = z.object({
  bookId: idSchema,
});

export const ingestSchema = z.object({
  feedUrl: z.string().url(),
});

export const batchIngestSchema = z.object({
  feedUrls: z.array(z.string().url()).min(1).max(50),
});

export function searchParamsToObject(
  req: NextRequest,
): Record<string, string> {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

export async function parseJson<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message || "Invalid input");
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): z.infer<T> {
  const result = schema.safeParse(searchParamsToObject(req));
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message || "Invalid query");
  }
  return result.data;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ message, ...(extra || {}) }, { status });
}

export function handleRouteError(err: unknown, route: string): NextResponse {
  if (err instanceof AuthError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof ValidationError) {
    return jsonError(err.message, 400);
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err, route }, "Unhandled route error");
  return jsonError("Internal server error", 500);
}
