CREATE TABLE IF NOT EXISTS "accessibility_metadata" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"has_transcript" boolean DEFAULT false NOT NULL,
	"has_dyslexia_font" boolean DEFAULT false NOT NULL,
	"has_large_text" boolean DEFAULT false NOT NULL,
	"reading_level" text,
	"content_warnings" text[],
	"accessibility_score" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "accessibility_metadata_book_id_unique" UNIQUE("book_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accessibility_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_preset" text,
	"synced_at" timestamp DEFAULT now(),
	"reduce_distraction" boolean DEFAULT false NOT NULL,
	"high_contrast" boolean DEFAULT false NOT NULL,
	"dyslexia_friendly" boolean DEFAULT false NOT NULL,
	"captions_preferred" boolean DEFAULT false NOT NULL,
	"transcript_open_by_default" boolean DEFAULT false NOT NULL,
	"font_size_scale" integer DEFAULT 100 NOT NULL,
	"reading_speed" integer DEFAULT 100 NOT NULL,
	"color_mode" varchar DEFAULT 'system' NOT NULL,
	"focus_mode" boolean DEFAULT false NOT NULL,
	"symbol_support" boolean DEFAULT false NOT NULL,
	"sign_language_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "accessibility_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accessibility_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"disability_type" text DEFAULT 'other' NOT NULL,
	"rating" integer NOT NULL,
	"screen_reader_score" integer,
	"navigation_score" integer,
	"contrast_score" integer,
	"audio_quality_score" integer,
	"comments" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_auctions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" varchar NOT NULL,
	"winning_ad_id" varchar,
	"winning_cpm_cents" integer DEFAULT 0 NOT NULL,
	"second_price_cpm_cents" integer DEFAULT 0 NOT NULL,
	"bids_considered" integer DEFAULT 0 NOT NULL,
	"no_fill" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_event_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"ad_id" varchar NOT NULL,
	"ad_type" varchar(32) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"placement_id" varchar(64),
	"completed" boolean DEFAULT false NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"served_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_rewards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"ad_impression_id" varchar NOT NULL,
	"reward_type" varchar NOT NULL,
	"granted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_slots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" varchar NOT NULL,
	"name" text NOT NULL,
	"website_url" text NOT NULL,
	"width" integer DEFAULT 728 NOT NULL,
	"height" integer DEFAULT 90 NOT NULL,
	"category" varchar DEFAULT 'other' NOT NULL,
	"min_cpm_cents" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"total_impressions" integer DEFAULT 0 NOT NULL,
	"total_earnings_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertiser_wallets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advertiser_id" varchar NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"total_topup_cents" integer DEFAULT 0 NOT NULL,
	"total_spend_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "advertiser_wallets_advertiser_id_unique" UNIQUE("advertiser_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bids" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" varchar NOT NULL,
	"ad_id" varchar NOT NULL,
	"advertiser_id" varchar NOT NULL,
	"cpm_cents" integer DEFAULT 0 NOT NULL,
	"is_winner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_loans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"loaned_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"returned_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"download_token" text NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"max_downloads" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_transcripts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"chapter_index" integer DEFAULT 0 NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_visuals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"scene_index" integer NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"scene_description" text NOT NULL,
	"video_prompt" text NOT NULL,
	"video_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bulletin_reactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" varchar NOT NULL,
	"emoji" varchar(16) DEFAULT '👍' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bulletin_replies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" varchar NOT NULL,
	"parent_reply_id" varchar,
	"author_user_id" varchar NOT NULL,
	"author_display_name" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"reaction_count" integer DEFAULT 0 NOT NULL,
	"hidden_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bulletin_threads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" varchar NOT NULL,
	"author_user_id" varchar,
	"author_display_name" varchar(120) DEFAULT 'AccessiBooks' NOT NULL,
	"kind" varchar(20) DEFAULT 'discussion' NOT NULL,
	"title" varchar(240) NOT NULL,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"reaction_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bulletin_topics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"icon_emoji" varchar(10),
	"premium_only_post" boolean DEFAULT false NOT NULL,
	"premium_only_view" boolean DEFAULT false NOT NULL,
	"is_accessibility_category" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bulletin_topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_ads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"advertiser_id" varchar NOT NULL,
	"headline" text NOT NULL,
	"body" text,
	"image_url" text,
	"destination_url" text NOT NULL,
	"status" varchar DEFAULT 'pending_review' NOT NULL,
	"max_cpm_cents" integer DEFAULT 0 NOT NULL,
	"rejection_reason" text,
	"impression_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "easy_english_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"chapter_number" integer NOT NULL,
	"original_text" text NOT NULL,
	"converted_text" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "easy_english_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"year_month" varchar NOT NULL,
	"chapters_converted" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entitlements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tier" varchar,
	"book_id" varchar,
	"feature" varchar,
	"granted_tier" varchar,
	"expires_at" timestamp,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"hidden_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_rsvps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"attended_at" timestamp,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institutional_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"org_type" text DEFAULT 'school' NOT NULL,
	"max_seats" integer DEFAULT 50 NOT NULL,
	"current_seats" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer DEFAULT 9900 NOT NULL,
	"features" jsonb DEFAULT '{"adFree":true,"premiumContent":true,"analytics":true}'::jsonb NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"stripe_subscription_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"weekly_goal_minutes" integer DEFAULT 180 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institutional_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institutional_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listening_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"device_type" varchar,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"minutes_listened" integer DEFAULT 0 NOT NULL,
	"interrupted_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"title" varchar(240) NOT NULL,
	"description" text NOT NULL,
	"host_user_id" varchar,
	"host_display_name" varchar(120) DEFAULT 'AccessiBooks' NOT NULL,
	"book_id" varchar,
	"book_title" varchar(240),
	"scheduled_start_at" timestamp NOT NULL,
	"scheduled_end_at" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"listening_room_id" varchar,
	"replay_url" text,
	"rsvp_count" integer DEFAULT 0 NOT NULL,
	"attended_count" integer DEFAULT 0 NOT NULL,
	"free_replay_preview_seconds" integer DEFAULT 600 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loan_waitlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now(),
	"notified_at" timestamp,
	"status" text DEFAULT 'waiting' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moat_metrics_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"total_a11y_reviews" integer DEFAULT 0 NOT NULL,
	"avg_a11y_score" integer DEFAULT 0 NOT NULL,
	"transcript_coverage" integer DEFAULT 0 NOT NULL,
	"prefs_synced_users" integer DEFAULT 0 NOT NULL,
	"institutional_orgs" integer DEFAULT 0 NOT NULL,
	"recommendation_clicks" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payout_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" varchar NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"payment_details" text,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" varchar NOT NULL,
	"name" text NOT NULL,
	"price_monthly_cents" integer DEFAULT 0 NOT NULL,
	"price_yearly_cents" integer DEFAULT 0 NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "plans_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"user_tier" varchar(20) DEFAULT 'free' NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publisher_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" varchar NOT NULL,
	"total_earned_cents" integer DEFAULT 0 NOT NULL,
	"pending_cents" integer DEFAULT 0 NOT NULL,
	"paid_out_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "publisher_earnings_publisher_id_unique" UNIQUE("publisher_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_clips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"book_title" varchar(240) NOT NULL,
	"start_sec" integer NOT NULL,
	"end_sec" integer NOT NULL,
	"quote" text,
	"share_token" varchar(32) NOT NULL,
	"hide_attribution" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "share_clips_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slot_clicks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"impression_id" varchar NOT NULL,
	"ad_id" varchar NOT NULL,
	"clicked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slot_impressions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" varchar NOT NULL,
	"ad_id" varchar NOT NULL,
	"slot_id" varchar NOT NULL,
	"advertiser_id" varchar NOT NULL,
	"publisher_id" varchar NOT NULL,
	"cpm_cents" integer DEFAULT 0 NOT NULL,
	"clicked" boolean DEFAULT false NOT NULL,
	"served_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"trial_end" timestamp,
	"canceled_at" timestamp,
	"stripe_subscription_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "word_bank_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"word" varchar NOT NULL,
	"definition" text,
	"image_url" text,
	"saved_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "title" SET DEFAULT 'New Chat';--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "daily_budget_cents" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "daily_spend_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "category" varchar DEFAULT 'other';--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "free_tier_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "ad_supported" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "transcript_available" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "reading_level" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_easy_english_subscription_item_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_name" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "website" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_status" varchar;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "user_id" varchar;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "accessibility_metadata" ADD CONSTRAINT "accessibility_metadata_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "accessibility_preferences" ADD CONSTRAINT "accessibility_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "accessibility_reviews" ADD CONSTRAINT "accessibility_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "accessibility_reviews" ADD CONSTRAINT "accessibility_reviews_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ad_auctions" ADD CONSTRAINT "ad_auctions_slot_id_ad_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."ad_slots"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ad_auctions" ADD CONSTRAINT "ad_auctions_winning_ad_id_display_ads_id_fk" FOREIGN KEY ("winning_ad_id") REFERENCES "public"."display_ads"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_ad_impression_id_ad_impressions_id_fk" FOREIGN KEY ("ad_impression_id") REFERENCES "public"."ad_impressions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ad_slots" ADD CONSTRAINT "ad_slots_publisher_id_users_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "advertiser_wallets" ADD CONSTRAINT "advertiser_wallets_advertiser_id_users_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_ad_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."ad_auctions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bids" ADD CONSTRAINT "bids_ad_id_display_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."display_ads"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bids" ADD CONSTRAINT "bids_advertiser_id_users_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "book_transcripts" ADD CONSTRAINT "book_transcripts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bulletin_reactions" ADD CONSTRAINT "bulletin_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bulletin_replies" ADD CONSTRAINT "bulletin_replies_thread_id_bulletin_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."bulletin_threads"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bulletin_replies" ADD CONSTRAINT "bulletin_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bulletin_threads" ADD CONSTRAINT "bulletin_threads_topic_id_bulletin_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."bulletin_topics"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bulletin_threads" ADD CONSTRAINT "bulletin_threads_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "display_ads" ADD CONSTRAINT "display_ads_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "display_ads" ADD CONSTRAINT "display_ads_advertiser_id_users_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "easy_english_usage" ADD CONSTRAINT "easy_english_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "institutional_members" ADD CONSTRAINT "institutional_members_institutional_id_institutional_accounts_id_fk" FOREIGN KEY ("institutional_id") REFERENCES "public"."institutional_accounts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "institutional_members" ADD CONSTRAINT "institutional_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "listening_sessions" ADD CONSTRAINT "listening_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "live_events" ADD CONSTRAINT "live_events_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "loan_waitlist" ADD CONSTRAINT "loan_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "loan_waitlist" ADD CONSTRAINT "loan_waitlist_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_publisher_id_users_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "publisher_earnings" ADD CONSTRAINT "publisher_earnings_publisher_id_users_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "share_clips" ADD CONSTRAINT "share_clips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "slot_clicks" ADD CONSTRAINT "slot_clicks_impression_id_slot_impressions_id_fk" FOREIGN KEY ("impression_id") REFERENCES "public"."slot_impressions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "slot_clicks" ADD CONSTRAINT "slot_clicks_ad_id_display_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."display_ads"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_auction_id_ad_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."ad_auctions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_ad_id_display_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."display_ads"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_slot_id_ad_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."ad_slots"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "word_bank_entries" ADD CONSTRAINT "word_bank_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_a11y_meta_book" ON "accessibility_metadata" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_a11y_meta_score" ON "accessibility_metadata" USING btree ("accessibility_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_a11y_prefs_user" ON "accessibility_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_a11y_reviews_book" ON "accessibility_reviews" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_a11y_reviews_user" ON "accessibility_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_a11y_reviews_status" ON "accessibility_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_a11y_reviews_disability" ON "accessibility_reviews" USING btree ("disability_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_auctions_slot" ON "ad_auctions" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_auctions_created" ON "ad_auctions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_event_logs_user" ON "ad_event_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_event_logs_served" ON "ad_event_logs" USING btree ("served_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_event_logs_provider" ON "ad_event_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_rewards_user" ON "ad_rewards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_rewards_impression" ON "ad_rewards" USING btree ("ad_impression_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_rewards_user_type" ON "ad_rewards" USING btree ("user_id","reward_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ad_rewards_user_impression" ON "ad_rewards" USING btree ("user_id","ad_impression_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_slots_publisher" ON "ad_slots" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_slots_active" ON "ad_slots" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_slots_category" ON "ad_slots" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bids_auction" ON "bids" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bids_ad" ON "bids" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bids_advertiser" ON "bids" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_loans_user" ON "book_loans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_loans_book" ON "book_loans" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_loans_status" ON "book_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_loans_expires" ON "book_loans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transcripts_book" ON "book_transcripts" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transcripts_book_chapter" ON "book_transcripts" USING btree ("book_id","chapter_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_book_visuals_book" ON "book_visuals" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_book_visuals_book_scene" ON "book_visuals" USING btree ("book_id","scene_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bulletin_reactions_target" ON "bulletin_reactions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bulletin_reactions_user" ON "bulletin_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bulletin_replies_thread" ON "bulletin_replies" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bulletin_threads_topic_pinned" ON "bulletin_threads" USING btree ("topic_id","is_pinned","last_activity_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bulletin_threads_recent" ON "bulletin_threads" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bulletin_topics_active" ON "bulletin_topics" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_display_ads_campaign" ON "display_ads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_display_ads_advertiser" ON "display_ads" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_display_ads_status" ON "display_ads" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_easy_english_cache_book_chapter" ON "easy_english_cache" USING btree ("book_id","chapter_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_easy_english_usage_user_month" ON "easy_english_usage" USING btree ("user_id","year_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entitlements_user" ON "entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entitlements_user_book" ON "entitlements" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entitlements_feature" ON "entitlements" USING btree ("feature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entitlements_expires" ON "entitlements" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_chat_event" ON "event_chat_messages" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_rsvps_event" ON "event_rsvps" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_rsvps_user" ON "event_rsvps" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_rsvps_event_user" ON "event_rsvps" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_institutional_active" ON "institutional_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inst_members_org" ON "institutional_members" USING btree ("institutional_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inst_members_user" ON "institutional_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listening_sessions_user" ON "listening_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listening_sessions_book" ON "listening_sessions" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listening_sessions_started" ON "listening_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_live_events_status_start" ON "live_events" USING btree ("status","scheduled_start_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_live_events_start" ON "live_events" USING btree ("scheduled_start_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_waitlist_user" ON "loan_waitlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_waitlist_book" ON "loan_waitlist" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_waitlist_status" ON "loan_waitlist" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_moat_metrics_date" ON "moat_metrics_snapshots" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payout_requests_publisher" ON "payout_requests" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payout_requests_status" ON "payout_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_events_type_time" ON "product_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_events_occurred" ON "product_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_share_clips_user" ON "share_clips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_share_clips_token" ON "share_clips" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slot_clicks_impression" ON "slot_clicks" USING btree ("impression_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slot_clicks_ad" ON "slot_clicks" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slot_impressions_ad" ON "slot_impressions" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slot_impressions_slot" ON "slot_impressions" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slot_impressions_advertiser" ON "slot_impressions" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slot_impressions_publisher" ON "slot_impressions" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_slot_impressions_served" ON "slot_impressions" USING btree ("served_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_user" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_status" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_stripe" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_word_bank_user" ON "word_bank_entries" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_tx_provider_txid" ON "payment_transactions" USING btree ("provider","provider_transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_created_at" ON "conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_user_id" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_created_at" ON "messages" USING btree ("created_at");