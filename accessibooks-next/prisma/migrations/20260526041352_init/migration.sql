-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "narrator" TEXT,
    "description" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "cover_image" TEXT,
    "audio_url" TEXT,
    "content_url" TEXT,
    "genre" TEXT,
    "published_year" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'local',
    "source_id" TEXT,
    "total_time" TEXT,
    "language" TEXT DEFAULT 'English',
    "content_type" TEXT NOT NULL DEFAULT 'audiobook',
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "free_tier_available" BOOLEAN NOT NULL DEFAULT true,
    "ad_supported" BOOLEAN NOT NULL DEFAULT true,
    "transcript_available" BOOLEAN NOT NULL DEFAULT false,
    "narration_type" TEXT,
    "page_count" INTEGER,
    "search_vector" TEXT,
    "reading_level" INTEGER,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seeder_progress" (
    "source" TEXT NOT NULL,
    "current_offset" INTEGER NOT NULL DEFAULT 0,
    "subject_index" INTEGER NOT NULL DEFAULT 0,
    "next_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "total_inserted" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seeder_progress_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "book_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chapter_number" INTEGER NOT NULL,
    "start_time" INTEGER,
    "end_time" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "duration" INTEGER,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "sid" TEXT NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "profile_image_url" TEXT,
    "auth_provider" TEXT DEFAULT 'local',
    "provider_id" TEXT,
    "subscription_tier" TEXT DEFAULT 'free',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "subscription_end_date" TIMESTAMP(3),
    "stripe_easy_english_subscription_item_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "referral_code" TEXT,
    "referral_credits" INTEGER NOT NULL DEFAULT 0,
    "password_hash" TEXT,
    "name" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "role" TEXT,
    "company_name" TEXT,
    "website" TEXT,
    "subscription_status" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "book_title" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT DEFAULT 'usd',
    "stripe_payment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "purchased_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_history" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "book_title" TEXT NOT NULL,
    "book_author" TEXT,
    "book_cover" TEXT,
    "current_time" INTEGER NOT NULL DEFAULT 0,
    "total_duration" INTEGER,
    "last_played_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "play_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "listening_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_likes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_follows" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_ratings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "book_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rating" INTEGER,
    "review_count" INTEGER,
    "last_updated" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "birth_date" TEXT,
    "death_date" TEXT,
    "photo_url" TEXT,
    "open_library_key" TEXT,
    "wikipedia" TEXT,
    "last_updated" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover_image" TEXT,
    "is_public" INTEGER NOT NULL DEFAULT 1,
    "is_curated" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "playlist_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "book_title" TEXT NOT NULL,
    "book_author" TEXT,
    "book_cover" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_streaks" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_listened_date" TEXT,
    "streak_start_date" TEXT,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_xp" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "total_listening_minutes" INTEGER NOT NULL DEFAULT 0,
    "books_completed" INTEGER NOT NULL DEFAULT 0,
    "reviews_written" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_xp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "achievement_type" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_listening_log" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "minutes_listened" INTEGER NOT NULL DEFAULT 0,
    "books_started" INTEGER NOT NULL DEFAULT 0,
    "books_completed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_listening_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_goals" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "daily_minutes_goal" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "user_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_challenges" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target_books" INTEGER NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "badge_icon" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reading_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_challenge_progress" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "books_completed" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_challenge_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "referrer_id" TEXT NOT NULL,
    "referred_user_id" TEXT,
    "referral_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "credit_amount" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "favorite_genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferred_content_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "listening_habit" TEXT,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "welcome_bonus_granted" BOOLEAN NOT NULL DEFAULT false,
    "premium_trial_end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_submissions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "description" TEXT,
    "content_type" TEXT NOT NULL DEFAULT 'audiobook',
    "audio_url" TEXT,
    "content_url" TEXT,
    "cover_image" TEXT,
    "genre" TEXT,
    "language" TEXT DEFAULT 'English',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,
    "page_count" INTEGER,
    "published_at" TIMESTAMP(3),
    "total_plays" INTEGER NOT NULL DEFAULT 0,
    "total_reads" INTEGER NOT NULL DEFAULT 0,
    "file_size" INTEGER,
    "narrator" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_promoted" BOOLEAN NOT NULL DEFAULT false,
    "author_user_id" TEXT,

    CONSTRAINT "user_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_profiles" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "website" TEXT,
    "social_links" JSONB,
    "profile_image" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "total_plays" INTEGER NOT NULL DEFAULT 0,
    "total_listeners" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_analytics" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "book_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "listener_id" TEXT,
    "duration" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "podcast_feeds" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "feed_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "author" TEXT,
    "language" TEXT,
    "website_url" TEXT,
    "categories" JSONB,
    "etag" TEXT,
    "last_modified" TEXT,
    "last_fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "podcast_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "podcast_episodes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "feed_id" TEXT NOT NULL,
    "guid" TEXT,
    "title" TEXT NOT NULL,
    "description_text" TEXT,
    "description_html" TEXT,
    "pub_date" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "audio_url" TEXT NOT NULL,
    "audio_type" TEXT,
    "audio_length_bytes" INTEGER,
    "explicit" BOOLEAN,
    "transcript_url" TEXT,
    "transcript_status" TEXT NOT NULL DEFAULT 'none',
    "content_warnings" JSONB,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "podcast_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "enabled_types" TEXT[] DEFAULT ARRAY['streak_reminder', 'goal_nudge', 'new_content', 'achievement', 'recommendation', 're_engagement', 'author_update', 'system', 'rsvp_reminder', 'friend_digest', 'win_back', 'weekly_recap', 'streak_at_risk']::TEXT[],
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "sent_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "clicked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_rooms" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "book_id" TEXT NOT NULL,
    "book_title" TEXT NOT NULL,
    "book_author" TEXT,
    "book_cover" TEXT,
    "host_user_id" TEXT NOT NULL,
    "room_code" VARCHAR(8) NOT NULL,
    "room_name" TEXT,
    "max_listeners" INTEGER NOT NULL DEFAULT 10,
    "host_tier" VARCHAR(20) NOT NULL DEFAULT 'plus',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listening_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_room_participants" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" VARCHAR(10) NOT NULL DEFAULT 'guest',
    "joined_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listening_room_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_room_messages" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listening_room_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaming_queues" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "genre" TEXT,
    "host_user_id" TEXT NOT NULL,
    "current_book_id" TEXT,
    "current_book_title" TEXT,
    "current_book_author" TEXT,
    "current_book_cover" TEXT,
    "current_book_audio_url" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "listener_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streaming_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaming_queue_items" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "queue_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "book_title" TEXT NOT NULL,
    "book_author" TEXT,
    "book_cover" TEXT,
    "book_audio_url" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "added_by" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streaming_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_votes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "queue_item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "advertiser_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "budget_cents" INTEGER NOT NULL DEFAULT 0,
    "daily_budget_cents" INTEGER DEFAULT 0,
    "spent_cents" INTEGER NOT NULL DEFAULT 0,
    "daily_spend_cents" INTEGER NOT NULL DEFAULT 0,
    "cpm_bid_cents" INTEGER NOT NULL DEFAULT 500,
    "target_genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_time_slots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT DEFAULT 'other',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creatives" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audio_url" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "mime_type" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "file_size" INTEGER,
    "is_recorded" BOOLEAN NOT NULL DEFAULT false,
    "click_through_url" TEXT,
    "companion_image_url" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_transaction_id" TEXT,
    "type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "metadata" TEXT,
    "receipt_url" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_impressions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" TEXT NOT NULL,
    "creative_id" TEXT NOT NULL,
    "user_id" TEXT,
    "ad_type" VARCHAR(10) NOT NULL DEFAULT 'preroll',
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "quartile_25" BOOLEAN NOT NULL DEFAULT false,
    "quartile_50" BOOLEAN NOT NULL DEFAULT false,
    "quartile_75" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "served_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_freezes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "total_freezes" INTEGER NOT NULL DEFAULT 0,
    "used_freezes" INTEGER NOT NULL DEFAULT 0,
    "last_earned_at" TIMESTAMP(3),

    CONSTRAINT "streak_freezes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiring_rewards" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "reward_type" TEXT NOT NULL,
    "reward_value" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expiring_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_rewards" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "ad_impression_id" TEXT NOT NULL,
    "reward_type" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_earnings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "earning_type" TEXT NOT NULL,
    "gross_cents" INTEGER NOT NULL DEFAULT 0,
    "commission_cents" INTEGER NOT NULL DEFAULT 0,
    "platform_fee_pct" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_packs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "voices" TEXT[],
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "is_premium_included" BOOLEAN NOT NULL DEFAULT false,
    "preview_url" TEXT,
    "system_prompt" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_pack_purchases" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "voice_pack_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "stripe_payment_id" TEXT,
    "purchased_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_pack_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation_sync" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "annotations" TEXT NOT NULL DEFAULT '[]',
    "bookmarks" TEXT NOT NULL DEFAULT '[]',
    "last_synced_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "from_user_id" TEXT,
    "to_email" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "balance_remaining" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'credits',
    "tier_gift" TEXT,
    "months_gift" INTEGER,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "redeemed_by" TEXT,
    "redeemed_at" TIMESTAMP(3),

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_accounts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "org_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'education',
    "max_seats" INTEGER NOT NULL DEFAULT 50,
    "current_seats" INTEGER NOT NULL DEFAULT 0,
    "amount_cents" INTEGER NOT NULL DEFAULT 9900,
    "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
    "stripe_subscription_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_members" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "enterprise_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "added_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_queues" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "sponsor_name" TEXT NOT NULL,
    "queue_id" TEXT,
    "ad_audio_url" TEXT,
    "sponsor_logo" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsored_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_accounts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL DEFAULT 'Family Plan',
    "max_members" INTEGER NOT NULL DEFAULT 5,
    "amount_cents" INTEGER NOT NULL DEFAULT 799,
    "stripe_subscription_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_members" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "family_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "added_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_tips" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "from_user_id" TEXT NOT NULL,
    "to_author_id" TEXT NOT NULL,
    "book_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "stripe_payment_id" TEXT,
    "message" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "author_tips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_feed" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "book_id" TEXT,
    "book_title" TEXT,
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_clubs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "creator_id" TEXT NOT NULL,
    "current_book_id" TEXT,
    "current_book_title" TEXT,
    "member_count" INTEGER NOT NULL DEFAULT 1,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_club_members" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "club_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_club_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_visuals" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "book_id" TEXT NOT NULL,
    "scene_index" INTEGER NOT NULL,
    "page_start" INTEGER NOT NULL,
    "page_end" INTEGER NOT NULL,
    "scene_description" TEXT NOT NULL,
    "video_prompt" TEXT NOT NULL,
    "video_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_visuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_metrics" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "last_active_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "total_sessions_last_30d" INTEGER NOT NULL DEFAULT 0,
    "total_minutes_last_30d" INTEGER NOT NULL DEFAULT 0,
    "churn_risk" TEXT NOT NULL DEFAULT 'low',
    "winback_offer_sent" BOOLEAN NOT NULL DEFAULT false,
    "winback_offer_sent_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_loans" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "loaned_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "returned_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "download_token" TEXT NOT NULL,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "max_downloads" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "book_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_waitlist" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'waiting',

    CONSTRAINT "loan_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessibility_preferences" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "active_preset" TEXT,
    "synced_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "reduce_distraction" BOOLEAN NOT NULL DEFAULT false,
    "high_contrast" BOOLEAN NOT NULL DEFAULT false,
    "dyslexia_friendly" BOOLEAN NOT NULL DEFAULT false,
    "captions_preferred" BOOLEAN NOT NULL DEFAULT false,
    "transcript_open_by_default" BOOLEAN NOT NULL DEFAULT false,
    "font_size_scale" INTEGER NOT NULL DEFAULT 100,
    "reading_speed" INTEGER NOT NULL DEFAULT 100,
    "color_mode" TEXT NOT NULL DEFAULT 'system',
    "focus_mode" BOOLEAN NOT NULL DEFAULT false,
    "symbol_support" BOOLEAN NOT NULL DEFAULT false,
    "sign_language_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessibility_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_transcripts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "book_id" TEXT NOT NULL,
    "chapter_index" INTEGER NOT NULL DEFAULT 0,
    "segments" JSONB NOT NULL DEFAULT '[]',
    "language" TEXT NOT NULL DEFAULT 'en',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessibility_metadata" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "book_id" TEXT NOT NULL,
    "has_transcript" BOOLEAN NOT NULL DEFAULT false,
    "has_dyslexia_font" BOOLEAN NOT NULL DEFAULT false,
    "has_large_text" BOOLEAN NOT NULL DEFAULT false,
    "reading_level" TEXT,
    "content_warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessibility_score" INTEGER DEFAULT 0,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessibility_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessibility_reviews" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "disability_type" TEXT NOT NULL DEFAULT 'other',
    "rating" INTEGER NOT NULL,
    "screen_reader_score" INTEGER,
    "navigation_score" INTEGER,
    "contrast_score" INTEGER,
    "audio_quality_score" INTEGER,
    "comments" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessibility_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutional_accounts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "org_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "org_type" TEXT NOT NULL DEFAULT 'school',
    "max_seats" INTEGER NOT NULL DEFAULT 50,
    "current_seats" INTEGER NOT NULL DEFAULT 0,
    "amount_cents" INTEGER NOT NULL DEFAULT 9900,
    "features" JSONB NOT NULL DEFAULT '{"adFree":true,"premiumContent":true,"analytics":true}',
    "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
    "stripe_subscription_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "weekly_goal_minutes" INTEGER NOT NULL DEFAULT 180,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutional_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutional_members" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "institutional_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "added_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutional_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moat_metrics_snapshots" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_a11y_reviews" INTEGER NOT NULL DEFAULT 0,
    "avg_a11y_score" INTEGER NOT NULL DEFAULT 0,
    "transcript_coverage" INTEGER NOT NULL DEFAULT 0,
    "prefs_synced_users" INTEGER NOT NULL DEFAULT 0,
    "institutional_orgs" INTEGER NOT NULL DEFAULT 0,
    "recommendation_clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "moat_metrics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "easy_english_cache" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "book_id" TEXT NOT NULL,
    "chapter_number" INTEGER NOT NULL,
    "original_text" TEXT NOT NULL,
    "converted_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "easy_english_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "easy_english_usage" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "year_month" TEXT NOT NULL,
    "chapters_converted" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "easy_english_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_ads" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" TEXT NOT NULL,
    "advertiser_id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT,
    "image_url" TEXT,
    "destination_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "max_cpm_cents" INTEGER NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "impression_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "display_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_slots" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "publisher_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website_url" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 728,
    "height" INTEGER NOT NULL DEFAULT 90,
    "category" TEXT NOT NULL DEFAULT 'other',
    "min_cpm_cents" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "total_impressions" INTEGER NOT NULL DEFAULT 0,
    "total_earnings_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_auctions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "slot_id" TEXT NOT NULL,
    "winning_ad_id" TEXT,
    "winning_cpm_cents" INTEGER NOT NULL DEFAULT 0,
    "second_price_cpm_cents" INTEGER NOT NULL DEFAULT 0,
    "bids_considered" INTEGER NOT NULL DEFAULT 0,
    "no_fill" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_impressions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "auction_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "advertiser_id" TEXT NOT NULL,
    "publisher_id" TEXT NOT NULL,
    "cpm_cents" INTEGER NOT NULL DEFAULT 0,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "served_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_clicks" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "impression_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "clicked_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertiser_wallets" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "advertiser_id" TEXT NOT NULL,
    "balance_cents" INTEGER NOT NULL DEFAULT 0,
    "total_topup_cents" INTEGER NOT NULL DEFAULT 0,
    "total_spend_cents" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertiser_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publisher_earnings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "publisher_id" TEXT NOT NULL,
    "total_earned_cents" INTEGER NOT NULL DEFAULT 0,
    "pending_cents" INTEGER NOT NULL DEFAULT 0,
    "paid_out_cents" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publisher_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "publisher_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_details" TEXT,
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "auction_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "advertiser_id" TEXT NOT NULL,
    "cpm_cents" INTEGER NOT NULL DEFAULT 0,
    "is_winner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_bank_entries" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "definition" TEXT,
    "image_url" TEXT,
    "saved_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_bank_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_monthly_cents" INTEGER NOT NULL DEFAULT 0,
    "price_yearly_cents" INTEGER NOT NULL DEFAULT 0,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "trial_end" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "stripe_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "tier" TEXT,
    "book_id" TEXT,
    "feature" TEXT,
    "granted_tier" TEXT,
    "expires_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_event_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT,
    "ad_id" TEXT NOT NULL,
    "ad_type" VARCHAR(32) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "placement_id" VARCHAR(64),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "served_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_type" VARCHAR(100) NOT NULL,
    "user_tier" VARCHAR(20) NOT NULL DEFAULT 'free',
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_sessions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "device_type" TEXT,
    "started_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "minutes_listened" INTEGER NOT NULL DEFAULT 0,
    "interrupted_by" TEXT,

    CONSTRAINT "listening_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "category" VARCHAR(60),
    "outcome" VARCHAR(40) NOT NULL DEFAULT 'sent',
    "reason" VARCHAR(60),
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_topics" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "icon_emoji" VARCHAR(10),
    "premium_only_post" BOOLEAN NOT NULL DEFAULT false,
    "premium_only_view" BOOLEAN NOT NULL DEFAULT false,
    "is_accessibility_category" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletin_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_threads" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "topic_id" TEXT NOT NULL,
    "author_user_id" TEXT,
    "author_display_name" VARCHAR(120) NOT NULL DEFAULT 'AccessiBooks',
    "kind" VARCHAR(20) NOT NULL DEFAULT 'discussion',
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "reaction_count" INTEGER NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletin_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_replies" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" TEXT NOT NULL,
    "parent_reply_id" TEXT,
    "author_user_id" TEXT NOT NULL,
    "author_display_name" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "reaction_count" INTEGER NOT NULL DEFAULT 0,
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletin_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_reactions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "target_type" VARCHAR(16) NOT NULL,
    "target_id" TEXT NOT NULL,
    "emoji" VARCHAR(16) NOT NULL DEFAULT '👍',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletin_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_type" VARCHAR(32) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT NOT NULL,
    "host_user_id" TEXT,
    "host_display_name" VARCHAR(120) NOT NULL DEFAULT 'AccessiBooks',
    "book_id" TEXT,
    "book_title" VARCHAR(240),
    "scheduled_start_at" TIMESTAMP(3) NOT NULL,
    "scheduled_end_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "listening_room_id" TEXT,
    "replay_url" TEXT,
    "rsvp_count" INTEGER NOT NULL DEFAULT 0,
    "attended_count" INTEGER NOT NULL DEFAULT 0,
    "free_replay_preview_seconds" INTEGER NOT NULL DEFAULT 600,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rsvps" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attended_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_chat_messages" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_clips" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "book_title" VARCHAR(240) NOT NULL,
    "start_sec" INTEGER NOT NULL,
    "end_sec" INTEGER NOT NULL,
    "quote" TEXT,
    "share_token" VARCHAR(32) NOT NULL,
    "hide_attribution" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activity_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "book_id" TEXT,
    "book_title" TEXT,
    "duration_seconds" INTEGER,
    "outcome_tag" VARCHAR(40),
    "note" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activity_shares" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "caregiver_label" TEXT NOT NULL,
    "share_token" VARCHAR(64) NOT NULL,
    "range_from" TIMESTAMP(3),
    "range_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_activity_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_config" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "feature_key" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_response_log" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "recipient" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_response_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_books_title" ON "books"("title");

-- CreateIndex
CREATE INDEX "idx_books_author" ON "books"("author");

-- CreateIndex
CREATE INDEX "idx_books_genre" ON "books"("genre");

-- CreateIndex
CREATE INDEX "idx_books_source" ON "books"("source");

-- CreateIndex
CREATE INDEX "idx_books_content_type" ON "books"("content_type");

-- CreateIndex
CREATE INDEX "idx_books_published_year" ON "books"("published_year");

-- CreateIndex
CREATE INDEX "idx_books_language" ON "books"("language");

-- CreateIndex
CREATE INDEX "idx_books_premium" ON "books"("is_premium");

-- CreateIndex
CREATE INDEX "idx_books_source_content" ON "books"("source", "content_type");

-- CreateIndex
CREATE INDEX "idx_books_genre_content" ON "books"("genre", "content_type");

-- CreateIndex
CREATE INDEX "idx_chapters_book_id" ON "chapters"("book_id");

-- CreateIndex
CREATE INDEX "idx_chapters_order" ON "chapters"("book_id", "chapter_number");

-- CreateIndex
CREATE INDEX "IDX_session_expire" ON "sessions"("expire");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "idx_purchases_user" ON "purchases"("user_id");

-- CreateIndex
CREATE INDEX "idx_purchases_book" ON "purchases"("book_id");

-- CreateIndex
CREATE INDEX "idx_purchases_user_book" ON "purchases"("user_id", "book_id");

-- CreateIndex
CREATE INDEX "idx_listening_history_user" ON "listening_history"("user_id");

-- CreateIndex
CREATE INDEX "idx_listening_history_last_played" ON "listening_history"("last_played_at");

-- CreateIndex
CREATE INDEX "idx_reviews_user" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "idx_reviews_book" ON "reviews"("book_id");

-- CreateIndex
CREATE INDEX "idx_reviews_created" ON "reviews"("created_at");

-- CreateIndex
CREATE INDEX "idx_review_likes_user" ON "review_likes"("user_id");

-- CreateIndex
CREATE INDEX "idx_review_likes_review" ON "review_likes"("review_id");

-- CreateIndex
CREATE INDEX "idx_user_follows_follower" ON "user_follows"("follower_id");

-- CreateIndex
CREATE INDEX "idx_user_follows_following" ON "user_follows"("following_id");

-- CreateIndex
CREATE INDEX "idx_external_ratings_book" ON "external_ratings"("book_id");

-- CreateIndex
CREATE INDEX "idx_authors_name" ON "authors"("name");

-- CreateIndex
CREATE INDEX "idx_authors_ol_key" ON "authors"("open_library_key");

-- CreateIndex
CREATE INDEX "idx_playlists_user" ON "playlists"("user_id");

-- CreateIndex
CREATE INDEX "idx_playlists_curated" ON "playlists"("is_curated");

-- CreateIndex
CREATE INDEX "idx_playlists_category" ON "playlists"("category");

-- CreateIndex
CREATE INDEX "idx_playlist_items_playlist" ON "playlist_items"("playlist_id");

-- CreateIndex
CREATE INDEX "idx_playlist_items_position" ON "playlist_items"("position");

-- CreateIndex
CREATE INDEX "idx_user_streaks_user" ON "user_streaks"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_xp_user" ON "user_xp"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_xp_total" ON "user_xp"("total_xp");

-- CreateIndex
CREATE INDEX "idx_user_achievements_user" ON "user_achievements"("user_id");

-- CreateIndex
CREATE INDEX "idx_daily_log_user_date" ON "daily_listening_log"("user_id", "date");

-- CreateIndex
CREATE INDEX "idx_user_goals_user" ON "user_goals"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_challenge_user" ON "user_challenge_progress"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_challenge_challenge" ON "user_challenge_progress"("challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referral_code_key" ON "referrals"("referral_code");

-- CreateIndex
CREATE INDEX "idx_referrals_referrer" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "idx_referrals_code" ON "referrals"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "author_profiles_user_id_key" ON "author_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_author_profiles_user" ON "author_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_content_analytics_book" ON "content_analytics"("book_id");

-- CreateIndex
CREATE INDEX "idx_content_analytics_author" ON "content_analytics"("author_user_id");

-- CreateIndex
CREATE INDEX "idx_content_analytics_date" ON "content_analytics"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "podcast_feeds_feed_url_key" ON "podcast_feeds"("feed_url");

-- CreateIndex
CREATE INDEX "idx_podcast_feeds_title" ON "podcast_feeds"("title");

-- CreateIndex
CREATE INDEX "idx_podcast_episodes_feed" ON "podcast_episodes"("feed_id");

-- CreateIndex
CREATE INDEX "idx_podcast_episodes_pub_date" ON "podcast_episodes"("pub_date");

-- CreateIndex
CREATE INDEX "idx_podcast_episodes_guid" ON "podcast_episodes"("guid");

-- CreateIndex
CREATE INDEX "idx_podcast_episodes_audio_url" ON "podcast_episodes"("audio_url");

-- CreateIndex
CREATE INDEX "idx_push_sub_user" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_push_sub_endpoint" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "idx_notif_log_user" ON "notification_log"("user_id");

-- CreateIndex
CREATE INDEX "idx_notif_log_type" ON "notification_log"("type");

-- CreateIndex
CREATE INDEX "idx_notif_log_sent" ON "notification_log"("sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "listening_rooms_room_code_key" ON "listening_rooms"("room_code");

-- CreateIndex
CREATE INDEX "idx_room_host" ON "listening_rooms"("host_user_id");

-- CreateIndex
CREATE INDEX "idx_room_code" ON "listening_rooms"("room_code");

-- CreateIndex
CREATE INDEX "idx_room_status" ON "listening_rooms"("status");

-- CreateIndex
CREATE INDEX "idx_participant_room" ON "listening_room_participants"("room_id");

-- CreateIndex
CREATE INDEX "idx_participant_user" ON "listening_room_participants"("user_id");

-- CreateIndex
CREATE INDEX "idx_room_msg_room" ON "listening_room_messages"("room_id");

-- CreateIndex
CREATE INDEX "idx_room_msg_created" ON "listening_room_messages"("created_at");

-- CreateIndex
CREATE INDEX "idx_sq_host" ON "streaming_queues"("host_user_id");

-- CreateIndex
CREATE INDEX "idx_sq_status" ON "streaming_queues"("status");

-- CreateIndex
CREATE INDEX "idx_sq_genre" ON "streaming_queues"("genre");

-- CreateIndex
CREATE INDEX "idx_sqi_queue" ON "streaming_queue_items"("queue_id");

-- CreateIndex
CREATE INDEX "idx_sqi_position" ON "streaming_queue_items"("queue_id", "position");

-- CreateIndex
CREATE INDEX "idx_sqi_status" ON "streaming_queue_items"("status");

-- CreateIndex
CREATE INDEX "idx_qv_item" ON "queue_votes"("queue_item_id");

-- CreateIndex
CREATE INDEX "idx_qv_user" ON "queue_votes"("user_id");

-- CreateIndex
CREATE INDEX "idx_campaign_advertiser" ON "ad_campaigns"("advertiser_id");

-- CreateIndex
CREATE INDEX "idx_campaign_status" ON "ad_campaigns"("status");

-- CreateIndex
CREATE INDEX "idx_creative_campaign" ON "ad_creatives"("campaign_id");

-- CreateIndex
CREATE INDEX "idx_creative_status" ON "ad_creatives"("status");

-- CreateIndex
CREATE INDEX "idx_tx_user" ON "payment_transactions"("user_id");

-- CreateIndex
CREATE INDEX "idx_tx_provider" ON "payment_transactions"("provider");

-- CreateIndex
CREATE INDEX "idx_tx_created" ON "payment_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_tx_provider_txid" ON "payment_transactions"("provider", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "idx_impression_campaign" ON "ad_impressions"("campaign_id");

-- CreateIndex
CREATE INDEX "idx_impression_creative" ON "ad_impressions"("creative_id");

-- CreateIndex
CREATE INDEX "idx_impression_served" ON "ad_impressions"("served_at");

-- CreateIndex
CREATE INDEX "idx_streak_freezes_user" ON "streak_freezes"("user_id");

-- CreateIndex
CREATE INDEX "idx_expiring_rewards_user" ON "expiring_rewards"("user_id");

-- CreateIndex
CREATE INDEX "idx_expiring_rewards_expires" ON "expiring_rewards"("expires_at");

-- CreateIndex
CREATE INDEX "idx_ad_rewards_user" ON "ad_rewards"("user_id");

-- CreateIndex
CREATE INDEX "idx_ad_rewards_impression" ON "ad_rewards"("ad_impression_id");

-- CreateIndex
CREATE INDEX "idx_ad_rewards_user_type" ON "ad_rewards"("user_id", "reward_type");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_ad_rewards_user_impression" ON "ad_rewards"("user_id", "ad_impression_id");

-- CreateIndex
CREATE INDEX "idx_author_earnings_user" ON "author_earnings"("user_id");

-- CreateIndex
CREATE INDEX "idx_author_earnings_book" ON "author_earnings"("book_id");

-- CreateIndex
CREATE INDEX "idx_author_earnings_status" ON "author_earnings"("status");

-- CreateIndex
CREATE INDEX "idx_vpp_user" ON "voice_pack_purchases"("user_id");

-- CreateIndex
CREATE INDEX "idx_vpp_pack" ON "voice_pack_purchases"("voice_pack_id");

-- CreateIndex
CREATE INDEX "idx_annotation_sync_user_book" ON "annotation_sync"("user_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_code_key" ON "gift_cards"("code");

-- CreateIndex
CREATE INDEX "idx_gift_cards_code" ON "gift_cards"("code");

-- CreateIndex
CREATE INDEX "idx_gift_cards_from" ON "gift_cards"("from_user_id");

-- CreateIndex
CREATE INDEX "idx_gift_cards_status" ON "gift_cards"("status");

-- CreateIndex
CREATE INDEX "idx_enterprise_email" ON "enterprise_accounts"("contact_email");

-- CreateIndex
CREATE INDEX "idx_ent_members_enterprise" ON "enterprise_members"("enterprise_id");

-- CreateIndex
CREATE INDEX "idx_ent_members_user" ON "enterprise_members"("user_id");

-- CreateIndex
CREATE INDEX "idx_sponsored_queues_active" ON "sponsored_queues"("is_active");

-- CreateIndex
CREATE INDEX "idx_sponsored_queues_dates" ON "sponsored_queues"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_family_owner" ON "family_accounts"("owner_id");

-- CreateIndex
CREATE INDEX "idx_family_members_family" ON "family_members"("family_id");

-- CreateIndex
CREATE INDEX "idx_family_members_user" ON "family_members"("user_id");

-- CreateIndex
CREATE INDEX "idx_tips_from" ON "author_tips"("from_user_id");

-- CreateIndex
CREATE INDEX "idx_tips_to" ON "author_tips"("to_author_id");

-- CreateIndex
CREATE INDEX "idx_reports_status" ON "content_reports"("status");

-- CreateIndex
CREATE INDEX "idx_reports_content" ON "content_reports"("content_type", "content_id");

-- CreateIndex
CREATE INDEX "idx_activity_user" ON "activity_feed"("user_id");

-- CreateIndex
CREATE INDEX "idx_activity_created" ON "activity_feed"("created_at");

-- CreateIndex
CREATE INDEX "idx_clubs_creator" ON "reading_clubs"("creator_id");

-- CreateIndex
CREATE INDEX "idx_club_members_club" ON "reading_club_members"("club_id");

-- CreateIndex
CREATE INDEX "idx_club_members_user" ON "reading_club_members"("user_id");

-- CreateIndex
CREATE INDEX "idx_book_visuals_book" ON "book_visuals"("book_id");

-- CreateIndex
CREATE INDEX "idx_book_visuals_book_scene" ON "book_visuals"("book_id", "scene_index");

-- CreateIndex
CREATE INDEX "idx_engagement_user" ON "engagement_metrics"("user_id");

-- CreateIndex
CREATE INDEX "idx_engagement_churn" ON "engagement_metrics"("churn_risk");

-- CreateIndex
CREATE INDEX "idx_engagement_active" ON "engagement_metrics"("last_active_at");

-- CreateIndex
CREATE INDEX "idx_loans_user" ON "book_loans"("user_id");

-- CreateIndex
CREATE INDEX "idx_loans_book" ON "book_loans"("book_id");

-- CreateIndex
CREATE INDEX "idx_loans_status" ON "book_loans"("status");

-- CreateIndex
CREATE INDEX "idx_loans_expires" ON "book_loans"("expires_at");

-- CreateIndex
CREATE INDEX "idx_waitlist_user" ON "loan_waitlist"("user_id");

-- CreateIndex
CREATE INDEX "idx_waitlist_book" ON "loan_waitlist"("book_id");

-- CreateIndex
CREATE INDEX "idx_waitlist_status" ON "loan_waitlist"("status");

-- CreateIndex
CREATE UNIQUE INDEX "accessibility_preferences_user_id_key" ON "accessibility_preferences"("user_id");

-- CreateIndex
CREATE INDEX "idx_a11y_prefs_user" ON "accessibility_preferences"("user_id");

-- CreateIndex
CREATE INDEX "idx_transcripts_book" ON "book_transcripts"("book_id");

-- CreateIndex
CREATE INDEX "idx_transcripts_book_chapter" ON "book_transcripts"("book_id", "chapter_index");

-- CreateIndex
CREATE UNIQUE INDEX "accessibility_metadata_book_id_key" ON "accessibility_metadata"("book_id");

-- CreateIndex
CREATE INDEX "idx_a11y_meta_book" ON "accessibility_metadata"("book_id");

-- CreateIndex
CREATE INDEX "idx_a11y_meta_score" ON "accessibility_metadata"("accessibility_score");

-- CreateIndex
CREATE INDEX "idx_a11y_reviews_book" ON "accessibility_reviews"("book_id");

-- CreateIndex
CREATE INDEX "idx_a11y_reviews_user" ON "accessibility_reviews"("user_id");

-- CreateIndex
CREATE INDEX "idx_a11y_reviews_status" ON "accessibility_reviews"("status");

-- CreateIndex
CREATE INDEX "idx_a11y_reviews_disability" ON "accessibility_reviews"("disability_type");

-- CreateIndex
CREATE INDEX "idx_institutional_active" ON "institutional_accounts"("is_active");

-- CreateIndex
CREATE INDEX "idx_inst_members_org" ON "institutional_members"("institutional_id");

-- CreateIndex
CREATE INDEX "idx_inst_members_user" ON "institutional_members"("user_id");

-- CreateIndex
CREATE INDEX "idx_moat_metrics_date" ON "moat_metrics_snapshots"("date");

-- CreateIndex
CREATE INDEX "idx_conversations_created_at" ON "conversations"("created_at");

-- CreateIndex
CREATE INDEX "idx_conversations_user_id" ON "conversations"("user_id");

-- CreateIndex
CREATE INDEX "idx_messages_conversation_id" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_messages_created_at" ON "messages"("created_at");

-- CreateIndex
CREATE INDEX "idx_easy_english_cache_book_chapter" ON "easy_english_cache"("book_id", "chapter_number");

-- CreateIndex
CREATE INDEX "idx_easy_english_usage_user_month" ON "easy_english_usage"("user_id", "year_month");

-- CreateIndex
CREATE INDEX "idx_display_ads_campaign" ON "display_ads"("campaign_id");

-- CreateIndex
CREATE INDEX "idx_display_ads_advertiser" ON "display_ads"("advertiser_id");

-- CreateIndex
CREATE INDEX "idx_display_ads_status" ON "display_ads"("status");

-- CreateIndex
CREATE INDEX "idx_ad_slots_publisher" ON "ad_slots"("publisher_id");

-- CreateIndex
CREATE INDEX "idx_ad_slots_active" ON "ad_slots"("is_active");

-- CreateIndex
CREATE INDEX "idx_ad_slots_category" ON "ad_slots"("category");

-- CreateIndex
CREATE INDEX "idx_ad_auctions_slot" ON "ad_auctions"("slot_id");

-- CreateIndex
CREATE INDEX "idx_ad_auctions_created" ON "ad_auctions"("created_at");

-- CreateIndex
CREATE INDEX "idx_slot_impressions_ad" ON "slot_impressions"("ad_id");

-- CreateIndex
CREATE INDEX "idx_slot_impressions_slot" ON "slot_impressions"("slot_id");

-- CreateIndex
CREATE INDEX "idx_slot_impressions_advertiser" ON "slot_impressions"("advertiser_id");

-- CreateIndex
CREATE INDEX "idx_slot_impressions_publisher" ON "slot_impressions"("publisher_id");

-- CreateIndex
CREATE INDEX "idx_slot_impressions_served" ON "slot_impressions"("served_at");

-- CreateIndex
CREATE INDEX "idx_slot_clicks_impression" ON "slot_clicks"("impression_id");

-- CreateIndex
CREATE INDEX "idx_slot_clicks_ad" ON "slot_clicks"("ad_id");

-- CreateIndex
CREATE UNIQUE INDEX "advertiser_wallets_advertiser_id_key" ON "advertiser_wallets"("advertiser_id");

-- CreateIndex
CREATE UNIQUE INDEX "publisher_earnings_publisher_id_key" ON "publisher_earnings"("publisher_id");

-- CreateIndex
CREATE INDEX "idx_payout_requests_publisher" ON "payout_requests"("publisher_id");

-- CreateIndex
CREATE INDEX "idx_payout_requests_status" ON "payout_requests"("status");

-- CreateIndex
CREATE INDEX "idx_bids_auction" ON "bids"("auction_id");

-- CreateIndex
CREATE INDEX "idx_bids_ad" ON "bids"("ad_id");

-- CreateIndex
CREATE INDEX "idx_bids_advertiser" ON "bids"("advertiser_id");

-- CreateIndex
CREATE INDEX "idx_word_bank_user" ON "word_bank_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_tier_key" ON "plans"("tier");

-- CreateIndex
CREATE INDEX "idx_subscriptions_user" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_status" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "idx_subscriptions_stripe" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "idx_entitlements_user" ON "entitlements"("user_id");

-- CreateIndex
CREATE INDEX "idx_entitlements_user_book" ON "entitlements"("user_id", "book_id");

-- CreateIndex
CREATE INDEX "idx_entitlements_feature" ON "entitlements"("feature");

-- CreateIndex
CREATE INDEX "idx_entitlements_expires" ON "entitlements"("expires_at");

-- CreateIndex
CREATE INDEX "idx_ad_event_logs_user" ON "ad_event_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_ad_event_logs_served" ON "ad_event_logs"("served_at");

-- CreateIndex
CREATE INDEX "idx_ad_event_logs_provider" ON "ad_event_logs"("provider");

-- CreateIndex
CREATE INDEX "idx_product_events_type_time" ON "product_events"("event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_product_events_occurred" ON "product_events"("occurred_at");

-- CreateIndex
CREATE INDEX "idx_listening_sessions_user" ON "listening_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_listening_sessions_book" ON "listening_sessions"("book_id");

-- CreateIndex
CREATE INDEX "idx_listening_sessions_started" ON "listening_sessions"("started_at");

-- CreateIndex
CREATE INDEX "idx_engagement_events_user_time" ON "engagement_events"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_engagement_events_type_time" ON "engagement_events"("event_type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "bulletin_topics_slug_key" ON "bulletin_topics"("slug");

-- CreateIndex
CREATE INDEX "idx_bulletin_topics_active" ON "bulletin_topics"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "idx_bulletin_threads_topic_pinned" ON "bulletin_threads"("topic_id", "is_pinned", "last_activity_at");

-- CreateIndex
CREATE INDEX "idx_bulletin_threads_recent" ON "bulletin_threads"("last_activity_at");

-- CreateIndex
CREATE INDEX "idx_bulletin_replies_thread" ON "bulletin_replies"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_bulletin_reactions_target" ON "bulletin_reactions"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "idx_bulletin_reactions_user" ON "bulletin_reactions"("user_id");

-- CreateIndex
CREATE INDEX "idx_live_events_status_start" ON "live_events"("status", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "idx_live_events_start" ON "live_events"("scheduled_start_at");

-- CreateIndex
CREATE INDEX "idx_event_rsvps_event" ON "event_rsvps"("event_id");

-- CreateIndex
CREATE INDEX "idx_event_rsvps_user" ON "event_rsvps"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_event_rsvps_event_user" ON "event_rsvps"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_event_chat_event" ON "event_chat_messages"("event_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "share_clips_share_token_key" ON "share_clips"("share_token");

-- CreateIndex
CREATE INDEX "idx_share_clips_user" ON "share_clips"("user_id");

-- CreateIndex
CREATE INDEX "idx_share_clips_token" ON "share_clips"("share_token");

-- CreateIndex
CREATE INDEX "idx_user_activity_user_time" ON "user_activity_events"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_user_activity_user_type" ON "user_activity_events"("user_id", "event_type");

-- CreateIndex
CREATE INDEX "idx_user_activity_user_book" ON "user_activity_events"("user_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_activity_shares_share_token_key" ON "user_activity_shares"("share_token");

-- CreateIndex
CREATE INDEX "idx_user_activity_shares_user" ON "user_activity_shares"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_activity_shares_token" ON "user_activity_shares"("share_token");

-- CreateIndex
CREATE UNIQUE INDEX "ux_entitlement_config_feature_tier" ON "entitlement_config"("feature_key", "tier");

-- CreateIndex
CREATE INDEX "idx_auto_response_log_expires" ON "auto_response_log"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ux_auto_response_log_recipient_sender_key" ON "auto_response_log"("recipient", "sender", "dedupe_key");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_history" ADD CONSTRAINT "listening_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_likes" ADD CONSTRAINT "review_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_likes" ADD CONSTRAINT "review_likes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_xp" ADD CONSTRAINT "user_xp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_listening_log" ADD CONSTRAINT "daily_listening_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "reading_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_profiles" ADD CONSTRAINT "author_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "podcast_feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_rooms" ADD CONSTRAINT "listening_rooms_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_room_participants" ADD CONSTRAINT "listening_room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "listening_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_room_participants" ADD CONSTRAINT "listening_room_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_room_messages" ADD CONSTRAINT "listening_room_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "listening_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_room_messages" ADD CONSTRAINT "listening_room_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_queues" ADD CONSTRAINT "streaming_queues_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_queue_items" ADD CONSTRAINT "streaming_queue_items_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "streaming_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_queue_items" ADD CONSTRAINT "streaming_queue_items_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_votes" ADD CONSTRAINT "queue_votes_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "streaming_queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_votes" ADD CONSTRAINT "queue_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "ad_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_freezes" ADD CONSTRAINT "streak_freezes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiring_rewards" ADD CONSTRAINT "expiring_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_ad_impression_id_fkey" FOREIGN KEY ("ad_impression_id") REFERENCES "ad_impressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_earnings" ADD CONSTRAINT "author_earnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_pack_purchases" ADD CONSTRAINT "voice_pack_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_pack_purchases" ADD CONSTRAINT "voice_pack_purchases_voice_pack_id_fkey" FOREIGN KEY ("voice_pack_id") REFERENCES "voice_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_sync" ADD CONSTRAINT "annotation_sync_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_members" ADD CONSTRAINT "enterprise_members_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_members" ADD CONSTRAINT "enterprise_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_accounts" ADD CONSTRAINT "family_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_tips" ADD CONSTRAINT "author_tips_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_tips" ADD CONSTRAINT "author_tips_to_author_id_fkey" FOREIGN KEY ("to_author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_clubs" ADD CONSTRAINT "reading_clubs_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_club_members" ADD CONSTRAINT "reading_club_members_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "reading_clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_club_members" ADD CONSTRAINT "reading_club_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_metrics" ADD CONSTRAINT "engagement_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_waitlist" ADD CONSTRAINT "loan_waitlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_waitlist" ADD CONSTRAINT "loan_waitlist_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessibility_preferences" ADD CONSTRAINT "accessibility_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transcripts" ADD CONSTRAINT "book_transcripts_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessibility_metadata" ADD CONSTRAINT "accessibility_metadata_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessibility_reviews" ADD CONSTRAINT "accessibility_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessibility_reviews" ADD CONSTRAINT "accessibility_reviews_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_members" ADD CONSTRAINT "institutional_members_institutional_id_fkey" FOREIGN KEY ("institutional_id") REFERENCES "institutional_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_members" ADD CONSTRAINT "institutional_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "easy_english_usage" ADD CONSTRAINT "easy_english_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_ads" ADD CONSTRAINT "display_ads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_ads" ADD CONSTRAINT "display_ads_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_slots" ADD CONSTRAINT "ad_slots_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_auctions" ADD CONSTRAINT "ad_auctions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "ad_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_auctions" ADD CONSTRAINT "ad_auctions_winning_ad_id_fkey" FOREIGN KEY ("winning_ad_id") REFERENCES "display_ads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "ad_auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "display_ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_impressions" ADD CONSTRAINT "slot_impressions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "ad_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_clicks" ADD CONSTRAINT "slot_clicks_impression_id_fkey" FOREIGN KEY ("impression_id") REFERENCES "slot_impressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_clicks" ADD CONSTRAINT "slot_clicks_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "display_ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertiser_wallets" ADD CONSTRAINT "advertiser_wallets_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publisher_earnings" ADD CONSTRAINT "publisher_earnings_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "ad_auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "display_ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_bank_entries" ADD CONSTRAINT "word_bank_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_sessions" ADD CONSTRAINT "listening_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_threads" ADD CONSTRAINT "bulletin_threads_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "bulletin_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_threads" ADD CONSTRAINT "bulletin_threads_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_replies" ADD CONSTRAINT "bulletin_replies_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "bulletin_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_replies" ADD CONSTRAINT "bulletin_replies_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_reactions" ADD CONSTRAINT "bulletin_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_events" ADD CONSTRAINT "live_events_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "live_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "live_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_clips" ADD CONSTRAINT "share_clips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity_events" ADD CONSTRAINT "user_activity_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity_shares" ADD CONSTRAINT "user_activity_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
