import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { z } from "zod";
import { referrals, userPreferences, userXp, userAchievements, listeningHistory, users, reviews, books, userSubmissions, streakFreezes, expiringRewards, dailyListeningLog, contentAnalytics, giftCards, battlePasses, battlePassMilestones, battlePassPurchases, notificationLog, activityFeed, readingClubs, readingClubMembers, familyAccounts, familyMembers, contentReports, advertiserWallets, paymentTransactions, adCampaigns } from "@shared/schema";
import { eq, desc, sql, count, sum, and, gt, gte } from "drizzle-orm";
import { setupMultiAuth, isAuthenticated } from "./multiAuth";
import { setupAuth0Routes, isAuth0Configured } from "./auth0";
import { getUncachableSpotifyClient, isSpotifyConnected } from "./spotifyClient";
import { getSeederStatus, getSeederMetrics, startSeeding, stopSeeding, resetSeeder, resetAndRestartExpandedSources, getSeededBookCount } from "./catalogSeeder";
import { registerSelfPublishingRoutes } from "./selfPublishing";
import { registerRevenueRoutes, seedVoicePacks } from "./revenueRoutes";
import { registerLoanRoutes, startLoanExpirationJob } from "./loanSystem";
import { registerPlatformRoutes } from "./platformRoutes";
import { registerPodcastRoutes } from "./podcastIngestion";
import { registerPushNotificationRoutes } from "./pushNotifications";
import { registerAdMediationRoutes } from "./adMediation";
import { registerSelfServeAdRoutes } from "./selfServeAds";
import { registerBillingRoutes, recordTransaction, updateTransactionStatus } from "./billing";
import { registerAccessibilityKernelRoutes } from "./accessibilityKernel";
import { registerTranscriptRoutes, seedSampleTranscript } from "./transcripts";
import { registerMoatScaffoldRoutes, ensureMoatMigrations } from "./moatScaffold";
import { registerCoachRoutes } from "./coachRoutes";
import { registerAdPlatformRoutes } from "./adPlatformRoutes";
import { registerChatRoutes } from "./replit_integrations/chat";
import {
  convertToEasyEnglish,
  getUserEasyEnglishStatus,
  incrementUserUsage,
  reportStripeUsage,
  fetchCanonicalPageText,
} from "./easyEnglish";
import { easyEnglishCache } from "@shared/schema";
import { 
  ensureCoversDir, 
  getGeneratedCoverUrl, 
  hasGeneratedCover, 
  buildCoverPrompt, 
  queueCoverGeneration, 
  getPendingCovers,
  markCoverGenerated,
  listGeneratedCovers,
  generateCoverForBook,
  generateCoversForBooks
} from "./coverGenerator";
import { stripe, PREMIUM_PRICE_MONTHLY, PREMIUM_PRICE_YEARLY, PLUS_PRICE_MONTHLY, PLUS_PRICE_YEARLY, SUBSCRIPTION_CONFIG, SUBSCRIPTION_CONFIGS, DONATION_CONFIG, DONATION_AMOUNTS, verifyWebhookSignature } from "./stripe";
import { TIER_PRICING, TITLE_PRICING, TIER_DISCOUNTS, TIER_FEATURES, type SubscriptionTier, purchases } from "@shared/schema";
import { rateLimitMiddleware, drmGuardMiddleware, premiumContentMiddleware, generateSignedStreamUrl } from "./drm";
import { apiCache, CACHE_TTL } from "./apiCache";
import { createPaypalOrder, capturePaypalOrder, loadPaypalDefault, isPayPalEnabled } from "./paypal";
import { createCoinbaseCharge, getCoinbaseCharge, handleCoinbaseWebhook, getPaymentMethods, isCoinbaseEnabled } from "./coinbase";
import { searchAmazonAudiobooks, getAmazonAudiobook, isAmazonEnabled } from "./amazon";
import { isSoundCloudEnabled, searchSoundCloudTracks, getSoundCloudTrack, getSoundCloudUser, getSoundCloudUserTracks, getSoundCloudStreamUrl, getSoundCloudGenreTracks, getSoundCloudRelated, SOUNDCLOUD_GENRES } from "./soundcloud";
import { isGooglePlayEnabled, searchGooglePlayAudiobooks, getGooglePlayAudiobook, getGooglePlaySimilar, searchGooglePlayEbooks, getGooglePlayEbook, searchGooglePlay, getGooglePlayBook } from "./googlePlay";
import { registerListeningPartyRoutes, setupListeningPartyWS } from "./listeningParty";
import { registerStreamingQueueRoutes } from "./streamingQueue";
import {
  getSkipStatus,
  useSkip,
  getAudioQuality,
  getAudioQualityForTier,
  getQualityBitrate,
  registerDevice,
  removeDevice,
  getDevices,
  createPlaybackSession,
  validatePlaybackSession,
  heartbeat,
  endPlaybackSession,
  getActiveSession,
  shouldShowAd,
  isShuffleModeRequired,
} from "./monetization";
import {
  createReview,
  updateReview,
  deleteReview,
  getReviewsByBook,
  getReviewsByUser,
  toggleReviewLike,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  isFollowing,
  getSocialFeed,
  getAggregatedRatings,
  getAuthorByName,
  getAuthorWorks,
} from "./reviews";
import {
  getGamificationProfile,
  recordListeningActivity,
  getLeaderboard,
  ACHIEVEMENT_DEFINITIONS,
  setDailyGoal,
  getActiveChallenges,
  joinChallenge,
  getUserChallenges,
} from "./gamification";
import express from "express";

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS for same-origin requests (more secure than wildcard)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost:5000', // Dev server
      'https://localhost:5000',
      process.env.ALLOWED_ORIGIN // Production domain
    ].filter(Boolean);
    
    // Only set CORS headers if origin is in allowlist (never use "*" with credentials)
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true"); // Required for sessions
    }
    
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Setup multi-provider authentication: local, Google, Facebook, Microsoft (Passport.js)
  setupMultiAuth(app);
  
  // Setup Auth0 M2M API routes
  setupAuth0Routes(app);

  // Self-publishing portal routes (author profiles, file uploads, analytics)
  registerSelfPublishingRoutes(app);

  // Podcast ingestion routes (RSS feeds, episodes)
  registerPodcastRoutes(app);

  // Push notification routes (subscribe, preferences, history)
  registerPushNotificationRoutes(app);

  // Programmatic audio ad mediation routes (AdsWizz, Triton, ad:personam, house ads)
  registerAdMediationRoutes(app);

  // Self-serve advertising platform (campaign management, CPM bidding, audio upload)
  registerSelfServeAdRoutes(app);

  // Ad bidding platform (advertisers, publishers, real-time auctions, admin review)
  registerAdPlatformRoutes(app);

  // Centralized billing platform (transactions, invoices, billing portal)
  registerBillingRoutes(app);

  // Revenue expansion routes (voice packs, annotations, gifts, enterprise, sponsorships)
  registerRevenueRoutes(app);
  seedVoicePacks().catch(err => console.warn("[Revenue] Failed to seed voice packs:", err.message));

  // Loan-return system (borrow, return, waitlist, downloads with expiry)
  registerLoanRoutes(app);
  startLoanExpirationJob();

  // Platform improvement routes (social, clubs, family, tipping, moderation, health, churn)
  registerPlatformRoutes(app);

  // Accessibility preferences kernel routes
  registerAccessibilityKernelRoutes(app);

  // Interactive transcripts routes
  registerTranscriptRoutes(app);
  seedSampleTranscript().catch(err => console.warn("[Transcripts] Failed to seed sample:", err.message));

  // Moat scaffold routes (a11y metadata, reviews, institutional, recommendations, metrics)
  ensureMoatMigrations().catch(err => console.warn("[Moat] Migrations failed:", err.message));
  registerMoatScaffoldRoutes(app);

  // AI Accessibility Coach endpoint
  registerCoachRoutes(app);

  // AI conversational chat routes (conversations, messages, streaming AI responses)
  registerChatRoutes(app);

  // === EASY ENGLISH ADD-ON ROUTES ===

  // GET /api/easy-english/status - Returns free chapters remaining and subscription status
  app.get("/api/easy-english/status", async (req: any, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const status = await getUserEasyEnglishStatus(userId);
      res.json(status);
    } catch (error) {
      console.error("[EasyEnglish] Error getting status:", error);
      res.status(500).json({ message: "Failed to get Easy English status" });
    }
  });

  // POST /api/easy-english/convert - Convert page text to Easy English
  app.post("/api/easy-english/convert", async (req: any, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      // chapterNumber = the 1-based reading segment (page slice of ~300 words)
      // For text ebooks that have no discrete chapters, each ~300-word page IS the billable unit.
      const { bookId, chapterNumber } = req.body;
      if (!bookId || typeof chapterNumber !== "number" || chapterNumber < 1) {
        return res.status(400).json({ message: "bookId and chapterNumber are required" });
      }

      // Check if already cached (cache hit is free — no usage counted)
      const cached = await db.select().from(easyEnglishCache)
        .where(and(eq(easyEnglishCache.bookId, bookId), eq(easyEnglishCache.chapterNumber, chapterNumber)))
        .limit(1);

      if (cached.length > 0) {
        return res.json({ convertedText: cached[0].convertedText, fromCache: true });
      }

      // Cache miss — check limits before doing any work
      const status = await getUserEasyEnglishStatus(userId);

      if (!status.hasAddonSubscription && (status.freeChaptersRemaining ?? 0) <= 0) {
        return res.status(402).json({
          message: "Free Easy English allowance exhausted",
          requiresSubscription: true,
          freeChaptersRemaining: 0,
          hasAddonSubscription: false,
        });
      }

      // Fetch canonical page text server-side (prevents cache poisoning)
      const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
      const canonicalText = await fetchCanonicalPageText(bookId, chapterNumber, baseUrl);
      if (!canonicalText) {
        return res.status(404).json({ message: "Page content not found or book has no text content" });
      }

      // Convert using OpenAI
      const convertedText = await convertToEasyEnglish(bookId, chapterNumber, canonicalText);

      // Increment monthly usage counter
      await incrementUserUsage(userId);

      // Report to Stripe for paid add-on subscribers
      if (status.hasAddonSubscription) {
        const userRow = await db.select({ stripeCustomerId: users.stripeCustomerId })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const customerId = userRow[0]?.stripeCustomerId;
        if (customerId) {
          await reportStripeUsage(customerId);
        }
      }

      res.json({ convertedText, fromCache: false });
    } catch (error) {
      console.error("[EasyEnglish] Error converting text:", error);
      res.status(500).json({ message: "Failed to convert text to Easy English" });
    }
  });

  // POST /api/easy-english/subscribe - Subscribe user to the Easy English metered add-on
  app.post("/api/easy-english/subscribe", async (req: any, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      if (!stripe) {
        return res.status(503).json({ message: "Stripe not configured" });
      }

      const userRow = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow.length) return res.status(404).json({ message: "User not found" });

      const user = userRow[0];

      // Guard against duplicate subscriptions — webhook must confirm activation
      if (user.stripeEasyEnglishSubscriptionItemId) {
        return res.status(409).json({ message: "Already subscribed to Easy English add-on" });
      }

      // Ensure Stripe customer exists
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
      }

      // Retrieve or lazily create the per-chapter metered price
      let priceId = process.env.STRIPE_EASY_ENGLISH_PRICE_ID;
      if (!priceId) {
        const product = await stripe.products.create({
          name: "Easy English Add-on",
          description: "Per-chapter Easy English text simplification",
          metadata: { type: "easy_english_addon" },
        });
        const price = await stripe.prices.create({
          product: product.id,
          currency: "usd",
          unit_amount: 49,
          recurring: {
            interval: "month",
            usage_type: "metered",
          },
          billing_scheme: "per_unit",
        });
        priceId = price.id;
      }

      // Build absolute origin for redirect URLs
      const origin = req.headers.origin || `https://${req.headers.host}`;

      // Create a Stripe Checkout Session — access is granted only after
      // checkout.session.completed + customer.subscription.updated webhooks confirm payment.
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          metadata: { userId, type: "easy_english_addon" },
        },
        metadata: { userId, type: "easy_english_addon" },
        success_url: `${origin}/?ee_subscribed=1`,
        cancel_url: `${origin}/`,
      });

      res.json({ checkoutUrl: session.url });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[EasyEnglish] Subscribe error:", msg);
      res.status(500).json({ message: msg || "Failed to create Easy English checkout session" });
    }
  });

  // Auth user endpoint (Passport.js authentication)
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Passport.js stores user object in session
      if (req.user.id) {
        const { passwordHash, ...userWithoutPassword } = req.user;
        return res.json(userWithoutPassword);
      }
      
      return res.status(401).json({ message: "Unauthorized - invalid session" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // GET /api/books - Get books with optional pagination
  app.get("/api/books", async (req, res) => {
    try {
      const { cursor, limit, source, contentType: ct, genre, search, readingLevel } = req.query;
      const pageLimit = Math.min(parseInt(limit as string) || 100, 500);
      const parsedReadingLevel = readingLevel ? parseInt(readingLevel as string) : undefined;

      const results = await storage.getBooksPaginated({
        cursor: cursor as string | undefined,
        limit: pageLimit,
        source: source as string | undefined,
        contentType: ct as string | undefined,
        genre: genre as string | undefined,
        search: search as string | undefined,
        readingLevel: parsedReadingLevel && parsedReadingLevel >= 1 && parsedReadingLevel <= 4 ? parsedReadingLevel : undefined,
      });
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch books" });
    }
  });

  // GET /api/books/easy-read - Books at reading levels 1 and 2 (Very Easy + Easy)
  app.get("/api/books/easy-read", async (req, res) => {
    try {
      const { limit } = req.query;
      const pageLimit = Math.min(parseInt(limit as string) || 24, 100);

      // Fetch all available books at each level (up to pageLimit each) then combine.
      // By fetching the full pageLimit from each level we can backfill from whichever
      // level has more books, ensuring we always return up to pageLimit results.
      const [level1, level2] = await Promise.all([
        storage.getBooksPaginated({ limit: pageLimit, readingLevel: 1 }),
        storage.getBooksPaginated({ limit: pageLimit, readingLevel: 2 }),
      ]);

      // Interleave and de-duplicate by ID, then sort by ID for stable ordering
      const seen = new Set<string>();
      const combined: typeof level1.data = [];
      for (const book of [...level1.data, ...level2.data]) {
        if (!seen.has(book.id)) { seen.add(book.id); combined.push(book); }
      }
      combined.sort((a, b) => a.id.localeCompare(b.id));

      res.json({
        data: combined.slice(0, pageLimit),
        hasMore: level1.hasMore || level2.hasMore,
        total: (level1.total ?? 0) + (level2.total ?? 0),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch Easy Read books" });
    }
  });

  // POST /api/books/backfill-reading-levels - Admin-only: compute and store reading levels
  app.post("/api/books/backfill-reading-levels", isAuthenticated, async (req: any, res) => {
    // Restrict to admin users only
    const userId = req.user?.id || req.user?.claims?.sub;
    if (userId) {
      try {
        const userRows = await db.execute(sql`SELECT role FROM users WHERE id = ${userId}`);
        const rows: any[] = (userRows as any).rows ?? [];
        const role = rows[0]?.role;
        if (role !== "admin") {
          return res.status(403).json({ message: "Admin access required" });
        }
      } catch {
        return res.status(403).json({ message: "Access denied" });
      }
    } else {
      return res.status(401).json({ message: "Authentication required" });
    }
    try {
      const { computeReadingLevel } = await import("./readingLevelUtils");
      const batchSize = 200;
      let updated = 0;
      let cursor: string | undefined;

      for (let i = 0; i < 50; i++) {
        const result = await db.execute(
          cursor
            ? sql`SELECT id, description, genre FROM books WHERE reading_level IS NULL AND id > ${cursor} ORDER BY id ASC LIMIT ${batchSize}`
            : sql`SELECT id, description, genre FROM books WHERE reading_level IS NULL ORDER BY id ASC LIMIT ${batchSize}`
        );
        const rows: any[] = (result as any).rows ?? (result as any) ?? [];
        if (!Array.isArray(rows) || rows.length === 0) break;

        for (const row of rows) {
          const level = computeReadingLevel(row.description, row.genre);
          await db.execute(sql`UPDATE books SET reading_level = ${level} WHERE id = ${row.id}`);
          updated++;
        }
        cursor = rows[rows.length - 1].id;
        if (rows.length < batchSize) break;
      }

      res.json({ updated, message: `Backfilled reading levels for ${updated} books` });
    } catch (error: any) {
      console.error("[ReadingLevel] Backfill error:", error?.message);
      res.status(500).json({ message: "Backfill failed", error: error?.message });
    }
  });

  // PATCH /api/admin/books/:id - Admin: update book metadata and/or override reading level
  app.patch("/api/admin/books/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.id || req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    try {
      const userRows = await db.execute(sql`SELECT role FROM users WHERE id = ${userId}`);
      const userArr: any[] = (userRows as any).rows ?? [];
      if (userArr[0]?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
    } catch {
      return res.status(403).json({ message: "Access denied" });
    }

    try {
      const { id } = req.params;
      const { readingLevel, description, genre, title, author, narrator, coverImage, audioUrl, contentUrl, isPremium } = req.body;

      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = title;
      if (author !== undefined) updates.author = author;
      if (narrator !== undefined) updates.narrator = narrator;
      if (description !== undefined) updates.description = description;
      if (genre !== undefined) updates.genre = genre;
      if (coverImage !== undefined) updates.coverImage = coverImage;
      if (audioUrl !== undefined) updates.audioUrl = audioUrl;
      if (contentUrl !== undefined) updates.contentUrl = contentUrl;
      if (isPremium !== undefined) updates.isPremium = isPremium;
      if (readingLevel !== undefined) {
        if (readingLevel !== null) {
          const rl = parseInt(readingLevel);
          if (isNaN(rl) || rl < 1 || rl > 4) {
            return res.status(400).json({ message: "readingLevel must be null or an integer between 1 and 4" });
          }
          updates.readingLevel = rl;
        } else {
          updates.readingLevel = null;
        }
      }

      const updated = await storage.updateBook(id, updates, {
        preserveReadingLevel: readingLevel !== undefined, // Explicit override; do not auto-recompute
      });

      if (!updated) return res.status(404).json({ message: "Book not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update book" });
    }
  });

  // GET /api/books/search - Search books (with optional SoundCloud/Google Play augmentation)
  app.get("/api/books/search", async (req, res) => {
    try {
      const { q, includeSoundCloud, includeGooglePlay } = req.query;
      
      if (!q || typeof q !== "string") {
        return res.status(400).json({ message: "Search query is required" });
      }

      const books = await storage.searchBooks(q);
      let augmented: any[] = [...books];

      if (includeSoundCloud === "true" && isSoundCloudEnabled()) {
        try {
          const scTracks = await searchSoundCloudTracks(q, 5);
          const scBooks = scTracks.map((track: any) => ({
            id: `soundcloud-${track.id}`,
            title: track.title,
            author: track.artist,
            description: track.description,
            coverImage: track.artworkUrl,
            audioUrl: `/api/soundcloud/track/${track.id}/stream`,
            duration: Math.floor(track.duration / 1000),
            genre: track.genre || "SoundCloud",
            contentType: "audiobook",
            source: "soundcloud",
            externalUrl: track.permalinkUrl,
            playbackCount: track.playbackCount,
          }));
          augmented = [...augmented, ...scBooks];
        } catch {}
      }

      if (includeGooglePlay === "true" && isGooglePlayEnabled()) {
        try {
          const gpResults = await searchGooglePlayAudiobooks(q as string, 5);
          const gpBooks = gpResults.map((item) => ({
            id: `gplay-${item.productId}`,
            title: item.title,
            author: item.authors.join(", "),
            description: item.description || "",
            coverImage: item.coverUrl,
            audioUrl: "",
            duration: 0,
            genre: item.categories?.[0] || "Google Play",
            contentType: "audiobook",
            source: "google_play",
            externalUrl: item.link,
            rating: item.rating,
            price: item.price,
          }));
          augmented = [...augmented, ...gpBooks];
        } catch {}
      }

      res.json(augmented);
    } catch (error) {
      res.status(500).json({ message: "Failed to search books" });
    }
  });

  // GET /api/books/featured - Book of the Day (deterministic by date)
  app.get("/api/books/featured", async (_req, res) => {
    try {
      const featured = await (storage as any).getFeaturedBook();
      if (!featured) {
        return res.status(404).json({ message: "No books available" });
      }
      res.json(featured);
    } catch (error) {
      console.error("Error fetching featured book:", error);
      res.status(500).json({ message: "Failed to fetch featured book" });
    }
  });

  // GET /api/books/trending - Top 10 most-listened books
  app.get("/api/books/trending", async (_req, res) => {
    try {
      let trending: { bookId: string; playCount: number }[] = [];
      try {
        trending = await db
          .select({
            bookId: listeningHistory.bookId,
            playCount: sql<number>`cast(sum(${listeningHistory.playCount}) as int)`,
          })
          .from(listeningHistory)
          .groupBy(listeningHistory.bookId)
          .orderBy(desc(sql`sum(${listeningHistory.playCount})`))
          .limit(10);
      } catch {}

      if (trending.length > 0) {
        const trendingBooks = [];
        for (const item of trending) {
          const book = await storage.getBook(item.bookId);
          if (book) trendingBooks.push(book);
        }
        if (trendingBooks.length > 0) {
          return res.json(trendingBooks);
        }
      }

      const randomBooks = await (storage as any).getRandomBooks(10);
      res.json(randomBooks);
    } catch (error) {
      console.error("Error fetching trending books:", error);
      res.status(500).json({ message: "Failed to fetch trending books" });
    }
  });

  // GET /api/books/:id - Get specific book
  app.get("/api/books/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);
      
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }
      
      res.json(book);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch book" });
    }
  });

  // GET /api/books/:id/stream-url - Get a signed streaming URL for a book
  // Requires authentication for security
  app.get("/api/books/:id/stream-url", async (req: any, res) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ 
          message: "Authentication required to get stream URL",
          loginRequired: true,
        });
      }
      
      const { id } = req.params;
      const book = await storage.getBook(id);
      
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }
      
      const userId = req.user?.claims?.sub || req.user?.id;

      const streamCacheKey = `stream_url:${id}:${userId}`;
      const cachedUrl = apiCache.get<string>(streamCacheKey);
      if (cachedUrl) {
        return res.json({ streamUrl: cachedUrl, expiresIn: 15 * 60 });
      }

      const signedUrl = generateSignedStreamUrl(id, userId);
      apiCache.set(streamCacheKey, signedUrl, 10 * 60 * 1000);
      
      res.json({ 
        streamUrl: signedUrl,
        expiresIn: 15 * 60,
      });
    } catch (error) {
      console.error("Error generating stream URL:", error);
      res.status(500).json({ message: "Failed to generate stream URL" });
    }
  });

  // POST /api/books/:id/prewarm - Pre-warm server cache for faster content delivery
  // Warms the exact same cache keys consumed by the real reader/player endpoints.
  app.post("/api/books/:id/prewarm", async (req: any, res) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);
      if (!book) {
        return res.status(404).json({ warmed: false, reason: "not found" });
      }

      // Warm stream URL cache (same key used by GET /api/books/:id/stream-url)
      if (req.isAuthenticated && req.isAuthenticated()) {
        const userId = req.user?.claims?.sub || req.user?.id;
        if (userId) {
          const streamCacheKey = `stream_url:${id}:${userId}`;
          if (!apiCache.has(streamCacheKey)) {
            const signedUrl = generateSignedStreamUrl(id, userId);
            apiCache.set(streamCacheKey, signedUrl, 10 * 60 * 1000);
          }
        }
      }

      // Warm ebook text content cache (same key used by GET /api/ebook/:id/content)
      if ((book.contentType === "ebook" || book.contentType === "magazine") && book.contentUrl) {
        const ebookTextCacheKey = `ebook_text:${id}`;
        if (!apiCache.has(ebookTextCacheKey)) {
          const urlLower = book.contentUrl.toLowerCase();
          const isTextContent = !urlLower.endsWith(".pdf") && !urlLower.endsWith(".epub");
          if (isTextContent) {
            const allowedDomains = [
              "gutenberg.org", "archive.org", "gutendex.com", "standardebooks.org",
              "manybooks.net", "feedbooks.com", "openstax.org", "wikipedia.org", "loyalbooks.com",
            ];
            try {
              const url = new URL(book.contentUrl);
              const isAllowed = allowedDomains.some(domain => url.hostname.includes(domain));
              if (isAllowed) {
                const response = await fetch(book.contentUrl, {
                  headers: { "Range": "bytes=0-102399" },
                });
                if (response.ok || response.status === 206) {
                  const ct = response.headers.get("content-type") || "";
                  if (ct.includes("text/plain") || ct.includes("text/html")) {
                    const text = await response.text();
                    apiCache.set(ebookTextCacheKey, text, CACHE_TTL.METADATA);
                  }
                }
              }
            } catch {
            }
          }
        }
      }

      storage.getBookChapters(id).catch(() => {});
      res.json({ warmed: true, id });
    } catch {
      res.json({ warmed: false });
    }
  });

  // GET /api/books/:id/chapters - Get chapters for a book
  app.get("/api/books/:id/chapters", async (req, res) => {
    try {
      const { id } = req.params;
      const chapters = await storage.getBookChapters(id);
      res.json(chapters);
    } catch (error) {
      console.error("Error fetching chapters:", error);
      res.status(500).json({ message: "Failed to fetch chapters" });
    }
  });

  // POST /api/books/:id/chapters - Create chapters for a book (admin)
  app.post("/api/books/:id/chapters", isAuthenticated, async (req: any, res) => {
    try {
      const { id: bookId } = req.params;
      const { chapters: chapterList } = req.body;
      
      if (!Array.isArray(chapterList)) {
        return res.status(400).json({ message: "chapters must be an array" });
      }
      
      const chaptersToCreate = chapterList.map((ch: any, index: number) => ({
        bookId,
        title: ch.title || `Chapter ${index + 1}`,
        chapterNumber: ch.chapterNumber ?? index + 1,
        startTime: ch.startTime ?? null,
        endTime: ch.endTime ?? null,
        pageStart: ch.pageStart ?? null,
        pageEnd: ch.pageEnd ?? null,
        duration: ch.duration ?? null,
      }));
      
      const created = await storage.createChapters(chaptersToCreate);
      res.json(created);
    } catch (error) {
      console.error("Error creating chapters:", error);
      res.status(500).json({ message: "Failed to create chapters" });
    }
  });

  // DELETE /api/books/:id/chapters - Delete all chapters for a book (admin)
  app.delete("/api/books/:id/chapters", isAuthenticated, async (req: any, res) => {
    try {
      const { id: bookId } = req.params;
      const deleted = await storage.deleteBookChapters(bookId);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting chapters:", error);
      res.status(500).json({ message: "Failed to delete chapters" });
    }
  });

  // Ensure generated covers directory exists
  ensureCoversDir();

  // GET /api/books/:id/cover - Get or check for generated cover
  app.get("/api/books/:id/cover", async (req, res) => {
    try {
      const { id: bookId } = req.params;
      const generatedUrl = getGeneratedCoverUrl(bookId);
      
      if (generatedUrl) {
        return res.json({ hasGeneratedCover: true, coverUrl: generatedUrl });
      }
      
      res.json({ hasGeneratedCover: false, coverUrl: null });
    } catch (error) {
      console.error("Error checking cover:", error);
      res.status(500).json({ message: "Failed to check cover" });
    }
  });

  // POST /api/books/:id/cover/request - Request cover generation for a book
  app.post("/api/books/:id/cover/request", async (req, res) => {
    try {
      const { id: bookId } = req.params;
      
      // Check if already generated
      if (hasGeneratedCover(bookId)) {
        return res.json({ 
          status: "exists", 
          coverUrl: getGeneratedCoverUrl(bookId) 
        });
      }
      
      // Get book details
      const book = await storage.getBook(bookId);
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }
      
      // Queue for generation
      const pending = queueCoverGeneration(
        bookId,
        book.title,
        book.author,
        book.genre || undefined,
        book.contentType || 'audiobook'
      );
      
      if (pending) {
        res.json({ 
          status: "queued", 
          prompt: pending.prompt,
          outputPath: pending.outputPath,
          bookId: pending.bookId,
          title: pending.title,
          author: pending.author
        });
      } else {
        res.json({ 
          status: "exists", 
          coverUrl: getGeneratedCoverUrl(bookId) 
        });
      }
    } catch (error) {
      console.error("Error requesting cover generation:", error);
      res.status(500).json({ message: "Failed to request cover generation" });
    }
  });

  // GET /api/covers/pending - Get list of books needing covers
  app.get("/api/covers/pending", async (req, res) => {
    try {
      const pending = getPendingCovers();
      res.json(pending);
    } catch (error) {
      console.error("Error getting pending covers:", error);
      res.status(500).json({ message: "Failed to get pending covers" });
    }
  });

  // GET /api/covers/generated - List all generated covers
  app.get("/api/covers/generated", async (req, res) => {
    try {
      const covers = listGeneratedCovers();
      res.json(covers);
    } catch (error) {
      console.error("Error listing generated covers:", error);
      res.status(500).json({ message: "Failed to list generated covers" });
    }
  });

  // POST /api/covers/:id/complete - Mark a cover as generated (called after AI generation)
  app.post("/api/covers/:id/complete", async (req, res) => {
    try {
      const { id: bookId } = req.params;
      markCoverGenerated(bookId);
      res.json({ success: true, coverUrl: getGeneratedCoverUrl(bookId) });
    } catch (error) {
      console.error("Error marking cover complete:", error);
      res.status(500).json({ message: "Failed to mark cover complete" });
    }
  });

  // POST /api/books/:id/cover/generate - Generate a cover for a single book using AI
  app.post("/api/books/:id/cover/generate", async (req, res) => {
    try {
      const { id: bookId } = req.params;
      const book = await storage.getBook(bookId);
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }

      const result = await generateCoverForBook(
        bookId,
        book.title,
        book.author,
        book.genre || undefined,
        book.contentType || 'audiobook'
      );

      res.json(result);
    } catch (error) {
      console.error("Error generating cover:", error);
      res.status(500).json({ message: "Failed to generate cover" });
    }
  });

  // POST /api/covers/generate-all - Mass-generate covers for all books missing covers (SSE stream)
  app.post("/api/covers/generate-all", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const dbResult = await storage.getBooksPaginated({ limit: 200 });
      const booksNeedingCovers = dbResult.data.filter(b => !b.coverImage && !hasGeneratedCover(b.id));

      res.write(`data: ${JSON.stringify({ type: 'start', total: booksNeedingCovers.length })}\n\n`);

      if (booksNeedingCovers.length === 0) {
        res.write(`data: ${JSON.stringify({ type: 'complete', generated: 0, skipped: 0, errors: 0 })}\n\n`);
        res.end();
        return;
      }

      const results = await generateCoversForBooks(booksNeedingCovers, (result, completed, total) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', ...result, completed, total })}\n\n`);
      });

      const summary = {
        type: 'complete',
        generated: results.filter(r => r.status === 'generated').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        errors: results.filter(r => r.status === 'error').length,
        results,
      };
      res.write(`data: ${JSON.stringify(summary)}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in mass cover generation:", error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Mass generation failed' })}\n\n`);
      res.end();
    }
  });

  // GET /api/covers/stats - Get cover generation statistics
  app.get("/api/covers/stats", async (req, res) => {
    try {
      const total = await storage.getBookCount();
      const generated = listGeneratedCovers();

      res.json({
        total,
        withOriginalCover: total,
        withGeneratedCover: generated.length,
        noCover: 0,
        generatedIds: generated,
      });
    } catch (error) {
      console.error("Error getting cover stats:", error);
      res.status(500).json({ message: "Failed to get cover stats" });
    }
  });

  // HEAD /api/stream/:id - Probe audio file size and type for byte-range readiness
  app.head("/api/stream/:id", rateLimitMiddleware, drmGuardMiddleware, premiumContentMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);
      if (!book || !book.audioUrl) return res.status(404).end();
      if (!storage.validateAudioUrl(book.audioUrl)) return res.status(403).end();

      const headRes = await fetch(book.audioUrl, {
        method: "HEAD",
        headers: { "User-Agent": "AccessiBooks/2.0 AudioProxy" },
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);

      if (headRes && headRes.ok) {
        const ct = headRes.headers.get("content-type");
        const cl = headRes.headers.get("content-length");
        if (ct) res.setHeader("Content-Type", ct);
        if (cl) res.setHeader("Content-Length", cl);
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(headRes?.status ?? 200).end();
    } catch {
      res.status(500).end();
    }
  });

  // GET /api/stream/:id - Byte-range streaming proxy (replaces 302 redirect)
  // Protected by rate limiting, DRM guard, and premium content check
  app.get("/api/stream/:id", rateLimitMiddleware, drmGuardMiddleware, premiumContentMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);
      
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }
      
      // Check if audio URL exists (ebooks/magazines may not have audio)
      if (!book.audioUrl) {
        return res.status(400).json({ 
          message: "This content does not have audio",
          error: "NO_AUDIO_AVAILABLE"
        });
      }
      
      // Security: Validate audio URL against allowed domains to prevent SSRF
      if (!storage.validateAudioUrl(book.audioUrl)) {
        console.warn(`Blocked potentially unsafe audio URL for book ${id}: ${book.audioUrl}`);
        return res.status(403).json({ 
          message: "Audio source not allowed",
          error: "INVALID_AUDIO_SOURCE"
        });
      }

      // Handle internal narration URLs (generated by ElevenLabs audiobook feature)
      // These are served directly from object storage rather than fetched from external URL
      if (book.audioUrl.startsWith("/api/audiobook/stream/")) {
        const narrationBookId = book.audioUrl.split("/api/audiobook/stream/")[1];
        const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(p => p.trim()).filter(Boolean);
        if (!publicSearchPaths.length) {
          return res.status(503).json({ message: "Object storage not configured" });
        }
        const publicPath = publicSearchPaths[0];
        const pathParts = publicPath.slice(1).split("/");
        const bucketName = pathParts[0];
        const objectName = `${pathParts.slice(1).join("/")}/${narrationBookId}-narration.mp3`;
        const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        const [exists] = await file.exists();
        if (!exists) {
          return res.status(404).json({ message: "Narration audio not found in storage" });
        }
        const [metadata] = await file.getMetadata();
        const totalSize = Number(metadata.size || 0);
        const rangeHeader = req.headers.range;
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "public, max-age=86400");
        if (rangeHeader && totalSize > 0) {
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          const chunkSize = end - start + 1;
          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
          res.setHeader("Content-Length", String(chunkSize));
          file.createReadStream({ start, end }).pipe(res);
        } else {
          if (totalSize > 0) res.setHeader("Content-Length", String(totalSize));
          file.createReadStream().pipe(res);
        }
        return;
      }

      // Build upstream request headers, forwarding Range for seek support
      const upstreamHeaders: Record<string, string> = {
        "User-Agent": "AccessiBooks/2.0 AudioProxy",
      };
      if (req.headers.range) {
        upstreamHeaders["Range"] = req.headers.range;
      }

      const upstreamRes = await fetch(book.audioUrl, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(30000),
      });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        console.error(`Upstream audio ${upstreamRes.status} for book ${id}`);
        return res.status(502).json({ message: "Failed to fetch audio from source" });
      }

      // Forward content headers from upstream
      const forwardHeaders = ["content-type", "content-length", "content-range"];
      for (const h of forwardHeaders) {
        const v = upstreamRes.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      // Ensure Content-Type is always set (some sources omit it)
      if (!upstreamRes.headers.get("content-type")) {
        res.setHeader("Content-Type", "audio/mpeg");
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(upstreamRes.status);

      if (!upstreamRes.body) {
        return res.end();
      }

      // Pipe upstream web stream to Express response
      const { Readable } = await import("stream");
      const nodeStream = Readable.fromWeb(upstreamRes.body as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.pipe(res);
      req.on("close", () => nodeStream.destroy());
    } catch (error) {
      console.error('Streaming error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to stream book" });
      }
    }
  });

  // HEAD /api/ebook/:id/content - Check content type without downloading
  app.head("/api/ebook/:id/content", async (req, res) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);
      
      if (!book) {
        return res.status(404).end();
      }

      if (book.contentType !== "ebook" && book.contentType !== "magazine") {
        return res.status(400).end();
      }

      if (!book.contentUrl) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.end();
      }

      const urlLower = book.contentUrl.toLowerCase();
      if (urlLower.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
      } else if (urlLower.endsWith(".epub")) {
        res.setHeader("Content-Type", "application/epub+zip");
      } else {
        try {
          const response = await fetch(book.contentUrl, { method: "HEAD" });
          const contentType = response.headers.get("content-type") || "text/plain";
          res.setHeader("Content-Type", contentType);
        } catch {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
      }
      
      res.end();
    } catch (error) {
      console.error("HEAD ebook content error:", error);
      res.status(500).end();
    }
  });

  // GET /api/ebook/:id/content - Fetch and proxy ebook content
  // Handles CORS issues and format conversion for client-side reader
  app.get("/api/ebook/:id/content", async (req, res) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);
      
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }

      // Check if this is an ebook or magazine
      if (book.contentType !== "ebook" && book.contentType !== "magazine") {
        return res.status(400).json({ message: "This is not an ebook or magazine" });
      }

      // If no content URL, return sample content
      if (!book.contentUrl) {
        const sampleContent = generateSampleEbookContent(book);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("X-Content-Source", "sample");
        return res.send(sampleContent);
      }

      // Check warm cache for text content (populated by prewarm endpoint)
      const ebookTextCacheKey = `ebook_text:${id}`;
      const cachedText = apiCache.get<string>(ebookTextCacheKey);
      if (cachedText) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("X-Content-Source", "cache");
        return res.send(cachedText);
      }

      // Validate content URL against allowed domains
      const allowedDomains = [
        "gutenberg.org",
        "archive.org",
        "gutendex.com",
        "standardebooks.org",
        "manybooks.net",
        "feedbooks.com",
        "openstax.org",
        "wikipedia.org",
        "loyalbooks.com",
      ];

      try {
        const url = new URL(book.contentUrl);
        const isAllowed = allowedDomains.some(domain => url.hostname.includes(domain));
        
        if (!isAllowed) {
          console.warn(`Blocked content fetch from unallowed domain: ${url.hostname}`);
          return res.status(403).json({ message: "Content source not allowed" });
        }

        // Fetch the content from the source
        const response = await fetch(book.contentUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch content: ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "text/plain";
        
        // Handle different content types
        if (contentType.includes("text/plain") || contentType.includes("text/html")) {
          const text = await response.text();
          apiCache.set(ebookTextCacheKey, text, CACHE_TTL.METADATA);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.send(text);
        } else if (contentType.includes("application/pdf")) {
          // Stream PDF content
          const buffer = await response.arrayBuffer();
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Length", buffer.byteLength.toString());
          res.send(Buffer.from(buffer));
        } else if (contentType.includes("application/epub") || book.contentUrl.endsWith(".epub")) {
          // Stream EPUB content
          const buffer = await response.arrayBuffer();
          res.setHeader("Content-Type", "application/epub+zip");
          res.setHeader("Content-Length", buffer.byteLength.toString());
          res.send(Buffer.from(buffer));
        } else {
          // Try to determine format from URL extension
          const urlLower = book.contentUrl.toLowerCase();
          if (urlLower.endsWith(".pdf")) {
            const buffer = await response.arrayBuffer();
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Length", buffer.byteLength.toString());
            res.send(Buffer.from(buffer));
          } else if (urlLower.endsWith(".epub")) {
            const buffer = await response.arrayBuffer();
            res.setHeader("Content-Type", "application/epub+zip");
            res.setHeader("Content-Length", buffer.byteLength.toString());
            res.send(Buffer.from(buffer));
          } else {
            // Unknown format, return as text
            const text = await response.text();
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.send(text);
          }
        }
      } catch (fetchError) {
        console.error("Error fetching ebook content:", fetchError);
        // Fall back to sample content
        const sampleContent = generateSampleEbookContent(book);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("X-Content-Source", "sample");
        res.send(sampleContent);
      }
    } catch (error) {
      console.error("Ebook content error:", error);
      res.status(500).json({ message: "Failed to fetch ebook content" });
    }
  });

  // Visual Reading - AI scene extraction and video generation for books
  const { extractScenes, saveScenesToDB, getBookVisuals, updateVisualVideo } = await import("./visualReading");

  // GET /api/books/:id/visuals - Get generated visual scenes for a book
  app.get("/api/books/:id/visuals", async (req, res) => {
    try {
      const visuals = await getBookVisuals(req.params.id);
      res.json(visuals);
    } catch (error) {
      console.error("Error fetching book visuals:", error);
      res.status(500).json({ message: "Failed to fetch visuals" });
    }
  });

  // POST /api/books/:id/generate-visuals - Extract scenes and generate visual prompts
  app.post("/api/books/:id/generate-visuals", express.json({ limit: "10mb" }), async (req, res) => {
    try {
      const { text, title, genre } = req.body;
      if (!text || text.length < 100) {
        return res.status(400).json({ message: "Book text too short for visual generation" });
      }

      const existing = await getBookVisuals(req.params.id);
      if (existing.length > 0) {
        return res.json({ scenes: existing, message: "Visuals already generated" });
      }

      const scenes = await extractScenes(text, title || "Book", genre);
      await saveScenesToDB(req.params.id, scenes);
      const saved = await getBookVisuals(req.params.id);
      res.json({ scenes: saved, message: `Generated ${scenes.length} scene descriptions` });
    } catch (error) {
      console.error("Error generating visuals:", error);
      res.status(500).json({ message: "Failed to generate visuals" });
    }
  });

  // POST /api/books/:id/visuals/:visualId/video - Update a scene with a video URL
  app.post("/api/books/:id/visuals/:visualId/video", express.json(), async (req, res) => {
    try {
      const { videoUrl } = req.body;
      if (!videoUrl) {
        return res.status(400).json({ message: "videoUrl required" });
      }
      await updateVisualVideo(req.params.visualId, videoUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating visual video:", error);
      res.status(500).json({ message: "Failed to update visual" });
    }
  });

  // GET /api/tts/voices - List available voices from OpenAI and ElevenLabs
  app.get("/api/tts/voices", async (_req, res) => {
    try {
      const openaiVoices = [
        { id: "nova", name: "Nova", description: "Warm, engaging female", provider: "openai" },
        { id: "alloy", name: "Alloy", description: "Neutral, balanced", provider: "openai" },
        { id: "echo", name: "Echo", description: "Clear, steady male", provider: "openai" },
        { id: "fable", name: "Fable", description: "Expressive, storytelling", provider: "openai" },
        { id: "onyx", name: "Onyx", description: "Deep, authoritative male", provider: "openai" },
        { id: "shimmer", name: "Shimmer", description: "Bright, optimistic female", provider: "openai" },
      ];

      const { isElevenLabsConfigured, listVoices } = await import("./replit_integrations/audio/elevenlabs");

      if (!isElevenLabsConfigured()) {
        return res.json({ openai: openaiVoices, elevenlabs: [] });
      }

      try {
        const elVoices = await listVoices();
        const elevenlabsVoices = elVoices.map(v => ({
          id: v.voice_id,
          name: v.name,
          description: v.labels?.description || v.description || v.category || "",
          provider: "elevenlabs",
        }));
        return res.json({ openai: openaiVoices, elevenlabs: elevenlabsVoices });
      } catch (err) {
        console.error("[ElevenLabs] Failed to fetch voices:", err);
        return res.json({ openai: openaiVoices, elevenlabs: [] });
      }
    } catch (error) {
      console.error("Error fetching voices:", error);
      res.status(500).json({ message: "Failed to fetch voices" });
    }
  });

  // POST /api/tts/synthesize - Convert text to speech using OpenAI or ElevenLabs
  app.post("/api/tts/synthesize", express.json({ limit: "10mb" }), async (req, res) => {
    try {
      const { text, voice = "nova", format = "mp3", provider = "openai", voiceId } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "Text is required" });
      }

      if (text.length > 5000) {
        return res.status(400).json({ message: "Text too long. Maximum 5000 characters per request." });
      }

      // ElevenLabs synthesis path
      if (provider === "elevenlabs") {
        const { textToSpeech: elTTS, isElevenLabsConfigured } = await import("./replit_integrations/audio/elevenlabs");
        if (!isElevenLabsConfigured()) {
          return res.status(503).json({ message: "ElevenLabs is not configured" });
        }
        const selectedVoiceId = voiceId || voice;
        try {
          const audioBuffer = await elTTS(text, selectedVoiceId);
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Content-Length", audioBuffer.length.toString());
          return res.send(audioBuffer);
        } catch (elErr: any) {
          console.error("ElevenLabs TTS error:", elErr.message);
          // Surface a clear message for API key issues
          const msg = elErr.message || "ElevenLabs synthesis failed";
          const isAuthErr = msg.includes("401") || msg.includes("sign_in_required") || msg.includes("authentication");
          return res.status(isAuthErr ? 401 : 500).json({
            message: isAuthErr
              ? "ElevenLabs API key is invalid or lacks text-to-speech permissions. Please check your ELEVENLABS_API_KEY."
              : msg,
          });
        }
      }

      // OpenAI synthesis path (default)
      const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
      if (!validVoices.includes(voice)) {
        return res.status(400).json({ message: `Invalid voice. Choose from: ${validVoices.join(", ")}` });
      }

      const { textToSpeech } = await import("./replit_integrations/audio/client");
      const audioBuffer = await textToSpeech(text, voice, format);

      const contentTypes: Record<string, string> = {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        flac: "audio/flac",
        opus: "audio/opus",
      };

      res.setHeader("Content-Type", contentTypes[format] || "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length.toString());
      res.send(audioBuffer);
    } catch (error) {
      console.error("TTS synthesis error:", error);
      res.status(500).json({ message: "Failed to synthesize speech" });
    }
  });

  // GET /api/audiobook/narration/:bookId - Get generated narration for a book
  app.get("/api/audiobook/narration/:bookId", async (req, res) => {
    try {
      const { bookId } = req.params;

      // First check: does the book's audioUrl already point to a generated narration?
      const book = await storage.getBook(bookId);
      if (book?.audioUrl && book.audioUrl.startsWith("/api/audiobook/stream/")) {
        return res.json({ narrationUrl: book.audioUrl });
      }

      // Second check: look for the file directly in object storage
      const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map((p: string) => p.trim()).filter(Boolean);
      if (!publicSearchPaths.length) {
        return res.status(404).json({ message: "No narration found" });
      }
      const publicPath = publicSearchPaths[0];
      const pathParts = publicPath.slice(1).split("/");
      const bucketName = pathParts[0];
      const objectName = `${pathParts.slice(1).join("/")}/${bookId}-narration.mp3`;
      const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ message: "No narration found" });
      }
      res.json({ narrationUrl: `/api/audiobook/stream/${bookId}` });
    } catch (error) {
      console.error("Error fetching narration:", error);
      res.status(500).json({ message: "Failed to fetch narration" });
    }
  });

  // POST /api/audiobook/generate - Generate full audiobook narration via ElevenLabs
  // Requires authentication + premium subscription or admin role
  app.post("/api/audiobook/generate", express.json({ limit: "1mb" }), async (req: any, res) => {
    try {
      // Auth check
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Premium or admin gating
      const userRow = await db.select({ subscriptionTier: users.subscriptionTier, role: users.role })
        .from(users).where(eq(users.id, userId)).limit(1);
      const userTier = userRow[0]?.subscriptionTier || "free";
      const userRole = userRow[0]?.role || null;
      const isAdmin = userRole === "admin";
      const isPremium = userTier === "premium" || userTier === "plus";
      if (!isAdmin && !isPremium) {
        return res.status(403).json({ message: "Narration generation requires a Plus or Premium subscription" });
      }

      const { bookId, voiceId } = req.body;

      if (!bookId || typeof bookId !== "string") {
        return res.status(400).json({ message: "bookId is required" });
      }

      const { isElevenLabsConfigured, textToSpeech: elTTS, listVoices } = await import("./replit_integrations/audio/elevenlabs");
      if (!isElevenLabsConfigured()) {
        return res.status(503).json({ message: "ElevenLabs is not configured" });
      }

      // Get the book
      const book = await storage.getBook(bookId);
      if (!book) {
        return res.status(404).json({ message: "Book not found" });
      }
      if (book.contentType !== "ebook") {
        return res.status(400).json({ message: "Narration generation is only available for ebooks" });
      }

      // Determine voice to use
      let selectedVoiceId = voiceId;
      if (!selectedVoiceId) {
        try {
          const voices = await listVoices();
          selectedVoiceId = voices[0]?.voice_id;
        } catch {}
      }
      if (!selectedVoiceId) {
        return res.status(400).json({ message: "No ElevenLabs voice available. Please specify a voiceId." });
      }

      // Fetch the real ebook text content via the existing ebook content proxy
      const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
      let fullText = "";
      let isSampleContent = false;
      try {
        const contentRes = await fetch(`${baseUrl}/api/ebook/${bookId}/content`);
        if (contentRes.ok) {
          const contentType = contentRes.headers.get("content-type") || "";
          // Check if the content endpoint served synthetic sample/placeholder text
          isSampleContent = contentRes.headers.get("X-Content-Source") === "sample";
          if (contentType.includes("text/plain") || contentType.includes("text/html")) {
            fullText = await contentRes.text();
          }
        }
      } catch (fetchErr) {
        console.warn("[Audiobook] Could not fetch ebook content:", fetchErr);
      }

      if (!fullText || fullText.trim().length < 50) {
        return res.status(422).json({
          message: "Could not retrieve ebook text content for narration. The book may be in PDF or EPUB format, which cannot be narrated automatically.",
        });
      }

      // Reject sample/placeholder text — narration must be from real ebook content
      if (isSampleContent) {
        return res.status(422).json({
          message: "This book does not have accessible plain-text content for narration. Only books with a direct text source URL can be narrated.",
        });
      }

      // Chunk text at ElevenLabs' safe limit (~2500 chars per request)
      const CHUNK_SIZE = 2500;
      const chunks: string[] = [];
      let remaining = fullText.trim();
      while (remaining.length > 0) {
        if (remaining.length <= CHUNK_SIZE) {
          chunks.push(remaining);
          break;
        }
        // Try to split at a sentence boundary
        let splitAt = remaining.lastIndexOf(". ", CHUNK_SIZE);
        if (splitAt === -1 || splitAt < CHUNK_SIZE / 2) splitAt = CHUNK_SIZE;
        else splitAt += 1; // include the period
        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
      }

      // Synthesize each chunk
      console.log(`[Audiobook] Generating narration for "${book.title}" (${chunks.length} chunks, voice: ${selectedVoiceId})`);
      const audioBuffers: Buffer[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        console.log(`[Audiobook] Synthesizing chunk ${i + 1}/${chunks.length}`);
        const buf = await elTTS(chunk, selectedVoiceId);
        audioBuffers.push(buf);
      }

      // Concatenate all MP3 buffers
      const combinedAudio = Buffer.concat(audioBuffers);

      // Upload to object storage
      const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
      const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(p => p.trim()).filter(Boolean);
      if (!publicSearchPaths.length) {
        return res.status(503).json({ message: "Object storage not configured" });
      }

      const publicPath = publicSearchPaths[0];
      // publicPath format: /<bucket>/<dir>
      const pathParts = publicPath.slice(1).split("/");
      const bucketName = pathParts[0];
      const objectName = `${pathParts.slice(1).join("/")}/${bookId}-narration.mp3`;

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(combinedAudio, { contentType: "audio/mpeg", resumable: false });

      // Build a URL that streams the narration from object storage
      const narrationUrl = `/api/audiobook/stream/${bookId}`;

      // Persist the narration URL into the book's audioUrl so it's available
      // across the entire app (standard audio player, book detail page, etc.)
      try {
        await db.update(books)
          .set({ audioUrl: narrationUrl })
          .where(eq(books.id, bookId));
        console.log(`[Audiobook] Updated book ${bookId} audioUrl to ${narrationUrl}`);
      } catch (dbErr) {
        // Non-fatal — narration is still accessible via stream endpoint
        console.error("[Audiobook] Failed to update book audioUrl:", dbErr);
      }

      res.json({
        success: true,
        narrationUrl,
        voiceId: selectedVoiceId,
        chunks: chunks.length,
        durationEstimate: Math.round(combinedAudio.length / 16000),
      });
    } catch (error: any) {
      console.error("[Audiobook] Generation error:", error);
      res.status(500).json({ message: error.message || "Failed to generate narration" });
    }
  });

  // GET /api/audiobook/stream/:bookId - Stream the generated narration
  app.get("/api/audiobook/stream/:bookId", isAuthenticated, async (req, res) => {
    try {
      const { bookId } = req.params;
      const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map(p => p.trim()).filter(Boolean);
      if (!publicSearchPaths.length) {
        return res.status(503).json({ message: "Object storage not configured" });
      }

      const publicPath = publicSearchPaths[0];
      const pathParts = publicPath.slice(1).split("/");
      const bucketName = pathParts[0];
      const objectName = `${pathParts.slice(1).join("/")}/${bookId}-narration.mp3`;

      const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ message: "Narration not found" });
      }

      const [metadata] = await file.getMetadata();
      const totalSize = Number(metadata.size || 0);
      const rangeHeader = req.headers.range;

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=86400");

      if (rangeHeader && totalSize > 0) {
        // Parse Range: bytes=start-end
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunkSize = end - start + 1;

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
        res.setHeader("Content-Length", String(chunkSize));
        file.createReadStream({ start, end }).pipe(res);
      } else {
        if (totalSize > 0) res.setHeader("Content-Length", String(totalSize));
        file.createReadStream().pipe(res);
      }
    } catch (error) {
      console.error("[Audiobook] Stream error:", error);
      res.status(500).json({ message: "Failed to stream narration" });
    }
  });

  // Helper function to generate sample ebook content
  function generateSampleEbookContent(book: any): string {
    const intro = `${book.title}\nby ${book.author}\n\n`;
    const lorem = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n`;
    
    let content = intro;
    for (let i = 0; i < 30; i++) {
      content += `Chapter ${i + 1}\n\n` + lorem.repeat(3);
    }
    return content;
  }

  // Spotify connection status
  app.get("/api/spotify/status", async (req, res) => {
    try {
      const connected = await isSpotifyConnected();
      res.json({ connected });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  // Search Spotify audiobooks
  app.get("/api/spotify/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== "string") {
        return res.status(400).json({ message: "Search query is required" });
      }

      const spotify = await getUncachableSpotifyClient();
      const results = await spotify.search(q, ["audiobook"], undefined, 20);
      
      const audiobooks = results.audiobooks?.items.map(item => ({
        id: `spotify-${item.id}`,
        title: item.name,
        author: item.authors?.[0]?.name || "Unknown Author",
        narrator: item.narrators?.[0]?.name || null,
        description: item.description || null,
        duration: item.total_chapters ? item.total_chapters * 1800 : 3600, // Estimate
        coverImage: item.images?.[0]?.url || null,
        audioUrl: item.external_urls?.spotify || "",
        genre: null,
        publishedYear: null,
        source: "spotify",
        sourceId: item.id,
        totalTime: null,
        language: item.languages?.[0] || "en",
      })) || [];

      res.json(audiobooks);
    } catch (error) {
      console.error("Spotify search error:", error);
      res.status(500).json({ message: "Failed to search Spotify audiobooks" });
    }
  });

  // Get Spotify audiobook details
  app.get("/api/spotify/audiobook/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const spotify = await getUncachableSpotifyClient();
      const audiobook = await spotify.audiobooks.get(id);
      
      res.json({
        id: `spotify-${audiobook.id}`,
        title: audiobook.name,
        author: audiobook.authors?.[0]?.name || "Unknown Author",
        narrator: audiobook.narrators?.[0]?.name || null,
        description: audiobook.description || null,
        duration: audiobook.total_chapters ? audiobook.total_chapters * 1800 : 3600,
        coverImage: audiobook.images?.[0]?.url || null,
        audioUrl: audiobook.external_urls?.spotify || "",
        genre: null,
        publishedYear: null,
        source: "spotify",
        sourceId: audiobook.id,
        chapters: audiobook.chapters?.items?.map(ch => ({
          id: ch.id,
          name: ch.name,
          duration_ms: ch.duration_ms,
        })) || [],
      });
    } catch (error) {
      console.error("Spotify audiobook error:", error);
      res.status(500).json({ message: "Failed to fetch Spotify audiobook" });
    }
  });

  // Get user's Spotify library audiobooks
  app.get("/api/spotify/library", async (req, res) => {
    try {
      const spotify = await getUncachableSpotifyClient();
      const savedAudiobooks = await spotify.currentUser.audiobooks.savedAudiobooks(20);
      
      const audiobooks = savedAudiobooks.items.map(item => ({
        id: `spotify-${item.id}`,
        title: item.name,
        author: item.authors?.[0]?.name || "Unknown Author",
        narrator: item.narrators?.[0]?.name || null,
        description: item.description || null,
        duration: item.total_chapters ? item.total_chapters * 1800 : 3600,
        coverImage: item.images?.[0]?.url || null,
        audioUrl: item.external_urls?.spotify || "",
        genre: null,
        publishedYear: null,
        source: "spotify",
        sourceId: item.id,
      }));

      res.json(audiobooks);
    } catch (error) {
      console.error("Spotify library error:", error);
      res.status(500).json({ message: "Failed to fetch Spotify library" });
    }
  });

  // Stripe subscription routes
  
  // GET /api/subscription/status - Get current subscription status
  app.get("/api/subscription/status", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const tier = (user.subscriptionTier || "free") as SubscriptionTier;
      const features = TIER_FEATURES[tier] || TIER_FEATURES.free;
      
      res.json({
        subscriptionTier: tier,
        subscriptionEndDate: user.subscriptionEndDate,
        stripeSubscriptionId: user.stripeSubscriptionId,
        isPremium: tier === "premium",
        isPlus: tier === "plus",
        isPaid: tier === "plus" || tier === "premium",
        features,
        pricing: TIER_PRICING,
        discountRate: TIER_DISCOUNTS[tier] || 0,
      });
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ message: "Failed to fetch subscription status" });
    }
  });

  // GET /api/subscription/pricing - Get pricing info (no auth required)
  app.get("/api/subscription/pricing", (_req: any, res) => {
    res.json({
      tiers: TIER_PRICING,
      titlePricing: TITLE_PRICING,
      discounts: TIER_DISCOUNTS,
      features: TIER_FEATURES,
    });
  });
  
  // POST /api/subscription/create-checkout - Create Stripe checkout session for Plus or Premium
  app.post("/api/subscription/create-checkout", async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Payment system not configured" });
      }
      
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const plan = (req.query.plan as string) || "monthly";
      const tier = (req.query.tier as string) || "premium";
      const validTiers = ["plus", "premium"];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({ message: "Invalid tier. Choose 'plus' or 'premium'" });
      }
      
      const config = SUBSCRIPTION_CONFIGS[tier];
      const isAnnual = plan === "annual";
      const amount = isAnnual
        ? (tier === "plus" ? PLUS_PRICE_YEARLY : PREMIUM_PRICE_YEARLY)
        : (tier === "plus" ? PLUS_PRICE_MONTHLY : PREMIUM_PRICE_MONTHLY);
      const interval: "month" | "year" = isAnnual ? "year" : "month";

      const descriptions: Record<string, string> = {
        plus: "Ad-free listening, unlimited skips, 192kbps audio, 3 devices",
        premium: "Ad-free listening, 320kbps audio, offline downloads, 5 devices, unlimited TTS",
      };
      
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserSubscription(userId, { stripeCustomerId: customerId });
      }
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: config.productName,
                description: descriptions[tier] || "",
              },
              unit_amount: amount,
              recurring: { interval },
            },
            quantity: 1,
          },
        ],
        success_url: `${req.headers.origin || "http://localhost:5000"}?subscription=success&tier=${tier}`,
        cancel_url: `${req.headers.origin || "http://localhost:5000"}?subscription=cancelled`,
        metadata: {
          userId: user.id,
          tier,
          plan,
        },
      });
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // POST /api/purchase/checkout - Create Stripe checkout for individual title purchase
  app.post("/api/purchase/checkout", async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Payment system not configured" });
      }
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { bookId, bookTitle, contentType } = req.body;
      if (!bookId || !bookTitle) {
        return res.status(400).json({ message: "bookId and bookTitle are required" });
      }

      const existing = await storage.getUserPurchase(userId, bookId);
      if (existing) {
        return res.status(400).json({ message: "You already own this title" });
      }

      const pricing = TITLE_PRICING[contentType as keyof typeof TITLE_PRICING] || TITLE_PRICING.default;
      const tier = (user.subscriptionTier || "free") as SubscriptionTier;
      const discount = TIER_DISCOUNTS[tier] || 0;
      const finalAmount = Math.round(pricing.base * (1 - discount));

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserSubscription(userId, { stripeCustomerId: customerId });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: bookTitle,
                description: `Individual ${contentType || "title"} purchase — ad-free, high quality`,
              },
              unit_amount: finalAmount,
            },
            quantity: 1,
          },
        ],
        success_url: `${req.headers.origin || "http://localhost:5000"}?purchase=success&bookId=${bookId}`,
        cancel_url: `${req.headers.origin || "http://localhost:5000"}?purchase=cancelled`,
        metadata: {
          userId: user.id,
          bookId,
          bookTitle,
          type: "purchase",
          amountCents: finalAmount.toString(),
        },
      });

      res.json({ url: session.url, finalAmount, discount: discount > 0 ? `${Math.round(discount * 100)}% off` : null });
    } catch (error) {
      console.error("Error creating purchase checkout:", error);
      res.status(500).json({ message: "Failed to create purchase checkout" });
    }
  });

  // GET /api/purchases - Get user's purchased titles
  app.get("/api/purchases", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const userPurchases = await storage.getUserPurchases(userId);
      res.json({ purchases: userPurchases });
    } catch (error) {
      console.error("Error fetching purchases:", error);
      res.status(500).json({ message: "Failed to fetch purchases" });
    }
  });

  // GET /api/purchases/:bookId - Check if user owns a specific title
  app.get("/api/purchases/:bookId", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const purchase = await storage.getUserPurchase(userId, req.params.bookId);
      res.json({ owned: !!purchase, purchase: purchase || null });
    } catch (error) {
      res.status(500).json({ message: "Failed to check purchase status" });
    }
  });
  
  // POST /api/subscription/cancel - Cancel subscription
  app.post("/api/subscription/cancel", async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Payment system not configured" });
      }
      
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user || !user.stripeSubscriptionId) {
        return res.status(400).json({ message: "No active subscription found" });
      }
      
      // Cancel at period end (don't cancel immediately)
      const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      
      // Update the database with cancellation info
      const cancelAt = subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null;
      await storage.updateUserSubscription(userId, {
        subscriptionEndDate: cancelAt,
      });
      
      res.json({
        message: "Subscription will be cancelled at period end",
        cancelAt: subscription.cancel_at,
      });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // POST /api/donation/create-checkout - Create donation checkout session
  app.post("/api/donation/create-checkout", async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ message: "Payment system not configured" });
      }
      
      const { amount } = req.body;
      const amountInCents = parseInt(amount);
      
      if (!amountInCents || amountInCents < 100) {
        return res.status(400).json({ message: "Minimum donation is $1" });
      }
      
      if (amountInCents > 100000) {
        return res.status(400).json({ message: "Maximum donation is $1,000" });
      }
      
      let customerId: string | undefined;
      
      if (req.isAuthenticated() && req.user) {
        const userId = req.user.claims?.sub || req.user.id;
        const user = await storage.getUser(userId);
        
        if (user?.stripeCustomerId) {
          customerId = user.stripeCustomerId;
        } else if (user) {
          const customer = await stripe.customers.create({
            email: user.email || undefined,
            metadata: { userId: user.id },
          });
          customerId = customer.id;
          await storage.updateUserSubscription(userId, { stripeCustomerId: customerId });
        }
      }
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: DONATION_CONFIG.productName,
                description: DONATION_CONFIG.description,
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${req.headers.origin || "http://localhost:5000"}?donation=success`,
        cancel_url: `${req.headers.origin || "http://localhost:5000"}?donation=cancelled`,
        metadata: {
          type: "donation",
          userId: req.user?.claims?.sub || req.user?.id || "anonymous",
        },
      });
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating donation checkout:", error);
      res.status(500).json({ message: "Failed to create donation checkout" });
    }
  });

  // GET /api/donation/amounts - Get suggested donation amounts
  app.get("/api/donation/amounts", (req, res) => {
    res.json({
      amounts: DONATION_AMOUNTS,
      currency: "usd",
      minimum: 100,
      maximum: 100000,
    });
  });

  // POST /api/webhooks/stripe - Stripe webhook handler
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.warn("STRIPE_WEBHOOK_SECRET not configured - webhook verification disabled");
        return res.status(400).json({ message: "Webhook secret not configured" });
      }
      
      const signature = req.headers["stripe-signature"] as string;
      
      if (!signature) {
        return res.status(400).json({ message: "Missing stripe-signature header" });
      }
      
      const event = verifyWebhookSignature(req.body, signature, webhookSecret);
      
      if (!event) {
        return res.status(400).json({ message: "Invalid webhook signature" });
      }
      
      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as any;
            const userId = session.metadata?.userId;

            // Handle AdBid wallet top-up
            if (session.mode === "payment" && session.metadata?.type === "ad_wallet_topup" && userId) {
              const amountCents = parseInt(session.metadata?.amountCents || "0");
              if (amountCents > 0) {
                try {
                  // Idempotency guard: check if this Stripe session ID was already processed
                  const [alreadyProcessed] = await db
                    .select({ id: paymentTransactions.id })
                    .from(paymentTransactions)
                    .where(eq(paymentTransactions.providerTransactionId, session.id))
                    .limit(1);
                  if (alreadyProcessed) {
                    console.log(`[AdWallet] Skipping duplicate webhook for session ${session.id}`);
                    break;
                  }
                  // Record transaction first (idempotency anchor)
                  await db.insert(paymentTransactions).values({
                    userId,
                    provider: "stripe",
                    providerTransactionId: session.id,
                    type: "ad_wallet_topup",
                    status: "completed",
                    amountCents,
                    currency: "USD",
                    description: `Ad wallet top-up via Stripe`,
                  });
                  // Now credit the wallet
                  await db
                    .insert(advertiserWallets)
                    .values({ advertiserId: userId, balanceCents: 0, totalTopupCents: 0 })
                    .onConflictDoNothing();
                  await db
                    .update(advertiserWallets)
                    .set({
                      balanceCents: sql`${advertiserWallets.balanceCents} + ${amountCents}`,
                      totalTopupCents: sql`${advertiserWallets.totalTopupCents} + ${amountCents}`,
                      updatedAt: new Date(),
                    })
                    .where(eq(advertiserWallets.advertiserId, userId));
                  console.log(`[AdWallet] Credited $${(amountCents / 100).toFixed(2)} to advertiser ${userId} (session ${session.id})`);
                  // Auto-resume: re-activate campaigns that were auto-paused due to empty wallet
                  const resumed = await db
                    .update(adCampaigns)
                    .set({ status: "active", updatedAt: new Date() })
                    .where(and(eq(adCampaigns.advertiserId, userId), eq(adCampaigns.status, "paused")))
                    .returning({ id: adCampaigns.id });
                  if (resumed.length > 0) {
                    console.log(`[AdWallet] Auto-resumed ${resumed.length} campaign(s) for advertiser ${userId}`);
                  }
                } catch (e) {
                  console.error("[AdWallet] Failed to credit wallet:", e);
                }
              }
              break;
            }

            // Handle Easy English add-on checkout completion
            if (session.mode === "subscription" && session.metadata?.type === "easy_english_addon" && userId) {
              try {
                const sub = await stripe.subscriptions.retrieve(session.subscription as string);
                const itemId = (sub as any).items?.data?.[0]?.id || null;
                await db.update(users)
                  .set({ stripeEasyEnglishSubscriptionItemId: itemId })
                  .where(eq(users.id, userId));
                console.log(`[EasyEnglish] Activated add-on for user ${userId}, item ${itemId}`);
              } catch (e) {
                console.warn("[EasyEnglish] Could not retrieve subscription after checkout:", e);
              }
              break;
            }
            
            if (session.mode === "subscription" && userId) {
              await storage.updateUserSubscription(userId, {
                subscriptionTier: "premium",
                stripeSubscriptionId: session.subscription,
                stripeCustomerId: session.customer,
              });
              await recordTransaction({
                userId,
                provider: "stripe",
                providerTransactionId: session.id,
                type: "subscription",
                status: "completed",
                amountCents: session.amount_total || PREMIUM_PRICE_MONTHLY,
                description: "AccessiBooks Premium subscription",
                receiptUrl: session.receipt_url || null,
              });
              console.log(`User ${userId} upgraded to premium via checkout`);
            } else if (session.metadata?.type === "donation") {
              if (userId) {
                await recordTransaction({
                  userId,
                  provider: "stripe",
                  providerTransactionId: session.id,
                  type: "donation",
                  status: "completed",
                  amountCents: session.amount_total || 0,
                  description: "Donation to AccessiBooks",
                });
              }
              console.log(`Donation received: $${(session.amount_total / 100).toFixed(2)} from ${userId || "anonymous"}`);
            }
            break;
          }
          
          case "customer.subscription.updated": {
            const subscription = event.data.object as any;
            const customerId = subscription.customer;

            // Handle Easy English add-on subscription updates
            if (subscription.metadata?.type === "easy_english_addon") {
              const eeUser = await storage.getUserByStripeCustomerId(customerId);
              if (eeUser) {
                const isActive = subscription.status === "active" || subscription.status === "trialing";
                const itemId = subscription.items?.data?.[0]?.id || null;
                await db.update(users)
                  .set({ stripeEasyEnglishSubscriptionItemId: isActive ? itemId : null })
                  .where(eq(users.id, eeUser.id));
                console.log(`[EasyEnglish] Subscription updated for user ${eeUser.id}: ${subscription.status}`);
              }
              break;
            }
            
            const user = await storage.getUserByStripeCustomerId(customerId);
            if (user) {
              const status = subscription.status;
              const isPremium = status === "active" || status === "trialing";
              
              await storage.updateUserSubscription(user.id, {
                subscriptionTier: isPremium ? "premium" : "free",
                subscriptionEndDate: subscription.current_period_end 
                  ? new Date(subscription.current_period_end * 1000) 
                  : null,
              });
              console.log(`Subscription updated for user ${user.id}: ${status}`);
            }
            break;
          }
          
          case "customer.subscription.deleted": {
            const subscription = event.data.object as any;
            const customerId = subscription.customer;

            // Handle Easy English add-on subscription deletion
            if (subscription.metadata?.type === "easy_english_addon") {
              const eeUser = await storage.getUserByStripeCustomerId(customerId);
              if (eeUser) {
                await db.update(users)
                  .set({ stripeEasyEnglishSubscriptionItemId: null })
                  .where(eq(users.id, eeUser.id));
                console.log(`[EasyEnglish] Subscription deleted for user ${eeUser.id}`);
              }
              break;
            }
            
            const user = await storage.getUserByStripeCustomerId(customerId);
            if (user) {
              await storage.updateUserSubscription(user.id, {
                subscriptionTier: "free",
                stripeSubscriptionId: null,
                subscriptionEndDate: null,
              });
              await recordTransaction({
                userId: user.id,
                provider: "stripe",
                providerTransactionId: subscription.id,
                type: "subscription_cancelled",
                status: "completed",
                amountCents: 0,
                description: "Premium subscription cancelled",
              });
              console.log(`Subscription cancelled for user ${user.id}`);
            }
            break;
          }
          
          case "invoice.payment_succeeded": {
            const invoice = event.data.object as any;
            const invoiceCustomerId = invoice.customer;
            const invoiceUser = await storage.getUserByStripeCustomerId(invoiceCustomerId);
            if (invoiceUser) {
              await recordTransaction({
                userId: invoiceUser.id,
                provider: "stripe",
                providerTransactionId: invoice.id,
                type: "subscription_renewal",
                status: "completed",
                amountCents: invoice.amount_paid || 0,
                description: "Subscription renewal payment",
                receiptUrl: invoice.hosted_invoice_url || null,
              });
            }
            console.log(`Payment succeeded for invoice ${invoice.id}`);
            break;
          }
          
          case "invoice.payment_failed": {
            const invoice = event.data.object as any;
            const customerId = invoice.customer;
            
            const user = await storage.getUserByStripeCustomerId(customerId);
            if (user) {
              await recordTransaction({
                userId: user.id,
                provider: "stripe",
                providerTransactionId: invoice.id,
                type: "subscription_renewal",
                status: "failed",
                amountCents: invoice.amount_due || 0,
                description: "Payment failed for subscription renewal",
              });
              console.warn(`Payment failed for user ${user.id}, invoice ${invoice.id}`);
            }
            break;
          }
          
          default:
            console.log(`Unhandled webhook event: ${event.type}`);
        }
        
        res.json({ received: true });
      } catch (error) {
        console.error("Webhook processing error:", error);
        res.status(500).json({ message: "Webhook processing failed" });
      }
    }
  );
  
  // ============== LISTENING HISTORY API ==============
  
  // GET /api/history - Get user's listening history
  app.get("/api/history", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user.claims?.sub || req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await storage.getListeningHistory(userId, limit);
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching listening history:", error);
      res.status(500).json({ message: "Failed to fetch listening history" });
    }
  });
  
  // GET /api/history/continue - Get continue listening items
  app.get("/api/history/continue", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user.claims?.sub || req.user.id;
      const limit = parseInt(req.query.limit as string) || 10;
      const continueListening = await storage.getContinueListening(userId, limit);
      
      res.json(continueListening);
    } catch (error) {
      console.error("Error fetching continue listening:", error);
      res.status(500).json({ message: "Failed to fetch continue listening" });
    }
  });
  
  // POST /api/history/progress - Update listening progress
  app.post("/api/history/progress", async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userId = req.user.claims?.sub || req.user.id;
      const { bookId, currentTime, bookTitle, bookAuthor, bookCover, totalDuration } = req.body;
      
      if (!bookId || currentTime === undefined || !bookTitle) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const history = await storage.updateListeningProgress(userId, bookId, {
        currentTime,
        bookTitle,
        bookAuthor,
        bookCover,
        totalDuration,
      });
      
      res.json(history);
    } catch (error) {
      console.error("Error updating listening progress:", error);
      res.status(500).json({ message: "Failed to update progress" });
    }
  });
  
  // POST /api/webhook/stripe - Stripe webhook handler
  app.post("/api/webhook/stripe", async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ message: "Payment system not configured" });
    }
    
    const sig = req.headers["stripe-signature"] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
      // In production, always require signature verification
      if (endpointSecret && sig) {
        // req.body is raw Buffer when using express.raw() middleware
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } else if (process.env.NODE_ENV === "development") {
        // Only allow unverified webhooks in development (for testing)
        console.warn("WARNING: Processing unverified Stripe webhook (dev mode only)");
        event = JSON.parse(req.body.toString());
      } else {
        console.error("Webhook secret not configured - rejecting request");
        return res.status(400).json({ message: "Webhook secret not configured" });
      }
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const userId = session.metadata?.userId;
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        // Handle Easy English add-on checkout completion
        if (session.mode === "subscription" && session.metadata?.type === "easy_english_addon" && userId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId as string);
            const itemId = (sub as any).items?.data?.[0]?.id || null;
            await db.update(users)
              .set({ stripeEasyEnglishSubscriptionItemId: itemId })
              .where(eq(users.id, userId));
            console.log(`[EasyEnglish] Activated add-on for user ${userId}, item ${itemId}`);
          } catch (e) {
            console.warn("[EasyEnglish] Could not retrieve subscription after checkout:", e);
          }
          break;
        }
        
        if (userId && subscriptionId) {
          let subscriptionEndDate: Date | null = null;
          try {
            const subResponse = await stripe.subscriptions.retrieve(subscriptionId as string);
            const sub = subResponse as any;
            if (sub.current_period_end) {
              subscriptionEndDate = new Date(sub.current_period_end * 1000);
            }
            await stripe.subscriptions.update(subscriptionId as string, {
              metadata: { userId },
            });
          } catch (e) {
            console.warn("Could not fetch subscription details:", e);
          }
          
          await storage.updateUserSubscription(userId, {
            stripeCustomerId: customerId as string,
            stripeSubscriptionId: subscriptionId as string,
            subscriptionTier: "premium",
            subscriptionEndDate,
          });
          await recordTransaction({
            userId,
            provider: "stripe",
            providerTransactionId: session.id,
            type: "subscription",
            status: "completed",
            amountCents: session.amount_total || PREMIUM_PRICE_MONTHLY,
            description: "AccessiBooks Premium subscription",
          });
          console.log(`User ${userId} upgraded to premium with customer ${customerId}`);
        }
        break;
      }
      
      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;

        // Handle Easy English add-on subscription deletion
        if (subscription.metadata?.type === "easy_english_addon") {
          const eeUser = subscription.customer
            ? await storage.getUserByStripeCustomerId(subscription.customer)
            : null;
          if (eeUser) {
            await db.update(users)
              .set({ stripeEasyEnglishSubscriptionItemId: null })
              .where(eq(users.id, eeUser.id));
            console.log(`[EasyEnglish] Subscription deleted for user ${eeUser.id}`);
          }
          break;
        }

        let userId = subscription.metadata?.userId;
        
        if (!userId && subscription.customer) {
          const user = await storage.getUserByStripeCustomerId(subscription.customer);
          if (user) {
            userId = user.id;
          }
        }
        
        if (userId) {
          await storage.updateUserSubscription(userId, {
            subscriptionTier: "free",
            stripeSubscriptionId: null,
            subscriptionEndDate: null,
          });
          await recordTransaction({
            userId,
            provider: "stripe",
            providerTransactionId: subscription.id,
            type: "subscription_cancelled",
            status: "completed",
            amountCents: 0,
            description: "Premium subscription cancelled",
          });
          console.log(`User ${userId} subscription deleted - downgraded to free`);
        } else {
          console.log(`Subscription ${subscription.id} deleted but no userId found`);
        }
        break;
      }
      
      case "customer.subscription.updated": {
        const subUpdated = event.data.object as any;

        // Handle Easy English add-on subscription updates
        if (subUpdated.metadata?.type === "easy_english_addon") {
          const eeUser = subUpdated.customer
            ? await storage.getUserByStripeCustomerId(subUpdated.customer)
            : null;
          if (eeUser) {
            const isActive = subUpdated.status === "active" || subUpdated.status === "trialing";
            const itemId = subUpdated.items?.data?.[0]?.id || null;
            await db.update(users)
              .set({ stripeEasyEnglishSubscriptionItemId: isActive ? itemId : null })
              .where(eq(users.id, eeUser.id));
            console.log(`[EasyEnglish] Subscription updated for user ${eeUser.id}: ${subUpdated.status}`);
          }
          break;
        }

        let userId = subUpdated.metadata?.userId;
        
        // Fallback: lookup user by Stripe customer ID if userId not in metadata
        if (!userId && subUpdated.customer) {
          const user = await storage.getUserByStripeCustomerId(subUpdated.customer);
          if (user) {
            userId = user.id;
          }
        }
        
        if (userId) {
          if (subUpdated.status === "canceled" || subUpdated.status === "unpaid") {
            await storage.updateUserSubscription(userId, {
              subscriptionTier: "free",
              stripeSubscriptionId: null,
              subscriptionEndDate: null,
            });
            console.log(`User ${userId} downgraded to free (status: ${subUpdated.status})`);
          } else if (subUpdated.status === "active" && subUpdated.cancel_at_period_end) {
            // Subscription is active but will cancel at period end
            const endDate = subUpdated.current_period_end 
              ? new Date(subUpdated.current_period_end * 1000) 
              : null;
            await storage.updateUserSubscription(userId, {
              subscriptionEndDate: endDate,
            });
            console.log(`User ${userId} subscription will cancel at period end`);
          }
        }
        break;
      }
      
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription;
        const customerId = invoice.customer;
        
        if (subscriptionId) {
          try {
            const subResponse = await stripe.subscriptions.retrieve(subscriptionId as string);
            const subData = subResponse as any;
            let userId = subData.metadata?.userId;
            
            // Fallback: lookup user by Stripe customer ID if userId not in metadata
            if (!userId && customerId) {
              const user = await storage.getUserByStripeCustomerId(customerId);
              if (user) {
                userId = user.id;
              }
            }
            
            if (userId) {
              const endDate = subData.current_period_end 
                ? new Date(subData.current_period_end * 1000) 
                : null;
              await storage.updateUserSubscription(userId, {
                subscriptionTier: "premium",
                subscriptionEndDate: endDate,
              });
              await recordTransaction({
                userId,
                provider: "stripe",
                providerTransactionId: invoice.id,
                type: "subscription_renewal",
                status: "completed",
                amountCents: invoice.amount_paid || 0,
                description: "Subscription renewal payment",
                receiptUrl: invoice.hosted_invoice_url || null,
              });
              console.log(`User ${userId} subscription renewed`);
            }
          } catch (e) {
            console.warn("Could not process invoice payment:", e);
          }
        }
        break;
      }
      
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    res.json({ received: true });
  });

  // ============================================
  // PayPal Payment Routes
  // ============================================
  
  // GET /paypal/setup - Get PayPal client token
  app.get("/paypal/setup", async (req, res) => {
    await loadPaypalDefault(req, res);
  });

  // POST /paypal/order - Create PayPal order
  app.post("/paypal/order", async (req, res) => {
    await createPaypalOrder(req, res);
  });

  // POST /paypal/order/:orderID/capture - Capture PayPal order
  app.post("/paypal/order/:orderID/capture", async (req: any, res) => {
    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      if (res.statusCode >= 200 && res.statusCode < 300 && data?.status === "COMPLETED") {
        const userId = req.user?.claims?.sub || req.user?.id;
        if (userId) {
          const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
          const amountStr = capture?.amount?.value || data.purchase_units?.[0]?.amount?.value || "0";
          const currency = capture?.amount?.currency_code || data.purchase_units?.[0]?.amount?.currency_code || "USD";
          recordTransaction({
            userId,
            provider: "paypal",
            providerTransactionId: data.id,
            type: "donation",
            status: "completed",
            amountCents: Math.round(parseFloat(amountStr) * 100),
            currency,
            description: "PayPal payment",
          }).catch(err => console.error("[Billing] PayPal tx record failed:", err));
        }
      }
      return originalJson(data);
    };
    await capturePaypalOrder(req, res);
  });

  // ============================================
  // Coinbase Commerce (Cryptocurrency) Routes
  // ============================================
  
  // POST /api/crypto/charge - Create cryptocurrency payment charge
  app.post("/api/crypto/charge", async (req, res) => {
    await createCoinbaseCharge(req, res);
  });

  // GET /api/crypto/charge/:chargeId - Get charge status
  app.get("/api/crypto/charge/:chargeId", async (req, res) => {
    await getCoinbaseCharge(req, res);
  });

  // POST /api/crypto/webhook - Coinbase Commerce webhook
  // Note: This route needs raw body for signature verification
  // The body is already available as req.body since express.json() runs globally
  // For production, consider adding express.raw() middleware specifically for this route
  app.post("/api/crypto/webhook", express.text({ type: "application/json" }), async (req: any, res) => {
    if (typeof req.body === "string") {
      try {
        req.rawBody = req.body;
        req.body = JSON.parse(req.body);
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    const event = req.body;
    if (event?.type === "charge:confirmed" || event?.type === "charge:failed") {
      const metadata = event.data?.metadata || {};
      const userId = metadata.userId;
      if (userId) {
        const localPrice = event.data?.pricing?.local;
        const amountCents = localPrice ? Math.round(parseFloat(localPrice.amount) * 100) : 0;
        const currency = localPrice?.currency || "USD";
        recordTransaction({
          userId,
          provider: "coinbase",
          providerTransactionId: event.data?.id || event.data?.code,
          type: metadata.type || "donation",
          status: event.type === "charge:confirmed" ? "completed" : "failed",
          amountCents,
          currency,
          description: `Cryptocurrency ${metadata.type || "payment"}`,
        }).catch(err => console.error("[Billing] Coinbase tx record failed:", err));
      }
    }

    await handleCoinbaseWebhook(req, res);
  });

  // ============================================
  // Payment Methods Discovery
  // ============================================
  
  // GET /api/payment-methods - Get available payment methods
  app.get("/api/payment-methods", async (req, res) => {
    await getPaymentMethods(req, res);
  });

  // ============================================
  // Amazon Affiliate / Audible Integration
  // ============================================

  app.get("/api/amazon/status", async (req, res) => {
    res.json({ enabled: isAmazonEnabled() });
  });

  app.get("/api/amazon/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      const limit = parseInt(req.query.limit as string) || 10;
      if (!q) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }
      const results = await searchAmazonAudiobooks(q, limit);
      res.json({ results });
    } catch (error) {
      console.error("Amazon search error:", error);
      res.status(500).json({ message: "Failed to search Amazon audiobooks" });
    }
  });

  app.get("/api/amazon/audiobook/:asin", async (req, res) => {
    try {
      const { asin } = req.params;
      const audiobook = await getAmazonAudiobook(asin);
      if (!audiobook) {
        return res.status(404).json({ message: "Audiobook not found" });
      }
      res.json(audiobook);
    } catch (error) {
      console.error("Amazon audiobook error:", error);
      res.status(500).json({ message: "Failed to fetch Amazon audiobook" });
    }
  });

  // ============================================
  // SoundCloud Integration
  // ============================================

  app.get("/api/soundcloud/status", async (req, res) => {
    res.json({ enabled: isSoundCloudEnabled() });
  });

  app.get("/api/soundcloud/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      const limit = parseInt(req.query.limit as string) || 20;
      const genre = req.query.genre as string | undefined;
      if (!q) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }
      const results = await searchSoundCloudTracks(q, limit, genre);
      res.json({ results });
    } catch (error) {
      console.error("SoundCloud search error:", error);
      res.status(500).json({ message: "Failed to search SoundCloud" });
    }
  });

  app.get("/api/soundcloud/track/:id", async (req, res) => {
    try {
      const trackId = parseInt(req.params.id);
      if (isNaN(trackId)) {
        return res.status(400).json({ message: "Invalid track ID" });
      }
      const track = await getSoundCloudTrack(trackId);
      if (!track) {
        return res.status(404).json({ message: "Track not found" });
      }
      res.json(track);
    } catch (error) {
      console.error("SoundCloud track error:", error);
      res.status(500).json({ message: "Failed to fetch SoundCloud track" });
    }
  });

  app.get("/api/soundcloud/track/:id/stream", async (req, res) => {
    try {
      const trackId = parseInt(req.params.id);
      if (isNaN(trackId)) {
        return res.status(400).json({ message: "Invalid track ID" });
      }
      const streamUrl = await getSoundCloudStreamUrl(trackId);
      if (!streamUrl) {
        return res.status(404).json({ message: "Stream not available" });
      }
      const format = req.query.format;
      if (format === "redirect") {
        return res.redirect(streamUrl);
      }
      res.json({ streamUrl });
    } catch (error) {
      console.error("SoundCloud stream error:", error);
      res.status(500).json({ message: "Failed to get stream URL" });
    }
  });

  app.get("/api/soundcloud/track/:id/related", async (req, res) => {
    try {
      const trackId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 10;
      if (isNaN(trackId)) {
        return res.status(400).json({ message: "Invalid track ID" });
      }
      const tracks = await getSoundCloudRelated(trackId, limit);
      res.json({ results: tracks });
    } catch (error) {
      console.error("SoundCloud related error:", error);
      res.status(500).json({ message: "Failed to fetch related tracks" });
    }
  });

  app.get("/api/soundcloud/user/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      const user = await getSoundCloudUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("SoundCloud user error:", error);
      res.status(500).json({ message: "Failed to fetch SoundCloud user" });
    }
  });

  app.get("/api/soundcloud/user/:id/tracks", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 20;
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      const tracks = await getSoundCloudUserTracks(userId, limit);
      res.json({ results: tracks });
    } catch (error) {
      console.error("SoundCloud user tracks error:", error);
      res.status(500).json({ message: "Failed to fetch user tracks" });
    }
  });

  app.get("/api/soundcloud/genres", async (req, res) => {
    res.json({ genres: SOUNDCLOUD_GENRES });
  });

  app.get("/api/soundcloud/genres/:genre", async (req, res) => {
    try {
      const { genre } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const tracks = await getSoundCloudGenreTracks(genre, limit);
      res.json({ results: tracks });
    } catch (error) {
      console.error("SoundCloud genre tracks error:", error);
      res.status(500).json({ message: "Failed to fetch genre tracks" });
    }
  });

  // ============================================
  // Google Play Audiobooks Integration (via SerpApi)
  // ============================================

  app.get("/api/google-play/status", async (req, res) => {
    res.json({ enabled: isGooglePlayEnabled() });
  });

  app.get("/api/google-play/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      const limit = parseInt(req.query.limit as string) || 20;
      if (!q) return res.json({ results: [] });
      const results = await searchGooglePlayAudiobooks(q, limit);
      res.json({ results });
    } catch (error) {
      console.error("Google Play search error:", error);
      res.status(500).json({ message: "Failed to search Google Play" });
    }
  });

  app.get("/api/google-play/audiobook/:productId", async (req, res) => {
    try {
      const { productId } = req.params;
      if (!productId) return res.status(400).json({ message: "Product ID required" });
      const audiobook = await getGooglePlayAudiobook(productId);
      if (!audiobook) return res.status(404).json({ message: "Audiobook not found" });
      res.json(audiobook);
    } catch (error) {
      console.error("Google Play audiobook error:", error);
      res.status(500).json({ message: "Failed to fetch Google Play audiobook" });
    }
  });

  app.get("/api/google-play/similar/:productId", async (req, res) => {
    try {
      const { productId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      const similar = await getGooglePlaySimilar(productId, limit);
      res.json({ results: similar });
    } catch (error) {
      console.error("Google Play similar error:", error);
      res.status(500).json({ message: "Failed to fetch similar audiobooks" });
    }
  });

  app.get("/api/google-play/ebooks/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      const limit = parseInt(req.query.limit as string) || 20;
      if (!q) return res.json({ results: [] });
      const results = await searchGooglePlayEbooks(q, limit);
      res.json({ results });
    } catch (error) {
      console.error("Google Play ebook search error:", error);
      res.status(500).json({ message: "Failed to search Google Play ebooks" });
    }
  });

  app.get("/api/google-play/ebook/:productId", async (req, res) => {
    try {
      const { productId } = req.params;
      if (!productId) return res.status(400).json({ message: "Product ID required" });
      const ebook = await getGooglePlayEbook(productId);
      if (!ebook) return res.status(404).json({ message: "Ebook not found" });
      res.json(ebook);
    } catch (error) {
      console.error("Google Play ebook error:", error);
      res.status(500).json({ message: "Failed to fetch Google Play ebook" });
    }
  });

  // ============================================
  // Monetization & DRM Controls (Spotify-like)
  // ============================================

  // GET /api/monetization/skip-status - Get skip limit status
  app.get("/api/monetization/skip-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await storage.getUser(userId);
      const isPremium = user?.subscriptionTier === "premium";
      const status = getSkipStatus(userId, isPremium);

      res.json(status);
    } catch (error) {
      console.error("Error getting skip status:", error);
      res.status(500).json({ message: "Failed to get skip status" });
    }
  });

  // POST /api/monetization/use-skip - Use a skip (for free users)
  app.post("/api/monetization/use-skip", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await storage.getUser(userId);
      const isPremium = user?.subscriptionTier === "premium";
      const result = useSkip(userId, isPremium);

      if (!result.success) {
        return res.status(429).json({
          success: false,
          remaining: result.remaining,
          message: result.message,
          upgradeUrl: "/api/subscription/create-checkout",
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error using skip:", error);
      res.status(500).json({ message: "Failed to use skip" });
    }
  });

  // GET /api/monetization/audio-quality - Get audio quality for user
  app.get("/api/monetization/audio-quality", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await storage.getUser(userId);
      const tier = (user?.subscriptionTier ?? "free") as SubscriptionTier;
      const isPremium = tier === "premium";
      const quality = getAudioQualityForTier(tier);
      const bitrate = getQualityBitrate(quality);

      res.json({
        quality,
        bitrate,
        isPremium,
        tier,
        upgradeMessage: tier !== "premium" ? "Upgrade to Premium for UHQ 320kbps audio" : null,
      });
    } catch (error) {
      console.error("Error getting audio quality:", error);
      res.status(500).json({ message: "Failed to get audio quality" });
    }
  });

  // GET /api/monetization/devices - Get registered devices
  app.get("/api/monetization/devices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const devices = getDevices(userId);
      const user = await storage.getUser(userId);
      const isPremium = user?.subscriptionTier === "premium";
      const maxDevices = isPremium ? 5 : 1;

      res.json({
        devices,
        maxDevices,
        isPremium,
      });
    } catch (error) {
      console.error("Error getting devices:", error);
      res.status(500).json({ message: "Failed to get devices" });
    }
  });

  // POST /api/monetization/devices/register - Register a device
  app.post("/api/monetization/devices/register", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { deviceId, deviceName } = req.body;
      if (!deviceId || !deviceName) {
        return res.status(400).json({ message: "Device ID and name required" });
      }

      const user = await storage.getUser(userId);
      const isPremium = user?.subscriptionTier === "premium";
      const result = registerDevice(userId, deviceId, deviceName, isPremium);

      if (!result.success) {
        return res.status(403).json({
          success: false,
          devices: result.devices,
          message: result.message,
          upgradeUrl: !isPremium ? "/api/subscription/create-checkout" : null,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error registering device:", error);
      res.status(500).json({ message: "Failed to register device" });
    }
  });

  // DELETE /api/monetization/devices/:deviceId - Remove a device
  app.delete("/api/monetization/devices/:deviceId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { deviceId } = req.params;
      const result = removeDevice(userId, deviceId);

      res.json(result);
    } catch (error) {
      console.error("Error removing device:", error);
      res.status(500).json({ message: "Failed to remove device" });
    }
  });

  // POST /api/monetization/session/start - Start playback session
  app.post("/api/monetization/session/start", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { deviceId, bookId } = req.body;
      if (!deviceId || !bookId) {
        return res.status(400).json({ message: "Device ID and book ID required" });
      }

      const user = await storage.getUser(userId);
      const tier = (user?.subscriptionTier || "free") as SubscriptionTier;
      const isPremium = tier === "premium";
      const isPaid = tier === "plus" || tier === "premium";

      const registerResult = registerDevice(userId, deviceId, req.headers["user-agent"] || "Unknown Device", isPremium, tier);
      if (!registerResult.success) {
        return res.status(403).json({
          success: false,
          message: registerResult.message,
          upgradeUrl: !isPaid ? "/api/subscription/create-checkout" : null,
        });
      }

      const sessionResult = createPlaybackSession(userId, deviceId, bookId, isPremium, tier);

      res.json({
        ...sessionResult,
        bitrate: getQualityBitrate(sessionResult.quality),
        isPremium,
        isPaid,
        tier,
      });
    } catch (error) {
      console.error("Error starting playback session:", error);
      res.status(500).json({ message: "Failed to start playback session" });
    }
  });

  // POST /api/monetization/session/heartbeat - Send session heartbeat
  app.post("/api/monetization/session/heartbeat", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId, deviceId } = req.body;
      if (!sessionId || !deviceId) {
        return res.status(400).json({ message: "Session ID and device ID required" });
      }

      const result = heartbeat(sessionId, deviceId);

      if (!result.success) {
        return res.status(403).json({
          success: false,
          message: result.message,
          sessionInvalid: true,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error processing heartbeat:", error);
      res.status(500).json({ message: "Failed to process heartbeat" });
    }
  });

  // POST /api/monetization/session/end - End playback session
  app.post("/api/monetization/session/end", isAuthenticated, async (req: any, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID required" });
      }

      endPlaybackSession(sessionId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error ending playback session:", error);
      res.status(500).json({ message: "Failed to end playback session" });
    }
  });

  // GET /api/monetization/session/active - Get active session
  app.get("/api/monetization/session/active", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const session = getActiveSession(userId);

      res.json({
        hasActiveSession: !!session,
        session: session ? {
          sessionId: session.sessionId,
          deviceId: session.deviceId,
          bookId: session.bookId,
          quality: session.quality,
          startedAt: session.startedAt,
        } : null,
      });
    } catch (error) {
      console.error("Error getting active session:", error);
      res.status(500).json({ message: "Failed to get active session" });
    }
  });

  // GET /api/monetization/playback-rules - Get playback rules for content
  app.get("/api/monetization/playback-rules", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { contentType = "single" } = req.query;
      const user = await storage.getUser(userId);
      const isPremium = user?.subscriptionTier === "premium";

      const skipStatus = getSkipStatus(userId, isPremium);
      const quality = getAudioQuality(isPremium);
      const shuffleRequired = isShuffleModeRequired(isPremium, contentType as "album" | "playlist" | "single");

      res.json({
        isPremium,
        skipStatus,
        quality,
        bitrate: getQualityBitrate(quality),
        shuffleRequired,
        showAds: !isPremium,
        maxDevices: isPremium ? 5 : 1,
        offlineEnabled: isPremium,
        upgradeUrl: !isPremium ? "/api/subscription/create-checkout" : null,
      });
    } catch (error) {
      console.error("Error getting playback rules:", error);
      res.status(500).json({ message: "Failed to get playback rules" });
    }
  });

  // GET /api/monetization/should-show-ad - Check if ad should be shown
  app.get("/api/monetization/should-show-ad", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { booksPlayed = 0 } = req.query;
      const user = await storage.getUser(userId);
      const isPremium = user?.subscriptionTier === "premium";

      const showAd = shouldShowAd(userId, isPremium, parseInt(booksPlayed as string, 10));

      res.json({
        showAd,
        isPremium,
        upgradeMessage: showAd ? "Upgrade to Premium for ad-free listening" : null,
      });
    } catch (error) {
      console.error("Error checking ad status:", error);
      res.status(500).json({ message: "Failed to check ad status" });
    }
  });

  app.post("/api/monetization/ad-impression", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { adId, adType, completed, skipped } = req.body;
      console.log(`Ad impression: user=${userId} ad=${adId} type=${adType} completed=${completed} skipped=${skipped}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording ad impression:", error);
      res.status(500).json({ message: "Failed to record impression" });
    }
  });

  // ============ REVIEWS AND SOCIAL ENDPOINTS ============

  // GET /api/books/:bookId/reviews - Get reviews for a book
  app.get("/api/books/:bookId/reviews", async (req: any, res) => {
    try {
      const { bookId } = req.params;
      const currentUserId = req.user?.id;
      const reviews = await getReviewsByBook(bookId, currentUserId);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // GET /api/books/:bookId/ratings - Get aggregated ratings for a book
  app.get("/api/books/:bookId/ratings", async (req: any, res) => {
    try {
      const { bookId } = req.params;
      const { title, author } = req.query;
      
      if (!title || !author) {
        return res.status(400).json({ message: "Title and author are required" });
      }
      
      const ratings = await getAggregatedRatings(bookId, title as string, author as string);
      res.json(ratings);
    } catch (error) {
      console.error("Error fetching ratings:", error);
      res.status(500).json({ message: "Failed to fetch ratings" });
    }
  });

  // POST /api/reviews/generate-title - AI-generate a review title
  app.post("/api/reviews/generate-title", isAuthenticated, async (req: any, res) => {
    try {
      const { content, bookTitle } = req.body;
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ message: "Review content is required" });
      }

      const { openai } = await import("./replit_integrations/image/client");

      const bookContext = typeof bookTitle === "string" && bookTitle.trim() ? ` for the book "${bookTitle.trim()}"` : "";
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "user",
            content: `Write a short, punchy review title (6 words or fewer)${bookContext} based on this review:\n\n${content.slice(0, 1000)}\n\nRespond with only the title, no quotes.`,
          },
        ],
        max_completion_tokens: 30,
      });

      const title = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!title) {
        return res.status(500).json({ message: "Failed to generate title" });
      }

      res.json({ title });
    } catch (error) {
      console.error("Error generating review title:", error);
      res.status(500).json({ message: "Failed to generate title" });
    }
  });

  // POST /api/reviews - Create a new review
  app.post("/api/reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { bookId, rating, title, content } = req.body;
      
      if (!bookId || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Book ID and rating (1-5) are required" });
      }

      const review = await createReview({ userId, bookId, rating, title, content });
      res.status(201).json(review);
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // PUT /api/reviews/:id - Update a review
  app.put("/api/reviews/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { id } = req.params;
      const { rating, title, content } = req.body;

      const review = await updateReview(id, userId, { rating, title, content });
      if (!review) {
        return res.status(404).json({ message: "Review not found or not authorized" });
      }
      res.json(review);
    } catch (error) {
      console.error("Error updating review:", error);
      res.status(500).json({ message: "Failed to update review" });
    }
  });

  // DELETE /api/reviews/:id - Delete a review
  app.delete("/api/reviews/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { id } = req.params;
      const deleted = await deleteReview(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Review not found or not authorized" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({ message: "Failed to delete review" });
    }
  });

  // POST /api/reviews/:id/like - Toggle like on a review
  app.post("/api/reviews/:id/like", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { id } = req.params;
      const isLiked = await toggleReviewLike(id, userId);
      res.json({ isLiked });
    } catch (error) {
      console.error("Error toggling review like:", error);
      res.status(500).json({ message: "Failed to toggle like" });
    }
  });

  // GET /api/users/:userId/reviews - Get reviews by a user
  app.get("/api/users/:userId/reviews", async (req: any, res) => {
    try {
      const { userId } = req.params;
      const reviews = await getReviewsByUser(userId);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching user reviews:", error);
      res.status(500).json({ message: "Failed to fetch user reviews" });
    }
  });

  // POST /api/users/:userId/follow - Follow a user
  app.post("/api/users/:userId/follow", isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user?.id;
      if (!followerId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { userId: followingId } = req.params;
      const success = await followUser(followerId, followingId);
      res.json({ success, following: true });
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ message: "Failed to follow user" });
    }
  });

  // DELETE /api/users/:userId/follow - Unfollow a user
  app.delete("/api/users/:userId/follow", isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user?.id;
      if (!followerId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { userId: followingId } = req.params;
      await unfollowUser(followerId, followingId);
      res.json({ success: true, following: false });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ message: "Failed to unfollow user" });
    }
  });

  // GET /api/users/:userId/followers - Get followers
  app.get("/api/users/:userId/followers", async (req: any, res) => {
    try {
      const { userId } = req.params;
      const followers = await getFollowers(userId);
      res.json({ followers, count: followers.length });
    } catch (error) {
      console.error("Error fetching followers:", error);
      res.status(500).json({ message: "Failed to fetch followers" });
    }
  });

  // GET /api/users/:userId/following - Get following
  app.get("/api/users/:userId/following", async (req: any, res) => {
    try {
      const { userId } = req.params;
      const following = await getFollowing(userId);
      res.json({ following, count: following.length });
    } catch (error) {
      console.error("Error fetching following:", error);
      res.status(500).json({ message: "Failed to fetch following" });
    }
  });

  // GET /api/users/:userId/is-following - Check if following
  app.get("/api/users/:userId/is-following", isAuthenticated, async (req: any, res) => {
    try {
      const followerId = req.user?.id;
      if (!followerId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { userId: followingId } = req.params;
      const following = await isFollowing(followerId, followingId);
      res.json({ following });
    } catch (error) {
      console.error("Error checking follow status:", error);
      res.status(500).json({ message: "Failed to check follow status" });
    }
  });

  // GET /api/feed - Get social feed (reviews from followed users)
  app.get("/api/feed", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { limit = 20 } = req.query;
      const feed = await getSocialFeed(userId, parseInt(limit as string, 10));
      res.json(feed);
    } catch (error) {
      console.error("Error fetching feed:", error);
      res.status(500).json({ message: "Failed to fetch feed" });
    }
  });

  // GET /api/authors/:name - Get author details
  app.get("/api/authors/:name", async (req: any, res) => {
    try {
      const { name } = req.params;
      const author = await getAuthorByName(decodeURIComponent(name));
      if (!author) {
        return res.status(404).json({ message: "Author not found" });
      }
      res.json(author);
    } catch (error) {
      console.error("Error fetching author:", error);
      res.status(500).json({ message: "Failed to fetch author" });
    }
  });

  // GET /api/authors/:name/works - Get author's works
  app.get("/api/authors/:name/works", async (req: any, res) => {
    try {
      const { name } = req.params;
      const { limit = 20 } = req.query;
      
      const author = await getAuthorByName(decodeURIComponent(name));
      if (!author || !author.openLibraryKey) {
        return res.json({ works: [] });
      }
      
      const works = await getAuthorWorks(author.openLibraryKey, parseInt(limit as string, 10));
      res.json({ author, works });
    } catch (error) {
      console.error("Error fetching author works:", error);
      res.status(500).json({ message: "Failed to fetch author works" });
    }
  });

  // ============================================
  // PLAYLIST (READING LIST) ROUTES
  // ============================================

  // GET /api/playlists - Get user's playlists (requires authentication)
  app.get("/api/playlists", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      // Only return this user's playlists
      const playlists = await storage.getPlaylists(userId);
      res.json(playlists);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      res.status(500).json({ message: "Failed to fetch playlists" });
    }
  });

  // GET /api/playlists/curated - Get staff-curated playlists (public, no auth required)
  app.get("/api/playlists/curated", async (req: any, res) => {
    try {
      const playlists = await storage.getCuratedPlaylists();
      res.json(playlists);
    } catch (error) {
      console.error("Error fetching curated playlists:", error);
      res.status(500).json({ message: "Failed to fetch curated playlists" });
    }
  });

  // GET /api/playlists/:id - Get specific playlist with items
  // Only accessible if: user owns it, it's public, or it's curated
  app.get("/api/playlists/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const playlist = await storage.getPlaylist(id);
      
      if (!playlist) {
        return res.status(404).json({ message: "Playlist not found" });
      }
      
      // Check access: owner, public, or curated
      const isOwner = userId && playlist.userId === userId;
      const isPublicOrCurated = playlist.isPublic === 1 || playlist.isCurated === 1;
      
      if (!isOwner && !isPublicOrCurated) {
        return res.status(403).json({ message: "Access denied to this playlist" });
      }
      
      res.json(playlist);
    } catch (error) {
      console.error("Error fetching playlist:", error);
      res.status(500).json({ message: "Failed to fetch playlist" });
    }
  });

  // POST /api/playlists - Create a new playlist
  app.post("/api/playlists", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { name, description, isPublic = 1 } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Playlist name is required" });
      }

      const playlist = await storage.createPlaylist({
        userId,
        name,
        description,
        isPublic: isPublic ? 1 : 0,
        isCurated: 0,
      });

      res.status(201).json(playlist);
    } catch (error) {
      console.error("Error creating playlist:", error);
      res.status(500).json({ message: "Failed to create playlist" });
    }
  });

  // PUT /api/playlists/:id - Update a playlist
  app.put("/api/playlists/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      const existing = await storage.getPlaylist(id);
      if (!existing) {
        return res.status(404).json({ message: "Playlist not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to edit this playlist" });
      }

      const { name, description, isPublic, coverImage } = req.body;
      const playlist = await storage.updatePlaylist(id, {
        name,
        description,
        isPublic: isPublic !== undefined ? (isPublic ? 1 : 0) : undefined,
        coverImage,
      });

      res.json(playlist);
    } catch (error) {
      console.error("Error updating playlist:", error);
      res.status(500).json({ message: "Failed to update playlist" });
    }
  });

  // DELETE /api/playlists/:id - Delete a playlist
  app.delete("/api/playlists/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      const existing = await storage.getPlaylist(id);
      if (!existing) {
        return res.status(404).json({ message: "Playlist not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this playlist" });
      }

      await storage.deletePlaylist(id);
      res.json({ message: "Playlist deleted" });
    } catch (error) {
      console.error("Error deleting playlist:", error);
      res.status(500).json({ message: "Failed to delete playlist" });
    }
  });

  // POST /api/playlists/:id/items - Add book to playlist
  app.post("/api/playlists/:id/items", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      const existing = await storage.getPlaylist(id);
      if (!existing) {
        return res.status(404).json({ message: "Playlist not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to modify this playlist" });
      }

      const { bookId, bookTitle, bookAuthor, bookCover } = req.body;
      if (!bookId || !bookTitle) {
        return res.status(400).json({ message: "bookId and bookTitle are required" });
      }

      const item = await storage.addToPlaylist(id, { bookId, bookTitle, bookAuthor, bookCover });
      res.status(201).json(item);
    } catch (error) {
      console.error("Error adding to playlist:", error);
      res.status(500).json({ message: "Failed to add to playlist" });
    }
  });

  // DELETE /api/playlists/:id/items/:bookId - Remove book from playlist
  app.delete("/api/playlists/:id/items/:bookId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { id, bookId } = req.params;

      const existing = await storage.getPlaylist(id);
      if (!existing) {
        return res.status(404).json({ message: "Playlist not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to modify this playlist" });
      }

      await storage.removeFromPlaylist(id, bookId);
      res.json({ message: "Book removed from playlist" });
    } catch (error) {
      console.error("Error removing from playlist:", error);
      res.status(500).json({ message: "Failed to remove from playlist" });
    }
  });

  // ============================================
  // DJ RECOMMENDATIONS ROUTES
  // ============================================

  // GET /api/dj/recommendations - Get personalized DJ recommendations
  app.get("/api/dj/recommendations", async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const recommendations = await storage.getDJRecommendations(userId);
      res.json(recommendations);
    } catch (error) {
      console.error("Error fetching DJ recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // ============================================
  // GAMIFICATION ROUTES
  // ============================================

  // GET /api/gamification/profile - Get user's gamification profile
  app.get("/api/gamification/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const profile = await getGamificationProfile(userId);
      res.json(profile);
    } catch (error) {
      console.error("Error fetching gamification profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // POST /api/gamification/activity - Record listening activity
  app.post("/api/gamification/activity", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { minutesListened, bookCompleted } = req.body;
      if (typeof minutesListened !== "number" || minutesListened < 0) {
        return res.status(400).json({ message: "minutesListened must be a non-negative number" });
      }
      const result = await recordListeningActivity(userId, minutesListened, bookCompleted || false);
      res.json(result);
    } catch (error) {
      console.error("Error recording activity:", error);
      res.status(500).json({ message: "Failed to record activity" });
    }
  });

  // GET /api/gamification/leaderboard - Get leaderboard
  app.get("/api/gamification/leaderboard", async (req, res) => {
    try {
      const period = (req.query.period as string) || "alltime";
      const limit = parseInt(req.query.limit as string) || 20;
      const leaderboard = await getLeaderboard(period as any, limit);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // GET /api/gamification/achievements - Get all achievement definitions
  app.get("/api/gamification/achievements", (_req, res) => {
    res.json(ACHIEVEMENT_DEFINITIONS);
  });

  // GET /api/gamification/surprise-achievements - Get surprise achievement definitions
  app.get("/api/gamification/surprise-achievements", (_req, res) => {
    const surpriseTypes = ["comeback_kid", "binge_reader", "weekend_warrior", "century_club",
      "diverse_listener", "review_streak", "sharing_is_caring", "party_animal", "collector", "speed_reader"];
    const surpriseAchievements = ACHIEVEMENT_DEFINITIONS.filter((a: any) => surpriseTypes.includes(a.type));
    res.json(surpriseAchievements);
  });

  // PUT /api/gamification/goal - Set daily listening goal
  app.put("/api/gamification/goal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { dailyMinutesGoal } = req.body;
      if (typeof dailyMinutesGoal !== "number" || dailyMinutesGoal < 5 || dailyMinutesGoal > 480) {
        return res.status(400).json({ message: "Goal must be between 5 and 480 minutes" });
      }
      const goal = await setDailyGoal(userId, dailyMinutesGoal);
      res.json(goal);
    } catch (error) {
      console.error("Error setting goal:", error);
      res.status(500).json({ message: "Failed to set goal" });
    }
  });

  // GET /api/gamification/challenges - Get active challenges
  app.get("/api/gamification/challenges", async (_req, res) => {
    try {
      const challenges = await getActiveChallenges();
      res.json(challenges);
    } catch (error) {
      console.error("Error fetching challenges:", error);
      res.status(500).json({ message: "Failed to fetch challenges" });
    }
  });

  // POST /api/gamification/challenges/:id/join - Join a challenge
  app.post("/api/gamification/challenges/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const progress = await joinChallenge(userId, id);
      res.json(progress);
    } catch (error) {
      console.error("Error joining challenge:", error);
      res.status(500).json({ message: "Failed to join challenge" });
    }
  });

  // GET /api/gamification/challenges/mine - Get user's challenges
  app.get("/api/gamification/challenges/mine", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const challenges = await getUserChallenges(userId);
      res.json(challenges);
    } catch (error) {
      console.error("Error fetching user challenges:", error);
      res.status(500).json({ message: "Failed to fetch challenges" });
    }
  });

  // GET /api/gamification/year-in-review - Get annual stats summary
  app.get("/api/gamification/year-in-review", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const parsedYear = parseInt(req.query.year as string);
      const year = (parsedYear && parsedYear >= 2020 && parsedYear <= 2100) ? parsedYear : new Date().getFullYear();
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const logs = await db.select().from(dailyListeningLog)
        .where(and(
          eq(dailyListeningLog.userId, userId),
          gte(dailyListeningLog.date, startDate),
          sql`${dailyListeningLog.date} <= ${endDate}`
        ));

      const totalMinutes = logs.reduce((sum, l) => sum + l.minutesListened, 0);
      const totalBooksCompleted = logs.reduce((sum, l) => sum + l.booksCompleted, 0);
      const totalDaysActive = logs.length;

      const sortedDates = logs.map(l => l.date).sort();
      let longestYearStreak = 0;
      let currentYearStreak = 0;
      for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) {
          currentYearStreak = 1;
        } else {
          const prev = new Date(sortedDates[i-1] + "T00:00:00Z");
          const curr = new Date(sortedDates[i] + "T00:00:00Z");
          const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
          if (diff === 1) {
            currentYearStreak++;
          } else {
            currentYearStreak = 1;
          }
        }
        longestYearStreak = Math.max(longestYearStreak, currentYearStreak);
      }

      const yearAchievements = await db.select().from(userAchievements)
        .where(and(
          eq(userAchievements.userId, userId),
          gte(userAchievements.unlockedAt, new Date(`${year}-01-01T00:00:00Z`)),
          sql`${userAchievements.unlockedAt} <= ${new Date(`${year}-12-31T23:59:59Z`)}`
        ));

      const [xpData] = await db.select().from(userXp).where(eq(userXp.userId, userId));

      const monthlyData: { month: number; minutes: number; books: number }[] = [];
      for (let m = 1; m <= 12; m++) {
        const monthStr = m.toString().padStart(2, '0');
        const monthLogs = logs.filter(l => l.date.startsWith(`${year}-${monthStr}`));
        monthlyData.push({
          month: m,
          minutes: monthLogs.reduce((s, l) => s + l.minutesListened, 0),
          books: monthLogs.reduce((s, l) => s + l.booksCompleted, 0),
        });
      }

      const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
      logs.forEach(l => {
        const d = new Date(l.date + "T00:00:00Z");
        dayOfWeekCounts[d.getUTCDay()] += l.minutesListened;
      });
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const mostActiveDay = dayNames[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))];

      const bestMonth = monthlyData.reduce((best, m) => m.minutes > best.minutes ? m : best, monthlyData[0]);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      res.json({
        year,
        totalMinutes,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
        totalBooksCompleted,
        totalDaysActive,
        longestStreak: longestYearStreak,
        achievementsEarned: yearAchievements.length,
        currentLevel: xpData?.level || 1,
        totalXp: xpData?.totalXp || 0,
        monthlyData,
        mostActiveDay,
        bestMonth: { name: monthNames[(bestMonth?.month || 1) - 1], minutes: bestMonth?.minutes || 0 },
      });
    } catch (error) {
      console.error("Error generating year in review:", error);
      res.status(500).json({ message: "Failed to generate year in review" });
    }
  });

  // === STREAK FREEZES & EXPIRING REWARDS ===

  app.get("/api/gamification/freezes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [freeze] = await db.select().from(streakFreezes).where(eq(streakFreezes.userId, userId));
      if (!freeze) {
        const [newFreeze] = await db.insert(streakFreezes).values({ userId, totalFreezes: 1, usedFreezes: 0 }).returning();
        return res.json(newFreeze);
      }
      res.json(freeze);
    } catch (error) {
      console.error("Error fetching freezes:", error);
      res.status(500).json({ message: "Failed to fetch streak freezes" });
    }
  });

  app.post("/api/gamification/freezes/use", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [freeze] = await db.select().from(streakFreezes).where(eq(streakFreezes.userId, userId));
      if (!freeze || freeze.totalFreezes - freeze.usedFreezes <= 0) {
        return res.status(400).json({ message: "No streak freezes available" });
      }
      const [updated] = await db.update(streakFreezes)
        .set({ usedFreezes: freeze.usedFreezes + 1 })
        .where(eq(streakFreezes.id, freeze.id))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error("Error using freeze:", error);
      res.status(500).json({ message: "Failed to use streak freeze" });
    }
  });

  app.get("/api/gamification/rewards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const rewards = await db.select().from(expiringRewards)
        .where(and(
          eq(expiringRewards.userId, userId),
          eq(expiringRewards.claimed, false),
          gt(expiringRewards.expiresAt, new Date())
        ))
        .orderBy(expiringRewards.expiresAt);
      res.json(rewards);
    } catch (error) {
      console.error("Error fetching rewards:", error);
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  app.post("/api/gamification/rewards/:id/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const rewardId = req.params.id;
      const [reward] = await db.select().from(expiringRewards)
        .where(and(
          eq(expiringRewards.id, rewardId),
          eq(expiringRewards.userId, userId)
        ));
      if (!reward) return res.status(404).json({ message: "Reward not found" });
      if (reward.claimed) return res.status(400).json({ message: "Already claimed" });
      if (new Date(reward.expiresAt) < new Date()) return res.status(400).json({ message: "Reward expired" });

      const [claimed] = await db.update(expiringRewards)
        .set({ claimed: true, claimedAt: new Date() })
        .where(eq(expiringRewards.id, rewardId))
        .returning();

      if (reward.rewardType === "xp_bonus") {
        await db.update(userXp)
          .set({ totalXp: sql`${userXp.totalXp} + ${reward.rewardValue}` })
          .where(eq(userXp.userId, userId));
      } else if (reward.rewardType === "streak_shield") {
        const [freeze] = await db.select().from(streakFreezes).where(eq(streakFreezes.userId, userId));
        if (freeze) {
          await db.update(streakFreezes)
            .set({ totalFreezes: freeze.totalFreezes + reward.rewardValue })
            .where(eq(streakFreezes.id, freeze.id));
        } else {
          await db.insert(streakFreezes).values({ userId, totalFreezes: reward.rewardValue, usedFreezes: 0 });
        }
      }

      res.json(claimed);
    } catch (error) {
      console.error("Error claiming reward:", error);
      res.status(500).json({ message: "Failed to claim reward" });
    }
  });

  app.post("/api/gamification/rewards/grant", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { rewardType, rewardValue, description, expiresInHours = 24 } = req.body;
      if (!rewardType || !description) return res.status(400).json({ message: "Missing fields" });

      const expiresAt = new Date(Date.now() + (expiresInHours * 60 * 60 * 1000));
      const [reward] = await db.insert(expiringRewards).values({
        userId, rewardType, rewardValue: rewardValue || 0, description, expiresAt, claimed: false,
      }).returning();
      res.json(reward);
    } catch (error) {
      console.error("Error granting reward:", error);
      res.status(500).json({ message: "Failed to grant reward" });
    }
  });

  // === BATTLE PASS ROUTES ===

  async function seedDefaultBattlePass() {
    try {
      const [existing] = await db.select().from(battlePasses).where(eq(battlePasses.isActive, true)).limit(1);
      if (existing) return;

      const now = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 3);

      const [pass] = await db.insert(battlePasses).values({
        seasonName: "Spring Reading Challenge",
        description: "Complete milestones to earn exclusive badges, streak freezes, XP multipliers, and more! Season runs for 3 months.",
        priceCents: 299,
        startDate: now,
        endDate: endDate,
        isActive: true,
      }).returning();

      const milestones = [
        { tier: 1, xpRequired: 100, rewardType: "badge", rewardValue: "🌱", description: "Sprout Badge - You're just getting started!" },
        { tier: 2, xpRequired: 250, rewardType: "streak_freeze", rewardValue: "1", description: "1 Streak Freeze - Protect your streak" },
        { tier: 3, xpRequired: 500, rewardType: "badge", rewardValue: "📖", description: "Reader Badge - Dedicated listener" },
        { tier: 4, xpRequired: 1000, rewardType: "xp_multiplier", rewardValue: "1.5x for 24h", description: "1.5x XP Boost for 24 hours" },
        { tier: 5, xpRequired: 2000, rewardType: "streak_freeze", rewardValue: "2", description: "2 Streak Freezes - Extra protection" },
        { tier: 6, xpRequired: 3500, rewardType: "badge", rewardValue: "⭐", description: "Star Badge - Rising star reader" },
        { tier: 7, xpRequired: 5000, rewardType: "premium_trial", rewardValue: "3", description: "3-Day Premium Trial" },
        { tier: 8, xpRequired: 7500, rewardType: "discount", rewardValue: "20", description: "20% off any title purchase" },
        { tier: 9, xpRequired: 10000, rewardType: "badge", rewardValue: "🏆", description: "Champion Badge - Season champion" },
        { tier: 10, xpRequired: 15000, rewardType: "premium_trial", rewardValue: "7", description: "7-Day Premium Trial + Exclusive 👑 Badge" },
      ];

      for (const m of milestones) {
        await db.insert(battlePassMilestones).values({
          battlePassId: pass.id,
          tier: m.tier,
          xpRequired: m.xpRequired,
          rewardType: m.rewardType,
          rewardValue: m.rewardValue,
          description: m.description,
        });
      }

      console.log(`[BattlePass] Seeded default season: ${pass.seasonName} with ${milestones.length} milestones`);
    } catch (error) {
      console.error("[BattlePass] Error seeding default battle pass:", error);
    }
  }

  seedDefaultBattlePass();

  // GET /api/battle-pass/current - Active season + user progress if purchased
  app.get("/api/battle-pass/current", async (req: any, res) => {
    try {
      const [activeSeason] = await db.select().from(battlePasses).where(eq(battlePasses.isActive, true)).limit(1);
      if (!activeSeason) {
        return res.json({ season: null, milestones: [], purchase: null });
      }

      const milestones = await db.select().from(battlePassMilestones)
        .where(eq(battlePassMilestones.battlePassId, activeSeason.id))
        .orderBy(battlePassMilestones.tier);

      let purchase = null;
      if (req.isAuthenticated?.() && req.user?.id) {
        const [userPurchase] = await db.select().from(battlePassPurchases)
          .where(and(
            eq(battlePassPurchases.userId, req.user.id),
            eq(battlePassPurchases.battlePassId, activeSeason.id)
          ))
          .limit(1);

        if (userPurchase) {
          const [xpRecord] = await db.select().from(userXp).where(eq(userXp.userId, req.user.id)).limit(1);
          const currentXp = xpRecord?.totalXp ?? 0;

          let currentTier = 0;
          for (const m of milestones) {
            if (currentXp >= m.xpRequired) {
              currentTier = m.tier;
            }
          }

          if (currentTier !== userPurchase.currentTier) {
            await db.update(battlePassPurchases)
              .set({ currentTier, xpEarned: currentXp })
              .where(eq(battlePassPurchases.id, userPurchase.id));
          }

          purchase = { ...userPurchase, currentTier, xpEarned: currentXp };
        }
      }

      res.json({ season: activeSeason, milestones, purchase });
    } catch (error) {
      console.error("Error fetching battle pass:", error);
      res.status(500).json({ message: "Failed to fetch battle pass" });
    }
  });

  // POST /api/battle-pass/purchase - Buy via Stripe
  app.post("/api/battle-pass/purchase", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [activeSeason] = await db.select().from(battlePasses).where(eq(battlePasses.isActive, true)).limit(1);
      if (!activeSeason) {
        return res.status(404).json({ message: "No active battle pass season" });
      }

      const [existingPurchase] = await db.select().from(battlePassPurchases)
        .where(and(
          eq(battlePassPurchases.userId, userId),
          eq(battlePassPurchases.battlePassId, activeSeason.id)
        ))
        .limit(1);

      if (existingPurchase) {
        return res.status(400).json({ message: "Battle pass already purchased for this season" });
      }

      if (stripe) {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: {
                name: `Battle Pass: ${activeSeason.seasonName}`,
                description: activeSeason.description || "Seasonal battle pass with exclusive rewards",
              },
              unit_amount: activeSeason.priceCents,
            },
            quantity: 1,
          }],
          mode: "payment",
          success_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/?battle_pass=success`,
          cancel_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/?battle_pass=cancelled`,
          metadata: {
            type: "battle_pass",
            userId,
            battlePassId: activeSeason.id,
          },
        });

        return res.json({ checkoutUrl: session.url, sessionId: session.id });
      }

      const [xpRecord] = await db.select().from(userXp).where(eq(userXp.userId, userId)).limit(1);
      const currentXp = xpRecord?.totalXp ?? 0;

      const [purchase] = await db.insert(battlePassPurchases).values({
        userId,
        battlePassId: activeSeason.id,
        amountCents: activeSeason.priceCents,
        currentTier: 0,
        xpEarned: currentXp,
        claimedMilestones: "[]",
      }).returning();

      res.json({ purchase, message: "Battle pass purchased successfully" });
    } catch (error) {
      console.error("Error purchasing battle pass:", error);
      res.status(500).json({ message: "Failed to purchase battle pass" });
    }
  });

  // POST /api/battle-pass/claim/:milestone - Claim reward at reached tier
  app.post("/api/battle-pass/claim/:milestone", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const milestoneId = req.params.milestone;

      const [activeSeason] = await db.select().from(battlePasses).where(eq(battlePasses.isActive, true)).limit(1);
      if (!activeSeason) {
        return res.status(404).json({ message: "No active battle pass season" });
      }

      const [purchase] = await db.select().from(battlePassPurchases)
        .where(and(
          eq(battlePassPurchases.userId, userId),
          eq(battlePassPurchases.battlePassId, activeSeason.id)
        ))
        .limit(1);

      if (!purchase) {
        return res.status(403).json({ message: "Battle pass not purchased" });
      }

      const [milestone] = await db.select().from(battlePassMilestones)
        .where(eq(battlePassMilestones.id, milestoneId))
        .limit(1);

      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }

      const [xpRecord] = await db.select().from(userXp).where(eq(userXp.userId, userId)).limit(1);
      const currentXp = xpRecord?.totalXp ?? 0;

      if (currentXp < milestone.xpRequired) {
        return res.status(400).json({ message: "Not enough XP to claim this milestone" });
      }

      let claimed: string[] = [];
      try { claimed = JSON.parse(purchase.claimedMilestones); } catch { claimed = []; }
      if (claimed.includes(milestoneId)) {
        return res.status(400).json({ message: "Milestone already claimed" });
      }

      claimed.push(milestoneId);
      await db.update(battlePassPurchases)
        .set({ claimedMilestones: JSON.stringify(claimed) })
        .where(eq(battlePassPurchases.id, purchase.id));

      let rewardDetails: any = { type: milestone.rewardType, value: milestone.rewardValue, description: milestone.description };

      if (milestone.rewardType === "streak_freeze") {
        const freezeCount = parseInt(milestone.rewardValue || "1");
        const [existingFreeze] = await db.select().from(streakFreezes).where(eq(streakFreezes.userId, userId)).limit(1);
        if (existingFreeze) {
          await db.update(streakFreezes)
            .set({ totalFreezes: sql`${streakFreezes.totalFreezes} + ${freezeCount}`, lastEarnedAt: new Date() })
            .where(eq(streakFreezes.id, existingFreeze.id));
        } else {
          await db.insert(streakFreezes).values({ userId, totalFreezes: freezeCount, usedFreezes: 0, lastEarnedAt: new Date() });
        }
      } else if (milestone.rewardType === "premium_trial") {
        const days = parseInt(milestone.rewardValue || "3");
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + days);
        const [existingPrefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
        if (existingPrefs) {
          await db.update(userPreferences).set({ premiumTrialEndDate: trialEnd }).where(eq(userPreferences.userId, userId));
        } else {
          await db.insert(userPreferences).values({ userId, premiumTrialEndDate: trialEnd, favoriteGenres: [], onboardingCompleted: false, welcomeBonusGranted: false });
        }
      } else if (milestone.rewardType === "xp_multiplier") {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        await db.insert(expiringRewards).values({
          userId,
          rewardType: "xp_multiplier",
          rewardValue: 150,
          description: milestone.description || "1.5x XP Boost from Battle Pass",
          expiresAt,
          claimed: false,
        });
      } else if (milestone.rewardType === "discount") {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        await db.insert(expiringRewards).values({
          userId,
          rewardType: "discount",
          rewardValue: parseInt(milestone.rewardValue || "20"),
          description: milestone.description || "Discount from Battle Pass",
          expiresAt,
          claimed: false,
        });
      }

      res.json({ success: true, reward: rewardDetails });
    } catch (error) {
      console.error("Error claiming milestone:", error);
      res.status(500).json({ message: "Failed to claim milestone" });
    }
  });

  // GET /api/battle-pass/leaderboard - Top participants by XP
  app.get("/api/battle-pass/leaderboard", async (_req, res) => {
    try {
      const [activeSeason] = await db.select().from(battlePasses).where(eq(battlePasses.isActive, true)).limit(1);
      if (!activeSeason) {
        return res.json([]);
      }

      const participants = await db
        .select({
          userId: battlePassPurchases.userId,
          xpEarned: battlePassPurchases.xpEarned,
          currentTier: battlePassPurchases.currentTier,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(battlePassPurchases)
        .innerJoin(users, eq(users.id, battlePassPurchases.userId))
        .where(eq(battlePassPurchases.battlePassId, activeSeason.id))
        .orderBy(desc(battlePassPurchases.xpEarned))
        .limit(20);

      const leaderboard = participants.map((p, i) => ({
        ...p,
        rank: i + 1,
      }));

      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching battle pass leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // === USER ACQUISITION ROUTES ===

  // GET /api/platform/stats - Public platform statistics
  app.get("/api/platform/stats", async (_req, res) => {
    try {
      const totalBooks = await storage.getBookCount();

      const [userCount] = await db.select({ count: count() }).from(users);
      const totalUsers = userCount?.count ?? 0;

      const [xpSum] = await db.select({ total: sql<number>`coalesce(sum(${userXp.totalListeningMinutes}), 0)` }).from(userXp);
      const totalListeningMinutes = Number(xpSum?.total ?? 0);

      res.json({ totalBooks, totalUsers, totalListeningMinutes });
    } catch (error) {
      console.error("Error fetching platform stats:", error);
      res.status(500).json({ message: "Failed to fetch platform stats" });
    }
  });

  // POST /api/user/welcome-bonus - Grant welcome bonus to new users
  app.post("/api/user/welcome-bonus", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [existing] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      if (existing?.welcomeBonusGranted) {
        return res.json({ granted: false, message: "Welcome bonus already claimed" });
      }

      const premiumTrialEnd = new Date();
      premiumTrialEnd.setDate(premiumTrialEnd.getDate() + 7);

      if (existing) {
        await db.update(userPreferences)
          .set({ welcomeBonusGranted: true, premiumTrialEndDate: premiumTrialEnd })
          .where(eq(userPreferences.userId, userId));
      } else {
        await db.insert(userPreferences).values({
          userId,
          welcomeBonusGranted: true,
          premiumTrialEndDate: premiumTrialEnd,
          favoriteGenres: [],
          onboardingCompleted: false,
        });
      }

      const [existingXp] = await db.select().from(userXp).where(eq(userXp.userId, userId));
      if (existingXp) {
        await db.update(userXp)
          .set({ totalXp: sql`${userXp.totalXp} + 250` })
          .where(eq(userXp.userId, userId));
      } else {
        await db.insert(userXp).values({
          userId,
          totalXp: 250,
          level: 1,
          totalListeningMinutes: 0,
          booksCompleted: 0,
          reviewsWritten: 0,
        });
      }

      const [existingAchievement] = await db.select().from(userAchievements)
        .where(sql`${userAchievements.userId} = ${userId} AND ${userAchievements.achievementType} = 'welcome'`);
      if (!existingAchievement) {
        await db.insert(userAchievements).values({
          userId,
          achievementType: "welcome",
        });
      }

      res.json({ granted: true, xpAwarded: 250, premiumTrialDays: 7 });
    } catch (error) {
      console.error("Error granting welcome bonus:", error);
      res.status(500).json({ message: "Failed to grant welcome bonus" });
    }
  });

  // GET /api/referral/code - Get or generate user's referral code
  app.get("/api/referral/code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const code = await storage.getUserReferralCode(userId);
      res.json({ code });
    } catch (error) {
      console.error("Error getting referral code:", error);
      res.status(500).json({ message: "Failed to get referral code" });
    }
  });

  // GET /api/referral/stats - Get referral statistics
  app.get("/api/referral/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const userReferrals = await storage.getUserReferrals(userId);
      const [user] = await db.select().from(users).where(eq(users.id, userId));

      const totalReferrals = userReferrals.length;
      const completedReferrals = userReferrals.filter(r => r.status === "completed" || r.status === "rewarded").length;
      const creditsEarned = user?.referralCredits || 0;

      res.json({ totalReferrals, completedReferrals, creditsEarned });
    } catch (error) {
      console.error("Error fetching referral stats:", error);
      res.status(500).json({ message: "Failed to fetch referral stats" });
    }
  });

  // POST /api/referral/apply - Apply a referral code
  app.post("/api/referral/apply", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Referral code is required" });
      }

      const referral = await storage.getReferralByCode(code);
      if (!referral) {
        return res.status(404).json({ message: "Invalid referral code" });
      }

      if (referral.referrerId === userId) {
        return res.status(400).json({ message: "Cannot apply your own referral code" });
      }

      if (referral.status !== "pending") {
        return res.status(400).json({ message: "Referral code already used" });
      }

      await storage.completeReferral(code, userId);

      res.json({ success: true, creditAmount: referral.creditAmount });
    } catch (error) {
      console.error("Error applying referral:", error);
      res.status(500).json({ message: "Failed to apply referral code" });
    }
  });

  // GET /api/referral/history - List referral history
  app.get("/api/referral/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const history = await storage.getUserReferrals(userId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching referral history:", error);
      res.status(500).json({ message: "Failed to fetch referral history" });
    }
  });

  // Legacy referral routes (backwards compatibility)
  app.post("/api/referrals/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const code = await storage.getUserReferralCode(userId);
      const existing = await storage.getReferralByCode(code);
      if (existing) {
        return res.json({ code: existing.referralCode, shareUrl: `${req.protocol}://${req.get("host")}?ref=${existing.referralCode}` });
      }
      const newReferral = await storage.createReferral(userId);
      res.json({ code: newReferral.referralCode, shareUrl: `${req.protocol}://${req.get("host")}?ref=${newReferral.referralCode}` });
    } catch (error) {
      console.error("Error generating referral code:", error);
      res.status(500).json({ message: "Failed to generate referral code" });
    }
  });

  app.get("/api/referrals/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const userReferrals = await storage.getUserReferrals(userId);
      const code = userReferrals.length > 0 ? userReferrals[0].referralCode : null;
      const totalReferred = userReferrals.length;
      const convertedCount = userReferrals.filter(r => r.status === "completed" || r.status === "rewarded").length;
      const pendingCount = userReferrals.filter(r => r.status === "pending").length;
      res.json({ referralCode: code, totalReferred, convertedCount, pendingCount });
    } catch (error) {
      console.error("Error fetching referral stats:", error);
      res.status(500).json({ message: "Failed to fetch referral stats" });
    }
  });

  app.post("/api/referrals/redeem", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Referral code is required" });
      }
      const referral = await storage.getReferralByCode(code);
      if (!referral) return res.status(404).json({ message: "Invalid referral code" });
      if (referral.referrerId === userId) return res.status(400).json({ message: "Cannot redeem your own referral code" });
      if (referral.status !== "pending") return res.status(400).json({ message: "Referral code already redeemed" });
      await storage.completeReferral(code, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error redeeming referral:", error);
      res.status(500).json({ message: "Failed to redeem referral code" });
    }
  });

  // PUT /api/user/preferences - Update user preferences
  app.put("/api/user/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { favoriteGenres, preferredContentTypes, listeningHabit, onboardingCompleted } = req.body;

      const [existing] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      if (existing) {
        const updates: any = {};
        if (favoriteGenres !== undefined) updates.favoriteGenres = favoriteGenres;
        if (preferredContentTypes !== undefined) updates.preferredContentTypes = preferredContentTypes;
        if (listeningHabit !== undefined) updates.listeningHabit = listeningHabit;
        if (onboardingCompleted !== undefined) updates.onboardingCompleted = onboardingCompleted;
        const [updated] = await db.update(userPreferences)
          .set(updates)
          .where(eq(userPreferences.userId, userId))
          .returning();
        res.json(updated);
      } else {
        const [created] = await db.insert(userPreferences).values({
          userId,
          favoriteGenres: favoriteGenres || [],
          preferredContentTypes: preferredContentTypes || [],
          listeningHabit: listeningHabit || null,
          onboardingCompleted: onboardingCompleted || false,
          welcomeBonusGranted: false,
        }).returning();
        res.json(created);
      }
    } catch (error) {
      console.error("Error updating preferences:", error);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // GET /api/user/preferences - Get user preferences
  app.get("/api/user/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      if (!prefs) {
        return res.json({
          userId,
          favoriteGenres: [],
          onboardingCompleted: false,
          welcomeBonusGranted: false,
          premiumTrialEndDate: null,
        });
      }
      res.json(prefs);
    } catch (error) {
      console.error("Error fetching preferences:", error);
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  // GET /api/reviews/public - Public reviews feed
  app.get("/api/reviews/public", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      let publicReviews: any[] = [];
      try {
        publicReviews = await db
          .select({
            id: reviews.id,
            rating: reviews.rating,
            title: reviews.title,
            content: reviews.content,
            createdAt: reviews.createdAt,
            bookId: reviews.bookId,
            userName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, 'Anonymous')`,
            userImage: users.profileImageUrl,
          })
          .from(reviews)
          .innerJoin(users, eq(reviews.userId, users.id))
          .orderBy(desc(reviews.createdAt))
          .limit(limit);
      } catch {
        return res.json([]);
      }

      const reviewsWithBooks = await Promise.all(
        publicReviews.map(async (review) => {
          const book = await storage.getBook(review.bookId);
          return {
            ...review,
            bookTitle: book?.title || "Unknown Book",
            bookAuthor: book?.author || "Unknown Author",
            bookCover: book?.coverImage || null,
          };
        })
      );

      res.json(reviewsWithBooks);
    } catch (error) {
      console.error("Error fetching public reviews:", error);
      res.status(500).json({ message: "Failed to fetch public reviews" });
    }
  });

  // === SEO Routes (must be before Vite middleware) ===

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeJsonLd(obj: object): string {
    return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  }

  function truncate(str: string, len: number): string {
    if (str.length <= len) return str;
    return str.slice(0, len - 3) + "...";
  }

  // GET /book/:id - SEO meta tag page for book detail
  app.get("/book/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);

      if (!book) {
        return res.status(404).send("Book not found");
      }

      const title = escapeHtml(book.title);
      const author = escapeHtml(book.author);
      const description = escapeHtml(truncate(book.description || `Listen to ${book.title} by ${book.author} on AccessiBooks.`, 160));
      const coverImage = escapeHtml(book.coverImage || "");
      const genre = escapeHtml(book.genre || "");
      const host = req.headers.host || "localhost";
      const url = escapeHtml(`https://${host}/book/${id}`);
      const rawDescription = book.description || `Listen to ${book.title} by ${book.author} on AccessiBooks.`;

      const jsonLd = safeJsonLd({
        "@context": "https://schema.org",
        "@type": "Audiobook",
        "name": book.title,
        "author": { "@type": "Person", "name": book.author },
        "description": rawDescription,
        "image": book.coverImage || "",
        "genre": book.genre || "",
      });

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} by ${author} | AccessiBooks</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${coverImage}">
  <meta property="og:type" content="book">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <script type="application/ld+json">${jsonLd}</script>
  <meta http-equiv="refresh" content="0;url=/?book=${encodeURIComponent(id)}">
</head>
<body>
  <p>Redirecting to <a href="/?book=${encodeURIComponent(id)}">${title} by ${author}</a>...</p>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("Error serving book SEO page:", error);
      res.status(500).send("Internal server error");
    }
  });

  // GET /author/:name - SEO meta tag page for author
  app.get("/author/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const decodedName = decodeURIComponent(name);
      const escapedName = escapeHtml(decodedName);
      const host = req.headers.host || "localhost";
      const url = escapeHtml(`https://${host}/author/${encodeURIComponent(decodedName)}`);
      const description = escapeHtml(truncate(`Browse audiobooks and ebooks by ${decodedName} on AccessiBooks. Discover their complete collection.`, 160));

      const jsonLd = safeJsonLd({
        "@context": "https://schema.org",
        "@type": "Person",
        "name": decodedName,
        "url": `https://${host}/author/${encodeURIComponent(decodedName)}`,
      });

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedName} - Author | AccessiBooks</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${escapedName} - Author">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapedName} - Author">
  <meta name="twitter:description" content="${description}">
  <script type="application/ld+json">${jsonLd}</script>
  <meta http-equiv="refresh" content="0;url=/?author=${encodeURIComponent(decodedName)}">
</head>
<body>
  <p>Redirecting to <a href="/?author=${encodeURIComponent(decodedName)}">${escapedName}</a> on AccessiBooks...</p>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("Error serving author SEO page:", error);
      res.status(500).send("Internal server error");
    }
  });

  // GET /sitemap.xml - XML sitemap for search engines
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const host = req.headers.host || "localhost";
      const baseUrl = `https://${host}`;
      const sitemapBooks = await storage.getBooksPaginated({ limit: 1000 });

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(baseUrl)}/</loc>
    <priority>1.0</priority>
  </url>`;

      for (const book of sitemapBooks.data) {
        xml += `
  <url>
    <loc>${escapeHtml(baseUrl)}/book/${encodeURIComponent(book.id)}</loc>
    <priority>0.8</priority>
  </url>`;
      }

      xml += `
</urlset>`;

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.send(xml);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send("Internal server error");
    }
  });

  // ============================================================
  // USER-SUBMITTED CONTENT
  // ============================================================

  // POST /api/submissions - Submit user content
  app.post("/api/submissions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const { title, author, description, contentType, audioUrl, contentUrl, coverImage, genre, language } = req.body;
      if (!title || !author) {
        return res.status(400).json({ message: "Title and author are required" });
      }

      const [submission] = await db.insert(userSubmissions).values({
        userId,
        title,
        author,
        description: description || null,
        contentType: contentType || "audiobook",
        audioUrl: audioUrl || null,
        contentUrl: contentUrl || null,
        coverImage: coverImage || null,
        genre: genre || null,
        language: language || "English",
        status: "pending",
      }).returning();

      res.json(submission);
    } catch (error) {
      console.error("Error creating submission:", error);
      res.status(500).json({ message: "Failed to submit content" });
    }
  });

  // GET /api/submissions - Get user's submissions
  app.get("/api/submissions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const submissions = await db.select().from(userSubmissions)
        .where(eq(userSubmissions.userId, userId))
        .orderBy(desc(userSubmissions.createdAt));
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching submissions:", error);
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // GET /api/submissions/approved - Get all approved submissions (public)
  app.get("/api/submissions/approved", async (_req, res) => {
    try {
      const approved = await db.select().from(userSubmissions)
        .where(eq(userSubmissions.status, "approved"))
        .orderBy(desc(userSubmissions.createdAt))
        .limit(50);

      const books: any[] = approved.map(s => ({
        id: `submission-${s.id}`,
        title: s.title,
        author: s.author,
        narrator: null,
        description: s.description,
        duration: 0,
        coverImage: s.coverImage,
        audioUrl: s.audioUrl,
        contentUrl: s.contentUrl,
        genre: s.genre || "Community",
        publishedYear: new Date().getFullYear(),
        source: "community",
        sourceId: s.id,
        totalTime: null,
        language: s.language || "English",
        contentType: s.contentType || "audiobook",
        isPremium: false,
        pageCount: null,
      }));

      res.json(books);
    } catch (error) {
      console.error("Error fetching approved submissions:", error);
      res.status(500).json({ message: "Failed to fetch community content" });
    }
  });

  // Catalog Seeder API endpoints
  app.get("/api/admin/seed/status", async (_req, res) => {
    try {
      const status = getSeederStatus();
      const counts = await getSeededBookCount();
      res.json({ ...status, dbCounts: counts });
    } catch (error) {
      console.error("Error getting seeder status:", error);
      res.status(500).json({ message: "Failed to get seeder status" });
    }
  });

  app.post("/api/admin/seed/start", async (req, res) => {
    try {
      const sources = req.body.sources || ["librivox", "gutenberg"];
      const result = await startSeeding(sources);
      res.json(result);
    } catch (error) {
      console.error("Error starting seeder:", error);
      res.status(500).json({ message: "Failed to start seeder" });
    }
  });

  app.post("/api/admin/seed/stop", (req, res) => {
    try {
      const result = stopSeeding(req.body.source);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to stop seeder" });
    }
  });

  app.post("/api/admin/seed/reset", (req, res) => {
    try {
      const result = resetSeeder(req.body.source);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to reset seeder" });
    }
  });

  // Trigger the expanded 1M-book seed run for Open Library + Internet Archive
  app.post("/api/admin/seed/expand", async (req, res) => {
    try {
      const result = await resetAndRestartExpandedSources();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to start expanded seed run" });
    }
  });

  app.get("/api/admin/seed/metrics", (_req, res) => {
    try {
      const metrics = getSeederMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to get seeder metrics" });
    }
  });

  app.post("/api/magazines/track-read", async (req: any, res) => {
    try {
      const { magazineId } = req.body;
      if (!magazineId || typeof magazineId !== "string") {
        return res.status(400).json({ message: "magazineId is required" });
      }

      const userId = req.isAuthenticated?.() ? (req.user?.id || req.user?.claims?.sub || null) : null;

      await db.insert(contentAnalytics).values({
        bookId: magazineId,
        authorUserId: "system",
        eventType: "magazine_read",
        listenerId: userId,
        duration: 0,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking magazine read:", error);
      res.status(500).json({ message: "Failed to track magazine read" });
    }
  });

  // === Gift Cards & Gifting System ===

  function generateGiftCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 16; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  const GIFT_SUBSCRIPTION_OPTIONS: Record<string, { tier: string; months: number; priceCents: number; label: string }> = {
    "plus-1": { tier: "plus", months: 1, priceCents: 499, label: "1 Month Plus" },
    "plus-3": { tier: "plus", months: 3, priceCents: 1397, label: "3 Months Plus" },
    "plus-6": { tier: "plus", months: 6, priceCents: 2694, label: "6 Months Plus" },
    "plus-12": { tier: "plus", months: 12, priceCents: 4999, label: "12 Months Plus" },
    "premium-1": { tier: "premium", months: 1, priceCents: 999, label: "1 Month Premium" },
    "premium-3": { tier: "premium", months: 3, priceCents: 2797, label: "3 Months Premium" },
    "premium-6": { tier: "premium", months: 6, priceCents: 5394, label: "6 Months Premium" },
    "premium-12": { tier: "premium", months: 12, priceCents: 9999, label: "12 Months Premium" },
  };

  const GIFT_CREDIT_OPTIONS: Record<number, { priceCents: number; label: string }> = {
    500: { priceCents: 500, label: "$5 Credit" },
    1000: { priceCents: 1000, label: "$10 Credit" },
    2500: { priceCents: 2500, label: "$25 Credit" },
    5000: { priceCents: 5000, label: "$50 Credit" },
  };

  app.post("/api/gifts/purchase", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { type, optionKey, toEmail, message: giftMessage } = req.body;

      if (!type || !["subscription", "credits"].includes(type)) {
        return res.status(400).json({ message: "Invalid gift type" });
      }

      let amountCents = 0;
      let tierGift: string | null = null;
      let monthsGift: number | null = null;
      let description = "";

      if (type === "subscription") {
        const option = GIFT_SUBSCRIPTION_OPTIONS[optionKey];
        if (!option) return res.status(400).json({ message: "Invalid subscription option" });
        amountCents = option.priceCents;
        tierGift = option.tier;
        monthsGift = option.months;
        description = `Gift: ${option.label}`;
      } else {
        const creditAmount = parseInt(optionKey);
        const option = GIFT_CREDIT_OPTIONS[creditAmount];
        if (!option) return res.status(400).json({ message: "Invalid credit amount" });
        amountCents = option.priceCents;
        description = `Gift: ${option.label}`;
      }

      let stripeSessionUrl: string | null = null;
      const code = generateGiftCode();

      if (stripe) {
        try {
          const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{
              price_data: {
                currency: "usd",
                product_data: { name: description },
                unit_amount: amountCents,
              },
              quantity: 1,
            }],
            metadata: { giftCode: code, userId, type, optionKey },
            success_url: `${req.headers.origin || "http://localhost:5000"}/billing?gift=success&code=${code}`,
            cancel_url: `${req.headers.origin || "http://localhost:5000"}/billing?gift=cancelled`,
          });
          stripeSessionUrl = session.url;
        } catch (stripeErr) {
          console.error("[Gifts] Stripe error:", stripeErr);
        }
      }

      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const [giftCard] = await db.insert(giftCards).values({
        code,
        fromUserId: userId,
        toEmail: toEmail || null,
        amountCents,
        balanceRemaining: amountCents,
        type,
        tierGift,
        monthsGift,
        message: giftMessage || null,
        status: "active",
        expiresAt,
        redeemedBy: null,
      }).returning();

      try {
        await recordTransaction({
          userId,
          provider: "stripe",
          type: "gift_card_purchase",
          status: "completed",
          amountCents,
          description,
          metadata: { giftCardId: giftCard.id, code },
        });
      } catch {}

      res.json({
        giftCard,
        code,
        checkoutUrl: stripeSessionUrl,
      });
    } catch (error) {
      console.error("[Gifts] Purchase error:", error);
      res.status(500).json({ message: "Failed to purchase gift card" });
    }
  });

  app.post("/api/gifts/redeem", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Gift code is required" });
      }

      const normalizedCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

      const [card] = await db.select().from(giftCards)
        .where(eq(giftCards.code, normalizedCode))
        .limit(1);

      if (!card) {
        return res.status(404).json({ message: "Invalid gift code" });
      }

      if (card.status === "redeemed") {
        return res.status(400).json({ message: "This gift card has already been redeemed" });
      }

      if (card.status === "expired" || (card.expiresAt && new Date(card.expiresAt) < new Date())) {
        return res.status(400).json({ message: "This gift card has expired" });
      }

      if (card.fromUserId === userId) {
        return res.status(400).json({ message: "You cannot redeem your own gift card" });
      }

      if (card.type === "subscription" && card.tierGift && card.monthsGift) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + card.monthsGift);

        await db.update(users)
          .set({
            subscriptionTier: card.tierGift,
            subscriptionEndDate: endDate,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      } else if (card.type === "credits") {
        await db.update(users)
          .set({
            referralCredits: sql`${users.referralCredits} + ${card.balanceRemaining}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }

      await db.update(giftCards)
        .set({
          status: "redeemed",
          redeemedBy: userId,
          redeemedAt: new Date(),
          balanceRemaining: 0,
        })
        .where(eq(giftCards.id, card.id));

      try {
        await recordTransaction({
          userId,
          provider: "gift_card",
          type: "gift_card_redemption",
          status: "completed",
          amountCents: card.amountCents,
          description: card.type === "subscription"
            ? `Redeemed: ${card.monthsGift} month(s) ${card.tierGift}`
            : `Redeemed: $${(card.amountCents / 100).toFixed(2)} credit`,
          metadata: { giftCardId: card.id, code: card.code },
        });
      } catch {}

      res.json({
        success: true,
        type: card.type,
        tier: card.tierGift,
        months: card.monthsGift,
        amountCents: card.amountCents,
        message: card.type === "subscription"
          ? `Your account has been upgraded to ${card.tierGift} for ${card.monthsGift} month(s)!`
          : `$${(card.amountCents / 100).toFixed(2)} in credits has been added to your account!`,
      });
    } catch (error) {
      console.error("[Gifts] Redeem error:", error);
      res.status(500).json({ message: "Failed to redeem gift card" });
    }
  });

  app.get("/api/gifts/sent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const sent = await db.select().from(giftCards)
        .where(eq(giftCards.fromUserId, userId))
        .orderBy(desc(giftCards.createdAt));

      res.json(sent);
    } catch (error) {
      console.error("[Gifts] Sent error:", error);
      res.status(500).json({ message: "Failed to fetch sent gifts" });
    }
  });

  app.get("/api/gifts/received", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const received = await db.select().from(giftCards)
        .where(eq(giftCards.redeemedBy, userId))
        .orderBy(desc(giftCards.redeemedAt));

      res.json(received);
    } catch (error) {
      console.error("[Gifts] Received error:", error);
      res.status(500).json({ message: "Failed to fetch received gifts" });
    }
  });

  // GET /api/recommendations - Get personalized recommendations for user
  app.get("/api/recommendations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      
      if (!prefs || !prefs.favoriteGenres || prefs.favoriteGenres.length === 0) {
        return res.json([]);
      }

      const results = await storage.getBooksPaginated({
        limit: 200,
      });
      
      const allBooks = results.data || [];
      const favoriteGenres = prefs.favoriteGenres;
      
      // Try to find books matching user's favorite genres
      for (const genre of favoriteGenres) {
        const matches = allBooks.filter(
          (book) => book.genre && book.genre.toLowerCase().includes(genre.toLowerCase())
        );
        if (matches.length >= 3) {
          return res.json(matches.slice(0, 8));
        }
      }

      // If no single genre has 3+ matches, return all genre matches
      const allMatches = allBooks.filter((book) =>
        favoriteGenres.some(
          (g) => book.genre && book.genre.toLowerCase().includes(g.toLowerCase())
        )
      );
      
      if (allMatches.length > 0) {
        return res.json(allMatches.slice(0, 8));
      }

      // Fallback: return popular books
      res.json(allBooks.slice(0, 8));
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // GET /api/social/feed - Get activity feed from followed users
  app.get("/api/social/feed", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const limit = Math.min(parseInt(req.query.limit || "50"), 100);
      
      const activities = await db
        .select()
        .from(activityFeed)
        .innerJoin(sql`users`, sql`users.id = ${activityFeed.userId}`)
        .where(sql`${activityFeed.userId} IN (SELECT following_id FROM user_follows WHERE follower_id = ${userId})`)
        .orderBy(desc(activityFeed.createdAt))
        .limit(limit);

      const formatted = activities.map((row: any) => ({
        id: row.activity_feed.id,
        userId: row.activity_feed.userId,
        username: row.users.firstName && row.users.lastName 
          ? `${row.users.firstName} ${row.users.lastName}`
          : row.users.email || "User",
        activityType: row.activity_feed.activityType,
        bookId: row.activity_feed.bookId,
        bookTitle: row.activity_feed.bookTitle,
        createdAt: row.activity_feed.createdAt,
      }));

      res.json(formatted);
    } catch (error) {
      console.error("Error fetching social feed:", error);
      res.status(500).json({ message: "Failed to fetch feed" });
    }
  });

  // GET /api/social/following/me - Get list of users you follow
  app.get("/api/social/following/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const following = await db
        .select({
          userId: sql<string>`users.id`,
          firstName: sql<string | null>`users.first_name`,
          lastName: sql<string | null>`users.last_name`,
          email: sql<string | null>`users.email`,
          profileImageUrl: sql<string | null>`users.profile_image_url`,
        })
        .from(sql`user_follows`)
        .innerJoin(sql`users`, sql`users.id = user_follows.following_id`)
        .where(sql`user_follows.follower_id = ${userId}`);

      const formatted = following.map((user: any) => ({
        id: user.userId,
        name: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}`
          : user.email || "User",
        email: user.email,
        profileImageUrl: user.profileImageUrl,
      }));

      res.json(formatted);
    } catch (error) {
      console.error("Error fetching following list:", error);
      res.status(500).json({ message: "Failed to fetch following" });
    }
  });

  // GET /api/clubs - Get all reading clubs
  app.get("/api/clubs", async (req: any, res) => {
    try {
      const clubs = await db
        .select()
        .from(readingClubs)
        .where(eq(readingClubs.isPublic, true))
        .orderBy(desc(readingClubs.createdAt));

      res.json(clubs);
    } catch (error) {
      console.error("Error fetching clubs:", error);
      res.status(500).json({ message: "Failed to fetch clubs" });
    }
  });

  // POST /api/clubs - Create a new reading club
  app.post("/api/clubs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { name, description, currentBookId, isPublic = true } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Club name is required" });
      }

      const [club] = await db.insert(readingClubs).values({
        name,
        description: description || null,
        creatorId: userId,
        currentBookId: currentBookId || null,
        currentBookTitle: null,
        isPublic,
      }).returning();

      // Add creator as member
      await db.insert(readingClubMembers).values({
        clubId: club.id,
        userId,
      });

      res.json(club);
    } catch (error) {
      console.error("Error creating club:", error);
      res.status(500).json({ message: "Failed to create club" });
    }
  });

  // POST /api/clubs/:id/join - Join a reading club
  app.post("/api/clubs/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { id: clubId } = req.params;

      // Check if already a member
      const existing = await db
        .select()
        .from(readingClubMembers)
        .where(and(eq(readingClubMembers.clubId, clubId), eq(readingClubMembers.userId, userId)))
        .limit(1);

      if (existing.length > 0) {
        return res.status(400).json({ message: "Already a member of this club" });
      }

      await db.insert(readingClubMembers).values({
        clubId,
        userId,
      });

      // Update member count
      const memberCount = await db
        .select({ count: count() })
        .from(readingClubMembers)
        .where(eq(readingClubMembers.clubId, clubId));

      await db.update(readingClubs)
        .set({ memberCount: memberCount[0]?.count || 1 })
        .where(eq(readingClubs.id, clubId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error joining club:", error);
      res.status(500).json({ message: "Failed to join club" });
    }
  });

  // GET /api/notifications - Get recent notifications for authenticated user
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const notifs = await db.select().from(notificationLog)
        .where(eq(notificationLog.userId, userId))
        .orderBy(desc(notificationLog.sentAt))
        .limit(50);

      const formatted = notifs.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        url: n.url || null,
        sentAt: n.sentAt ? new Date(n.sentAt).toISOString() : new Date().toISOString(),
        clicked: n.clicked === 1 ? 1 : 0,
      }));

      res.json(formatted);
    } catch (error) {
      console.error("[Notifications] Get error:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // PATCH /api/notifications/:id/read - Mark a notification as read
  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { id } = req.params;
      
      const [notif] = await db.select().from(notificationLog)
        .where(and(eq(notificationLog.id, id), eq(notificationLog.userId, userId)));

      if (!notif) return res.status(404).json({ message: "Notification not found" });

      await db.update(notificationLog)
        .set({ clicked: 1 })
        .where(eq(notificationLog.id, id));

      res.json({ success: true });
    } catch (error) {
      console.error("[Notifications] Mark read error:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // POST /api/notifications/read-all - Mark all notifications as read
  app.post("/api/notifications/read-all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      await db.update(notificationLog)
        .set({ clicked: 1 })
        .where(and(eq(notificationLog.userId, userId), eq(notificationLog.clicked, 0)));

      res.json({ success: true });
    } catch (error) {
      console.error("[Notifications] Mark all read error:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // Family Plan Routes
  app.post("/api/family/create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const existing = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId)).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ message: "Already in a family plan" });
      }

      const [account] = await db.insert(familyAccounts).values({
        ownerId: userId,
        planName: "Family Plan",
        maxMembers: 5,
        amountCents: 799,
        isActive: true,
      }).returning();

      await db.insert(familyMembers).values({
        familyId: account.id,
        userId,
        role: "owner",
      });

      res.json({ success: true, familyId: account.id });
    } catch (error) {
      console.error("Error creating family plan:", error);
      res.status(500).json({ message: "Failed to create family plan" });
    }
  });

  app.get("/api/family", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const membership = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId)).limit(1);
      if (membership.length === 0) {
        return res.json({ account: null, members: [] });
      }

      const familyId = membership[0].familyId;
      const [account] = await db.select().from(familyAccounts).where(eq(familyAccounts.id, familyId));
      if (!account) {
        return res.json({ account: null, members: [] });
      }

      const allMembers = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
      const memberDetails = await Promise.all(allMembers.map(async (m) => {
        const [user] = await db.select({ id: users.id, firstName: users.firstName, email: users.email }).from(users).where(eq(users.id, m.userId)).limit(1);
        return {
          id: m.id,
          userId: m.userId,
          role: m.role,
          user: user ? { username: user.firstName || `User ${m.userId.substring(0, 8)}`, email: user.email || "" } : { username: `User ${m.userId.substring(0, 8)}`, email: "" },
        };
      }));

      res.json({ account, members: memberDetails });
    } catch (error) {
      console.error("Error fetching family:", error);
      res.status(500).json({ message: "Failed to fetch family" });
    }
  });

  app.post("/api/family/invite", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });

      const membership = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId)).limit(1);
      if (membership.length === 0) return res.status(404).json({ message: "Family not found" });

      const familyId = membership[0].familyId;
      const [account] = await db.select().from(familyAccounts).where(eq(familyAccounts.id, familyId));
      if (!account) return res.status(404).json({ message: "Family not found" });

      const currentMembers = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
      if (currentMembers.length >= account.maxMembers) {
        return res.status(400).json({ message: "Family plan is full" });
      }

      const invitedUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const invitedUserId = invitedUser.length > 0 ? invitedUser[0].id : `pending_${Date.now()}`;

      await db.insert(familyMembers).values({
        familyId,
        userId: invitedUserId,
        role: "member",
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error inviting member:", error);
      res.status(500).json({ message: "Failed to send invitation" });
    }
  });

  app.delete("/api/family/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { memberId } = req.params;

      const result = await db.delete(familyMembers).where(eq(familyMembers.id, memberId)).returning();
      if (result.length === 0) {
        return res.status(404).json({ message: "Member not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // Admin Moderation Routes
  app.get("/api/admin/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const reports = await db.select().from(contentReports).orderBy(desc(contentReports.createdAt));
      const enriched = await Promise.all(reports.map(async (report) => {
        const [reporter] = await db.select({ id: users.id, firstName: users.firstName, email: users.email }).from(users).where(eq(users.id, report.reporterId)).limit(1);
        return {
          ...report,
          reporter: reporter ? { id: reporter.id, username: reporter.firstName || `Reporter ${report.reporterId.substring(0, 8)}`, email: reporter.email || "" } : { id: report.reporterId, username: `Reporter ${report.reporterId.substring(0, 8)}`, email: "" },
        };
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.patch("/api/admin/reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { id } = req.params;
      const { status } = req.body;

      if (!["approved", "removed", "dismissed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const result = await db.update(contentReports)
        .set({ status, reviewedBy: userId, reviewedAt: new Date() })
        .where(eq(contentReports.id, id))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating report:", error);
      res.status(500).json({ message: "Failed to update report" });
    }
  });

  // Admin Health Dashboard
  app.get("/api/admin/health", async (_req, res) => {
    try {
      // Get total books count
      const bookCount = await db.select({ count: count() }).from(books);
      const totalBooks = bookCount[0]?.count || 0;

      // Get total users count
      const userCount = await db.select({ count: count() }).from(users);
      const totalUsers = userCount[0]?.count || 0;

      // Get memory usage
      const memoryUsage = process.memoryUsage();

      // Get uptime in seconds
      const uptime = process.uptime();

      // Get seeder status
      const seederStatus = getSeederStatus();
      const seededCounts = await getSeededBookCount();

      // Transform seeder status to include totalSeeded (filter out isRunning)
      const seederStatusWithCounts = Object.entries(seederStatus)
        .filter(([source]) => source !== "isRunning")
        .map(([source, sourceStatus]: any) => ({
          source: source.charAt(0).toUpperCase() + source.slice(1),
          status: sourceStatus.status,
          totalSeeded: seededCounts[source] || 0,
        }));

      res.json({
        totalBooks,
        totalUsers,
        memoryUsage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        },
        uptime: Math.floor(uptime),
        seederStatus: seederStatusWithCounts,
      });
    } catch (error) {
      console.error("Error getting health status:", error);
      res.status(500).json({ message: "Failed to get health status" });
    }
  });

  // Churn Risk Dashboard
  app.get("/api/admin/churn-risk", async (_req, res) => {
    try {
      // Get all users first
      const allUsers = await db.select({ id: users.id, firstName: users.firstName }).from(users);
      
      // For each user, get their listening history in the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = [];
      for (const user of allUsers) {
        const recentSessions = await db
          .select()
          .from(listeningHistory)
          .where(and(
            eq(listeningHistory.userId, user.id),
            sql`${listeningHistory.lastPlayedAt} >= ${thirtyDaysAgo}::timestamp`
          ));

        const sessionCount = recentSessions.length;
        const lastActive = recentSessions.length > 0
          ? recentSessions[recentSessions.length - 1].lastPlayedAt
          : null;

        if (sessionCount < 5) { // Only include at-risk users
          const daysSinceActive = lastActive
            ? Math.floor((Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24))
            : 30;

          let churnRisk = "low";
          if (daysSinceActive > 20) churnRisk = "high";
          else if (daysSinceActive > 10) churnRisk = "medium";

          result.push({
            userId: user.id,
            username: user.firstName || "Unknown",
            lastActiveAt: lastActive ? new Date(lastActive).toISOString() : new Date().toISOString(),
            churnRisk,
            totalSessionsLast30d: sessionCount,
            winbackOfferSent: false,
          });
        }
      }

      // Sort by risk level (high first)
      result.sort((a, b) => {
        const riskOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return riskOrder[a.churnRisk] - riskOrder[b.churnRisk];
      });

      res.json(result);
    } catch (error) {
      console.error("Error getting churn risk data:", error);
      res.status(500).json({ message: "Failed to get churn risk data" });
    }
  });

  // ─── AI Accessibility Features ────────────────────────────────────────────

  // In-memory caches for AI comprehension content (avoids repeat OpenAI calls)
  const chapterPreviewCache = new Map<string, string>();
  const chapterCheckinCache = new Map<string, { questions: { question: string; options: string[]; correct: number }[] }>();
  const pictureCheckinCache = new Map<string, { question: string; options: string[] }>();

  app.post("/api/ai/chapter-preview", async (req: any, res) => {
    try {
      const { chapterText, title, bookId, chapterIndex } = req.body as {
        chapterText?: string;
        title?: string;
        bookId?: string;
        chapterIndex?: number;
      };
      if (!chapterText || typeof chapterText !== "string" || chapterText.trim().length === 0) {
        return res.status(400).json({ message: "chapterText is required" });
      }

      const cacheKey = bookId && chapterIndex !== undefined ? `${bookId}:${chapterIndex}` : "";
      if (cacheKey && chapterPreviewCache.has(cacheKey)) {
        return res.json({ preview: chapterPreviewCache.get(cacheKey), fromCache: true });
      }

      const { openai } = await import("./replit_integrations/image/client");
      const excerpt = chapterText.slice(0, 1500);
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You help readers with learning disabilities prepare for each chapter. Write a 2-3 sentence plain-English preview of what happens in the passage below. Use very simple words. Start with 'In this part,' or 'In this chapter,'. No spoilers beyond the text given.",
          },
          {
            role: "user",
            content: `${title ? `Book: ${title}\n\n` : ""}Text excerpt:\n${excerpt}`,
          },
        ],
        max_tokens: 120,
      });
      const preview = completion.choices[0]?.message?.content?.trim() ?? "Get ready to read the next part of the story.";
      if (cacheKey) chapterPreviewCache.set(cacheKey, preview);
      res.json({ preview, fromCache: false });
    } catch (err) {
      console.error("chapter-preview error:", err);
      res.status(500).json({ message: "AI preview generation failed" });
    }
  });

  app.post("/api/ai/chapter-picture-checkin", async (req: any, res) => {
    try {
      const { chapterText, title, bookId, chapterIndex } = req.body as {
        chapterText?: string;
        title?: string;
        bookId?: string;
        chapterIndex?: number;
      };
      if (!chapterText || typeof chapterText !== "string" || chapterText.trim().length === 0) {
        return res.status(400).json({ message: "chapterText is required" });
      }

      const cacheKey = bookId && chapterIndex !== undefined ? `pic:${bookId}:${chapterIndex}` : "";
      if (cacheKey && pictureCheckinCache.has(cacheKey)) {
        return res.json({ ...pictureCheckinCache.get(cacheKey)!, fromCache: true });
      }

      const { openai } = await import("./replit_integrations/image/client");
      const excerpt = chapterText.slice(0, 1000);
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              'You help readers with learning disabilities reflect on what they just read. Generate ONE simple reflective question and 2-3 single-word answer options. The options should be concrete nouns, emotions, or simple concepts that can be illustrated with a picture symbol. Respond ONLY with valid JSON: {"question": "...", "options": ["word1", "word2", "word3"]}. Keep the question very simple. Do NOT include correct/wrong answers — this is not a test.',
          },
          {
            role: "user",
            content: `${title ? `Book: ${title}\n\n` : ""}Text excerpt:\n${excerpt}`,
          },
        ],
        max_tokens: 120,
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: { question: string; options: string[] };
      try {
        parsed = JSON.parse(raw);
        if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length < 2) {
          parsed = { question: "What was this part of the story about?", options: ["adventure", "friendship", "mystery"] };
        }
      } catch {
        parsed = { question: "What was this part of the story about?", options: ["adventure", "friendship", "mystery"] };
      }
      if (cacheKey) pictureCheckinCache.set(cacheKey, parsed);
      res.json(parsed);
    } catch (err) {
      console.error("chapter-picture-checkin error:", err);
      res.status(500).json({ message: "AI picture check-in failed" });
    }
  });

  app.post("/api/ai/explain-passage", async (req: any, res) => {
    try {
      const { passage, context } = req.body as { passage?: string; context?: string };
      if (!passage || typeof passage !== "string" || passage.trim().length === 0) {
        return res.status(400).json({ message: "passage is required" });
      }
      const { openai } = await import("./replit_integrations/image/client");
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly reading assistant that helps people with reading disabilities understand text. Explain the given passage in clear, simple language. Be concise (2–4 sentences). Avoid jargon.",
          },
          {
            role: "user",
            content: context
              ? `Book context: ${context.slice(0, 200)}\n\nPassage to explain: "${passage}"`
              : `Explain this passage: "${passage}"`,
          },
        ],
        max_tokens: 200,
      });
      const explanation = completion.choices[0]?.message?.content ?? "Unable to generate explanation.";
      res.json({ explanation });
    } catch (err) {
      console.error("explain-passage error:", err);
      res.status(500).json({ message: "AI explanation failed" });
    }
  });

  app.post("/api/ai/chapter-checkin", async (req: any, res) => {
    try {
      const { chapterText, title, bookId, chapterIndex } = req.body as {
        chapterText?: string;
        title?: string;
        bookId?: string;
        chapterIndex?: number;
      };
      if (!chapterText || typeof chapterText !== "string" || chapterText.trim().length === 0) {
        return res.status(400).json({ message: "chapterText is required" });
      }

      const cacheKey = bookId && chapterIndex !== undefined ? `${bookId}:${chapterIndex}` : "";
      if (cacheKey && chapterCheckinCache.has(cacheKey)) {
        return res.json({ ...chapterCheckinCache.get(cacheKey)!, fromCache: true });
      }

      const { openai } = await import("./replit_integrations/image/client");
      const excerpt = chapterText.slice(0, 2000);
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              'You are a comprehension quiz generator. Given a text excerpt, generate 3 multiple-choice questions to check understanding. Respond ONLY with valid JSON: {"questions": [{"question": "...", "options": ["A", "B", "C", "D"], "correct": 0}]}. Use 0-based index for correct answer.',
          },
          {
            role: "user",
            content: `${title ? `Book: ${title}\n\n` : ""}Text excerpt:\n${excerpt}`,
          },
        ],
        max_tokens: 600,
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: { questions: { question: string; options: string[]; correct: number }[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { questions: [] };
      }
      if (cacheKey && parsed.questions?.length > 0) chapterCheckinCache.set(cacheKey, parsed);
      res.json(parsed);
    } catch (err) {
      console.error("chapter-checkin error:", err);
      res.status(500).json({ message: "AI comprehension quiz failed" });
    }
  });

  app.post("/api/ai/image-description", async (req: any, res) => {
    try {
      const { imageUrl, bookContext } = req.body as { imageUrl?: string; bookContext?: string };
      if (!imageUrl || typeof imageUrl !== "string") {
        return res.status(400).json({ message: "imageUrl is required" });
      }
      const { openai } = await import("./replit_integrations/image/client");
      const visionMessages: Parameters<typeof openai.chat.completions.create>[0]["messages"] = [
        {
          role: "user" as const,
          content: `Describe this image (URL: ${imageUrl}) in 1–2 sentences for a visually impaired reader. Be specific and factual.${bookContext ? ` Context: ${bookContext}` : ""}`,
        },
      ];
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: visionMessages,
        max_tokens: 120,
      });
      const description = completion.choices[0]?.message?.content ?? "Image description unavailable.";
      res.json({ description });
    } catch (err) {
      console.error("image-description error:", err);
      res.status(500).json({ message: "Image description failed" });
    }
  });

  app.get("/api/books/:id/daisy", async (req: any, res) => {
    try {
      const bookId = req.params.id as string;
      const [book] = await db.select().from(books).where(eq(books.id, bookId));
      if (!book) return res.status(404).json({ message: "Book not found" });

      const chapters: { id: string; title: string; text: string }[] = [];
      if (book.chapters && Array.isArray(book.chapters)) {
        (book.chapters as { title?: string; content?: string }[]).forEach((ch, i) => {
          chapters.push({
            id: `ch${i + 1}`,
            title: ch.title ?? `Chapter ${i + 1}`,
            text: ch.content ?? "",
          });
        });
      } else {
        chapters.push({
          id: "ch1",
          title: book.title ?? "Full Text",
          text: (book as any).content ?? book.description ?? "",
        });
      }

      const navEntries = chapters.map((ch) => `  <navPoint id="${ch.id}"><navLabel><text>${ch.title}</text></navLabel><content src="${ch.id}.html"/></navPoint>`).join("\n");
      const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${book.title ?? "Untitled"}</text></docTitle>
  <navMap>
${navEntries}
  </navMap>
</ncx>`;

      const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${book.title ?? "Untitled"}</dc:title>
    <dc:creator>${book.author ?? "Unknown"}</dc:creator>
    <dc:identifier id="bookid">${bookId}</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="navigation.ncx" media-type="application/x-dtbncx+xml"/>
    ${chapters.map(ch => `<item id="${ch.id}" href="${ch.id}.html" media-type="application/xhtml+xml"/>`).join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${chapters.map(ch => `<itemref idref="${ch.id}"/>`).join("\n    ")}
  </spine>
</package>`;

      const chapterHtmlFiles = chapters.map((ch) => ({
        name: `${ch.id}.html`,
        content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><title>${ch.title}</title></head>
<body><h1>${ch.title}</h1><p>${ch.text.replace(/\n\n/g, "</p><p>")}</p></body>
</html>`,
      }));

      res.json({
        bookId,
        title: book.title,
        author: book.author,
        format: "DAISY 2.02",
        files: [
          { name: "content.opf", content: opfXml },
          { name: "navigation.ncx", content: ncxXml },
          ...chapterHtmlFiles,
        ],
      });
    } catch (err) {
      console.error("DAISY export error:", err);
      res.status(500).json({ message: "DAISY export failed" });
    }
  });

  // ─── Symbol-Supported Text Endpoints ─────────────────────────────────────

  // GET /api/symbols/:word — proxy ARASAAC pictogram search with server-side cache
  app.get("/api/symbols/:word", async (req, res) => {
    const word = (req.params.word ?? "").toLowerCase().replace(/[^a-z\s-]/g, "").trim().slice(0, 50);
    if (!word) return res.json({ url: null, id: null });

    const cacheKey = `arasaac:${word}`;
    const cached = apiCache.get<{ url: string | null; id: number | null }>(cacheKey);
    if (cached) return res.json(cached);

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `https://api.arasaac.org/v1/pictograms/en/search/${encodeURIComponent(word)}`,
        { signal: controller.signal }
      );
      clearTimeout(tid);

      if (!resp.ok) {
        const empty = { url: null, id: null };
        apiCache.set(cacheKey, empty, CACHE_TTL.METADATA);
        return res.json(empty);
      }

      const data = await resp.json() as Array<{ _id: number }>;
      if (!Array.isArray(data) || !data.length) {
        const empty = { url: null, id: null };
        apiCache.set(cacheKey, empty, CACHE_TTL.METADATA);
        return res.json(empty);
      }

      const id = data[0]._id;
      const url = `https://static.arasaac.org/pictograms/${id}/${id}_500.png`;
      const result = { url, id };
      apiCache.set(cacheKey, result, 24 * 60 * 60 * 1000);
      return res.json(result);
    } catch {
      return res.json({ url: null, id: null });
    }
  });

  // POST /api/symbols/keywords — OpenAI-based keyword extraction (nouns/verbs/adjectives) for a page of text
  app.post("/api/symbols/keywords", async (req, res) => {
    const { text } = req.body as { text?: string };
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.json({ keywords: [] });
    }
    const excerpt = text.slice(0, 1200);
    const hashKey = `keywords:${excerpt.slice(0, 80).replace(/\W+/g, "_")}`;
    const cached = apiCache.get<{ keywords: string[] }>(hashKey);
    if (cached) return res.json(cached);

    try {
      const { openai } = await import("./replit_integrations/image/client");
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              'Extract the 12–18 most important concrete nouns, action verbs, and descriptive adjectives from the given text. These will have pictograms shown above them to support low-literacy readers. Respond ONLY with valid JSON: {"keywords": ["word1","word2",...]}. Lowercase only, no punctuation, no duplicates, no stop words.',
          },
          { role: "user", content: excerpt },
        ],
        max_tokens: 200,
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: { keywords: string[] };
      try {
        parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.keywords)) parsed = { keywords: [] };
      } catch {
        parsed = { keywords: [] };
      }
      parsed.keywords = parsed.keywords.slice(0, 20).map(w => w.toLowerCase().replace(/[^a-z\s-]/g, "").trim()).filter(Boolean);
      apiCache.set(hashKey, parsed, 24 * 60 * 60 * 1000);
      return res.json(parsed);
    } catch (err) {
      console.error("keywords endpoint error:", err);
      return res.json({ keywords: [] });
    }
  });

  // POST /api/symbols/define — return a plain-English word definition (free dictionary API, then null)
  app.post("/api/symbols/define", async (req, res) => {
    const { word } = req.body as { word?: string };
    if (!word || typeof word !== "string") {
      return res.status(400).json({ message: "word is required" });
    }
    const clean = word.toLowerCase().replace(/[^a-z\s-]/g, "").trim().slice(0, 50);
    if (!clean) return res.json({ definition: null });

    const cacheKey = `definition:${clean}`;
    const cached = apiCache.get<{ definition: string | null }>(cacheKey);
    if (cached) return res.json(cached);

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4000);
      const dictRes = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`,
        { signal: controller.signal }
      );
      clearTimeout(tid);

      if (dictRes.ok) {
        const data = await dictRes.json() as Array<{
          meanings: Array<{ definitions: Array<{ definition: string }> }>;
        }>;
        const def = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
        if (def) {
          const result = { definition: def };
          apiCache.set(cacheKey, result, 24 * 60 * 60 * 1000);
          return res.json(result);
        }
      }
    } catch {}

    const empty = { definition: null };
    apiCache.set(cacheKey, empty, CACHE_TTL.METADATA);
    return res.json(empty);
  });

  registerListeningPartyRoutes(app);
  registerStreamingQueueRoutes(app);

  // ── Personal Word Bank ─────────────────────────────────────────────────────
  app.get("/api/word-bank", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const entries = await storage.getWordBankEntries(userId);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch word bank" });
    }
  });

  app.post("/api/word-bank", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { word, definition: clientDefinition, imageUrl: clientImageUrl } = req.body;
      if (!word || typeof word !== "string") {
        return res.status(400).json({ message: "word is required" });
      }
      const clean = word.trim().toLowerCase().slice(0, 50);

      // Server-side enrichment: look up definition and image when not supplied by client
      let definition: string | null = clientDefinition ?? null;
      let imageUrl: string | null = clientImageUrl ?? null;

      const enrichmentCacheKey = `wb-enrich:${clean}`;
      const enrichmentCached = apiCache.get<{ definition: string | null; imageUrl: string | null }>(enrichmentCacheKey);
      if (enrichmentCached) {
        if (!definition) definition = enrichmentCached.definition;
        if (!imageUrl) imageUrl = enrichmentCached.imageUrl;
      } else {
        // Fetch definition — free dictionary API first, OpenAI fallback
        if (!definition) {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 3000);
            const dictRes = await fetch(
              `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`,
              { signal: ctrl.signal }
            );
            clearTimeout(tid);
            if (dictRes.ok) {
              const data = await dictRes.json() as Array<{
                meanings: Array<{ definitions: Array<{ definition: string }> }>;
              }>;
              definition = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition ?? null;
            }
          } catch {}
        }

        // OpenAI fallback: generate a plain-English definition if dictionary lookup gave nothing
        if (!definition) {
          try {
            const { openai } = await import("./replit_integrations/image/client");
            const completion = await openai.chat.completions.create({
              model: "gpt-4.1-mini",
              messages: [
                {
                  role: "system",
                  content: "You are a vocabulary helper for low-literacy readers. When given a single word, provide one short, plain-English definition in 15 words or fewer. Reply with ONLY the definition text, no punctuation outside the sentence.",
                },
                { role: "user", content: clean },
              ],
              max_tokens: 60,
            });
            const aiDef = completion.choices[0]?.message?.content?.trim();
            if (aiDef && aiDef.length > 2) definition = aiDef;
          } catch {}
        }

        // Fetch ARASAAC pictogram image when absent
        if (!imageUrl) {
          try {
            const ctrl2 = new AbortController();
            const tid2 = setTimeout(() => ctrl2.abort(), 3000);
            const picRes = await fetch(
              `https://api.arasaac.org/v1/pictograms/en/search/${encodeURIComponent(clean)}`,
              { signal: ctrl2.signal }
            );
            clearTimeout(tid2);
            if (picRes.ok) {
              const picData = await picRes.json() as Array<{ _id: number }>;
              if (Array.isArray(picData) && picData.length > 0) {
                const id = picData[0]._id;
                imageUrl = `https://static.arasaac.org/pictograms/${id}/${id}_500.png`;
              }
            }
          } catch {}
        }

        apiCache.set(enrichmentCacheKey, { definition, imageUrl }, 24 * 60 * 60 * 1000);
      }

      const { entry, isNew } = await storage.addWordBankEntry(userId, { word: clean, definition, imageUrl });

      // Milestone detection: only for newly inserted entries, not duplicates
      let milestone: number | null = null;
      if (isNew) {
        const MILESTONES = [1, 5, 10, 25, 50];
        const count = await storage.getWordBankCount(userId);
        milestone = MILESTONES.includes(count) ? count : null;
      }

      res.status(201).json({ entry, milestone, alreadySaved: !isNew });
    } catch (error) {
      res.status(500).json({ message: "Failed to add word to bank" });
    }
  });

  // === SIGN LANGUAGE GLOSSARY ===

  // In-memory cache: key = "<lang>:<word>", value = { embedUrl, source } | null
  const signCache = new Map<string, { embedUrl: string; source: string } | null>();

  // GET /api/sign-language/:word?lang=BSL|ASL
  // Returns an embeddable URL for a sign language video clip, or null if not found.
  // BSL: uses SignBSL.com search (iframe-embeddable /definition/ pages)
  // ASL: uses HandSpeak embed pattern
  app.get("/api/sign-language/:word", async (req, res) => {
    const word = (req.params.word ?? "").toLowerCase().replace(/[^a-z'-]/g, "").trim();
    const lang = (req.query.lang as string ?? "ASL").toUpperCase() === "BSL" ? "BSL" : "ASL";

    if (!word || word.length < 2) {
      return res.json({ embedUrl: null, source: null });
    }

    const cacheKey = `${lang}:${word}`;
    if (signCache.has(cacheKey)) {
      return res.json(signCache.get(cacheKey));
    }

    try {
      let result: { embedUrl: string; source: string } | null = null;

      if (lang === "BSL") {
        // SignBSL.com provides public, embeddable definition pages
        // Pattern: https://www.signbsl.com/sign/<word>
        // We verify existence by fetching the page (HEAD request)
        const url = `https://www.signbsl.com/sign/${encodeURIComponent(word)}`;
        try {
          const check = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
          if (check.ok && !check.url.includes("not-found") && !check.url.includes("404")) {
            result = { embedUrl: url, source: "SignBSL" };
          }
        } catch {
          // Network error — treat as not found
        }
      } else {
        // ASL: HandSpeak video embed pattern
        // HandSpeak provides direct video files at: https://www.handspeak.com/word/search/index.php?id=<slug>
        // But for embedding we link to their public word page
        const url = `https://www.handspeak.com/word/search/index.php?id=${encodeURIComponent(word)}`;
        try {
          const check = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
          if (check.ok) {
            result = { embedUrl: url, source: "HandSpeak" };
          }
        } catch {
          // Network error — treat as not found
        }
      }

      // Cache for the process lifetime to minimise API calls
      signCache.set(cacheKey, result);
      res.json(result ?? { embedUrl: null, source: null });
    } catch (error) {
      res.json({ embedUrl: null, source: null });
    }
  });

  // === BOOK COMPLETION CERTIFICATES ===

  // POST /api/completions — record book completion (uses existing listeningHistory.completedAt)
  app.post("/api/completions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { bookId, bookTitle, bookAuthor, bookCover, totalDuration } = req.body;
      if (!bookId || !bookTitle) {
        return res.status(400).json({ message: "bookId and bookTitle are required" });
      }

      // Find existing listening history row for this user+book
      const rows = await db.select()
        .from(listeningHistory)
        .where(and(eq(listeningHistory.userId, userId), eq(listeningHistory.bookId, bookId)))
        .orderBy(desc(listeningHistory.lastPlayedAt))
        .limit(1);

      if (rows.length > 0) {
        const existing = rows[0];
        if (!existing.completedAt) {
          await db.update(listeningHistory)
            .set({ completedAt: new Date() })
            .where(eq(listeningHistory.id, existing.id));
        }
      } else {
        await db.insert(listeningHistory).values({
          userId,
          bookId,
          bookTitle,
          bookAuthor: bookAuthor || null,
          bookCover: bookCover || null,
          currentTime: 0,
          totalDuration: totalDuration || null,
          completedAt: new Date(),
          playCount: 1,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[Completions] Failed to record:", error);
      res.status(500).json({ message: "Failed to record completion" });
    }
  });

  // GET /api/completions — get all completed books for current user
  app.get("/api/completions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const completed = await db.select()
        .from(listeningHistory)
        .where(and(
          eq(listeningHistory.userId, userId),
          sql`${listeningHistory.completedAt} IS NOT NULL`,
        ))
        .orderBy(desc(listeningHistory.completedAt));

      res.json(completed);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch completions" });
    }
  });

  // GET /api/completions/next-read/:bookId — single "read this next" recommendation
  app.get("/api/completions/next-read/:bookId", async (req: any, res) => {
    try {
      const { bookId } = req.params;
      const userId = req.user?.id || req.user?.claims?.sub;

      // Use storage.getBooks() to avoid selecting columns that may not exist in DB (e.g. reading_level)
      const allBooks = await storage.getBooks();
      const sourceBook = allBooks.find(b => b.id === bookId);

      // Get completed book IDs to exclude
      const excludeIds = new Set<string>([bookId]);
      if (userId) {
        try {
          const completedRows = await db.select({ bookId: listeningHistory.bookId })
            .from(listeningHistory)
            .where(and(
              eq(listeningHistory.userId, userId),
              sql`${listeningHistory.completedAt} IS NOT NULL`,
            ));
          completedRows.forEach(r => excludeIds.add(r.bookId));
        } catch {}
      }

      let candidate: typeof allBooks[0] | undefined;

      if (sourceBook?.genre) {
        // Same genre, prefer matching reading level
        const sameGenre = allBooks.filter(b => b.genre === sourceBook.genre && !excludeIds.has(b.id));
        // Shuffle for variety
        const shuffled = [...sameGenre].sort(() => Math.random() - 0.5);
        // Prefer same reading level, fallback to any in genre
        candidate = shuffled.find(b => b.readingLevel === sourceBook.readingLevel)
          ?? shuffled[0];
      }

      if (!candidate) {
        // Fallback: random book not yet completed
        const others = allBooks.filter(b => !excludeIds.has(b.id));
        const shuffled = [...others].sort(() => Math.random() - 0.5);
        candidate = shuffled[0];
      }

      if (!candidate) return res.json(null);

      res.json({
        id: candidate.id,
        title: candidate.title,
        author: candidate.author,
        coverImage: candidate.coverImage,
        genre: candidate.genre,
        contentType: candidate.contentType,
      });
    } catch (error) {
      console.error("[NextRead] Error:", error);
      res.status(500).json({ message: "Failed to fetch recommendation" });
    }
  });

  app.delete("/api/word-bank/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      await storage.removeWordBankEntry(userId, id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove word from bank" });
    }
  });

  const httpServer = createServer(app);
  setupListeningPartyWS(httpServer);
  return httpServer;
}
