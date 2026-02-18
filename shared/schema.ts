import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";

// Content type enum values
export const CONTENT_TYPES = ["audiobook", "ebook", "magazine"] as const;
export type ContentType = typeof CONTENT_TYPES[number];
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const books = pgTable("books", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  author: text("author").notNull(),
  narrator: text("narrator"),
  description: text("description"),
  duration: integer("duration").notNull().default(0), // duration in seconds (0 for ebooks)
  coverImage: text("cover_image"),
  audioUrl: text("audio_url"), // Nullable for ebooks/magazines that don't have audio
  contentUrl: text("content_url"), // URL for ebook/magazine content (PDF, EPUB, etc.)
  genre: text("genre"),
  publishedYear: integer("published_year"),
  source: text("source").notNull().default("local"), // Track which API/source this book came from
  sourceId: text("source_id"), // Original ID from the source API
  totalTime: text("total_time"), // Human readable duration (e.g., "11:35:00")
  language: text("language").default("English"),
  contentType: text("content_type").notNull().default("audiobook"), // audiobook, ebook, or magazine
  isPremium: boolean("is_premium").notNull().default(false), // Whether content requires premium subscription
  pageCount: integer("page_count"), // For ebooks and magazines
});

export const insertBookSchema = createInsertSchema(books).omit({
  id: true,
});

export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof books.$inferSelect;

export const chapters = pgTable("chapters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  chapterNumber: integer("chapter_number").notNull(),
  startTime: integer("start_time"), // Start time in seconds (for audiobooks)
  endTime: integer("end_time"), // End time in seconds (for audiobooks)
  pageStart: integer("page_start"), // Start page (for ebooks/magazines)
  pageEnd: integer("page_end"), // End page (for ebooks/magazines)
  duration: integer("duration"), // Duration in seconds (for audiobooks)
}, (table) => [
  index("idx_chapters_book_id").on(table.bookId),
  index("idx_chapters_order").on(table.bookId, table.chapterNumber),
]);

export const insertChapterSchema = createInsertSchema(chapters).omit({
  id: true,
});

export type InsertChapter = z.infer<typeof insertChapterSchema>;
export type Chapter = typeof chapters.$inferSelect;

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Subscription tier enum values
export const SUBSCRIPTION_TIERS = ["free", "premium"] as const;
export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number];

// User table for multi-provider authentication (matches existing database)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  authProvider: varchar("auth_provider").default("local"),
  providerId: varchar("provider_id"),
  subscriptionTier: varchar("subscription_tier").default("free"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Legacy columns from NextAuth migration - kept for database compatibility
  passwordHash: varchar("password_hash"),
  name: varchar("name"),
  emailVerified: timestamp("email_verified"),
  image: varchar("image"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Listening history table for tracking user activity
export const listeningHistory = pgTable("listening_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author"),
  bookCover: text("book_cover"),
  currentTime: integer("current_time").notNull().default(0), // Progress in seconds
  totalDuration: integer("total_duration"), // Book duration in seconds
  lastPlayedAt: timestamp("last_played_at").defaultNow(),
  completedAt: timestamp("completed_at"), // When user finished the book
  playCount: integer("play_count").notNull().default(1),
}, (table) => [
  index("idx_listening_history_user").on(table.userId),
  index("idx_listening_history_last_played").on(table.lastPlayedAt),
]);

export const insertListeningHistorySchema = createInsertSchema(listeningHistory).omit({
  id: true,
  lastPlayedAt: true,
});

export type InsertListeningHistory = z.infer<typeof insertListeningHistorySchema>;
export type ListeningHistory = typeof listeningHistory.$inferSelect;

// Bookmark type for frontend use
export interface Bookmark {
  id: string;
  bookId: string;
  name: string;
  time: number; // time in seconds
  createdAt: string;
}

// Progress tracking type
export interface Progress {
  bookId: string;
  currentTime: number;
  lastPlayed: string;
}

// User reviews for books
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  rating: integer("rating").notNull(), // 1-5 stars
  title: text("title"),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_reviews_user").on(table.userId),
  index("idx_reviews_book").on(table.bookId),
  index("idx_reviews_created").on(table.createdAt),
]);

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

// Review likes/helpful votes
export const reviewLikes = pgTable("review_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewId: varchar("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_review_likes_user").on(table.userId),
  index("idx_review_likes_review").on(table.reviewId),
]);

export const insertReviewLikeSchema = createInsertSchema(reviewLikes).omit({
  id: true,
  createdAt: true,
});

export type InsertReviewLike = z.infer<typeof insertReviewLikeSchema>;
export type ReviewLike = typeof reviewLikes.$inferSelect;

// User follows for social features
export const userFollows = pgTable("user_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followingId: varchar("following_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_follows_follower").on(table.followerId),
  index("idx_user_follows_following").on(table.followingId),
]);

export const insertUserFollowSchema = createInsertSchema(userFollows).omit({
  id: true,
  createdAt: true,
});

export type InsertUserFollow = z.infer<typeof insertUserFollowSchema>;
export type UserFollow = typeof userFollows.$inferSelect;

// External ratings cache
export const externalRatings = pgTable("external_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  source: varchar("source").notNull(), // google-books, itunes, open-library
  rating: integer("rating"), // Normalized to 0-100 scale
  reviewCount: integer("review_count"),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("idx_external_ratings_book").on(table.bookId),
]);

export type ExternalRating = typeof externalRatings.$inferSelect;

// Author metadata cache
export const authors = pgTable("authors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  bio: text("bio"),
  birthDate: varchar("birth_date"),
  deathDate: varchar("death_date"),
  photoUrl: text("photo_url"),
  openLibraryKey: varchar("open_library_key"),
  wikipedia: text("wikipedia"),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("idx_authors_name").on(table.name),
  index("idx_authors_ol_key").on(table.openLibraryKey),
]);

export type Author = typeof authors.$inferSelect;

// Review with user info for display
export interface ReviewWithUser extends Review {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
  likesCount: number;
  isLiked?: boolean;
}

// Aggregated ratings from multiple sources
export interface AggregatedRatings {
  averageRating: number; // 0-5 scale
  totalReviews: number;
  userRating?: number;
  sources: {
    name: string;
    rating: number;
    reviewCount: number;
  }[];
}

// Playlists (Reading Lists) - Spotify-inspired feature
export const playlists = pgTable("playlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }), // null for curated playlists
  name: text("name").notNull(),
  description: text("description"),
  coverImage: text("cover_image"),
  isPublic: integer("is_public").notNull().default(1), // 1 = public, 0 = private
  isCurated: integer("is_curated").notNull().default(0), // 1 = staff-curated, 0 = user-created
  category: varchar("category"), // For curated: "classics", "mystery", "sleep", "motivation", etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_playlists_user").on(table.userId),
  index("idx_playlists_curated").on(table.isCurated),
  index("idx_playlists_category").on(table.category),
]);

export const insertPlaylistSchema = createInsertSchema(playlists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;
export type Playlist = typeof playlists.$inferSelect;

// Playlist items (books in a playlist)
export const playlistItems = pgTable("playlist_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playlistId: varchar("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author"),
  bookCover: text("book_cover"),
  position: integer("position").notNull().default(0), // Order in playlist
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => [
  index("idx_playlist_items_playlist").on(table.playlistId),
  index("idx_playlist_items_position").on(table.position),
]);

export const insertPlaylistItemSchema = createInsertSchema(playlistItems).omit({
  id: true,
  addedAt: true,
});

export type InsertPlaylistItem = z.infer<typeof insertPlaylistItemSchema>;
export type PlaylistItem = typeof playlistItems.$inferSelect;

// Playlist with items count for display
export interface PlaylistWithCount extends Playlist {
  itemCount: number;
  items?: PlaylistItem[];
}

// DJ recommendation types
export interface DJRecommendation {
  id: string;
  type: "continue" | "similar" | "genre" | "mood" | "time-based";
  title: string;
  description: string;
  books: Book[];
}

// === GAMIFICATION SYSTEM ===

// User streaks - track consecutive days of listening
export const userStreaks = pgTable("user_streaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastListenedDate: text("last_listened_date"), // YYYY-MM-DD format
  streakStartDate: text("streak_start_date"), // YYYY-MM-DD format
}, (table) => [
  index("idx_user_streaks_user").on(table.userId),
]);

export type UserStreak = typeof userStreaks.$inferSelect;

// User XP and levels
export const userXp = pgTable("user_xp", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  totalXp: integer("total_xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  totalListeningMinutes: integer("total_listening_minutes").notNull().default(0),
  booksCompleted: integer("books_completed").notNull().default(0),
  reviewsWritten: integer("reviews_written").notNull().default(0),
}, (table) => [
  index("idx_user_xp_user").on(table.userId),
  index("idx_user_xp_total").on(table.totalXp),
]);

export type UserXp = typeof userXp.$inferSelect;

// Achievement definitions
export const ACHIEVEMENT_TYPES = [
  "first_listen", "first_complete", "streak_3", "streak_7", "streak_30",
  "speed_demon", "night_owl", "early_bird", "genre_explorer",
  "bookworm_5", "bookworm_10", "bookworm_25", "bookworm_50",
  "social_butterfly", "critic", "marathon_listener",
  "level_5", "level_10", "level_25",
] as const;
export type AchievementType = typeof ACHIEVEMENT_TYPES[number];

// User achievements/badges
export const userAchievements = pgTable("user_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  achievementType: varchar("achievement_type").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
}, (table) => [
  index("idx_user_achievements_user").on(table.userId),
]);

export type UserAchievement = typeof userAchievements.$inferSelect;

// Daily listening log for streak tracking and goals
export const dailyListeningLog = pgTable("daily_listening_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  minutesListened: integer("minutes_listened").notNull().default(0),
  booksStarted: integer("books_started").notNull().default(0),
  booksCompleted: integer("books_completed").notNull().default(0),
}, (table) => [
  index("idx_daily_log_user_date").on(table.userId, table.date),
]);

export type DailyListeningLog = typeof dailyListeningLog.$inferSelect;

// User daily goals
export const userGoals = pgTable("user_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dailyMinutesGoal: integer("daily_minutes_goal").notNull().default(30),
}, (table) => [
  index("idx_user_goals_user").on(table.userId),
]);

export type UserGoal = typeof userGoals.$inferSelect;

// Reading challenges
export const readingChallenges = pgTable("reading_challenges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  targetBooks: integer("target_books").notNull(),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date").notNull(), // YYYY-MM-DD
  badgeIcon: text("badge_icon"), // emoji or icon name
  isActive: boolean("is_active").notNull().default(true),
});

export type ReadingChallenge = typeof readingChallenges.$inferSelect;

// User challenge progress
export const userChallengeProgress = pgTable("user_challenge_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  challengeId: varchar("challenge_id").notNull().references(() => readingChallenges.id, { onDelete: "cascade" }),
  booksCompleted: integer("books_completed").notNull().default(0),
  completedAt: timestamp("completed_at"),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("idx_user_challenge_user").on(table.userId),
  index("idx_user_challenge_challenge").on(table.challengeId),
]);

export type UserChallengeProgress = typeof userChallengeProgress.$inferSelect;

// Achievement metadata for frontend display
export interface AchievementMeta {
  type: AchievementType;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
}

// Gamification profile combining all user stats
export interface GamificationProfile {
  streak: UserStreak;
  xp: UserXp;
  achievements: UserAchievement[];
  dailyLog: DailyListeningLog | null;
  goal: UserGoal;
  level: number;
  xpToNextLevel: number;
  xpForCurrentLevel: number;
}

// Leaderboard entry
export interface LeaderboardEntry {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  totalXp: number;
  level: number;
  booksCompleted: number;
  totalListeningMinutes: number;
  currentStreak: number;
  rank: number;
}

// Referral system
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referredUserId: varchar("referred_user_id").references(() => users.id, { onDelete: "set null" }),
  referralCode: varchar("referral_code").notNull().unique(),
  status: varchar("status").notNull().default("pending"),
  rewardGranted: boolean("reward_granted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  convertedAt: timestamp("converted_at"),
}, (table) => [
  index("idx_referrals_referrer").on(table.referrerId),
  index("idx_referrals_code").on(table.referralCode),
]);

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  createdAt: true,
  convertedAt: true,
});

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

// User genre preferences for onboarding
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  favoriteGenres: text("favorite_genres").array().default(sql`'{}'::text[]`),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  welcomeBonusGranted: boolean("welcome_bonus_granted").notNull().default(false),
  premiumTrialEndDate: timestamp("premium_trial_end_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
});

export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

// User-submitted content
export const userSubmissions = pgTable("user_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description"),
  contentType: text("content_type").notNull().default("audiobook"),
  audioUrl: text("audio_url"),
  contentUrl: text("content_url"),
  coverImage: text("cover_image"),
  genre: text("genre"),
  language: text("language").default("English"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
  duration: integer("duration"),
  pageCount: integer("page_count"),
  publishedAt: timestamp("published_at"),
  totalPlays: integer("total_plays").notNull().default(0),
  totalReads: integer("total_reads").notNull().default(0),
  fileSize: integer("file_size"),
  narrator: text("narrator"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
});

export const insertUserSubmissionSchema = createInsertSchema(userSubmissions).omit({
  id: true,
  createdAt: true,
});

export type InsertUserSubmission = z.infer<typeof insertUserSubmissionSchema>;
export type UserSubmission = typeof userSubmissions.$inferSelect;

// Author profiles for self-publishing system
export const authorProfiles = pgTable("author_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  website: text("website"),
  socialLinks: jsonb("social_links"),
  profileImage: text("profile_image"),
  isVerified: boolean("is_verified").notNull().default(false),
  totalPlays: integer("total_plays").notNull().default(0),
  totalListeners: integer("total_listeners").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_author_profiles_user").on(table.userId),
]);

export const insertAuthorProfileSchema = createInsertSchema(authorProfiles).omit({
  id: true,
  createdAt: true,
  totalPlays: true,
  totalListeners: true,
  isVerified: true,
});

export type InsertAuthorProfile = z.infer<typeof insertAuthorProfileSchema>;
export type AuthorProfile = typeof authorProfiles.$inferSelect;

// Content analytics for tracking plays/reads
export const contentAnalytics = pgTable("content_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  authorUserId: varchar("author_user_id").notNull(),
  eventType: text("event_type").notNull(), // play, read, complete, skip
  listenerId: varchar("listener_id"),
  duration: integer("duration"), // seconds listened/read
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_content_analytics_book").on(table.bookId),
  index("idx_content_analytics_author").on(table.authorUserId),
  index("idx_content_analytics_date").on(table.createdAt),
]);

export const insertContentAnalyticSchema = createInsertSchema(contentAnalytics).omit({
  id: true,
  createdAt: true,
});

export type InsertContentAnalytic = z.infer<typeof insertContentAnalyticSchema>;
export type ContentAnalytic = typeof contentAnalytics.$inferSelect;

// === PODCAST INGESTION SYSTEM ===

export const TRANSCRIPT_STATUSES = ["none", "available", "pending", "generated"] as const;
export type TranscriptStatus = typeof TRANSCRIPT_STATUSES[number];

export const podcastFeeds = pgTable("podcast_feeds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feedUrl: text("feed_url").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  author: text("author"),
  language: text("language"),
  websiteUrl: text("website_url"),
  categories: jsonb("categories"),
  etag: text("etag"),
  lastModified: text("last_modified"),
  lastFetchedAt: timestamp("last_fetched_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_podcast_feeds_title").on(table.title),
]);

export const insertPodcastFeedSchema = createInsertSchema(podcastFeeds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastFetchedAt: true,
});

export type InsertPodcastFeed = z.infer<typeof insertPodcastFeedSchema>;
export type PodcastFeed = typeof podcastFeeds.$inferSelect;

export const podcastEpisodes = pgTable("podcast_episodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feedId: varchar("feed_id").notNull().references(() => podcastFeeds.id, { onDelete: "cascade" }),
  guid: text("guid"),
  title: text("title").notNull(),
  descriptionText: text("description_text"),
  descriptionHtml: text("description_html"),
  pubDate: timestamp("pub_date"),
  durationSeconds: integer("duration_seconds"),
  audioUrl: text("audio_url").notNull(),
  audioType: text("audio_type"),
  audioLengthBytes: integer("audio_length_bytes"),
  explicit: boolean("explicit"),
  transcriptUrl: text("transcript_url"),
  transcriptStatus: text("transcript_status").notNull().default("none"),
  contentWarnings: jsonb("content_warnings"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_podcast_episodes_feed").on(table.feedId),
  index("idx_podcast_episodes_pub_date").on(table.pubDate),
  index("idx_podcast_episodes_guid").on(table.guid),
  index("idx_podcast_episodes_audio_url").on(table.audioUrl),
]);

export const insertPodcastEpisodeSchema = createInsertSchema(podcastEpisodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPodcastEpisode = z.infer<typeof insertPodcastEpisodeSchema>;
export type PodcastEpisode = typeof podcastEpisodes.$inferSelect;

export const NOTIFICATION_TYPES = [
  "streak_reminder", "goal_nudge", "new_content", "achievement",
  "recommendation", "re_engagement", "author_update", "system"
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  enabledTypes: text("enabled_types").array().notNull().default(sql`ARRAY['streak_reminder','goal_nudge','new_content','achievement','recommendation','re_engagement','author_update','system']::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
}, (table) => [
  index("idx_push_sub_user").on(table.userId),
  index("idx_push_sub_endpoint").on(table.endpoint),
]);

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export const notificationLog = pgTable("notification_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  sentAt: timestamp("sent_at").defaultNow(),
  clicked: integer("clicked").notNull().default(0),
}, (table) => [
  index("idx_notif_log_user").on(table.userId),
  index("idx_notif_log_type").on(table.type),
  index("idx_notif_log_sent").on(table.sentAt),
]);

export type NotificationLogEntry = typeof notificationLog.$inferSelect;

export * from "./models/chat";

// Listening Party - synchronized listening rooms
export const listeningRooms = pgTable("listening_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author"),
  bookCover: text("book_cover"),
  hostUserId: varchar("host_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roomCode: varchar("room_code", { length: 8 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_room_host").on(table.hostUserId),
  index("idx_room_code").on(table.roomCode),
  index("idx_room_status").on(table.status),
]);

export const insertListeningRoomSchema = createInsertSchema(listeningRooms).omit({
  id: true,
  createdAt: true,
});
export type InsertListeningRoom = z.infer<typeof insertListeningRoomSchema>;
export type ListeningRoom = typeof listeningRooms.$inferSelect;

export const listeningRoomParticipants = pgTable("listening_room_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => listeningRooms.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  role: varchar("role", { length: 10 }).notNull().default("guest"),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("idx_participant_room").on(table.roomId),
  index("idx_participant_user").on(table.userId),
]);

export const insertRoomParticipantSchema = createInsertSchema(listeningRoomParticipants).omit({
  id: true,
  joinedAt: true,
});
export type InsertRoomParticipant = z.infer<typeof insertRoomParticipantSchema>;
export type RoomParticipant = typeof listeningRoomParticipants.$inferSelect;

export const listeningRoomMessages = pgTable("listening_room_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => listeningRooms.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_room_msg_room").on(table.roomId),
  index("idx_room_msg_created").on(table.createdAt),
]);

export const insertRoomMessageSchema = createInsertSchema(listeningRoomMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertRoomMessage = z.infer<typeof insertRoomMessageSchema>;
export type RoomMessage = typeof listeningRoomMessages.$inferSelect;
