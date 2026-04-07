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

export async function setupAdPlatformTables(): Promise<void> {
  try {
    // Add role-related columns to users
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name varchar`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS website varchar`;

    // Add category to ad_campaigns if not present
    await sql`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS category varchar DEFAULT 'other'`;

    // Display ads
    await sql`
      CREATE TABLE IF NOT EXISTS display_ads (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id varchar NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
        advertiser_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        headline text NOT NULL,
        body text,
        image_url text,
        destination_url text NOT NULL,
        status varchar NOT NULL DEFAULT 'pending_review',
        max_cpm_cents integer NOT NULL DEFAULT 0,
        rejection_reason text,
        impression_count integer NOT NULL DEFAULT 0,
        click_count integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `;

    // Ad slots
    await sql`
      CREATE TABLE IF NOT EXISTS ad_slots (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        publisher_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        website_url text NOT NULL,
        width integer NOT NULL DEFAULT 728,
        height integer NOT NULL DEFAULT 90,
        category varchar NOT NULL DEFAULT 'other',
        min_cpm_cents integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        total_impressions integer NOT NULL DEFAULT 0,
        total_earnings_cents integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now()
      )
    `;

    // Ad auctions
    await sql`
      CREATE TABLE IF NOT EXISTS ad_auctions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_id varchar NOT NULL REFERENCES ad_slots(id) ON DELETE CASCADE,
        winning_ad_id varchar REFERENCES display_ads(id),
        winning_cpm_cents integer NOT NULL DEFAULT 0,
        second_price_cpm_cents integer NOT NULL DEFAULT 0,
        bids_considered integer NOT NULL DEFAULT 0,
        no_fill boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now()
      )
    `;

    // Slot impressions
    await sql`
      CREATE TABLE IF NOT EXISTS slot_impressions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        auction_id varchar NOT NULL REFERENCES ad_auctions(id) ON DELETE CASCADE,
        ad_id varchar NOT NULL REFERENCES display_ads(id) ON DELETE CASCADE,
        slot_id varchar NOT NULL REFERENCES ad_slots(id) ON DELETE CASCADE,
        advertiser_id varchar NOT NULL,
        publisher_id varchar NOT NULL,
        cpm_cents integer NOT NULL DEFAULT 0,
        clicked boolean NOT NULL DEFAULT false,
        served_at timestamp DEFAULT now()
      )
    `;

    // Slot clicks
    await sql`
      CREATE TABLE IF NOT EXISTS slot_clicks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        impression_id varchar NOT NULL REFERENCES slot_impressions(id) ON DELETE CASCADE,
        ad_id varchar NOT NULL REFERENCES display_ads(id) ON DELETE CASCADE,
        clicked_at timestamp DEFAULT now()
      )
    `;

    // Advertiser wallets
    await sql`
      CREATE TABLE IF NOT EXISTS advertiser_wallets (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        advertiser_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance_cents integer NOT NULL DEFAULT 0,
        total_topup_cents integer NOT NULL DEFAULT 0,
        total_spend_cents integer NOT NULL DEFAULT 0,
        updated_at timestamp DEFAULT now()
      )
    `;

    // Publisher earnings
    await sql`
      CREATE TABLE IF NOT EXISTS publisher_earnings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        publisher_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        total_earned_cents integer NOT NULL DEFAULT 0,
        pending_cents integer NOT NULL DEFAULT 0,
        paid_out_cents integer NOT NULL DEFAULT 0,
        updated_at timestamp DEFAULT now()
      )
    `;

    // Payout requests
    await sql`
      CREATE TABLE IF NOT EXISTS payout_requests (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        publisher_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount_cents integer NOT NULL,
        status varchar NOT NULL DEFAULT 'pending',
        payment_details text,
        admin_notes text,
        created_at timestamp DEFAULT now(),
        resolved_at timestamp
      )
    `;

    // Bids table: records each bid submitted during an auction
    await sql`
      CREATE TABLE IF NOT EXISTS bids (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        auction_id varchar NOT NULL REFERENCES ad_auctions(id) ON DELETE CASCADE,
        ad_id varchar NOT NULL REFERENCES display_ads(id) ON DELETE CASCADE,
        advertiser_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cpm_cents integer NOT NULL DEFAULT 0,
        is_winner boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now()
      )
    `;

    console.log("[AdPlatform] Tables set up successfully");
  } catch (error: any) {
    console.warn("[AdPlatform] Table setup warning:", error.message);
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
