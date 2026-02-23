import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";

const dbUrl = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = neon(dbUrl);
export const db = drizzle(sql, { schema });
