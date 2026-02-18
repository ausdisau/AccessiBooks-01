import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { z } from "zod";
import { referrals, userPreferences, userXp, userAchievements, listeningHistory, users, reviews, books, userSubmissions } from "@shared/schema";
import { eq, desc, sql, count, sum } from "drizzle-orm";
import { setupMultiAuth, isAuthenticated } from "./multiAuth";
import { setupAuth0Routes, isAuth0Configured } from "./auth0";
import { getUncachableSpotifyClient, isSpotifyConnected } from "./spotifyClient";
import { getSeederStatus, startSeeding, stopSeeding, resetSeeder, getSeededBookCount } from "./catalogSeeder";
import { registerSelfPublishingRoutes } from "./selfPublishing";
import { registerPodcastRoutes } from "./podcastIngestion";
import { registerPushNotificationRoutes } from "./pushNotifications";
import { registerAdMediationRoutes } from "./adMediation";
import { registerSelfServeAdRoutes } from "./selfServeAds";
import { registerBillingRoutes, recordTransaction, updateTransactionStatus } from "./billing";
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
import { stripe, PREMIUM_PRICE_MONTHLY, SUBSCRIPTION_CONFIG, DONATION_CONFIG, DONATION_AMOUNTS, verifyWebhookSignature } from "./stripe";
import { rateLimitMiddleware, drmGuardMiddleware, premiumContentMiddleware, generateSignedStreamUrl } from "./drm";
import { createPaypalOrder, capturePaypalOrder, loadPaypalDefault, isPayPalEnabled } from "./paypal";
import { createCoinbaseCharge, getCoinbaseCharge, handleCoinbaseWebhook, getPaymentMethods, isCoinbaseEnabled } from "./coinbase";
import { searchAmazonAudiobooks, getAmazonAudiobook, isAmazonEnabled } from "./amazon";
import { isSoundCloudEnabled, searchSoundCloudTracks, getSoundCloudTrack, getSoundCloudUser, getSoundCloudUserTracks, getSoundCloudStreamUrl, getSoundCloudGenreTracks, getSoundCloudRelated, SOUNDCLOUD_GENRES } from "./soundcloud";
import { registerListeningPartyRoutes, setupListeningPartyWS } from "./listeningParty";
import { registerStreamingQueueRoutes } from "./streamingQueue";
import {
  getSkipStatus,
  useSkip,
  getAudioQuality,
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

  // Centralized billing platform (transactions, invoices, billing portal)
  registerBillingRoutes(app);

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

  // GET /api/books - Get all books
  app.get("/api/books", async (req, res) => {
    try {
      const books = await storage.getBooks();
      res.json(books);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch books" });
    }
  });

  // GET /api/books/search - Search books (with optional SoundCloud augmentation)
  app.get("/api/books/search", async (req, res) => {
    try {
      const { q, includeSoundCloud } = req.query;
      
      if (!q || typeof q !== "string") {
        return res.status(400).json({ message: "Search query is required" });
      }

      const books = await storage.searchBooks(q);

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
          return res.json([...books, ...scBooks]);
        } catch {
          return res.json(books);
        }
      }

      res.json(books);
    } catch (error) {
      res.status(500).json({ message: "Failed to search books" });
    }
  });

  // GET /api/books/featured - Book of the Day (deterministic by date)
  app.get("/api/books/featured", async (_req, res) => {
    try {
      const allBooks = await storage.getBooks();
      if (allBooks.length === 0) {
        return res.status(404).json({ message: "No books available" });
      }
      const today = new Date();
      const daysSinceEpoch = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
      const index = daysSinceEpoch % allBooks.length;
      res.json(allBooks[index]);
    } catch (error) {
      console.error("Error fetching featured book:", error);
      res.status(500).json({ message: "Failed to fetch featured book" });
    }
  });

  // GET /api/books/trending - Top 10 most-listened books
  app.get("/api/books/trending", async (_req, res) => {
    try {
      const trending = await db
        .select({
          bookId: listeningHistory.bookId,
          playCount: sql<number>`cast(sum(${listeningHistory.playCount}) as int)`,
        })
        .from(listeningHistory)
        .groupBy(listeningHistory.bookId)
        .orderBy(desc(sql`sum(${listeningHistory.playCount})`))
        .limit(10);

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

      const allBooks = await storage.getBooks();
      const shuffled = allBooks.sort(() => 0.5 - Math.random()).slice(0, 10);
      res.json(shuffled);
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
      
      // Check premium content requirement
      if (id.startsWith("premium-")) {
        const user = await storage.getUser(userId);
        if (!user || user.subscriptionTier !== "premium") {
          return res.status(403).json({
            message: "Premium subscription required to access this content",
            premiumRequired: true,
          });
        }
      }
      
      const signedUrl = generateSignedStreamUrl(id, userId);
      
      res.json({ 
        streamUrl: signedUrl,
        expiresIn: 15 * 60,
      });
    } catch (error) {
      console.error("Error generating stream URL:", error);
      res.status(500).json({ message: "Failed to generate stream URL" });
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
      const allBooks = await storage.getBooks();
      const booksNeedingCovers = allBooks.filter(b => !b.coverImage && !hasGeneratedCover(b.id));

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
      const allBooks = await storage.getBooks();
      const generated = listGeneratedCovers();
      const withOriginalCover = allBooks.filter(b => b.coverImage).length;
      const withGeneratedCover = generated.length;
      const noCover = allBooks.filter(b => !b.coverImage && !hasGeneratedCover(b.id)).length;

      res.json({
        total: allBooks.length,
        withOriginalCover,
        withGeneratedCover,
        noCover,
        generatedIds: generated,
      });
    } catch (error) {
      console.error("Error getting cover stats:", error);
      res.status(500).json({ message: "Failed to get cover stats" });
    }
  });

  // GET /api/stream/:id - Stream audio (redirect to actual audio URL)
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
      
      // Redirect to the validated audio URL
      res.redirect(302, book.audioUrl);
    } catch (error) {
      console.error('Streaming error:', error);
      res.status(500).json({ message: "Failed to stream book" });
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
        return res.send(sampleContent);
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
        res.send(sampleContent);
      }
    } catch (error) {
      console.error("Ebook content error:", error);
      res.status(500).json({ message: "Failed to fetch ebook content" });
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
      
      res.json({
        subscriptionTier: user.subscriptionTier || "free",
        subscriptionEndDate: user.subscriptionEndDate,
        stripeSubscriptionId: user.stripeSubscriptionId,
        isPremium: user.subscriptionTier === "premium",
      });
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ message: "Failed to fetch subscription status" });
    }
  });
  
  // POST /api/subscription/create-checkout - Create Stripe checkout session
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
      
      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: {
            userId: user.id,
          },
        });
        customerId = customer.id;
        
        // Save customer ID to database
        await storage.updateUserSubscription(userId, { stripeCustomerId: customerId });
      }
      
      // Create checkout session for subscription
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: SUBSCRIPTION_CONFIG.productName,
                description: "Ad-free listening, unlimited bookmarks, exclusive content",
              },
              unit_amount: PREMIUM_PRICE_MONTHLY,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${req.headers.origin || "http://localhost:5000"}?subscription=success`,
        cancel_url: `${req.headers.origin || "http://localhost:5000"}?subscription=cancelled`,
        metadata: {
          userId: user.id,
        },
      });
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
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
      const isPremium = user?.subscriptionTier === "premium";
      const quality = getAudioQuality(isPremium);
      const bitrate = getQualityBitrate(quality);

      res.json({
        quality,
        bitrate,
        isPremium,
        upgradeMessage: !isPremium ? "Upgrade to Premium for 320kbps high-quality audio" : null,
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
      const isPremium = user?.subscriptionTier === "premium";

      const registerResult = registerDevice(userId, deviceId, req.headers["user-agent"] || "Unknown Device", isPremium);
      if (!registerResult.success) {
        return res.status(403).json({
          success: false,
          message: registerResult.message,
          upgradeUrl: !isPremium ? "/api/subscription/create-checkout" : null,
        });
      }

      const sessionResult = createPlaybackSession(userId, deviceId, bookId, isPremium);

      res.json({
        ...sessionResult,
        bitrate: getQualityBitrate(sessionResult.quality),
        isPremium,
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

  // === USER ACQUISITION ROUTES ===

  // GET /api/platform/stats - Public platform statistics
  app.get("/api/platform/stats", async (_req, res) => {
    try {
      const allBooks = await storage.getBooks();
      const totalBooks = allBooks.length;

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

  // POST /api/referrals/generate - Generate a referral code
  app.post("/api/referrals/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const [existing] = await db.select().from(referrals).where(eq(referrals.referrerId, userId));
      if (existing) {
        return res.json({
          code: existing.referralCode,
          shareUrl: `${req.protocol}://${req.get("host")}/referral/${existing.referralCode}`,
        });
      }

      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const [newReferral] = await db.insert(referrals).values({
        referrerId: userId,
        referralCode: code,
        status: "pending",
        rewardGranted: false,
      }).returning();

      res.json({
        code: newReferral.referralCode,
        shareUrl: `${req.protocol}://${req.get("host")}/referral/${newReferral.referralCode}`,
      });
    } catch (error) {
      console.error("Error generating referral code:", error);
      res.status(500).json({ message: "Failed to generate referral code" });
    }
  });

  // GET /api/referrals/stats - Get referral statistics
  app.get("/api/referrals/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const userReferrals = await db.select().from(referrals).where(eq(referrals.referrerId, userId));
      if (userReferrals.length === 0) {
        return res.json({ referralCode: null, totalReferred: 0, convertedCount: 0, pendingCount: 0 });
      }

      const referralCode = userReferrals[0].referralCode;
      const totalReferred = userReferrals.filter(r => r.referredUserId).length;
      const convertedCount = userReferrals.filter(r => r.status === "converted").length;
      const pendingCount = userReferrals.filter(r => r.status === "pending").length;

      res.json({ referralCode, totalReferred, convertedCount, pendingCount });
    } catch (error) {
      console.error("Error fetching referral stats:", error);
      res.status(500).json({ message: "Failed to fetch referral stats" });
    }
  });

  // POST /api/referrals/redeem - Redeem a referral code
  app.post("/api/referrals/redeem", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Referral code is required" });
      }

      const [referral] = await db.select().from(referrals).where(eq(referrals.referralCode, code));
      if (!referral) {
        return res.status(404).json({ message: "Invalid referral code" });
      }

      if (referral.referrerId === userId) {
        return res.status(400).json({ message: "Cannot redeem your own referral code" });
      }

      if (referral.status === "converted") {
        return res.status(400).json({ message: "Referral code already redeemed" });
      }

      await db.update(referrals)
        .set({
          status: "converted",
          referredUserId: userId,
          convertedAt: new Date(),
          rewardGranted: true,
        })
        .where(eq(referrals.id, referral.id));

      const [existingXp] = await db.select().from(userXp).where(eq(userXp.userId, referral.referrerId));
      if (existingXp) {
        await db.update(userXp)
          .set({ totalXp: sql`${userXp.totalXp} + 500` })
          .where(eq(userXp.userId, referral.referrerId));
      } else {
        await db.insert(userXp).values({
          userId: referral.referrerId,
          totalXp: 500,
          level: 1,
          totalListeningMinutes: 0,
          booksCompleted: 0,
          reviewsWritten: 0,
        });
      }

      const [referrerPrefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, referral.referrerId));
      const newTrialEnd = new Date();
      if (referrerPrefs?.premiumTrialEndDate && referrerPrefs.premiumTrialEndDate > new Date()) {
        newTrialEnd.setTime(referrerPrefs.premiumTrialEndDate.getTime());
      }
      newTrialEnd.setDate(newTrialEnd.getDate() + 7);

      if (referrerPrefs) {
        await db.update(userPreferences)
          .set({ premiumTrialEndDate: newTrialEnd })
          .where(eq(userPreferences.userId, referral.referrerId));
      } else {
        await db.insert(userPreferences).values({
          userId: referral.referrerId,
          premiumTrialEndDate: newTrialEnd,
          favoriteGenres: [],
          onboardingCompleted: false,
          welcomeBonusGranted: false,
        });
      }

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

      const { favoriteGenres, onboardingCompleted } = req.body;

      const [existing] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      if (existing) {
        const updates: any = {};
        if (favoriteGenres !== undefined) updates.favoriteGenres = favoriteGenres;
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

      const publicReviews = await db
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

      const jsonLd = JSON.stringify({
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

      const jsonLd = JSON.stringify({
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
      const allBooks = await storage.getBooks();

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(baseUrl)}/</loc>
    <priority>1.0</priority>
  </url>`;

      for (const book of allBooks) {
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

  app.post("/api/admin/seed/stop", (_req, res) => {
    try {
      const result = stopSeeding();
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

  registerListeningPartyRoutes(app);
  registerStreamingQueueRoutes(app);

  const httpServer = createServer(app);
  setupListeningPartyWS(httpServer);
  return httpServer;
}
