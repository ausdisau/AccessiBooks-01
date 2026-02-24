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
  searchVector: text("search_vector"), // Cached lowercase search text for fast filtering
}, (table) => [
  index("idx_books_title").on(table.title),
  index("idx_books_author").on(table.author),
  index("idx_books_genre").on(table.genre),
  index("idx_books_source").on(table.source),
  index("idx_books_content_type").on(table.contentType),
  index("idx_books_published_year").on(table.publishedYear),
  index("idx_books_language").on(table.language),
  index("idx_books_premium").on(table.isPremium),
  index("idx_books_source_content").on(table.source, table.contentType),
  index("idx_books_genre_content").on(table.genre, table.contentType),
]);

export const insertBookSchema = createInsertSchema(books).omit({
  id: true,
  searchVector: true,
});

export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof books.$inferSelect;

export const seederProgress = pgTable("seeder_progress", {
  source: varchar("source").primaryKey(),
  currentOffset: integer("current_offset").notNull().default(0),
  subjectIndex: integer("subject_index").notNull().default(0),
  nextUrl: text("next_url"),
  status: text("status").notNull().default("idle"),
  totalInserted: integer("total_inserted").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
export const SUBSCRIPTION_TIERS = ["free", "plus", "premium"] as const;
export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number];

// Tier pricing constants (in cents)
export const TIER_PRICING = {
  plus: { monthly: 499, yearly: 4999, monthlyDisplay: "$4.99", yearlyDisplay: "$49.99", yearlyMonthly: "$4.17" },
  premium: { monthly: 999, yearly: 9999, monthlyDisplay: "$9.99", yearlyDisplay: "$99.99", yearlyMonthly: "$8.33" },
} as const;

// Per-title micro-payment pricing (in cents)
export const TITLE_PRICING = {
  audiobook: { base: 299, label: "$2.99" },
  ebook: { base: 199, label: "$1.99" },
  default: { base: 199, label: "$1.99" },
} as const;

// Tier-based discounts on individual purchases
export const TIER_DISCOUNTS = {
  free: 0,
  plus: 0.10,
  premium: 0.20,
} as const;

// Tier feature limits
export const TIER_FEATURES = {
  free:    { skipLimit: 6, audioQuality: 128, maxDevices: 2, adsEnabled: true,  offlineEnabled: false, ttsDaily: 0,  bookmarkLimit: 10 },
  plus:    { skipLimit: Infinity, audioQuality: 192, maxDevices: 3, adsEnabled: false, offlineEnabled: false, ttsDaily: 10, bookmarkLimit: Infinity },
  premium: { skipLimit: Infinity, audioQuality: 320, maxDevices: 5, adsEnabled: false, offlineEnabled: true,  ttsDaily: Infinity, bookmarkLimit: Infinity },
} as const;

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
  referralCode: varchar("referral_code").unique(),
  referralCredits: integer("referral_credits").notNull().default(0),
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

// Individual title purchases table
export const purchases = pgTable("purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookTitle: text("book_title").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency").default("usd"),
  stripePaymentId: varchar("stripe_payment_id"),
  status: varchar("status").notNull().default("completed"),
  purchasedAt: timestamp("purchased_at").defaultNow(),
}, (table) => [
  index("idx_purchases_user").on(table.userId),
  index("idx_purchases_book").on(table.bookId),
  index("idx_purchases_user_book").on(table.userId, table.bookId),
]);

export const insertPurchaseSchema = createInsertSchema(purchases).omit({
  id: true,
  purchasedAt: true,
});
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchases.$inferSelect;

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
  // Surprise achievements
  "comeback_kid", "binge_reader", "weekend_warrior", "century_club",
  "diverse_listener", "review_streak", "sharing_is_caring", "party_animal",
  "collector", "speed_reader",
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
  status: text("status").notNull().default("pending"),
  creditAmount: integer("credit_amount").notNull().default(100),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_referrals_referrer").on(table.referrerId),
  index("idx_referrals_code").on(table.referralCode),
]);

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  createdAt: true,
});

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

// User genre preferences for onboarding
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  favoriteGenres: text("favorite_genres").array().default(sql`'{}'::text[]`),
  preferredContentTypes: text("preferred_content_types").array().default(sql`'{}'::text[]`),
  listeningHabit: text("listening_habit"),
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
  isPromoted: boolean("is_promoted").notNull().default(false),
  authorUserId: varchar("author_user_id"),
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
  roomName: text("room_name"),
  maxListeners: integer("max_listeners").notNull().default(10),
  hostTier: varchar("host_tier", { length: 20 }).notNull().default("plus"),
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

// Live Streaming Queues - preference-based book radio
export const streamingQueues = pgTable("streaming_queues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  genre: text("genre"),
  hostUserId: varchar("host_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentBookId: varchar("current_book_id"),
  currentBookTitle: text("current_book_title"),
  currentBookAuthor: text("current_book_author"),
  currentBookCover: text("current_book_cover"),
  currentBookAudioUrl: text("current_book_audio_url"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  listenerCount: integer("listener_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_sq_host").on(table.hostUserId),
  index("idx_sq_status").on(table.status),
  index("idx_sq_genre").on(table.genre),
]);

export const insertStreamingQueueSchema = createInsertSchema(streamingQueues).omit({
  id: true,
  listenerCount: true,
  createdAt: true,
});
export type InsertStreamingQueue = z.infer<typeof insertStreamingQueueSchema>;
export type StreamingQueue = typeof streamingQueues.$inferSelect;

export const streamingQueueItems = pgTable("streaming_queue_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queueId: varchar("queue_id").notNull().references(() => streamingQueues.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author"),
  bookCover: text("book_cover"),
  bookAudioUrl: text("book_audio_url"),
  position: integer("position").notNull().default(0),
  votes: integer("votes").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  addedBy: varchar("added_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_sqi_queue").on(table.queueId),
  index("idx_sqi_position").on(table.queueId, table.position),
  index("idx_sqi_status").on(table.status),
]);

export const insertStreamingQueueItemSchema = createInsertSchema(streamingQueueItems).omit({
  id: true,
  votes: true,
  createdAt: true,
});
export type InsertStreamingQueueItem = z.infer<typeof insertStreamingQueueItemSchema>;
export type StreamingQueueItem = typeof streamingQueueItems.$inferSelect;

export const queueVotes = pgTable("queue_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queueItemId: varchar("queue_item_id").notNull().references(() => streamingQueueItems.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_qv_item").on(table.queueItemId),
  index("idx_qv_user").on(table.userId),
]);

// Self-Serve Advertising Platform
export const AD_CAMPAIGN_STATUSES = ["draft", "pending_review", "active", "paused", "completed", "rejected"] as const;
export type AdCampaignStatus = typeof AD_CAMPAIGN_STATUSES[number];

export const adCampaigns = pgTable("ad_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  budgetCents: integer("budget_cents").notNull().default(0),
  spentCents: integer("spent_cents").notNull().default(0),
  cpmBidCents: integer("cpm_bid_cents").notNull().default(500),
  targetGenres: text("target_genres").array(),
  targetTimeSlots: text("target_time_slots").array(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_campaign_advertiser").on(table.advertiserId),
  index("idx_campaign_status").on(table.status),
]);

export const insertAdCampaignSchema = createInsertSchema(adCampaigns).omit({
  id: true,
  spentCents: true,
  impressions: true,
  clicks: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdCampaign = z.infer<typeof insertAdCampaignSchema>;
export type AdCampaign = typeof adCampaigns.$inferSelect;

export const adCreatives = pgTable("ad_creatives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  audioUrl: text("audio_url").notNull(),
  duration: integer("duration").notNull().default(0),
  mimeType: text("mime_type").notNull().default("audio/mpeg"),
  fileSize: integer("file_size"),
  isRecorded: boolean("is_recorded").notNull().default(false),
  clickThroughUrl: text("click_through_url"),
  companionImageUrl: text("companion_image_url"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_creative_campaign").on(table.campaignId),
  index("idx_creative_status").on(table.status),
]);

export const insertAdCreativeSchema = createInsertSchema(adCreatives).omit({
  id: true,
  createdAt: true,
});
export type InsertAdCreative = z.infer<typeof insertAdCreativeSchema>;
export type AdCreative = typeof adCreatives.$inferSelect;

export const paymentTransactions = pgTable("payment_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 20 }).notNull(),
  providerTransactionId: varchar("provider_transaction_id"),
  type: varchar("type", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  description: text("description"),
  metadata: text("metadata"),
  receiptUrl: text("receipt_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_tx_user").on(table.userId),
  index("idx_tx_provider").on(table.provider),
  index("idx_tx_created").on(table.createdAt),
]);

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;

export const adImpressions = pgTable("ad_impressions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  creativeId: varchar("creative_id").notNull().references(() => adCreatives.id, { onDelete: "cascade" }),
  userId: varchar("user_id"),
  adType: varchar("ad_type", { length: 10 }).notNull().default("preroll"),
  costCents: integer("cost_cents").notNull().default(0),
  clicked: boolean("clicked").notNull().default(false),
  quartile25: boolean("quartile_25").notNull().default(false),
  quartile50: boolean("quartile_50").notNull().default(false),
  quartile75: boolean("quartile_75").notNull().default(false),
  completed: boolean("completed").notNull().default(false),
  servedAt: timestamp("served_at").defaultNow(),
}, (table) => [
  index("idx_impression_campaign").on(table.campaignId),
  index("idx_impression_creative").on(table.creativeId),
  index("idx_impression_served").on(table.servedAt),
]);

export const streakFreezes = pgTable("streak_freezes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  totalFreezes: integer("total_freezes").notNull().default(0),
  usedFreezes: integer("used_freezes").notNull().default(0),
  lastEarnedAt: timestamp("last_earned_at"),
}, (table) => [
  index("idx_streak_freezes_user").on(table.userId),
]);

export const insertStreakFreezeSchema = createInsertSchema(streakFreezes).omit({ id: true });
export type InsertStreakFreeze = z.infer<typeof insertStreakFreezeSchema>;
export type StreakFreeze = typeof streakFreezes.$inferSelect;

export const expiringRewards = pgTable("expiring_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rewardType: varchar("reward_type").notNull(),
  rewardValue: integer("reward_value").notNull().default(0),
  description: text("description").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  claimed: boolean("claimed").notNull().default(false),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_expiring_rewards_user").on(table.userId),
  index("idx_expiring_rewards_expires").on(table.expiresAt),
]);

export const insertExpiringRewardSchema = createInsertSchema(expiringRewards).omit({ id: true, claimedAt: true, createdAt: true });
export type InsertExpiringReward = z.infer<typeof insertExpiringRewardSchema>;
export type ExpiringReward = typeof expiringRewards.$inferSelect;

export const authorEarnings = pgTable("author_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  earningType: varchar("earning_type").notNull(),
  grossCents: integer("gross_cents").notNull().default(0),
  commissionCents: integer("commission_cents").notNull().default(0),
  platformFeePct: integer("platform_fee_pct").notNull().default(30),
  status: varchar("status").notNull().default("pending"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_author_earnings_user").on(table.userId),
  index("idx_author_earnings_book").on(table.bookId),
  index("idx_author_earnings_status").on(table.status),
]);

export const insertAuthorEarningSchema = createInsertSchema(authorEarnings).omit({ id: true, createdAt: true });
export type InsertAuthorEarning = z.infer<typeof insertAuthorEarningSchema>;
export type AuthorEarning = typeof authorEarnings.$inferSelect;

export const voicePacks = pgTable("voice_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  voices: text("voices").array().notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  isPremiumIncluded: boolean("is_premium_included").notNull().default(false),
  previewUrl: text("preview_url"),
  systemPrompt: text("system_prompt"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVoicePackSchema = createInsertSchema(voicePacks).omit({ id: true, createdAt: true });
export type InsertVoicePack = z.infer<typeof insertVoicePackSchema>;
export type VoicePack = typeof voicePacks.$inferSelect;

export const voicePackPurchases = pgTable("voice_pack_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  voicePackId: varchar("voice_pack_id").notNull().references(() => voicePacks.id),
  amountCents: integer("amount_cents").notNull().default(0),
  stripePaymentId: varchar("stripe_payment_id"),
  purchasedAt: timestamp("purchased_at").defaultNow(),
}, (table) => [
  index("idx_vpp_user").on(table.userId),
  index("idx_vpp_pack").on(table.voicePackId),
]);

export const insertVoicePackPurchaseSchema = createInsertSchema(voicePackPurchases).omit({ id: true, purchasedAt: true });
export type InsertVoicePackPurchase = z.infer<typeof insertVoicePackPurchaseSchema>;
export type VoicePackPurchase = typeof voicePackPurchases.$inferSelect;

export const battlePasses = pgTable("battle_passes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seasonName: text("season_name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull().default(299),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBattlePassSchema = createInsertSchema(battlePasses).omit({ id: true, createdAt: true });
export type InsertBattlePass = z.infer<typeof insertBattlePassSchema>;
export type BattlePass = typeof battlePasses.$inferSelect;

export const battlePassMilestones = pgTable("battle_pass_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  battlePassId: varchar("battle_pass_id").notNull().references(() => battlePasses.id, { onDelete: "cascade" }),
  tier: integer("tier").notNull(),
  xpRequired: integer("xp_required").notNull(),
  rewardType: varchar("reward_type").notNull(),
  rewardValue: text("reward_value"),
  description: text("description"),
}, (table) => [
  index("idx_bp_milestones_pass").on(table.battlePassId),
]);

export const insertBattlePassMilestoneSchema = createInsertSchema(battlePassMilestones).omit({ id: true });
export type InsertBattlePassMilestone = z.infer<typeof insertBattlePassMilestoneSchema>;
export type BattlePassMilestone = typeof battlePassMilestones.$inferSelect;

export const battlePassPurchases = pgTable("battle_pass_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  battlePassId: varchar("battle_pass_id").notNull().references(() => battlePasses.id),
  amountCents: integer("amount_cents").notNull().default(0),
  purchasedAt: timestamp("purchased_at").defaultNow(),
  currentTier: integer("current_tier").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  claimedMilestones: text("claimed_milestones").notNull().default("[]"),
}, (table) => [
  index("idx_bpp_user").on(table.userId),
  index("idx_bpp_pass").on(table.battlePassId),
]);

export const insertBattlePassPurchaseSchema = createInsertSchema(battlePassPurchases).omit({ id: true, purchasedAt: true });
export type InsertBattlePassPurchase = z.infer<typeof insertBattlePassPurchaseSchema>;
export type BattlePassPurchase = typeof battlePassPurchases.$inferSelect;

export const annotationSync = pgTable("annotation_sync", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  annotations: text("annotations").notNull().default("[]"),
  bookmarks: text("bookmarks").notNull().default("[]"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
}, (table) => [
  index("idx_annotation_sync_user_book").on(table.userId, table.bookId),
]);

export const insertAnnotationSyncSchema = createInsertSchema(annotationSync).omit({ id: true, lastSyncedAt: true });
export type InsertAnnotationSync = z.infer<typeof insertAnnotationSyncSchema>;
export type AnnotationSyncRecord = typeof annotationSync.$inferSelect;

export const giftCards = pgTable("gift_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull().unique(),
  fromUserId: varchar("from_user_id").references(() => users.id),
  toEmail: text("to_email"),
  amountCents: integer("amount_cents").notNull(),
  balanceRemaining: integer("balance_remaining").notNull(),
  type: varchar("type").notNull().default("credits"),
  tierGift: varchar("tier_gift"),
  monthsGift: integer("months_gift"),
  message: text("message"),
  status: varchar("status").notNull().default("active"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  redeemedBy: varchar("redeemed_by").references(() => users.id),
  redeemedAt: timestamp("redeemed_at"),
}, (table) => [
  index("idx_gift_cards_code").on(table.code),
  index("idx_gift_cards_from").on(table.fromUserId),
  index("idx_gift_cards_status").on(table.status),
]);

export const insertGiftCardSchema = createInsertSchema(giftCards).omit({ id: true, createdAt: true, redeemedAt: true });
export type InsertGiftCard = z.infer<typeof insertGiftCardSchema>;
export type GiftCard = typeof giftCards.$inferSelect;

export const enterpriseAccounts = pgTable("enterprise_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgName: text("org_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  tier: varchar("tier").notNull().default("education"),
  maxSeats: integer("max_seats").notNull().default(50),
  currentSeats: integer("current_seats").notNull().default(0),
  amountCents: integer("amount_cents").notNull().default(9900),
  billingCycle: varchar("billing_cycle").notNull().default("monthly"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_enterprise_email").on(table.contactEmail),
]);

export const insertEnterpriseAccountSchema = createInsertSchema(enterpriseAccounts).omit({ id: true, createdAt: true });
export type InsertEnterpriseAccount = z.infer<typeof insertEnterpriseAccountSchema>;
export type EnterpriseAccount = typeof enterpriseAccounts.$inferSelect;

export const enterpriseMembers = pgTable("enterprise_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: varchar("enterprise_id").notNull().references(() => enterpriseAccounts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role").notNull().default("member"),
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => [
  index("idx_ent_members_enterprise").on(table.enterpriseId),
  index("idx_ent_members_user").on(table.userId),
]);

export const insertEnterpriseMemberSchema = createInsertSchema(enterpriseMembers).omit({ id: true, addedAt: true });
export type InsertEnterpriseMember = z.infer<typeof insertEnterpriseMemberSchema>;
export type EnterpriseMember = typeof enterpriseMembers.$inferSelect;

export const sponsoredQueues = pgTable("sponsored_queues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sponsorName: text("sponsor_name").notNull(),
  queueId: varchar("queue_id"),
  adAudioUrl: text("ad_audio_url"),
  sponsorLogo: text("sponsor_logo"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  amountCents: integer("amount_cents").notNull().default(0),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_sponsored_queues_active").on(table.isActive),
  index("idx_sponsored_queues_dates").on(table.startDate, table.endDate),
])

export const insertSponsoredQueueSchema = createInsertSchema(sponsoredQueues).omit({ id: true, impressions: true, clicks: true, createdAt: true });
export type InsertSponsoredQueue = z.infer<typeof insertSponsoredQueueSchema>;
export type SponsoredQueue = typeof sponsoredQueues.$inferSelect;

// Family plan accounts
export const familyAccounts = pgTable("family_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planName: text("plan_name").notNull().default("Family Plan"),
  maxMembers: integer("max_members").notNull().default(5),
  amountCents: integer("amount_cents").notNull().default(799),
  stripeSubscriptionId: text("stripe_subscription_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_family_owner").on(table.ownerId),
]);

export const insertFamilyAccountSchema = createInsertSchema(familyAccounts).omit({ id: true, createdAt: true });
export type InsertFamilyAccount = z.infer<typeof insertFamilyAccountSchema>;
export type FamilyAccount = typeof familyAccounts.$inferSelect;

export const familyMembers = pgTable("family_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").notNull().references(() => familyAccounts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => [
  index("idx_family_members_family").on(table.familyId),
  index("idx_family_members_user").on(table.userId),
]);

export const insertFamilyMemberSchema = createInsertSchema(familyMembers).omit({ id: true, addedAt: true });
export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;
export type FamilyMember = typeof familyMembers.$inferSelect;

// Author tips / micropayments
export const authorTips = pgTable("author_tips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toAuthorId: varchar("to_author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id"),
  amountCents: integer("amount_cents").notNull(),
  stripePaymentId: text("stripe_payment_id"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_tips_from").on(table.fromUserId),
  index("idx_tips_to").on(table.toAuthorId),
]);

export const insertAuthorTipSchema = createInsertSchema(authorTips).omit({ id: true, createdAt: true });
export type InsertAuthorTip = z.infer<typeof insertAuthorTipSchema>;
export type AuthorTip = typeof authorTips.$inferSelect;

// Content reports / moderation
export const contentReports = pgTable("content_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  contentId: varchar("content_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reports_status").on(table.status),
  index("idx_reports_content").on(table.contentType, table.contentId),
]);

export const insertContentReportSchema = createInsertSchema(contentReports).omit({ id: true, reviewedBy: true, reviewedAt: true, createdAt: true });
export type InsertContentReport = z.infer<typeof insertContentReportSchema>;
export type ContentReport = typeof contentReports.$inferSelect;

// Activity feed for social features
export const activityFeed = pgTable("activity_feed", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityType: text("activity_type").notNull(),
  bookId: varchar("book_id"),
  bookTitle: text("book_title"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_activity_user").on(table.userId),
  index("idx_activity_created").on(table.createdAt),
]);

export const insertActivityFeedSchema = createInsertSchema(activityFeed).omit({ id: true, createdAt: true });
export type InsertActivityFeed = z.infer<typeof insertActivityFeedSchema>;
export type ActivityFeedEntry = typeof activityFeed.$inferSelect;

// Reading clubs
export const readingClubs = pgTable("reading_clubs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  creatorId: varchar("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentBookId: varchar("current_book_id"),
  currentBookTitle: text("current_book_title"),
  memberCount: integer("member_count").notNull().default(1),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_clubs_creator").on(table.creatorId),
]);

export const insertReadingClubSchema = createInsertSchema(readingClubs).omit({ id: true, memberCount: true, createdAt: true });
export type InsertReadingClub = z.infer<typeof insertReadingClubSchema>;
export type ReadingClub = typeof readingClubs.$inferSelect;

export const readingClubMembers = pgTable("reading_club_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clubId: varchar("club_id").notNull().references(() => readingClubs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("idx_club_members_club").on(table.clubId),
  index("idx_club_members_user").on(table.userId),
]);

export const insertReadingClubMemberSchema = createInsertSchema(readingClubMembers).omit({ id: true, joinedAt: true });
export type InsertReadingClubMember = z.infer<typeof insertReadingClubMemberSchema>;
export type ReadingClubMember = typeof readingClubMembers.$inferSelect;

// Book Visuals - AI-generated scene videos for Visual Reading mode
export const bookVisuals = pgTable("book_visuals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  sceneIndex: integer("scene_index").notNull(),
  pageStart: integer("page_start").notNull(),
  pageEnd: integer("page_end").notNull(),
  sceneDescription: text("scene_description").notNull(),
  videoPrompt: text("video_prompt").notNull(),
  videoUrl: text("video_url"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_book_visuals_book").on(table.bookId),
  index("idx_book_visuals_book_scene").on(table.bookId, table.sceneIndex),
]);

export const insertBookVisualSchema = createInsertSchema(bookVisuals).omit({ id: true, createdAt: true });
export type InsertBookVisual = z.infer<typeof insertBookVisualSchema>;
export type BookVisual = typeof bookVisuals.$inferSelect;

// Churn tracking / engagement metrics
export const engagementMetrics = pgTable("engagement_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  totalSessionsLast30d: integer("total_sessions_last_30d").notNull().default(0),
  totalMinutesLast30d: integer("total_minutes_last_30d").notNull().default(0),
  churnRisk: text("churn_risk").notNull().default("low"),
  winbackOfferSent: boolean("winback_offer_sent").notNull().default(false),
  winbackOfferSentAt: timestamp("winback_offer_sent_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_engagement_user").on(table.userId),
  index("idx_engagement_churn").on(table.churnRisk),
  index("idx_engagement_active").on(table.lastActiveAt),
]);
