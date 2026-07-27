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

export async function ensureNdisSchema(): Promise<void> {
  try {
    await runSql(`
      CREATE TABLE IF NOT EXISTS ndis_participants (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        participant_name text NOT NULL,
        ndis_number varchar NOT NULL,
        date_of_birth varchar,
        management_type varchar NOT NULL DEFAULT 'self_managed',
        plan_manager_name text,
        plan_manager_email varchar,
        plan_manager_company text,
        plan_start_date varchar,
        plan_end_date varchar,
        contact_email varchar,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_ndis_participants_user ON ndis_participants (user_id)`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS ndis_invoices (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number varchar NOT NULL UNIQUE,
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        participant_name text NOT NULL,
        ndis_number varchar NOT NULL,
        management_type varchar NOT NULL,
        plan_manager_name text,
        plan_manager_email varchar,
        support_item_number varchar,
        support_item_name text NOT NULL,
        service_description text,
        quantity integer NOT NULL DEFAULT 1,
        unit_price_cents integer NOT NULL,
        amount_cents integer NOT NULL,
        gst_cents integer NOT NULL DEFAULT 0,
        gst_treatment varchar NOT NULL DEFAULT 'GST-free',
        total_cents integer NOT NULL,
        currency varchar NOT NULL DEFAULT 'AUD',
        service_start_date varchar,
        service_end_date varchar,
        status varchar NOT NULL DEFAULT 'issued',
        claim_status varchar NOT NULL DEFAULT 'unclaimed',
        source_type varchar NOT NULL DEFAULT 'manual',
        source_transaction_id varchar,
        notes text,
        issued_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_ndis_invoices_number ON ndis_invoices (invoice_number)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_ndis_invoices_user ON ndis_invoices (user_id)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_ndis_invoices_claim_status ON ndis_invoices (claim_status)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_ndis_invoices_user_source ON ndis_invoices (user_id, source_type, source_transaction_id)`);
    console.log("[NDIS] Schema ensured (ndis_participants + ndis_invoices)");
  } catch (error: any) {
    console.warn("[NDIS] Schema setup warning:", error.message);
  }
}

export async function ensureCommercialCreditsSchema(): Promise<void> {
  try {
    await runSql(`
      CREATE TABLE IF NOT EXISTS credit_accounts (
        user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS credit_grants (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount integer NOT NULL,
        remaining integer NOT NULL,
        source varchar(32) NOT NULL,
        source_id varchar,
        idempotency_key varchar,
        expires_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_credit_grants_user ON credit_grants (user_id)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_credit_grants_user_expiry ON credit_grants (user_id, expires_at)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_credit_grants_user_remaining ON credit_grants (user_id, remaining)`);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_credit_grants_idempotency ON credit_grants (idempotency_key)`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type varchar(16) NOT NULL,
        amount integer NOT NULL,
        balance_after integer NOT NULL,
        grant_id varchar,
        book_id varchar,
        bundle_id varchar,
        source varchar(32),
        source_id varchar,
        description text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger (user_id)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger (user_id, created_at)`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS commercial_bundles (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar NOT NULL,
        title text NOT NULL,
        description text,
        cover_image text,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        price_cents integer NOT NULL,
        original_price_cents integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_commercial_bundles_slug ON commercial_bundles (slug)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_commercial_bundles_active ON commercial_bundles (is_active)`);
    // Enforce single ownership per (user, book). redeemTitle and fulfillBundle
    // rely on `ON CONFLICT (user_id, book_id)`, which REQUIRES this unique index
    // to exist or the inserts error at runtime. Dedupe any pre-existing duplicate
    // rows first (keeping one row per user+book), create the index, then VERIFY
    // it exists — we must not run the paid redeem/bundle flows without it.
    await runSql(`
      DELETE FROM purchases a
      USING purchases b
      WHERE a.ctid < b.ctid
        AND a.user_id = b.user_id
        AND a.book_id = b.book_id
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_purchases_user_book ON purchases (user_id, book_id)`);
    const { rows: idxRows } = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'ux_purchases_user_book'`,
    );
    if (idxRows.length === 0) {
      throw new Error(
        "ux_purchases_user_book unique index missing after creation — commercial redeem/bundle fulfillment requires (user_id, book_id) uniqueness",
      );
    }
    console.log("[CommercialCredits] Schema ensured (credit_accounts, credit_grants, credit_ledger, commercial_bundles)");
    await seedCommercialBundles();
  } catch (error: any) {
    console.warn("[CommercialCredits] Schema setup warning:", error.message);
  }
}

// Task #214: gift & sponsorship schema. Adds the money-correctness columns the
// original gift_cards table lacked (stripe_session_id + paid_at for webhook
// gating, pack_id + credit_amount for #213 credit gifts) and creates the new
// subscription_sponsorships pool table. Idempotent — safe to run on every boot.
export async function ensureGiftSponsorSchema(): Promise<void> {
  try {
    // gift_cards already exists; add the new nullable columns in place.
    await runSql(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS stripe_session_id varchar`);
    await runSql(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS paid_at timestamp`);
    await runSql(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS pack_id varchar`);
    await runSql(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS credit_amount integer`);
    // A Stripe session funds exactly one gift card; this index is the webhook's
    // idempotency anchor for the pending -> active flip.
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_gift_cards_stripe_session ON gift_cards (stripe_session_id)`);

    await runSql(`
      CREATE TABLE IF NOT EXISTS subscription_sponsorships (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        sponsor_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind varchar(16) NOT NULL,
        tier varchar(16),
        term_months integer,
        credit_amount integer,
        pack_id varchar,
        amount_cents integer NOT NULL,
        currency varchar(3) NOT NULL DEFAULT 'USD',
        message text,
        status varchar(16) NOT NULL DEFAULT 'pending',
        stripe_session_id varchar,
        claimed_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
        claimed_at timestamp,
        funded_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_sub_sponsorships_status ON subscription_sponsorships (status)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_sub_sponsorships_sponsor ON subscription_sponsorships (sponsor_user_id)`);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_sub_sponsorships_stripe_session ON subscription_sponsorships (stripe_session_id)`);
    // DB-enforced: a user may hold at most one CLAIMED sponsorship. claimSponsorship
    // relies on this partial unique index to make the per-user cap race-proof.
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS ux_sub_sponsorships_one_claim_per_user ON subscription_sponsorships (claimed_by_user_id) WHERE status = 'claimed'`);
    console.log("[GiftSponsor] Schema ensured (gift_cards columns + subscription_sponsorships)");
  } catch (error: any) {
    console.warn("[GiftSponsor] Schema setup warning:", error.message);
  }
}

export async function seedCommercialBundles(): Promise<void> {
  try {
    const titleById = new Map(schema.COMMERCIAL_TITLES.map((t) => [t.bookId, t]));
    for (const b of schema.COMMERCIAL_BUNDLE_SEED) {
      const items = b.bookIds
        .map((id) => titleById.get(id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t));
      await pool.query(
        `INSERT INTO commercial_bundles (slug, title, description, cover_image, items, price_cents, original_price_cents, is_active)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, true)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           cover_image = EXCLUDED.cover_image,
           items = EXCLUDED.items,
           price_cents = EXCLUDED.price_cents,
           original_price_cents = EXCLUDED.original_price_cents`,
        [b.slug, b.title, b.description, b.coverImage ?? null, JSON.stringify(items), b.priceCents, b.originalPriceCents],
      );
    }
    console.log(`[CommercialCredits] Seeded ${schema.COMMERCIAL_BUNDLE_SEED.length} bundles`);
  } catch (error: any) {
    console.warn("[CommercialCredits] Bundle seed warning:", error.message);
  }
}

export async function ensureNarrationSchema(): Promise<void> {
  try {
    await runSql(`
      CREATE TABLE IF NOT EXISTS narration_jobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id varchar NOT NULL,
        voice_id varchar NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        total_chapters integer NOT NULL DEFAULT 0,
        completed_chapters integer NOT NULL DEFAULT 0,
        error text,
        requested_by varchar,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_narration_jobs_book_voice ON narration_jobs (book_id, voice_id)`);
    await runSql(`
      CREATE TABLE IF NOT EXISTS narration_assets (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id varchar NOT NULL,
        voice_id varchar NOT NULL,
        chapter_number integer NOT NULL,
        title text,
        audio_url text NOT NULL,
        duration_seconds integer,
        char_count integer,
        timing_json jsonb,
        created_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_narration_assets_book_voice_chapter ON narration_assets (book_id, voice_id, chapter_number)`);
    console.log("[Narration] Schema ensured (narration_jobs + narration_assets)");
  } catch (error: any) {
    console.warn("[Narration] Schema setup warning:", error.message);
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

// ---------------------------------------------------------------------------
// Narration provenance backfill (catalogue-wide, idempotent).
//
// Tags books.narration_type where the source clearly indicates provenance:
//   - human: LibriVox & LoyalBooks (volunteer narrators), iTunes (commercial
//     narrated audiobooks), podcasts & BBC (human-produced audio), Spoken
//     Wikipedia (volunteer readers), Internet Archive audio items.
//   - ai: any book with generated ElevenLabs narration assets.
// Ebooks and ambiguous sources stay NULL (unlabelled) - accuracy beats
// coverage for listeners who can only tolerate one narration style.
//
// Runs at every boot: the partial index keeps re-runs O(untagged audiobooks),
// which ingest-time tagging keeps near zero. A fresh production deploy
// self-heals without manual SQL.
// ---------------------------------------------------------------------------
export async function ensureNarrationBackfill(): Promise<void> {
  try {
    // Order-independent: ensure the prerequisites this function relies on.
    await runSql(`ALTER TABLE books ADD COLUMN IF NOT EXISTS narration_type text`);
    await runSql(
      `CREATE INDEX IF NOT EXISTS idx_books_narration_backfill ON books (source) WHERE narration_type IS NULL AND content_type = 'audiobook'`
    );
    await runSql(`
      UPDATE books SET narration_type = 'human'
      WHERE narration_type IS NULL
        AND content_type = 'audiobook'
        AND source IN ('librivox','loyalbooks','itunes','podcast','bbc','wikipedia','internet_archive','internet-archive','internetarchive')
    `);
    // Last on purpose: narration_assets may not exist yet on a fresh DB; the
    // catch below lets the human backfill stand and the next boot heal this.
    await runSql(`
      UPDATE books SET narration_type = 'ai'
      WHERE narration_type IS NULL
        AND id IN (SELECT book_id FROM narration_assets)
    `);
    console.log("[NarrationBackfill] narration_type ensured (human sources + AI narration assets)");
  } catch (error: any) {
    console.warn("[NarrationBackfill] warning:", error.message);
  }
}

export async function ensureCommunityAnnotationsSchema(): Promise<void> {
  try {
    await runSql(`
      CREATE TABLE IF NOT EXISTS community_annotations (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id varchar NOT NULL,
        contributor_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contributor_name text,
        page integer NOT NULL,
        start_offset integer NOT NULL,
        end_offset integer NOT NULL,
        text text NOT NULL,
        note text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        reviewed_by varchar,
        review_note text,
        approved_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_community_annotations_book_status ON community_annotations (book_id, status)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_community_annotations_status ON community_annotations (status)`);
    await runSql(`CREATE INDEX IF NOT EXISTS idx_community_annotations_contributor ON community_annotations (contributor_id)`);
    console.log("[CommunityAnnotations] Schema ensured (community_annotations)");
  } catch (error: any) {
    console.warn("[CommunityAnnotations] Schema setup warning:", error.message);
  }
}
