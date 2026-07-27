import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, jsonb, index, boolean, uniqueIndex } from "drizzle-orm/pg-core";

// Content type enum values
export const CONTENT_TYPES = ["audiobook", "ebook", "magazine"] as const;
export type ContentType = typeof CONTENT_TYPES[number];
import { createInsertSchema } from "drizzle-zod";
// drizzle-zod 0.8.x uses the Zod v4 API internally (`zod/v4`). Importing
// `z` from the root `zod` entry yields the v3 ZodType, whose 3-arg
// `ZodType<any,any,any>` constraint no longer accepts the ZodObject that
// `createInsertSchema` returns — surfacing as ~40 TS2344 errors in this
// file. Pulling `z` from `zod/v4` keeps the constraint side and the
// schema side on the same type lineage, fixing every error in one go
// without any other code changes.
import { z } from "zod/v4";

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
  freeTierAvailable: boolean("free_tier_available").notNull().default(true), // Whether free-tier users can access this title
  adSupported: boolean("ad_supported").notNull().default(true), // Whether ads may be served for this title
  transcriptAvailable: boolean("transcript_available").notNull().default(false), // Whether an interactive transcript is available (display hint only — NOT an access gate)
  auslanAvailable: boolean("auslan_available").notNull().default(false), // Whether a published Auslan sign-language video companion exists (browse-filter hint)
  narrationType: text("narration_type"), // "human" | "ai" | null (null = not specified). Display hint only — NOT an access gate.
  pageCount: integer("page_count"), // For ebooks and magazines
  searchVector: text("search_vector"), // Cached lowercase search text for fast filtering
  readingLevel: integer("reading_level"), // 1=Very Easy, 2=Easy, 3=Moderate, 4=Advanced (FK grade estimate)
  status: text("status").notNull().default("published"), // "draft" | "published" — publish gate. Existing/seeded rows default to published; only incomplete new uploads stay draft. Public catalog queries filter status = 'published'.
  accessibilityTags: text("accessibility_tags").array(), // Search/browse facet, e.g. ["captioned","audio-described","dyslexia-friendly","easy-read","auslan"] (display hint only — NOT an access gate)
}, (table) => [
  index("idx_books_title").on(table.title),
  index("idx_books_status").on(table.status),
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

// Subscription tier enum values (institutional for Task #44 entitlement enforcement; admin for Task #43 freemium)
export const SUBSCRIPTION_TIERS = ["free", "plus", "premium", "institutional", "admin"] as const;
export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number];

// Tier pricing constants (in cents)
export const TIER_PRICING = {
  plus: { monthly: 499, yearly: 4999, monthlyDisplay: "$4.99", yearlyDisplay: "$49.99", yearlyMonthly: "$4.17" },
  premium: { monthly: 999, yearly: 9999, monthlyDisplay: "$9.99", yearlyDisplay: "$99.99", yearlyMonthly: "$8.33" },
  institutional: { monthly: 4900, yearly: 49000, monthlyDisplay: "$49.00", yearlyDisplay: "$490.00", yearlyMonthly: "$40.83" },
  admin: { monthly: 0, yearly: 0, monthlyDisplay: "$0.00", yearlyDisplay: "$0.00", yearlyMonthly: "$0.00" },
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
  free:          { skipLimit: 6,        audioQuality: 128, maxDevices: 2,  adsEnabled: true,  offlineEnabled: false, ttsDaily: 0,        bookmarkLimit: 10 },
  plus:          { skipLimit: Infinity, audioQuality: 192, maxDevices: 3,  adsEnabled: false, offlineEnabled: false, ttsDaily: 10,       bookmarkLimit: Infinity },
  premium:       { skipLimit: Infinity, audioQuality: 320, maxDevices: 5,  adsEnabled: false, offlineEnabled: true,  ttsDaily: Infinity, bookmarkLimit: Infinity },
  institutional: { skipLimit: Infinity, audioQuality: 320, maxDevices: 10, adsEnabled: false, offlineEnabled: true,  ttsDaily: Infinity, bookmarkLimit: Infinity },
  admin:         { skipLimit: Infinity, audioQuality: 320, maxDevices: 10, adsEnabled: false, offlineEnabled: true,  ttsDaily: Infinity, bookmarkLimit: Infinity },
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
  stripeEasyEnglishSubscriptionItemId: varchar("stripe_easy_english_subscription_item_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  referralCode: varchar("referral_code").unique(),
  referralCredits: integer("referral_credits").notNull().default(0),
  // Legacy columns from NextAuth migration - kept for database compatibility
  passwordHash: varchar("password_hash"),
  name: varchar("name"),
  emailVerified: timestamp("email_verified"),
  image: varchar("image"),
  // Ad platform role: 'advertiser' | 'publisher' | 'admin' | null (existing users)
  role: varchar("role"),
  companyName: varchar("company_name"),
  website: varchar("website"),
  // Freemium lifecycle: active | trialing | past_due | canceled | null
  subscriptionStatus: varchar("subscription_status"),
  // Which system owns the current subscription row: "stripe" | "revenuecat" | "manual" | null.
  // Lets the RevenueCat sync only downgrade rows it owns (never Stripe/institutional rows).
  subscriptionProvider: varchar("subscription_provider"),
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
export interface DJRecommendationItem {
  bookId: string;
  rationale?: string;
  score?: number;
}

export interface DJRecommendation {
  id: string;
  type: "continue" | "similar" | "genre" | "mood" | "time-based" | "agent";
  title: string;
  description: string;
  books: Book[];
  intro?: string;
  items?: DJRecommendationItem[];
  source?: "agent" | "heuristic" | "popularity";
}

// LangChain agent structured response
export const agentRecommendationItemSchema = z.object({
  bookId: z.string(),
  rationale: z.string(),
  score: z.number().optional(),
});

export const agentRecommendationSetSchema = z.object({
  id: z.string(),
  title: z.string(),
  intro: z.string(),
  type: z.enum(["continue", "similar", "genre", "mood", "time-based", "agent"]).default("agent"),
  items: z.array(agentRecommendationItemSchema).min(1),
});

export const agentRecommendationResponseSchema = z.object({
  sets: z.array(agentRecommendationSetSchema).min(1),
  source: z.enum(["agent", "heuristic", "popularity"]).default("agent"),
  generatedAt: z.string().optional(),
});

export type AgentRecommendationItem = z.infer<typeof agentRecommendationItemSchema>;
export type AgentRecommendationSet = z.infer<typeof agentRecommendationSetSchema>;
export type AgentRecommendationResponse = z.infer<typeof agentRecommendationResponseSchema>;

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
  "recommendation", "re_engagement", "author_update", "system",
  // Engagement & monetization
  "rsvp_reminder", "friend_digest", "win_back", "weekly_recap", "streak_at_risk"
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  enabledTypes: text("enabled_types").array().notNull().default(sql`ARRAY['streak_reminder','goal_nudge','new_content','achievement','recommendation','re_engagement','author_update','system','rsvp_reminder','friend_digest','win_back','weekly_recap','streak_at_risk']::text[]`),
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
  dailyBudgetCents: integer("daily_budget_cents").default(0),
  spentCents: integer("spent_cents").notNull().default(0),
  dailySpendCents: integer("daily_spend_cents").notNull().default(0),
  cpmBidCents: integer("cpm_bid_cents").notNull().default(500),
  targetGenres: text("target_genres").array(),
  targetTimeSlots: text("target_time_slots").array(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  category: varchar("category").default("other"),
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
  uniqueIndex("uniq_tx_provider_txid").on(table.provider, table.providerTransactionId),
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

export const adRewards = pgTable("ad_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  adImpressionId: varchar("ad_impression_id").notNull().references(() => adImpressions.id, { onDelete: "cascade" }),
  rewardType: varchar("reward_type").notNull(),
  grantedAt: timestamp("granted_at").defaultNow(),
}, (table) => [
  index("idx_ad_rewards_user").on(table.userId),
  index("idx_ad_rewards_impression").on(table.adImpressionId),
  index("idx_ad_rewards_user_type").on(table.userId, table.rewardType),
  uniqueIndex("uniq_ad_rewards_user_impression").on(table.userId, table.adImpressionId),
]);

export const insertAdRewardSchema = createInsertSchema(adRewards).omit({ id: true, grantedAt: true });
export type InsertAdReward = z.infer<typeof insertAdRewardSchema>;
export type AdReward = typeof adRewards.$inferSelect;

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
  isPremium: boolean("is_premium").notNull().default(false), // false = free track, true = premium track
}, (table) => [
  index("idx_bp_milestones_pass").on(table.battlePassId),
  index("idx_bp_milestones_track").on(table.battlePassId, table.isPremium),
  // One reward per (season, tier, track) so seeding/backfill is idempotent and
  // concurrent inserts cannot create duplicate separately-claimable rewards.
  uniqueIndex("idx_bp_milestones_unique").on(table.battlePassId, table.tier, table.isPremium),
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
  isPremium: boolean("is_premium").notNull().default(false), // premium track unlocked for this user/season
  status: varchar("status").notNull().default("active"), // 'active' (free progress) | 'pending' (premium checkout in flight)
  stripeSessionId: varchar("stripe_session_id"), // idempotency key for premium-unlock webhook fulfillment
}, (table) => [
  index("idx_bpp_user").on(table.userId),
  index("idx_bpp_pass").on(table.battlePassId),
  uniqueIndex("idx_bpp_user_pass_unique").on(table.userId, table.battlePassId),
  index("idx_bpp_session").on(table.stripeSessionId),
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

// Community annotations (Task #121) — reader-contributed highlights + notes
// that go through moderation before appearing for every reader. Personal
// annotations stay in annotation_sync / localStorage; only community ones
// live here. status: pending -> approved | rejected.
export const COMMUNITY_ANNOTATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type CommunityAnnotationStatus = typeof COMMUNITY_ANNOTATION_STATUSES[number];

export const communityAnnotations = pgTable("community_annotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(), // no FK: catalog rows are seeded/refreshed and may be replaced
  contributorId: varchar("contributor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contributorName: text("contributor_name"), // display-name snapshot at submission time
  page: integer("page").notNull(),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  text: text("text").notNull(), // the highlighted passage
  note: text("note").notNull(), // the contributed explanation shown to readers
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedBy: varchar("reviewed_by"), // admin user id who made the decision
  reviewNote: text("review_note"), // optional moderator note (e.g. rejection reason)
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_community_annotations_book_status").on(table.bookId, table.status),
  index("idx_community_annotations_status").on(table.status),
  index("idx_community_annotations_contributor").on(table.contributorId),
]);

export const insertCommunityAnnotationSchema = createInsertSchema(communityAnnotations).omit({
  id: true,
  status: true,
  reviewedBy: true,
  reviewNote: true,
  approvedAt: true,
  createdAt: true,
});
export type InsertCommunityAnnotation = z.infer<typeof insertCommunityAnnotationSchema>;
export type CommunityAnnotation = typeof communityAnnotations.$inferSelect;

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

// Book loans system
export const bookLoans = pgTable("book_loans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  loanedAt: timestamp("loaned_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  returnedAt: timestamp("returned_at"),
  status: text("status").notNull().default("active"),
  downloadToken: text("download_token").notNull(),
  downloadCount: integer("download_count").notNull().default(0),
  maxDownloads: integer("max_downloads").notNull().default(3),
}, (table) => [
  index("idx_loans_user").on(table.userId),
  index("idx_loans_book").on(table.bookId),
  index("idx_loans_status").on(table.status),
  index("idx_loans_expires").on(table.expiresAt),
]);

export const insertBookLoanSchema = createInsertSchema(bookLoans).omit({ id: true, loanedAt: true, downloadCount: true });
export type InsertBookLoan = z.infer<typeof insertBookLoanSchema>;
export type BookLoan = typeof bookLoans.$inferSelect;

// Loan waitlist system
export const loanWaitlist = pgTable("loan_waitlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  joinedAt: timestamp("joined_at").defaultNow(),
  notifiedAt: timestamp("notified_at"),
  status: text("status").notNull().default("waiting"),
}, (table) => [
  index("idx_waitlist_user").on(table.userId),
  index("idx_waitlist_book").on(table.bookId),
  index("idx_waitlist_status").on(table.status),
]);

export const insertLoanWaitlistSchema = createInsertSchema(loanWaitlist).omit({ id: true, joinedAt: true, position: true });
export type InsertLoanWaitlist = z.infer<typeof insertLoanWaitlistSchema>;
export type LoanWaitlist = typeof loanWaitlist.$inferSelect;

// ============================================================
// ACCESSIBILITY MOAT TABLES
// ============================================================

export const accessibilityPreferences = pgTable("accessibility_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  profile: jsonb("profile").notNull().default(sql`'{}'::jsonb`),
  activePreset: text("active_preset"),
  syncedAt: timestamp("synced_at").defaultNow(),
  // Individual preference flags (additive columns)
  reduceDistraction: boolean("reduce_distraction").notNull().default(false),
  highContrast: boolean("high_contrast").notNull().default(false),
  dyslexiaFriendly: boolean("dyslexia_friendly").notNull().default(false),
  captionsPreferred: boolean("captions_preferred").notNull().default(false),
  transcriptOpenByDefault: boolean("transcript_open_by_default").notNull().default(false),
  fontSizeScale: integer("font_size_scale").notNull().default(100),
  readingSpeed: integer("reading_speed").notNull().default(100),
  colorMode: varchar("color_mode").notNull().default("system"),
  focusMode: boolean("focus_mode").notNull().default(false),
  symbolSupport: boolean("symbol_support").notNull().default(false),
  signLanguageEnabled: boolean("sign_language_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_a11y_prefs_user").on(table.userId),
]);

export const insertAccessibilityPreferencesSchema = createInsertSchema(accessibilityPreferences).omit({ id: true, syncedAt: true, updatedAt: true });
export type InsertAccessibilityPreferences = z.infer<typeof insertAccessibilityPreferencesSchema>;
export type AccessibilityPreferences = typeof accessibilityPreferences.$inferSelect;

/** Extended accessibility + listening preference profile stored in the `profile` jsonb column. */
export interface A11yProfile {
  fontSize: number;
  fontFamily: string;
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderHints: boolean;
  captionsOn: boolean;
  captionPosition?: "above" | "below";
  playbackSpeed: number;
  colorScheme: string;
  lineSpacing: number;
  letterSpacing: number;
  dyslexiaFont: boolean;
  focusHighlight: boolean;
  darkMode?: boolean;
  karaokeFollowAlong?: boolean;
  /** @default false — open transcript panel by default when playing */
  transcriptOpenByDefault: boolean;
  /** @default false — hides decorative images and reduces visual noise */
  reduceDistractionMode: boolean;
  /** @default false — free-tier only: prefer static ads over animated/video */
  suppressAnimatedAds: boolean;
  /** @default "ask" — free-tier only: rewarded listening ad preference */
  rewardedAdPreference: "always" | "never" | "ask";
  /** @default 15 — preferred skip-forward duration in seconds */
  preferredSkipForward: 10 | 15 | 30;
  /** @default 15 — preferred skip-back duration in seconds */
  preferredSkipBack: 5 | 10 | 15;
  /** @default true — automatically advance to next chapter */
  autoAdvanceChapters: boolean;
  /** @default null — default sleep timer in minutes, null = disabled */
  sleepTimerDefault: number | null;
  /** @default false — Calm Mode disables streaks, leaderboards, push, rewarded-ad nudges */
  calmMode?: boolean;
  /** Per-category notification toggles. Missing keys default to true. */
  notificationCategories?: Partial<Record<NotificationType, boolean>>;
  /** @default { start: 21, end: 8 } — local-time hours when push is suppressed */
  quietHours?: { start: number; end: number } | null;
  /** @default false — pause streak counter for 7 days when user signals a break */
  streakPaused?: boolean;
  /** Streak pause start date (ISO yyyy-mm-dd) — auto-resumes after 7 days */
  streakPausedAt?: string | null;
  /** ISO date — hide all upgrade nudges until this date */
  hideUpgradeNudgesUntil?: string | null;
  /** @default true — make /hub the post-login default landing page */
  hubAsHome?: boolean;
  /** IANA timezone for accurate local-time quiet-hours enforcement (e.g. "America/Los_Angeles"). */
  timezone?: string | null;
  /** ISO timestamp — most-recent win-back send (single-send guard, per Task #64). */
  lastWinBackSentAt?: string | null;
  /** ISO timestamp — most-recent friend-digest send. Used to dedupe so a digest
   *  only fires when there are *new* completions since the last successful send. */
  lastFriendDigestSentAt?: string | null;
  /** @default false — Sensory Regulation Mode: dampens animation, simplifies
   *  layout (hides decorative imagery, gradients, parallax), and applies a
   *  Web-Audio peak-limiter to the player. Existing reducedMotion /
   *  reduceDistractionMode flags remain available as fine-grained overrides. */
  sensoryMode?: boolean;
  /** Set to true once the user has acknowledged (or dismissed) the auto-enable
   *  notice triggered by OS-level prefers-reduced-motion on first load. Prevents
   *  re-prompting and prevents auto-toggling when the user explicitly chose. */
  sensoryModeChosen?: boolean;
  /** @default false — Low-Bandwidth Mode (Task #66): forces lowest-bitrate audio
   *  stream (128 kbps SD) regardless of subscription tier, suppresses video and
   *  animated ad creatives, and tells the ebook reader to hide decorative
   *  imagery / disable Visual Reading. Designed for slow networks, capped data
   *  plans, and low-end devices. */
  lowBandwidthMode?: boolean;
  /** @default false — Text-Only ebook reading: hides covers, illustrations, and
   *  the Visual Reading background video. Independent of lowBandwidthMode so
   *  users on fast networks can still strip visual chrome from the reader. */
  textOnlyMode?: boolean;
  /** @default false — Task #67: opt-in NDIS-friendly user activity tracking.
   *  When false, user_activity_events writes are skipped server-side. */
  activityTrackingEnabled?: boolean;
  /** ISO timestamp — when the user opted in (used in the report header). */
  activityTrackingEnabledAt?: string | null;
}

export const DEFAULT_A11Y_PROFILE: A11yProfile = {
  fontSize: 16,
  fontFamily: "system",
  highContrast: false,
  reducedMotion: false,
  screenReaderHints: true,
  captionsOn: false,
  captionPosition: "below",
  playbackSpeed: 1.0,
  colorScheme: "default",
  lineSpacing: 1.5,
  letterSpacing: 0,
  dyslexiaFont: false,
  focusHighlight: true,
  darkMode: false,
  karaokeFollowAlong: false,
  transcriptOpenByDefault: false,
  reduceDistractionMode: false,
  suppressAnimatedAds: false,
  rewardedAdPreference: "ask",
  preferredSkipForward: 15,
  preferredSkipBack: 15,
  autoAdvanceChapters: true,
  sleepTimerDefault: null,
  calmMode: false,
  notificationCategories: {},
  quietHours: { start: 21, end: 8 },
  streakPaused: false,
  streakPausedAt: null,
  hideUpgradeNudgesUntil: null,
  hubAsHome: true,
  timezone: null,
  lastWinBackSentAt: null,
  lastFriendDigestSentAt: null,
  sensoryMode: false,
  sensoryModeChosen: false,
  lowBandwidthMode: false,
  textOnlyMode: false,
  activityTrackingEnabled: false,
  activityTrackingEnabledAt: null,
};

// Read-along (karaoke) timing format. Times are in SECONDS, absolute on the
// audio timeline for the chapter's audio asset. `words` is optional: when the
// timing source provides real per-word marks (e.g. AI narration with timestamps)
// it is populated for exact read-along; otherwise only sentence/segment timing
// exists and word timing is estimated by consumers within each timed segment.
export interface TranscriptWordTiming {
  text: string;
  start: number;
  end: number;
  index?: number;
}
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWordTiming[];
}

export const bookTranscripts = pgTable("book_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterIndex: integer("chapter_index").notNull().default(0),
  segments: jsonb("segments").$type<TranscriptSegment[]>().notNull().default(sql`'[]'::jsonb`),
  language: text("language").notNull().default("en"),
  format: text("format").notNull().default("segments"), // "segments" | "plain" | "vtt" | "srt" — how the transcript payload is authored
  plainText: text("plain_text"), // Optional full plain-text rendering (for plain-text/imported transcripts and no-JS/SEO fallback)
  source: text("source").notNull().default("manual"), // "uploaded" | "generated" | "imported" | "manual"
  qualityStatus: text("quality_status").notNull().default("draft"), // "missing" | "pending" | "draft" | "reviewed" | "published"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_transcripts_book").on(table.bookId),
  index("idx_transcripts_book_chapter").on(table.bookId, table.chapterIndex),
]);

export const insertBookTranscriptSchema = createInsertSchema(bookTranscripts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBookTranscript = z.infer<typeof insertBookTranscriptSchema>;
export type BookTranscript = typeof bookTranscripts.$inferSelect;

export const accessibilityMetadata = pgTable("accessibility_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }).unique(),
  hasTranscript: boolean("has_transcript").notNull().default(false),
  hasInteractiveTranscript: boolean("has_interactive_transcript").notNull().default(false),
  hasStructuredChapters: boolean("has_structured_chapters").notNull().default(false),
  hasCaptions: boolean("has_captions").notNull().default(false),
  hasAudioDescription: boolean("has_audio_description").notNull().default(false),
  plainLanguageAvailable: boolean("plain_language_available").notNull().default(false),
  dyslexiaFriendlyTextAvailable: boolean("dyslexia_friendly_text_available").notNull().default(false),
  ebookAvailable: boolean("ebook_available").notNull().default(false),
  brailleAvailable: boolean("braille_available").notNull().default(false),
  largePrintAvailable: boolean("large_print_available").notNull().default(false),
  hasDyslexiaFont: boolean("has_dyslexia_font").notNull().default(false),
  hasLargeText: boolean("has_large_text").notNull().default(false),
  narrationType: text("narration_type"), // "human" | "synthetic" | "mixed" | "unknown"
  audioQualityStatus: text("audio_quality_status"), // "missing" | "pending" | "reviewed" | "published"
  metadataQualityStatus: text("metadata_quality_status"), // completeness of catalogue metadata
  readingLevel: text("reading_level"),
  contentWarnings: text("content_warnings").array(),
  regionAvailability: text("region_availability").array(), // rights/region codes where available (empty/null = unrestricted)
  accessibilityScore: integer("accessibility_score").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_a11y_meta_book").on(table.bookId),
  index("idx_a11y_meta_score").on(table.accessibilityScore),
]);

export const insertAccessibilityMetadataSchema = createInsertSchema(accessibilityMetadata).omit({ id: true, updatedAt: true });
export type InsertAccessibilityMetadata = z.infer<typeof insertAccessibilityMetadataSchema>;
export type AccessibilityMetadata = typeof accessibilityMetadata.$inferSelect;

// Admin/creator-managed, human-produced Auslan (sign-language) video companions for a title.
// Videos are uploaded to object storage; objectPath is the normalized "/objects/..." serving path.
export const AUSLAN_COMPANION_STATUSES = ["draft", "published", "archived"] as const;
export type AuslanCompanionStatus = typeof AUSLAN_COMPANION_STATUSES[number];

export const bookAuslanCompanions = pgTable("book_auslan_companions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  objectPath: text("object_path").notNull(), // normalized /objects/uploads/u_<b64>/<uuid> serving path
  mimeType: varchar("mime_type", { length: 80 }).notNull().default("video/mp4"),
  sizeBytes: integer("size_bytes"),
  durationSeconds: integer("duration_seconds"),
  language: varchar("language", { length: 16 }).notNull().default("AUSLAN"),
  status: varchar("status", { length: 16 }).notNull().default("draft"), // draft | published | archived
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_auslan_companions_book").on(t.bookId),
  // At most one published companion per (book, language)
  uniqueIndex("uq_auslan_companions_book_lang_published").on(t.bookId, t.language).where(sql`status = 'published'`),
]);

export const insertBookAuslanCompanionSchema = createInsertSchema(bookAuslanCompanions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBookAuslanCompanion = z.infer<typeof insertBookAuslanCompanionSchema>;
export type BookAuslanCompanion = typeof bookAuslanCompanions.$inferSelect;

export const DISABILITY_TYPES = ["dyslexia", "low-vision", "motor", "hearing", "cognitive", "other"] as const;
export type DisabilityType = typeof DISABILITY_TYPES[number];

export const accessibilityReviews = pgTable("accessibility_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  disabilityType: text("disability_type").notNull().default("other"),
  rating: integer("rating").notNull(),
  screenReaderScore: integer("screen_reader_score"),
  navigationScore: integer("navigation_score"),
  contrastScore: integer("contrast_score"),
  audioQualityScore: integer("audio_quality_score"),
  comments: text("comments"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_a11y_reviews_book").on(table.bookId),
  index("idx_a11y_reviews_user").on(table.userId),
  index("idx_a11y_reviews_status").on(table.status),
  index("idx_a11y_reviews_disability").on(table.disabilityType),
]);

export const insertAccessibilityReviewSchema = createInsertSchema(accessibilityReviews).omit({ id: true, createdAt: true });
export type InsertAccessibilityReview = z.infer<typeof insertAccessibilityReviewSchema>;
export type AccessibilityReview = typeof accessibilityReviews.$inferSelect;

export const institutionalAccounts = pgTable("institutional_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgName: text("org_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  orgType: text("org_type").notNull().default("school"),
  maxSeats: integer("max_seats").notNull().default(50),
  currentSeats: integer("current_seats").notNull().default(0),
  amountCents: integer("amount_cents").notNull().default(9900),
  features: jsonb("features").notNull().default(sql`'{"adFree":true,"premiumContent":true,"analytics":true}'::jsonb`),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  isActive: boolean("is_active").notNull().default(true),
  weeklyGoalMinutes: integer("weekly_goal_minutes").notNull().default(180),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_institutional_active").on(table.isActive),
]);

export const insertInstitutionalAccountSchema = createInsertSchema(institutionalAccounts).omit({ id: true, currentSeats: true, createdAt: true });
export type InsertInstitutionalAccount = z.infer<typeof insertInstitutionalAccountSchema>;
export type InstitutionalAccount = typeof institutionalAccounts.$inferSelect;

export const institutionalMembers = pgTable("institutional_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  institutionalId: varchar("institutional_id").notNull().references(() => institutionalAccounts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => [
  index("idx_inst_members_org").on(table.institutionalId),
  index("idx_inst_members_user").on(table.userId),
]);

export const insertInstitutionalMemberSchema = createInsertSchema(institutionalMembers).omit({ id: true, addedAt: true });
export type InsertInstitutionalMember = z.infer<typeof insertInstitutionalMemberSchema>;
export type InstitutionalMember = typeof institutionalMembers.$inferSelect;

export const moatMetricsSnapshots = pgTable("moat_metrics_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull().defaultNow(),
  totalA11yReviews: integer("total_a11y_reviews").notNull().default(0),
  avgA11yScore: integer("avg_a11y_score").notNull().default(0),
  transcriptCoverage: integer("transcript_coverage").notNull().default(0),
  prefsSyncedUsers: integer("prefs_synced_users").notNull().default(0),
  institutionalOrgs: integer("institutional_orgs").notNull().default(0),
  recommendationClicks: integer("recommendation_clicks").notNull().default(0),
}, (table) => [
  index("idx_moat_metrics_date").on(table.date),
]);

export const insertMoatMetricsSnapshotSchema = createInsertSchema(moatMetricsSnapshots).omit({ id: true });
export type InsertMoatMetricsSnapshot = z.infer<typeof insertMoatMetricsSnapshotSchema>;
export type MoatMetricsSnapshot = typeof moatMetricsSnapshots.$inferSelect;

// === AI CHAT SYSTEM ===

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Chat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_conversations_created_at").on(table.createdAt),
  index("idx_conversations_user_id").on(table.userId),
]);

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_messages_conversation_id").on(table.conversationId),
  index("idx_messages_created_at").on(table.createdAt),
]);

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// === EASY ENGLISH ADD-ON ===

export const FREE_EASY_ENGLISH_MONTHLY_ALLOWANCE = 3;

export const easyEnglishCache = pgTable("easy_english_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookId: varchar("book_id").notNull(),
  chapterNumber: integer("chapter_number").notNull(),
  originalText: text("original_text").notNull(),
  convertedText: text("converted_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_easy_english_cache_book_chapter").on(table.bookId, table.chapterNumber),
]);

export const insertEasyEnglishCacheSchema = createInsertSchema(easyEnglishCache).omit({ id: true, createdAt: true });
export type InsertEasyEnglishCache = z.infer<typeof insertEasyEnglishCacheSchema>;
export type EasyEnglishCache = typeof easyEnglishCache.$inferSelect;

export const easyEnglishUsage = pgTable("easy_english_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  yearMonth: varchar("year_month").notNull(), // e.g. "2026-04"
  chaptersConverted: integer("chapters_converted").notNull().default(0),
}, (table) => [
  index("idx_easy_english_usage_user_month").on(table.userId, table.yearMonth),
]);

export const insertEasyEnglishUsageSchema = createInsertSchema(easyEnglishUsage).omit({ id: true });
export type InsertEasyEnglishUsage = z.infer<typeof insertEasyEnglishUsageSchema>;
export type EasyEnglishUsage = typeof easyEnglishUsage.$inferSelect;

// ============================================================
// AD BIDDING PLATFORM — NEW TABLES
// (adCampaigns & adImpressions already defined above for audio ads)
// ============================================================

export const AD_CATEGORIES = [
  "technology", "finance", "health", "education", "entertainment",
  "sports", "travel", "food", "fashion", "automotive", "real_estate",
  "gaming", "news", "lifestyle", "business", "other",
] as const;
export type AdCategory = typeof AD_CATEGORIES[number];

export const DISPLAY_AD_STATUSES = ["draft", "pending_review", "approved", "rejected", "paused", "archived"] as const;
export type DisplayAdStatus = typeof DISPLAY_AD_STATUSES[number];

// Display ads: image/text creatives for the bidding platform
export const displayAds = pgTable("display_ads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  advertiserId: varchar("advertiser_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  headline: text("headline").notNull(),
  body: text("body"),
  imageUrl: text("image_url"),
  destinationUrl: text("destination_url").notNull(),
  status: varchar("status").notNull().default("pending_review"),
  maxCpmCents: integer("max_cpm_cents").notNull().default(0),
  rejectionReason: text("rejection_reason"),
  impressionCount: integer("impression_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_display_ads_campaign").on(t.campaignId),
  index("idx_display_ads_advertiser").on(t.advertiserId),
  index("idx_display_ads_status").on(t.status),
]);

export const insertDisplayAdSchema = createInsertSchema(displayAds).omit({ id: true, createdAt: true, updatedAt: true, impressionCount: true, clickCount: true });
export type InsertDisplayAd = z.infer<typeof insertDisplayAdSchema>;
export type DisplayAd = typeof displayAds.$inferSelect;

// Ad Slots: publisher-registered placements
export const adSlots = pgTable("ad_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publisherId: varchar("publisher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  websiteUrl: text("website_url").notNull(),
  width: integer("width").notNull().default(728),
  height: integer("height").notNull().default(90),
  category: varchar("category").notNull().default("other"),
  minCpmCents: integer("min_cpm_cents").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  totalImpressions: integer("total_impressions").notNull().default(0),
  totalEarningsCents: integer("total_earnings_cents").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_ad_slots_publisher").on(t.publisherId),
  index("idx_ad_slots_active").on(t.isActive),
  index("idx_ad_slots_category").on(t.category),
]);

export const insertAdSlotSchema = createInsertSchema(adSlots).omit({ id: true, createdAt: true, totalImpressions: true, totalEarningsCents: true });
export type InsertAdSlot = z.infer<typeof insertAdSlotSchema>;
export type AdSlot = typeof adSlots.$inferSelect;

// Auctions: each time a slot is requested, runs a second-price auction
export const adAuctions = pgTable("ad_auctions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slotId: varchar("slot_id").notNull().references(() => adSlots.id, { onDelete: "cascade" }),
  winningAdId: varchar("winning_ad_id").references(() => displayAds.id),
  winningCpmCents: integer("winning_cpm_cents").notNull().default(0),
  secondPriceCpmCents: integer("second_price_cpm_cents").notNull().default(0),
  bidsConsidered: integer("bids_considered").notNull().default(0),
  noFill: boolean("no_fill").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_ad_auctions_slot").on(t.slotId),
  index("idx_ad_auctions_created").on(t.createdAt),
]);

export type AdAuction = typeof adAuctions.$inferSelect;

// Slot impressions: each time a winning display ad is served (distinct from audio adImpressions)
export const slotImpressions = pgTable("slot_impressions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auctionId: varchar("auction_id").notNull().references(() => adAuctions.id, { onDelete: "cascade" }),
  adId: varchar("ad_id").notNull().references(() => displayAds.id, { onDelete: "cascade" }),
  slotId: varchar("slot_id").notNull().references(() => adSlots.id, { onDelete: "cascade" }),
  advertiserId: varchar("advertiser_id").notNull(),
  publisherId: varchar("publisher_id").notNull(),
  cpmCents: integer("cpm_cents").notNull().default(0),
  clicked: boolean("clicked").notNull().default(false),
  servedAt: timestamp("served_at").defaultNow(),
}, (t) => [
  index("idx_slot_impressions_ad").on(t.adId),
  index("idx_slot_impressions_slot").on(t.slotId),
  index("idx_slot_impressions_advertiser").on(t.advertiserId),
  index("idx_slot_impressions_publisher").on(t.publisherId),
  index("idx_slot_impressions_served").on(t.servedAt),
]);

export type SlotImpression = typeof slotImpressions.$inferSelect;

// Slot clicks: when a user clicks a served display ad
export const slotClicks = pgTable("slot_clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  impressionId: varchar("impression_id").notNull().references(() => slotImpressions.id, { onDelete: "cascade" }),
  adId: varchar("ad_id").notNull().references(() => displayAds.id, { onDelete: "cascade" }),
  clickedAt: timestamp("clicked_at").defaultNow(),
}, (t) => [
  index("idx_slot_clicks_impression").on(t.impressionId),
  index("idx_slot_clicks_ad").on(t.adId),
]);

export type SlotClick = typeof slotClicks.$inferSelect;

// Advertiser wallets: credit balance for ad spend
export const advertiserWallets = pgTable("advertiser_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  balanceCents: integer("balance_cents").notNull().default(0),
  totalTopupCents: integer("total_topup_cents").notNull().default(0),
  totalSpendCents: integer("total_spend_cents").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AdvertiserWallet = typeof advertiserWallets.$inferSelect;

// Publisher earnings: accumulate CPM revenue share
export const publisherEarnings = pgTable("publisher_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publisherId: varchar("publisher_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  totalEarnedCents: integer("total_earned_cents").notNull().default(0),
  pendingCents: integer("pending_cents").notNull().default(0),
  paidOutCents: integer("paid_out_cents").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PublisherEarning = typeof publisherEarnings.$inferSelect;

// Payout requests from publishers
export const payoutRequests = pgTable("payout_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publisherId: varchar("publisher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  status: varchar("status").notNull().default("pending"),
  paymentDetails: text("payment_details"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (t) => [
  index("idx_payout_requests_publisher").on(t.publisherId),
  index("idx_payout_requests_status").on(t.status),
]);

export type PayoutRequest = typeof payoutRequests.$inferSelect;

// Bids: individual bids placed during an auction
export const bids = pgTable("bids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auctionId: varchar("auction_id").notNull().references(() => adAuctions.id, { onDelete: "cascade" }),
  adId: varchar("ad_id").notNull().references(() => displayAds.id, { onDelete: "cascade" }),
  advertiserId: varchar("advertiser_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cpmCents: integer("cpm_cents").notNull().default(0),
  isWinner: boolean("is_winner").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_bids_auction").on(t.auctionId),
  index("idx_bids_ad").on(t.adId),
  index("idx_bids_advertiser").on(t.advertiserId),
]);

export const insertBidSchema = createInsertSchema(bids).omit({ id: true, createdAt: true, isWinner: true });
export type InsertBid = z.infer<typeof insertBidSchema>;
export type Bid = typeof bids.$inferSelect;

// Personal Word Bank: words saved by users while reading
export const wordBankEntries = pgTable("word_bank_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  word: varchar("word").notNull(),
  definition: text("definition"),
  imageUrl: text("image_url"),
  savedAt: timestamp("saved_at").defaultNow(),
}, (t) => [
  index("idx_word_bank_user").on(t.userId),
]);

export const insertWordBankEntrySchema = createInsertSchema(wordBankEntries).omit({ id: true, savedAt: true });
export type InsertWordBankEntry = z.infer<typeof insertWordBankEntrySchema>;
export type DbWordBankEntry = typeof wordBankEntries.$inferSelect;

// === FREEMIUM DATA MODEL (Task #43) + ENTITLEMENTS (Task #44) ===

// Plans catalogue — one row per subscription tier
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tier: varchar("tier").notNull().unique(), // free | plus | premium | institutional
  name: text("name").notNull(),
  priceMonthlycents: integer("price_monthly_cents").notNull().default(0),
  priceYearlyCents: integer("price_yearly_cents").notNull().default(0),
  trialDays: integer("trial_days").notNull().default(0),
  features: jsonb("features").notNull().default(sql`'{}'::jsonb`), // TIER_FEATURES blob
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, createdAt: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;

// Subscriptions — full lifecycle per user (decoupled from raw Stripe IDs on users)
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: varchar("plan_id").notNull().references(() => plans.id),
  status: varchar("status").notNull().default("active"), // active | trialing | past_due | canceled
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEnd: timestamp("trial_end"),
  canceledAt: timestamp("canceled_at"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_subscriptions_user").on(table.userId),
  index("idx_subscriptions_status").on(table.status),
  index("idx_subscriptions_stripe").on(table.stripeSubscriptionId),
]);

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Entitlements — per-user access overrides that take precedence over subscriptionTier.
// Combines Task #44 (tier/bookId overrides) and Task #43 (feature/grantedTier overrides).
export const entitlements = pgTable("entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Task #44: effective tier granted by this override (e.g. "premium", "institutional")
  tier: varchar("tier"),
  // Task #44: optional restriction to a specific title (null = applies to all titles)
  bookId: varchar("book_id"),
  // Task #43: feature key for fine-grained overrides (e.g. "premium_access", "offline", "tts")
  feature: varchar("feature"),
  // Task #43: tier this entitlement mimics for feature-based overrides
  grantedTier: varchar("granted_tier"),
  // Optional expiry — null means the override never expires
  expiresAt: timestamp("expires_at"),
  reason: text("reason"), // Human-readable reason (e.g. "promotional_trial", "institutional_seat", "promo_code")
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_entitlements_user").on(table.userId),
  index("idx_entitlements_user_book").on(table.userId, table.bookId),
  index("idx_entitlements_feature").on(table.feature),
  index("idx_entitlements_expires").on(table.expiresAt),
]);

export const insertEntitlementSchema = createInsertSchema(entitlements).omit({ id: true, createdAt: true });
export type InsertEntitlement = z.infer<typeof insertEntitlementSchema>;
export type Entitlement = typeof entitlements.$inferSelect;

export const adEventLogs = pgTable("ad_event_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  adId: varchar("ad_id").notNull(),
  adType: varchar("ad_type", { length: 32 }).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  placementId: varchar("placement_id", { length: 64 }),
  completed: boolean("completed").notNull().default(false),
  skipped: boolean("skipped").notNull().default(false),
  servedAt: timestamp("served_at").defaultNow(),
}, (t) => [
  index("idx_ad_event_logs_user").on(t.userId),
  index("idx_ad_event_logs_served").on(t.servedAt),
  index("idx_ad_event_logs_provider").on(t.provider),
]);

export const insertAdEventLogSchema = createInsertSchema(adEventLogs).omit({ id: true, servedAt: true });
export type InsertAdEventLog = z.infer<typeof insertAdEventLogSchema>;
export type AdEventLog = typeof adEventLogs.$inferSelect;

// ============================================================
// PRODUCT EVENTS — anonymised funnel / monetization signals
// No userId — events are aggregate signals, not per-user tracking
// ============================================================

export const PRODUCT_EVENT_TYPES = [
  "user_signed_up",
  "subscription_upgraded",
  "subscription_canceled",
  "subscription_churned",
  "ad_impression_served",
  "rewarded_ad_completed",
  "rewarded_ad_offered",
  "playback_session_started",
  "playback_session_ended",
  // Engagement & monetization
  "hub_visit",
  "bulletin_thread_created",
  "bulletin_reply_created",
  "event_rsvp",
  "event_attended",
  "share_clip_generated",
  "upgrade_nudge_shown",
  "upgrade_nudge_dismissed",
  "upgrade_nudge_clicked",
  "referral_converted",
] as const;
export type ProductEventType = typeof PRODUCT_EVENT_TYPES[number];

export const productEvents = pgTable("product_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  userTier: varchar("user_tier", { length: 20 }).notNull().default("free"),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("idx_product_events_type_time").on(table.eventType, table.occurredAt),
  index("idx_product_events_occurred").on(table.occurredAt),
]);

export const insertProductEventSchema = createInsertSchema(productEvents).omit({ id: true });
export type InsertProductEvent = z.infer<typeof insertProductEventSchema>;
export type ProductEvent = typeof productEvents.$inferSelect;

// Listening sessions — analytics-grade per-session records
export const listeningSessions = pgTable("listening_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  deviceType: varchar("device_type"), // mobile | desktop | tablet | unknown
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  minutesListened: integer("minutes_listened").notNull().default(0),
  interruptedBy: varchar("interrupted_by"), // ad | limit | user | null
}, (table) => [
  index("idx_listening_sessions_user").on(table.userId),
  index("idx_listening_sessions_book").on(table.bookId),
  index("idx_listening_sessions_started").on(table.startedAt),
]);

export const insertListeningSessionSchema = createInsertSchema(listeningSessions).omit({ id: true });
export type InsertListeningSession = z.infer<typeof insertListeningSessionSchema>;
export type ListeningSession = typeof listeningSessions.$inferSelect;


// ============================================================
// ENGAGEMENT & MONETIZATION SYSTEM (Task #64)
// Centralized community bulletin board, live events, hub aggregation
// ============================================================

// Per-user engagement events (opt-in, dedupe-keyed) — used by notification
// triggers to record sent/skipped attempts so the scheduler can avoid
// duplicate sends and the analytics layer can compute trigger health.
// Distinct from anonymised `productEvents`: this row carries userId.
export const engagementEvents = pgTable("engagement_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  category: varchar("category", { length: 60 }),
  outcome: varchar("outcome", { length: 40 }).notNull().default("sent"),
  reason: varchar("reason", { length: 60 }),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (t) => [
  index("idx_engagement_events_user_time").on(t.userId, t.occurredAt),
  index("idx_engagement_events_type_time").on(t.eventType, t.occurredAt),
]);

export const insertEngagementEventSchema = createInsertSchema(engagementEvents).omit({ id: true, occurredAt: true });
export type InsertEngagementEvent = z.infer<typeof insertEngagementEventSchema>;
export type EngagementEvent = typeof engagementEvents.$inferSelect;

// Curated bulletin topics (operator-managed list, not user-created)
export const bulletinTopics = pgTable("bulletin_topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  iconEmoji: varchar("icon_emoji", { length: 10 }),
  premiumOnlyPost: boolean("premium_only_post").notNull().default(false),
  premiumOnlyView: boolean("premium_only_view").notNull().default(false),
  isAccessibilityCategory: boolean("is_accessibility_category").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_bulletin_topics_active").on(t.isActive, t.sortOrder),
]);

export const insertBulletinTopicSchema = createInsertSchema(bulletinTopics).omit({ id: true, createdAt: true });
export type InsertBulletinTopic = z.infer<typeof insertBulletinTopicSchema>;
export type BulletinTopic = typeof bulletinTopics.$inferSelect;

// Threads — operator announcements OR user-posted threads inside a topic
export const bulletinThreads = pgTable("bulletin_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicId: varchar("topic_id").notNull().references(() => bulletinTopics.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id").references(() => users.id, { onDelete: "set null" }),
  authorDisplayName: varchar("author_display_name", { length: 120 }).notNull().default("AccessiBooks"),
  kind: varchar("kind", { length: 20 }).notNull().default("discussion"), // announcement | discussion
  title: varchar("title", { length: 240 }).notNull(),
  body: text("body").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  isLocked: boolean("is_locked").notNull().default(false),
  replyCount: integer("reply_count").notNull().default(0),
  reactionCount: integer("reaction_count").notNull().default(0),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_bulletin_threads_topic_pinned").on(t.topicId, t.isPinned, t.lastActivityAt),
  index("idx_bulletin_threads_recent").on(t.lastActivityAt),
]);

export const insertBulletinThreadSchema = createInsertSchema(bulletinThreads).omit({
  id: true, replyCount: true, reactionCount: true, lastActivityAt: true, createdAt: true,
});
export type InsertBulletinThread = z.infer<typeof insertBulletinThreadSchema>;
export type BulletinThread = typeof bulletinThreads.$inferSelect;

// Replies (single level of nesting; parentId optional for threaded responses)
export const bulletinReplies = pgTable("bulletin_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull().references(() => bulletinThreads.id, { onDelete: "cascade" }),
  parentReplyId: varchar("parent_reply_id"),
  authorUserId: varchar("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  authorDisplayName: varchar("author_display_name", { length: 120 }).notNull(),
  body: text("body").notNull(),
  reactionCount: integer("reaction_count").notNull().default(0),
  hiddenAt: timestamp("hidden_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_bulletin_replies_thread").on(t.threadId, t.createdAt),
]);

export const insertBulletinReplySchema = createInsertSchema(bulletinReplies).omit({
  id: true, reactionCount: true, hiddenAt: true, createdAt: true,
});
export type InsertBulletinReply = z.infer<typeof insertBulletinReplySchema>;
export type BulletinReply = typeof bulletinReplies.$inferSelect;

// Reactions on threads or replies (one row per user+target+emoji)
export const bulletinReactions = pgTable("bulletin_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: varchar("target_type", { length: 16 }).notNull(), // thread | reply
  targetId: varchar("target_id").notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull().default("👍"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_bulletin_reactions_target").on(t.targetType, t.targetId),
  index("idx_bulletin_reactions_user").on(t.userId),
]);

export const insertBulletinReactionSchema = createInsertSchema(bulletinReactions).omit({ id: true, createdAt: true });
export type InsertBulletinReaction = z.infer<typeof insertBulletinReactionSchema>;
export type BulletinReaction = typeof bulletinReactions.$inferSelect;

// Live events (author Q&A, group_listen, launch party, AMA)
export const LIVE_EVENT_TYPES = ["author_qa", "group_listen", "launch_party", "community_ama"] as const;
export type LiveEventType = typeof LIVE_EVENT_TYPES[number];

export const liveEvents = pgTable("live_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description").notNull(),
  hostUserId: varchar("host_user_id").references(() => users.id, { onDelete: "set null" }),
  hostDisplayName: varchar("host_display_name", { length: 120 }).notNull().default("AccessiBooks"),
  bookId: varchar("book_id"),
  bookTitle: varchar("book_title", { length: 240 }),
  scheduledStartAt: timestamp("scheduled_start_at").notNull(),
  scheduledEndAt: timestamp("scheduled_end_at").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("scheduled"), // scheduled | live | ended | canceled
  listeningRoomId: varchar("listening_room_id"),
  replayUrl: text("replay_url"),
  rsvpCount: integer("rsvp_count").notNull().default(0),
  attendedCount: integer("attended_count").notNull().default(0),
  freeReplayPreviewSeconds: integer("free_replay_preview_seconds").notNull().default(600),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_live_events_status_start").on(t.status, t.scheduledStartAt),
  index("idx_live_events_start").on(t.scheduledStartAt),
]);

export const insertLiveEventSchema = createInsertSchema(liveEvents).omit({
  id: true, rsvpCount: true, attendedCount: true, createdAt: true,
}).extend({
  scheduledStartAt: z.coerce.date(),
  scheduledEndAt: z.coerce.date(),
});
export type InsertLiveEvent = z.infer<typeof insertLiveEventSchema>;
export type LiveEvent = typeof liveEvents.$inferSelect;

// Per-user RSVP record
export const eventRsvps = pgTable("event_rsvps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => liveEvents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attendedAt: timestamp("attended_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_event_rsvps_event").on(t.eventId),
  index("idx_event_rsvps_user").on(t.userId),
  uniqueIndex("uq_event_rsvps_event_user").on(t.eventId, t.userId),
]);

export const insertEventRsvpSchema = createInsertSchema(eventRsvps).omit({
  id: true, attendedAt: true, reminderSentAt: true, createdAt: true,
});
export type InsertEventRsvp = z.infer<typeof insertEventRsvpSchema>;
export type EventRsvp = typeof eventRsvps.$inferSelect;

// Per-event chat messages (slow-mode + caption-friendly)
export const eventChatMessages = pgTable("event_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => liveEvents.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  body: text("body").notNull(),
  hiddenAt: timestamp("hidden_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_event_chat_event").on(t.eventId, t.createdAt),
]);

export const insertEventChatMessageSchema = createInsertSchema(eventChatMessages).omit({
  id: true, hiddenAt: true, createdAt: true,
});
export type InsertEventChatMessage = z.infer<typeof insertEventChatMessageSchema>;
export type EventChatMessage = typeof eventChatMessages.$inferSelect;

// Saved live-caption transcripts for events and reading-club sessions.
// No video-conferencing: the host/admin posts caption cues that accumulate here and are saved.
export const EVENT_TRANSCRIPT_SOURCE_TYPES = ["live_event", "reading_club"] as const;
export type EventTranscriptSourceType = typeof EVENT_TRANSCRIPT_SOURCE_TYPES[number];

export const EVENT_TRANSCRIPT_STATUSES = ["live", "final"] as const;
export type EventTranscriptStatus = typeof EVENT_TRANSCRIPT_STATUSES[number];

export const eventTranscripts = pgTable("event_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceType: varchar("source_type", { length: 24 }).notNull(), // live_event | reading_club
  sourceId: varchar("source_id").notNull(),
  segments: jsonb("segments").$type<TranscriptSegment[]>().notNull().default(sql`'[]'::jsonb`),
  language: text("language").notNull().default("en"),
  source: text("source").notNull().default("live_caption"), // manual | live_caption | imported
  status: varchar("status", { length: 12 }).notNull().default("live"), // live | final
  createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  uniqueIndex("uq_event_transcripts_source").on(t.sourceType, t.sourceId),
]);

export const insertEventTranscriptSchema = createInsertSchema(eventTranscripts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventTranscript = z.infer<typeof insertEventTranscriptSchema>;
export type EventTranscript = typeof eventTranscripts.$inferSelect;

// Share-clip records (15-60s player segments shared externally)
export const shareClips = pgTable("share_clips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bookId: varchar("book_id").notNull(),
  bookTitle: varchar("book_title", { length: 240 }).notNull(),
  startSec: integer("start_sec").notNull(),
  endSec: integer("end_sec").notNull(),
  quote: text("quote"),
  shareToken: varchar("share_token", { length: 32 }).notNull().unique(),
  hideAttribution: boolean("hide_attribution").notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_share_clips_user").on(t.userId),
  index("idx_share_clips_token").on(t.shareToken),
]);

export const insertShareClipSchema = createInsertSchema(shareClips).omit({
  id: true, viewCount: true, createdAt: true,
});
export type InsertShareClip = z.infer<typeof insertShareClipSchema>;
export type ShareClip = typeof shareClips.$inferSelect;

// ============================================================
// USER ACTIVITY (Task #67) — opt-in, per-user, NDIS-friendly
// Separate from anonymised product_events. Only written when
// the user has explicitly enabled activityTrackingEnabled.
// ============================================================

export const OUTCOME_TAGS = [
  "capacity_building",
  "independent_access",
  "daily_living",
  "communication_support",
] as const;
export type OutcomeTag = typeof OUTCOME_TAGS[number];

export const OUTCOME_TAG_LABELS: Record<OutcomeTag, string> = {
  capacity_building: "Capacity building",
  independent_access: "Independent access",
  daily_living: "Daily living",
  communication_support: "Communication support",
};

export const ACTIVITY_EVENT_TYPES = [
  "playback_session",
  "transcript_opened",
  "accessibility_change",
  "ebook_session",
  "bookmark_added",
] as const;
export type ActivityEventType = typeof ACTIVITY_EVENT_TYPES[number];

export const ACTIVITY_EVENT_LABELS: Record<ActivityEventType, string> = {
  playback_session: "Listened to an audiobook",
  transcript_opened: "Opened a transcript",
  accessibility_change: "Adjusted accessibility settings",
  ebook_session: "Read an ebook",
  bookmark_added: "Added a bookmark",
};

export const userActivityEvents = pgTable("user_activity_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  bookId: varchar("book_id"),
  bookTitle: text("book_title"),
  durationSeconds: integer("duration_seconds"),
  outcomeTag: varchar("outcome_tag", { length: 40 }),
  note: text("note"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (t) => [
  index("idx_user_activity_user_time").on(t.userId, t.occurredAt),
  index("idx_user_activity_user_type").on(t.userId, t.eventType),
  index("idx_user_activity_user_book").on(t.userId, t.bookId),
]);

export const insertUserActivityEventSchema = createInsertSchema(userActivityEvents).omit({
  id: true, occurredAt: true,
});
export type InsertUserActivityEvent = z.infer<typeof insertUserActivityEventSchema>;
export type UserActivityEvent = typeof userActivityEvents.$inferSelect;

export const userActivityShares = pgTable("user_activity_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  caregiverLabel: text("caregiver_label").notNull(),
  shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
  rangeFrom: timestamp("range_from"),
  rangeTo: timestamp("range_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [
  index("idx_user_activity_shares_user").on(t.userId),
  index("idx_user_activity_shares_token").on(t.shareToken),
]);

export const insertUserActivityShareSchema = createInsertSchema(userActivityShares).omit({
  id: true, shareToken: true, createdAt: true, revokedAt: true,
});
export type InsertUserActivityShare = z.infer<typeof insertUserActivityShareSchema>;
export type UserActivityShare = typeof userActivityShares.$inferSelect;

// ============================================================
// PROGRESS GOALS (Task #221) — caregiver/therapist literacy &
// listening goals. Multi-metric, weekly/monthly targets, built
// on top of the Task #67 activity-sharing infra. Goal rows are
// plain config (auth-only CRUD); progress aggregation and the
// shared caregiver report stay gated by the #67 opt-in + token.
// ============================================================

export const GOAL_METRICS = [
  "listening_minutes",
  "books_completed",
  "active_days",
  "transcript_opens",
] as const;
export type GoalMetric = typeof GOAL_METRICS[number];

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  listening_minutes: "Listening / reading time",
  books_completed: "Books completed",
  active_days: "Active days",
  transcript_opens: "Transcript opens",
};

// Unit shown next to a target, e.g. "150 minutes".
export const GOAL_METRIC_UNITS: Record<GoalMetric, string> = {
  listening_minutes: "minutes",
  books_completed: "books",
  active_days: "days",
  transcript_opens: "opens",
};

export const GOAL_PERIODS = ["week", "month"] as const;
export type GoalPeriod = typeof GOAL_PERIODS[number];

export const GOAL_PERIOD_LABELS: Record<GoalPeriod, string> = {
  week: "per week",
  month: "per month",
};

export const progressGoals = pgTable("progress_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metric: varchar("metric", { length: 40 }).notNull(),
  period: varchar("period", { length: 10 }).notNull(),
  target: integer("target").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (t) => [
  index("idx_progress_goals_user_active").on(t.userId, t.archivedAt),
  // Partial unique index: at most one active goal per (user, metric, period).
  // Archived rows are excluded so a re-created goal after delete is allowed.
  uniqueIndex("uniq_progress_goals_active")
    .on(t.userId, t.metric, t.period)
    .where(sql`archived_at IS NULL`),
]);

export const insertProgressGoalSchema = createInsertSchema(progressGoals).omit({
  id: true, createdAt: true, updatedAt: true, archivedAt: true,
});
export type InsertProgressGoal = z.infer<typeof insertProgressGoalSchema>;
export type ProgressGoal = typeof progressGoals.$inferSelect;

// ============================================================
// ENTITLEMENT CONFIG (Task #70)
// Server-stored (featureKey, tier, enabled) grid edited by admins.
// The entitlement service consults this table first; if a feature
// is missing, it falls back to the hard-coded mapping in
// server/entitlements.ts. This lets admins toggle access without
// a code change or server restart.
// ============================================================
export const entitlementConfig = pgTable("entitlement_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  featureKey: text("feature_key").notNull(),
  tier: text("tier").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("ux_entitlement_config_feature_tier").on(t.featureKey, t.tier),
]);

export const insertEntitlementConfigSchema = createInsertSchema(entitlementConfig).omit({
  id: true, updatedAt: true,
});
export type InsertEntitlementConfig = z.infer<typeof insertEntitlementConfigSchema>;
export type EntitlementConfig = typeof entitlementConfig.$inferSelect;

/** Catalogue of admin-configurable feature keys + their default tier mapping.
 *  Mirrors the hard-coded fallback in server/entitlements.ts so the seeder
 *  and the admin UI agree on the initial grid. */
export const ENTITLEMENT_FEATURES = [
  { key: "advanced_personalization", label: "Advanced personalization", description: "Personalised recommendations, AI-coached suggestions." },
  { key: "ai_coach_full",           label: "AI Coach (full)",          description: "Unlimited AI accessibility coach conversations." },
  { key: "ultra_audio_quality",     label: "Ultra audio quality",      description: "320 kbps HD audio streaming." },
  { key: "multi_device_5plus",      label: "Multi-device (5+)",        description: "Sign in on 5 or more devices simultaneously." },
  { key: "unlimited_tts",           label: "Unlimited text-to-speech", description: "Convert any ebook page to speech without daily caps." },
  { key: "offline_downloads",       label: "Offline downloads",        description: "Download titles for offline listening." },
] as const;
export type EntitlementFeatureKey = typeof ENTITLEMENT_FEATURES[number]["key"];

// ============================================================
// AUTO RESPONSE LOG (Task #133)
// Persists which (recipient, sender, dedupeKey) tuples have already received
// an automated reply, so the dedupe window survives server restarts /
// multi-instance deploys. Mirrors the in-memory Map in server/agentMailer.ts.
// ============================================================
export const autoResponseLog = pgTable("auto_response_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipient: text("recipient").notNull(),
  sender: text("sender").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("ux_auto_response_log_recipient_sender_key").on(t.recipient, t.sender, t.dedupeKey),
  index("idx_auto_response_log_expires").on(t.expiresAt),
]);

export const insertAutoResponseLogSchema = createInsertSchema(autoResponseLog).omit({
  id: true, createdAt: true,
});
export type InsertAutoResponseLog = z.infer<typeof insertAutoResponseLogSchema>;
export type AutoResponseLog = typeof autoResponseLog.$inferSelect;

/** Default (featureKey × tier) → enabled mapping. Mirrors current code. */
export const DEFAULT_ENTITLEMENT_MATRIX: Record<EntitlementFeatureKey, Record<SubscriptionTier, boolean>> = {
  advanced_personalization: { free: false, plus: false, premium: true,  institutional: true,  admin: true },
  ai_coach_full:            { free: false, plus: false, premium: true,  institutional: true,  admin: true },
  ultra_audio_quality:      { free: false, plus: false, premium: true,  institutional: true,  admin: true },
  multi_device_5plus:       { free: false, plus: false, premium: true,  institutional: true,  admin: true },
  unlimited_tts:            { free: false, plus: false, premium: true,  institutional: true,  admin: true },
  offline_downloads:        { free: false, plus: false, premium: true,  institutional: true,  admin: true },
};

// Audit log of automatic account-link events performed during sign-in.
// Records when a legacy Google-OAuth account is matched to the new
// Replit-managed OIDC identity by verified email (or when a link was
// refused because the matching account is a local-password account).
// Admin-visible via GET /api/admin/account-link-audits.
export const accountLinkAudits = pgTable("account_link_audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider").notNull(), // e.g. "google"
  providerSub: varchar("provider_sub").notNull(), // OIDC subject that was linked
  email: varchar("email"), // verified email the match was made on
  previousAuthProvider: varchar("previous_auth_provider"), // authProvider before linking
  outcome: varchar("outcome").notNull(), // "linked" | "skipped_local_password"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_account_link_audits_user").on(table.userId),
  index("idx_account_link_audits_created").on(table.createdAt),
]);

export const insertAccountLinkAuditSchema = createInsertSchema(accountLinkAudits).omit({
  id: true,
  createdAt: true,
});
export type InsertAccountLinkAudit = z.infer<typeof insertAccountLinkAuditSchema>;
export type AccountLinkAudit = typeof accountLinkAudits.$inferSelect;
