/**
 * serverDb.ts — Drizzle DB connection used by Next.js server routes.
 *
 * Kept separate from the api-server's db.ts because Next route handlers run
 * inside the Next.js process (and, on Vercel, inside individual serverless
 * functions). Reads DATABASE_URL (or CUSTOM_DATABASE_URL as an override) and
 * caches the pool on globalThis to survive Next.js hot reloads in dev.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db";

const { Pool } = pg;

const dbUrl = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

type GlobalWithPool = typeof globalThis & {
  __accessibooksNextPgPool?: pg.Pool;
};

const g = globalThis as GlobalWithPool;
const pool = g.__accessibooksNextPgPool ?? new Pool({ connectionString: dbUrl });
if (process.env.NODE_ENV !== "production") {
  g.__accessibooksNextPgPool = pool;
}

export const db = drizzle(pool, { schema });
