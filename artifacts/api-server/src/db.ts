import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db";

const { Pool } = pg;

const dbUrl = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({ connectionString: dbUrl });
export const db = drizzle(pool, { schema });

async function runSql(query: string): Promise<void> {
  await pool.query(query);
}

export async function setupFullTextSearch(): Promise<void> {
  try {
    await runSql(`ALTER TABLE books ADD COLUMN IF NOT EXISTS search_tsv tsvector`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_books_search_tsv ON books USING GIN(search_tsv)`);
    await runSql(`
      UPDATE books SET search_tsv = 
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(author, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(genre, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(LEFT(description, 500), '')), 'D')
      WHERE search_tsv IS NULL
    `);
    await runSql(`
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
    `);
    await runSql(`
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
    `);
    console.log("[FTS] Full-text search setup complete (tsvector + GIN index + trigger)");
  } catch (error: any) {
    console.warn("[FTS] Setup warning:", error.message);
  }
}

export async function setupAdPlatformTables(): Promise<void> {
  try {
    await runSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar`);
    await runSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name varchar`);
    await runSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS website varchar`);
    await runSql(`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS category varchar DEFAULT 'other'`);
    await runSql(`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS daily_budget_cents integer DEFAULT 0`);
    await runSql(`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS start_date timestamp`);
    await runSql(`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS end_date timestamp`);
    await runSql(`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS daily_spend_cents integer NOT NULL DEFAULT 0`);

    await runSql(`
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
    `);
    await runSql(`
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
    `);
    await runSql(`
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
    `);
    await runSql(`
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
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS slot_clicks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        impression_id varchar NOT NULL REFERENCES slot_impressions(id) ON DELETE CASCADE,
        ad_id varchar NOT NULL REFERENCES display_ads(id) ON DELETE CASCADE,
        clicked_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_clicks_impression_unique ON slot_clicks (impression_id)`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS advertiser_wallets (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        advertiser_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance_cents integer NOT NULL DEFAULT 0,
        total_topup_cents integer NOT NULL DEFAULT 0,
        total_spend_cents integer NOT NULL DEFAULT 0,
        updated_at timestamp DEFAULT now()
      )
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS publisher_earnings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        publisher_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        total_earned_cents integer NOT NULL DEFAULT 0,
        pending_cents integer NOT NULL DEFAULT 0,
        paid_out_cents integer NOT NULL DEFAULT 0,
        updated_at timestamp DEFAULT now()
      )
    `);
    await runSql(`
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
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS bids (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        auction_id varchar NOT NULL REFERENCES ad_auctions(id) ON DELETE CASCADE,
        ad_id varchar NOT NULL REFERENCES display_ads(id) ON DELETE CASCADE,
        advertiser_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cpm_cents integer NOT NULL DEFAULT 0,
        is_winner boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now()
      )
    `);

    console.log("[AdPlatform] Tables set up successfully");
  } catch (error: any) {
    console.warn("[AdPlatform] Table setup warning:", error.message);
  }
}

export async function ensureReadingLevelColumn(): Promise<void> {
  try {
    await runSql(`ALTER TABLE books ADD COLUMN IF NOT EXISTS reading_level integer`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_books_reading_level ON books (reading_level)`);
    console.log("[ReadingLevel] reading_level column ensured");
  } catch (error: any) {
    console.warn("[ReadingLevel] Column setup warning:", error.message);
  }
}

export async function setupEasyEnglishTables(): Promise<void> {
  try {
    await runSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_easy_english_subscription_item_id varchar`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS easy_english_cache (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id varchar NOT NULL,
        chapter_number integer NOT NULL,
        original_text text NOT NULL,
        converted_text text NOT NULL,
        created_at timestamp DEFAULT NOW()
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_easy_english_cache_book_chapter ON easy_english_cache (book_id, chapter_number)`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS easy_english_usage (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        year_month varchar NOT NULL,
        chapters_converted integer NOT NULL DEFAULT 0
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_easy_english_usage_user_month ON easy_english_usage (user_id, year_month)`);
    console.log("[EasyEnglish] Tables set up successfully");
  } catch (error: any) {
    console.warn("[EasyEnglish] Table setup warning:", error.message);
  }
}

export async function ensureEntitlementSchema(): Promise<void> {
  try {
    await runSql(`ALTER TABLE books ADD COLUMN IF NOT EXISTS free_tier_available boolean NOT NULL DEFAULT true`);
    await runSql(`ALTER TABLE books ADD COLUMN IF NOT EXISTS ad_supported boolean NOT NULL DEFAULT true`);
    await runSql(`ALTER TABLE books ADD COLUMN IF NOT EXISTS transcript_available boolean NOT NULL DEFAULT false`);
    await runSql(`ALTER TABLE books ADD COLUMN IF NOT EXISTS narration_type text`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS entitlements (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tier varchar NOT NULL,
        book_id varchar,
        expires_at timestamp,
        reason text,
        created_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements (user_id)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_entitlements_user_book ON entitlements (user_id, book_id)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_entitlements_expires ON entitlements (expires_at)`);
    console.log("[Entitlements] Schema ensured (books flags + entitlements table)");
  } catch (error: any) {
    console.warn("[Entitlements] Schema setup warning:", error.message);
  }
}

export async function ensureAutoResponseLogSchema(): Promise<void> {
  try {
    await runSql(`
      CREATE TABLE IF NOT EXISTS auto_response_log (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient text NOT NULL,
        sender text NOT NULL,
        dedupe_key text NOT NULL,
        expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_auto_response_log_recipient_sender_key ON auto_response_log (recipient, sender, dedupe_key)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_auto_response_log_expires ON auto_response_log (expires_at)`);
    console.log("[AgentMail] auto_response_log schema ensured");
  } catch (error: any) {
    console.warn("[AgentMail] auto_response_log schema setup warning:", error.message);
  }
}

export async function ensureUserActivitySchema(): Promise<void> {
  try {
    await runSql(`
      CREATE TABLE IF NOT EXISTS user_activity_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_type varchar NOT NULL,
        book_id varchar,
        book_title text,
        duration_seconds integer,
        outcome_tag varchar,
        note text,
        occurred_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_user_activity_events_user_time ON user_activity_events (user_id, occurred_at)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_user_activity_events_user_type ON user_activity_events (user_id, event_type)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_user_activity_events_user_book ON user_activity_events (user_id, book_id)`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS user_activity_shares (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        caregiver_label text NOT NULL,
        share_token varchar NOT NULL UNIQUE,
        range_from timestamp,
        range_to timestamp,
        created_at timestamp DEFAULT now(),
        revoked_at timestamp
      )
    `);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_user_activity_shares_user ON user_activity_shares (user_id)`);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_shares_token ON user_activity_shares (share_token)`);
    console.log("[UserActivity] Schema ensured (user_activity_events + user_activity_shares)");
  } catch (error: any) {
    console.warn("[UserActivity] Schema setup warning:", error.message);
  }
}

export async function setupWordBankTable(): Promise<boolean> {
  try {
    await runSql(`
      CREATE TABLE IF NOT EXISTS word_bank_entries (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        word varchar NOT NULL,
        definition text,
        image_url text,
        saved_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_word_bank_user ON word_bank_entries(user_id)`);
    console.log("[WordBank] Table setup successful");
    return true;
  } catch (error: any) {
    console.warn("[WordBank] Table setup warning (in-memory fallback active):", error.message);
    return false;
  }
}
