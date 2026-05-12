CREATE TABLE "accessibility_metadata" (
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
CREATE TABLE "accessibility_preferences" (
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
CREATE TABLE "accessibility_reviews" (
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
CREATE TABLE "activity_feed" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"activity_type" text NOT NULL,
	"book_id" varchar,
	"book_title" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_auctions" (
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
CREATE TABLE "ad_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advertiser_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"daily_budget_cents" integer DEFAULT 0,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	"daily_spend_cents" integer DEFAULT 0 NOT NULL,
	"cpm_bid_cents" integer DEFAULT 500 NOT NULL,
	"target_genres" text[],
	"target_time_slots" text[],
	"start_date" timestamp,
	"end_date" timestamp,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"category" varchar DEFAULT 'other',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_creatives" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"name" text NOT NULL,
	"audio_url" text NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"mime_type" text DEFAULT 'audio/mpeg' NOT NULL,
	"file_size" integer,
	"is_recorded" boolean DEFAULT false NOT NULL,
	"click_through_url" text,
	"companion_image_url" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_event_logs" (
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
CREATE TABLE "ad_impressions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"creative_id" varchar NOT NULL,
	"user_id" varchar,
	"ad_type" varchar(10) DEFAULT 'preroll' NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"clicked" boolean DEFAULT false NOT NULL,
	"quartile_25" boolean DEFAULT false NOT NULL,
	"quartile_50" boolean DEFAULT false NOT NULL,
	"quartile_75" boolean DEFAULT false NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"served_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_rewards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"ad_impression_id" varchar NOT NULL,
	"reward_type" varchar NOT NULL,
	"granted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_slots" (
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
CREATE TABLE "advertiser_wallets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advertiser_id" varchar NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"total_topup_cents" integer DEFAULT 0 NOT NULL,
	"total_spend_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "advertiser_wallets_advertiser_id_unique" UNIQUE("advertiser_id")
);
--> statement-breakpoint
CREATE TABLE "annotation_sync" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"annotations" text DEFAULT '[]' NOT NULL,
	"bookmarks" text DEFAULT '[]' NOT NULL,
	"last_synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "author_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"earning_type" varchar NOT NULL,
	"gross_cents" integer DEFAULT 0 NOT NULL,
	"commission_cents" integer DEFAULT 0 NOT NULL,
	"platform_fee_pct" integer DEFAULT 30 NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "author_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"website" text,
	"social_links" jsonb,
	"profile_image" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"total_plays" integer DEFAULT 0 NOT NULL,
	"total_listeners" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "author_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "author_tips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" varchar NOT NULL,
	"to_author_id" varchar NOT NULL,
	"book_id" varchar,
	"amount_cents" integer NOT NULL,
	"stripe_payment_id" text,
	"message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"birth_date" varchar,
	"death_date" varchar,
	"photo_url" text,
	"open_library_key" varchar,
	"wikipedia" text,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auto_response_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient" text NOT NULL,
	"sender" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_milestones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"battle_pass_id" varchar NOT NULL,
	"tier" integer NOT NULL,
	"xp_required" integer NOT NULL,
	"reward_type" varchar NOT NULL,
	"reward_value" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "battle_pass_purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"battle_pass_id" varchar NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"purchased_at" timestamp DEFAULT now(),
	"current_tier" integer DEFAULT 0 NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"claimed_milestones" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_passes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_name" text NOT NULL,
	"description" text,
	"price_cents" integer DEFAULT 299 NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" varchar NOT NULL,
	"ad_id" varchar NOT NULL,
	"advertiser_id" varchar NOT NULL,
	"cpm_cents" integer DEFAULT 0 NOT NULL,
	"is_winner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "book_loans" (
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
CREATE TABLE "book_transcripts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"chapter_index" integer DEFAULT 0 NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "book_visuals" (
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
CREATE TABLE "books" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"narrator" text,
	"description" text,
	"duration" integer DEFAULT 0 NOT NULL,
	"cover_image" text,
	"audio_url" text,
	"content_url" text,
	"genre" text,
	"published_year" integer,
	"source" text DEFAULT 'local' NOT NULL,
	"source_id" text,
	"total_time" text,
	"language" text DEFAULT 'English',
	"content_type" text DEFAULT 'audiobook' NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"free_tier_available" boolean DEFAULT true NOT NULL,
	"ad_supported" boolean DEFAULT true NOT NULL,
	"transcript_available" boolean DEFAULT false NOT NULL,
	"narration_type" text,
	"page_count" integer,
	"search_vector" text,
	"reading_level" integer
);
--> statement-breakpoint
CREATE TABLE "bulletin_reactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" varchar NOT NULL,
	"emoji" varchar(16) DEFAULT '👍' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bulletin_replies" (
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
CREATE TABLE "bulletin_threads" (
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
CREATE TABLE "bulletin_topics" (
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
CREATE TABLE "chapters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"title" text NOT NULL,
	"chapter_number" integer NOT NULL,
	"start_time" integer,
	"end_time" integer,
	"page_start" integer,
	"page_end" integer,
	"duration" integer
);
--> statement-breakpoint
CREATE TABLE "content_analytics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"author_user_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"listener_id" varchar,
	"duration" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" varchar NOT NULL,
	"content_type" text NOT NULL,
	"content_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_listening_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" text NOT NULL,
	"minutes_listened" integer DEFAULT 0 NOT NULL,
	"books_started" integer DEFAULT 0 NOT NULL,
	"books_completed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "display_ads" (
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
CREATE TABLE "easy_english_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"chapter_number" integer NOT NULL,
	"original_text" text NOT NULL,
	"converted_text" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "easy_english_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"year_month" varchar NOT NULL,
	"chapters_converted" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"category" varchar(60),
	"outcome" varchar(40) DEFAULT 'sent' NOT NULL,
	"reason" varchar(60),
	"metadata" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"last_active_at" timestamp DEFAULT now(),
	"total_sessions_last_30d" integer DEFAULT 0 NOT NULL,
	"total_minutes_last_30d" integer DEFAULT 0 NOT NULL,
	"churn_risk" text DEFAULT 'low' NOT NULL,
	"winback_offer_sent" boolean DEFAULT false NOT NULL,
	"winback_offer_sent_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enterprise_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"tier" varchar DEFAULT 'education' NOT NULL,
	"max_seats" integer DEFAULT 50 NOT NULL,
	"current_seats" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer DEFAULT 9900 NOT NULL,
	"billing_cycle" varchar DEFAULT 'monthly' NOT NULL,
	"stripe_subscription_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enterprise_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entitlement_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_key" text NOT NULL,
	"tier" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
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
CREATE TABLE "event_chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"hidden_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"attended_at" timestamp,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expiring_rewards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"reward_type" varchar NOT NULL,
	"reward_value" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "external_ratings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"source" varchar NOT NULL,
	"rating" integer,
	"review_count" integer,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"plan_name" text DEFAULT 'Family Plan' NOT NULL,
	"max_members" integer DEFAULT 5 NOT NULL,
	"amount_cents" integer DEFAULT 799 NOT NULL,
	"stripe_subscription_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar NOT NULL,
	"from_user_id" varchar,
	"to_email" text,
	"amount_cents" integer NOT NULL,
	"balance_remaining" integer NOT NULL,
	"type" varchar DEFAULT 'credits' NOT NULL,
	"tier_gift" varchar,
	"months_gift" integer,
	"message" text,
	"status" varchar DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"redeemed_by" varchar,
	"redeemed_at" timestamp,
	CONSTRAINT "gift_cards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "institutional_accounts" (
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
CREATE TABLE "institutional_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institutional_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "listening_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"book_title" text NOT NULL,
	"book_author" text,
	"book_cover" text,
	"current_time" integer DEFAULT 0 NOT NULL,
	"total_duration" integer,
	"last_played_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"play_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_room_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "listening_room_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" text NOT NULL,
	"role" varchar(10) DEFAULT 'guest' NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "listening_rooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"book_title" text NOT NULL,
	"book_author" text,
	"book_cover" text,
	"host_user_id" varchar NOT NULL,
	"room_code" varchar(8) NOT NULL,
	"room_name" text,
	"max_listeners" integer DEFAULT 10 NOT NULL,
	"host_tier" varchar(20) DEFAULT 'plus' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "listening_rooms_room_code_unique" UNIQUE("room_code")
);
--> statement-breakpoint
CREATE TABLE "listening_sessions" (
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
CREATE TABLE "live_events" (
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
CREATE TABLE "loan_waitlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now(),
	"notified_at" timestamp,
	"status" text DEFAULT 'waiting' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moat_metrics_snapshots" (
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
CREATE TABLE "notification_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"sent_at" timestamp DEFAULT now(),
	"clicked" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_transaction_id" varchar,
	"type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"description" text,
	"metadata" text,
	"receipt_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
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
CREATE TABLE "plans" (
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
CREATE TABLE "playlist_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"book_title" text NOT NULL,
	"book_author" text,
	"book_cover" text,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"is_public" integer DEFAULT 1 NOT NULL,
	"is_curated" integer DEFAULT 0 NOT NULL,
	"category" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "podcast_episodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" varchar NOT NULL,
	"guid" text,
	"title" text NOT NULL,
	"description_text" text,
	"description_html" text,
	"pub_date" timestamp,
	"duration_seconds" integer,
	"audio_url" text NOT NULL,
	"audio_type" text,
	"audio_length_bytes" integer,
	"explicit" boolean,
	"transcript_url" text,
	"transcript_status" text DEFAULT 'none' NOT NULL,
	"content_warnings" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "podcast_feeds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_url" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"author" text,
	"language" text,
	"website_url" text,
	"categories" jsonb,
	"etag" text,
	"last_modified" text,
	"last_fetched_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "podcast_feeds_feed_url_unique" UNIQUE("feed_url")
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"user_tier" varchar(20) DEFAULT 'free' NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" varchar NOT NULL,
	"total_earned_cents" integer DEFAULT 0 NOT NULL,
	"pending_cents" integer DEFAULT 0 NOT NULL,
	"paid_out_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "publisher_earnings_publisher_id_unique" UNIQUE("publisher_id")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"book_title" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar DEFAULT 'usd',
	"stripe_payment_id" varchar,
	"status" varchar DEFAULT 'completed' NOT NULL,
	"purchased_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"enabled_types" text[] DEFAULT ARRAY['streak_reminder','goal_nudge','new_content','achievement','recommendation','re_engagement','author_update','system','rsvp_reminder','friend_digest','win_back','weekly_recap','streak_at_risk']::text[] NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "queue_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_item_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reading_challenges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_books" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"badge_icon" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_club_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reading_clubs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"creator_id" varchar NOT NULL,
	"current_book_id" varchar,
	"current_book_title" text,
	"member_count" integer DEFAULT 1 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" varchar NOT NULL,
	"referred_user_id" varchar,
	"referral_code" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"credit_amount" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "referrals_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "review_likes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"review_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"content" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seeder_progress" (
	"source" varchar PRIMARY KEY NOT NULL,
	"current_offset" integer DEFAULT 0 NOT NULL,
	"subject_index" integer DEFAULT 0 NOT NULL,
	"next_url" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"total_inserted" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_clips" (
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
CREATE TABLE "slot_clicks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"impression_id" varchar NOT NULL,
	"ad_id" varchar NOT NULL,
	"clicked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "slot_impressions" (
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
CREATE TABLE "sponsored_queues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sponsor_name" text NOT NULL,
	"queue_id" varchar,
	"ad_audio_url" text,
	"sponsor_logo" text,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "streak_freezes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"total_freezes" integer DEFAULT 0 NOT NULL,
	"used_freezes" integer DEFAULT 0 NOT NULL,
	"last_earned_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "streaming_queue_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"book_title" text NOT NULL,
	"book_author" text,
	"book_cover" text,
	"book_audio_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"added_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "streaming_queues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"genre" text,
	"host_user_id" varchar NOT NULL,
	"current_book_id" varchar,
	"current_book_title" text,
	"current_book_author" text,
	"current_book_cover" text,
	"current_book_audio_url" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"listener_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
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
CREATE TABLE "user_achievements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"achievement_type" varchar NOT NULL,
	"unlocked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_activity_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"book_id" varchar,
	"book_title" text,
	"duration_seconds" integer,
	"outcome_tag" varchar(40),
	"note" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity_shares" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"caregiver_label" text NOT NULL,
	"share_token" varchar(64) NOT NULL,
	"range_from" timestamp,
	"range_to" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "user_activity_shares_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "user_challenge_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"challenge_id" varchar NOT NULL,
	"books_completed" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" varchar NOT NULL,
	"following_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_goals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"daily_minutes_goal" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"favorite_genres" text[] DEFAULT '{}'::text[],
	"preferred_content_types" text[] DEFAULT '{}'::text[],
	"listening_habit" text,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"welcome_bonus_granted" boolean DEFAULT false NOT NULL,
	"premium_trial_end_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_streaks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_listened_date" text,
	"streak_start_date" text
);
--> statement-breakpoint
CREATE TABLE "user_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"description" text,
	"content_type" text DEFAULT 'audiobook' NOT NULL,
	"audio_url" text,
	"content_url" text,
	"cover_image" text,
	"genre" text,
	"language" text DEFAULT 'English',
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"duration" integer,
	"page_count" integer,
	"published_at" timestamp,
	"total_plays" integer DEFAULT 0 NOT NULL,
	"total_reads" integer DEFAULT 0 NOT NULL,
	"file_size" integer,
	"narrator" text,
	"tags" text[] DEFAULT '{}'::text[],
	"is_promoted" boolean DEFAULT false NOT NULL,
	"author_user_id" varchar
);
--> statement-breakpoint
CREATE TABLE "user_xp" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"total_listening_minutes" integer DEFAULT 0 NOT NULL,
	"books_completed" integer DEFAULT 0 NOT NULL,
	"reviews_written" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"auth_provider" varchar DEFAULT 'local',
	"provider_id" varchar,
	"subscription_tier" varchar DEFAULT 'free',
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"subscription_end_date" timestamp,
	"stripe_easy_english_subscription_item_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"referral_code" varchar,
	"referral_credits" integer DEFAULT 0 NOT NULL,
	"password_hash" varchar,
	"name" varchar,
	"email_verified" timestamp,
	"image" varchar,
	"role" varchar,
	"company_name" varchar,
	"website" varchar,
	"subscription_status" varchar,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "voice_pack_purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"voice_pack_id" varchar NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"stripe_payment_id" varchar,
	"purchased_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "voice_packs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"voices" text[] NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"is_premium_included" boolean DEFAULT false NOT NULL,
	"preview_url" text,
	"system_prompt" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "word_bank_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"word" varchar NOT NULL,
	"definition" text,
	"image_url" text,
	"saved_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "accessibility_metadata" ADD CONSTRAINT "accessibility_metadata_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accessibility_preferences" ADD CONSTRAINT "accessibility_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accessibility_reviews" ADD CONSTRAINT "accessibility_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accessibility_reviews" ADD CONSTRAINT "accessibility_reviews_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_auctions" ADD CONSTRAINT "ad_auctions_slot_id_ad_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."ad_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_auctions" ADD CONSTRAINT "ad_auctions_winning_ad_id_display_ads_id_fk" FOREIGN KEY ("winning_ad_id") REFERENCES "public"."display_ads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_advertiser_id_users_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_creative_id_ad_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_ad_impression_id_ad_impressions_id_fk" FOREIGN KEY ("ad_impression_id") REFERENCES "public"."ad_impressions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_slots" ADD CONSTRAINT "ad_slots_publisher_id_users_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertiser_wallets" ADD CONSTRAINT "advertiser_wallets_advertiser_id_users_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_sync" ADD CONSTRAINT "annotation_sync_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_earnings" ADD CONSTRAINT "author_earnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_profiles" ADD CONSTRAINT "author_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_tips" ADD CONSTRAINT "author_tips_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_tips" ADD CONSTRAINT "author_tips_to_author_id_users_id_fk" FOREIGN KEY ("to_author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_milestones" ADD CONSTRAINT "battle_pass_milestones_battle_pass_id_battle_passes_id_fk" FOREIGN KEY ("battle_pass_id") REFERENCES "public"."battle_passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_purchases" ADD CONSTRAINT "battle_pass_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_purchases" ADD CONSTRAINT "battle_pass_purchases_battle_pass_id_battle_passes_id_fk" FOREIGN KEY ("battle_pass_id") REFERENCES "public"."battle_passes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_ad_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."ad_auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_ad_id_display_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."display_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_advertiser_id_users_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_transcripts" ADD CONSTRAINT "book_transcripts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_reactions" ADD CONSTRAINT "bulletin_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_replies" ADD CONSTRAINT "bulletin_replies_thread_id_bulletin_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."bulletin_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_replies" ADD CONSTRAINT "bulletin_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_threads" ADD CONSTRAINT "bulletin_threads_topic_id_bulletin_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."bulletin_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_threads" ADD CONSTRAINT "bulletin_threads_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_listening_log" ADD CONSTRAINT "daily_listening_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_ads" ADD CONSTRAINT "display_ads_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_ads" ADD CONSTRAINT "display_ads_advertiser_id_users_id_fk" FOREIGN KEY ("advertiser_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "easy_english_usage" ADD CONSTRAINT "easy_english_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_metrics" ADD CONSTRAINT "engagement_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_members" ADD CONSTRAINT "enterprise_members_enterprise_id_enterprise_accounts_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprise_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_members" ADD CONSTRAINT "enterprise_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_live_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."live_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expiring_rewards" ADD CONSTRAINT "expiring_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_accounts" ADD CONSTRAINT "family_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_family_accounts_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_members" ADD CONSTRAINT "institutional_members_institutional_id_institutional_accounts_id_fk" FOREIGN KEY ("institutional_id") REFERENCES "public"."institutional_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_members" ADD CONSTRAINT "institutional_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_history" ADD CONSTRAINT "listening_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_room_messages" ADD CONSTRAINT "listening_room_messages_room_id_listening_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."listening_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_room_messages" ADD CONSTRAINT "listening_room_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_room_participants" ADD CONSTRAINT "listening_room_participants_room_id_listening_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."listening_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_room_participants" ADD CONSTRAINT "listening_room_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_rooms" ADD CONSTRAINT "listening_rooms_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_sessions" ADD CONSTRAINT "listening_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_events" ADD CONSTRAINT "live_events_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_waitlist" ADD CONSTRAINT "loan_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_waitlist" ADD CONSTRAINT "loan_waitlist_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_publisher_id_users_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_feed_id_podcast_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."podcast_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_earnings" ADD CONSTRAINT "publisher_earnings_publisher_id_users_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_votes" ADD CONSTRAINT "queue_votes_queue_item_id_streaming_queue_items_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."streaming_queue_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_votes" ADD CONSTRAINT "queue_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_club_members" ADD CONSTRAINT "reading_club_members_club_id_reading_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."reading_clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_club_members" ADD CONSTRAINT "reading_club_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_clubs" ADD CONSTRAINT "reading_clubs_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_likes" ADD CONSTRAINT "review_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_likes" ADD CONSTRAINT "review_likes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_clips" ADD CONSTRAINT "share_clips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_clicks" ADD CONSTRAINT "slot_clicks_impression_id_slot_impressions_id_fk" FOREIGN KEY ("impression_id") REFERENCES "public"."slot_impressions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_clicks" ADD CONSTRAINT "slot_clicks_ad_id_display_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."display_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_auction_id_ad_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."ad_auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_ad_id_display_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."display_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_slot_id_ad_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."ad_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_freezes" ADD CONSTRAINT "streak_freezes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaming_queue_items" ADD CONSTRAINT "streaming_queue_items_queue_id_streaming_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."streaming_queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaming_queue_items" ADD CONSTRAINT "streaming_queue_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaming_queues" ADD CONSTRAINT "streaming_queues_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_events" ADD CONSTRAINT "user_activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_shares" ADD CONSTRAINT "user_activity_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_challenge_id_reading_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."reading_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_xp" ADD CONSTRAINT "user_xp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_pack_purchases" ADD CONSTRAINT "voice_pack_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_pack_purchases" ADD CONSTRAINT "voice_pack_purchases_voice_pack_id_voice_packs_id_fk" FOREIGN KEY ("voice_pack_id") REFERENCES "public"."voice_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_bank_entries" ADD CONSTRAINT "word_bank_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_a11y_meta_book" ON "accessibility_metadata" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_a11y_meta_score" ON "accessibility_metadata" USING btree ("accessibility_score");--> statement-breakpoint
CREATE INDEX "idx_a11y_prefs_user" ON "accessibility_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_a11y_reviews_book" ON "accessibility_reviews" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_a11y_reviews_user" ON "accessibility_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_a11y_reviews_status" ON "accessibility_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_a11y_reviews_disability" ON "accessibility_reviews" USING btree ("disability_type");--> statement-breakpoint
CREATE INDEX "idx_activity_user" ON "activity_feed" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activity_created" ON "activity_feed" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ad_auctions_slot" ON "ad_auctions" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "idx_ad_auctions_created" ON "ad_auctions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_campaign_advertiser" ON "ad_campaigns" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX "idx_campaign_status" ON "ad_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_creative_campaign" ON "ad_creatives" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_creative_status" ON "ad_creatives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ad_event_logs_user" ON "ad_event_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ad_event_logs_served" ON "ad_event_logs" USING btree ("served_at");--> statement-breakpoint
CREATE INDEX "idx_ad_event_logs_provider" ON "ad_event_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_impression_campaign" ON "ad_impressions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_impression_creative" ON "ad_impressions" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX "idx_impression_served" ON "ad_impressions" USING btree ("served_at");--> statement-breakpoint
CREATE INDEX "idx_ad_rewards_user" ON "ad_rewards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ad_rewards_impression" ON "ad_rewards" USING btree ("ad_impression_id");--> statement-breakpoint
CREATE INDEX "idx_ad_rewards_user_type" ON "ad_rewards" USING btree ("user_id","reward_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ad_rewards_user_impression" ON "ad_rewards" USING btree ("user_id","ad_impression_id");--> statement-breakpoint
CREATE INDEX "idx_ad_slots_publisher" ON "ad_slots" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "idx_ad_slots_active" ON "ad_slots" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_ad_slots_category" ON "ad_slots" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_annotation_sync_user_book" ON "annotation_sync" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "idx_author_earnings_user" ON "author_earnings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_author_earnings_book" ON "author_earnings" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_author_earnings_status" ON "author_earnings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_author_profiles_user" ON "author_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tips_from" ON "author_tips" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "idx_tips_to" ON "author_tips" USING btree ("to_author_id");--> statement-breakpoint
CREATE INDEX "idx_authors_name" ON "authors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_authors_ol_key" ON "authors" USING btree ("open_library_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_auto_response_log_recipient_sender_key" ON "auto_response_log" USING btree ("recipient","sender","dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_auto_response_log_expires" ON "auto_response_log" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_bp_milestones_pass" ON "battle_pass_milestones" USING btree ("battle_pass_id");--> statement-breakpoint
CREATE INDEX "idx_bpp_user" ON "battle_pass_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bpp_pass" ON "battle_pass_purchases" USING btree ("battle_pass_id");--> statement-breakpoint
CREATE INDEX "idx_bids_auction" ON "bids" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "idx_bids_ad" ON "bids" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "idx_bids_advertiser" ON "bids" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX "idx_loans_user" ON "book_loans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_loans_book" ON "book_loans" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_loans_status" ON "book_loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_loans_expires" ON "book_loans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_transcripts_book" ON "book_transcripts" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_transcripts_book_chapter" ON "book_transcripts" USING btree ("book_id","chapter_index");--> statement-breakpoint
CREATE INDEX "idx_book_visuals_book" ON "book_visuals" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_book_visuals_book_scene" ON "book_visuals" USING btree ("book_id","scene_index");--> statement-breakpoint
CREATE INDEX "idx_books_title" ON "books" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idx_books_author" ON "books" USING btree ("author");--> statement-breakpoint
CREATE INDEX "idx_books_genre" ON "books" USING btree ("genre");--> statement-breakpoint
CREATE INDEX "idx_books_source" ON "books" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_books_content_type" ON "books" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "idx_books_published_year" ON "books" USING btree ("published_year");--> statement-breakpoint
CREATE INDEX "idx_books_language" ON "books" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_books_premium" ON "books" USING btree ("is_premium");--> statement-breakpoint
CREATE INDEX "idx_books_source_content" ON "books" USING btree ("source","content_type");--> statement-breakpoint
CREATE INDEX "idx_books_genre_content" ON "books" USING btree ("genre","content_type");--> statement-breakpoint
CREATE INDEX "idx_bulletin_reactions_target" ON "bulletin_reactions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_bulletin_reactions_user" ON "bulletin_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bulletin_replies_thread" ON "bulletin_replies" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_bulletin_threads_topic_pinned" ON "bulletin_threads" USING btree ("topic_id","is_pinned","last_activity_at");--> statement-breakpoint
CREATE INDEX "idx_bulletin_threads_recent" ON "bulletin_threads" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "idx_bulletin_topics_active" ON "bulletin_topics" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "idx_chapters_book_id" ON "chapters" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_chapters_order" ON "chapters" USING btree ("book_id","chapter_number");--> statement-breakpoint
CREATE INDEX "idx_content_analytics_book" ON "content_analytics" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_content_analytics_author" ON "content_analytics" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "idx_content_analytics_date" ON "content_analytics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_reports_status" ON "content_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_reports_content" ON "content_reports" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_created_at" ON "conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_user_id" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_daily_log_user_date" ON "daily_listening_log" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_display_ads_campaign" ON "display_ads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_display_ads_advertiser" ON "display_ads" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX "idx_display_ads_status" ON "display_ads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_easy_english_cache_book_chapter" ON "easy_english_cache" USING btree ("book_id","chapter_number");--> statement-breakpoint
CREATE INDEX "idx_easy_english_usage_user_month" ON "easy_english_usage" USING btree ("user_id","year_month");--> statement-breakpoint
CREATE INDEX "idx_engagement_events_user_time" ON "engagement_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_engagement_events_type_time" ON "engagement_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_engagement_user" ON "engagement_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_engagement_churn" ON "engagement_metrics" USING btree ("churn_risk");--> statement-breakpoint
CREATE INDEX "idx_engagement_active" ON "engagement_metrics" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "idx_enterprise_email" ON "enterprise_accounts" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX "idx_ent_members_enterprise" ON "enterprise_members" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "idx_ent_members_user" ON "enterprise_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_entitlement_config_feature_tier" ON "entitlement_config" USING btree ("feature_key","tier");--> statement-breakpoint
CREATE INDEX "idx_entitlements_user" ON "entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_entitlements_user_book" ON "entitlements" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "idx_entitlements_feature" ON "entitlements" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "idx_entitlements_expires" ON "entitlements" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_event_chat_event" ON "event_chat_messages" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_event_rsvps_event" ON "event_rsvps" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_event_rsvps_user" ON "event_rsvps" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_event_rsvps_event_user" ON "event_rsvps" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_expiring_rewards_user" ON "expiring_rewards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_expiring_rewards_expires" ON "expiring_rewards" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_external_ratings_book" ON "external_ratings" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_family_owner" ON "family_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_family_members_family" ON "family_members" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "idx_family_members_user" ON "family_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_gift_cards_code" ON "gift_cards" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_gift_cards_from" ON "gift_cards" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "idx_gift_cards_status" ON "gift_cards" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_institutional_active" ON "institutional_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_inst_members_org" ON "institutional_members" USING btree ("institutional_id");--> statement-breakpoint
CREATE INDEX "idx_inst_members_user" ON "institutional_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_listening_history_user" ON "listening_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_listening_history_last_played" ON "listening_history" USING btree ("last_played_at");--> statement-breakpoint
CREATE INDEX "idx_room_msg_room" ON "listening_room_messages" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_room_msg_created" ON "listening_room_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_participant_room" ON "listening_room_participants" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_participant_user" ON "listening_room_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_room_host" ON "listening_rooms" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "idx_room_code" ON "listening_rooms" USING btree ("room_code");--> statement-breakpoint
CREATE INDEX "idx_room_status" ON "listening_rooms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_listening_sessions_user" ON "listening_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_listening_sessions_book" ON "listening_sessions" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_listening_sessions_started" ON "listening_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_live_events_status_start" ON "live_events" USING btree ("status","scheduled_start_at");--> statement-breakpoint
CREATE INDEX "idx_live_events_start" ON "live_events" USING btree ("scheduled_start_at");--> statement-breakpoint
CREATE INDEX "idx_waitlist_user" ON "loan_waitlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_waitlist_book" ON "loan_waitlist" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_waitlist_status" ON "loan_waitlist" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_created_at" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_moat_metrics_date" ON "moat_metrics_snapshots" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_notif_log_user" ON "notification_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notif_log_type" ON "notification_log" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_notif_log_sent" ON "notification_log" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "idx_tx_user" ON "payment_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tx_provider" ON "payment_transactions" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_tx_created" ON "payment_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tx_provider_txid" ON "payment_transactions" USING btree ("provider","provider_transaction_id");--> statement-breakpoint
CREATE INDEX "idx_payout_requests_publisher" ON "payout_requests" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "idx_payout_requests_status" ON "payout_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_playlist_items_playlist" ON "playlist_items" USING btree ("playlist_id");--> statement-breakpoint
CREATE INDEX "idx_playlist_items_position" ON "playlist_items" USING btree ("position");--> statement-breakpoint
CREATE INDEX "idx_playlists_user" ON "playlists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_playlists_curated" ON "playlists" USING btree ("is_curated");--> statement-breakpoint
CREATE INDEX "idx_playlists_category" ON "playlists" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_podcast_episodes_feed" ON "podcast_episodes" USING btree ("feed_id");--> statement-breakpoint
CREATE INDEX "idx_podcast_episodes_pub_date" ON "podcast_episodes" USING btree ("pub_date");--> statement-breakpoint
CREATE INDEX "idx_podcast_episodes_guid" ON "podcast_episodes" USING btree ("guid");--> statement-breakpoint
CREATE INDEX "idx_podcast_episodes_audio_url" ON "podcast_episodes" USING btree ("audio_url");--> statement-breakpoint
CREATE INDEX "idx_podcast_feeds_title" ON "podcast_feeds" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idx_product_events_type_time" ON "product_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_product_events_occurred" ON "product_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_purchases_user" ON "purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_purchases_book" ON "purchases" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_purchases_user_book" ON "purchases" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "idx_push_sub_user" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_push_sub_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "idx_qv_item" ON "queue_votes" USING btree ("queue_item_id");--> statement-breakpoint
CREATE INDEX "idx_qv_user" ON "queue_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_club_members_club" ON "reading_club_members" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_club_members_user" ON "reading_club_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_clubs_creator" ON "reading_clubs" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_referrer" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_code" ON "referrals" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "idx_review_likes_user" ON "review_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_review_likes_review" ON "review_likes" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_user" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_book" ON "reviews" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_created" ON "reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_share_clips_user" ON "share_clips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_share_clips_token" ON "share_clips" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "idx_slot_clicks_impression" ON "slot_clicks" USING btree ("impression_id");--> statement-breakpoint
CREATE INDEX "idx_slot_clicks_ad" ON "slot_clicks" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "idx_slot_impressions_ad" ON "slot_impressions" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "idx_slot_impressions_slot" ON "slot_impressions" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "idx_slot_impressions_advertiser" ON "slot_impressions" USING btree ("advertiser_id");--> statement-breakpoint
CREATE INDEX "idx_slot_impressions_publisher" ON "slot_impressions" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "idx_slot_impressions_served" ON "slot_impressions" USING btree ("served_at");--> statement-breakpoint
CREATE INDEX "idx_sponsored_queues_active" ON "sponsored_queues" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_sponsored_queues_dates" ON "sponsored_queues" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_streak_freezes_user" ON "streak_freezes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sqi_queue" ON "streaming_queue_items" USING btree ("queue_id");--> statement-breakpoint
CREATE INDEX "idx_sqi_position" ON "streaming_queue_items" USING btree ("queue_id","position");--> statement-breakpoint
CREATE INDEX "idx_sqi_status" ON "streaming_queue_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sq_host" ON "streaming_queues" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "idx_sq_status" ON "streaming_queues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sq_genre" ON "streaming_queues" USING btree ("genre");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_stripe" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_user_achievements_user" ON "user_achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_activity_user_time" ON "user_activity_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_user_activity_user_type" ON "user_activity_events" USING btree ("user_id","event_type");--> statement-breakpoint
CREATE INDEX "idx_user_activity_user_book" ON "user_activity_events" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "idx_user_activity_shares_user" ON "user_activity_shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_activity_shares_token" ON "user_activity_shares" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "idx_user_challenge_user" ON "user_challenge_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_challenge_challenge" ON "user_challenge_progress" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "idx_user_follows_follower" ON "user_follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "idx_user_follows_following" ON "user_follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "idx_user_goals_user" ON "user_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_streaks_user" ON "user_streaks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_xp_user" ON "user_xp" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_xp_total" ON "user_xp" USING btree ("total_xp");--> statement-breakpoint
CREATE INDEX "idx_vpp_user" ON "voice_pack_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vpp_pack" ON "voice_pack_purchases" USING btree ("voice_pack_id");--> statement-breakpoint
CREATE INDEX "idx_word_bank_user" ON "word_bank_entries" USING btree ("user_id");