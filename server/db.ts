import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";

const dbUrl = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = neon(dbUrl);
export const db = drizzle(sql, { schema });

export async function setupFullTextSearch(): Promise<void> {
  try {
    await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS search_tsv tsvector`;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_books_search_tsv ON books USING GIN(search_tsv)`;
    
    await sql`
      UPDATE books SET search_tsv = 
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(author, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(genre, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(LEFT(description, 500), '')), 'D')
      WHERE search_tsv IS NULL
    `;
    
    await sql`
      CREATE OR REPLACE FUNCTION books_search_tsv_trigger() RETURNS trigger AS $$
      BEGIN
        NEW.search_tsv :=
          setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.author, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.genre, '')), 'C') ||
          setweight(to_tsvector('english', COALESCE(LEFT(NEW.description, 500), '')), 'D');
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `;
    
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_books_search_tsv') THEN
          CREATE TRIGGER trg_books_search_tsv
            BEFORE INSERT OR UPDATE OF title, author, genre, description
            ON books
            FOR EACH ROW
            EXECUTE FUNCTION books_search_tsv_trigger();
        END IF;
      END
      $$
    `;
    
    console.log("[FTS] Full-text search setup complete (tsvector + GIN index + trigger)");
  } catch (error: any) {
    console.warn("[FTS] Setup warning:", error.message);
  }
}

export async function setupEasyEnglishTables(): Promise<void> {
  try {
    await sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_easy_english_subscription_item_id varchar
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS easy_english_cache (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id varchar NOT NULL,
        chapter_number integer NOT NULL,
        original_text text NOT NULL,
        converted_text text NOT NULL,
        created_at timestamp DEFAULT NOW()
      )
    `;

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_easy_english_cache_book_chapter
      ON easy_english_cache (book_id, chapter_number)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS easy_english_usage (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        year_month varchar NOT NULL,
        chapters_converted integer NOT NULL DEFAULT 0
      )
    `;

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_easy_english_usage_user_month
      ON easy_english_usage (user_id, year_month)
    `;

    console.log("[EasyEnglish] Tables set up successfully");
  } catch (error: any) {
    console.warn("[EasyEnglish] Table setup warning:", error.message);
  }
}
