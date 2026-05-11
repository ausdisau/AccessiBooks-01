/**
 * index.ts — Express application entry point
 *
 * Auth system (all registered via registerRoutes → routes.ts):
 *   auth.ts       — Primary auth: email/password local strategy, magic-link, session setup,
 *                   and all /api/auth/* REST endpoints.
 *   multiAuth.ts  — OAuth strategies (Google, Facebook, Microsoft, Auth0) via Passport.
 *                   Provides isAuthenticated middleware.
 *   auth0.ts      — Auth0 SDK integration for Management API + JWT token validation.
 *                   Only activated when AUTH0_* env vars are present.
 *   replitAuth.ts — Replit OIDC strategy. Only activated in Replit-hosted environments.
 *
 * Ad system:
 *   adPlatformRoutes.ts — Display-ad bidding platform (AdBid): campaigns, display ads,
 *                         slots, wallet, publisher earnings, Vickrey auction serving.
 *   selfServeAds.ts     — Audio self-serve ads: audio campaigns, creatives, upload URLs.
 *                         Also exports ad selection functions used by adMediation.ts.
 *   adMediation.ts      — Audio ad waterfall (programmatic VAST → self-serve → house ads).
 */
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import fs from "fs";
import path from "path";
import { validateEnv } from "./validateEnv";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startNotificationScheduler } from "./notificationTriggers";
import { setupFullTextSearch, setupEasyEnglishTables, setupAdPlatformTables, ensureReadingLevelColumn, setupWordBankTable, ensureEntitlementSchema, ensureUserActivitySchema, ensureAutoResponseLogSchema } from "./db";
import { seedPlans } from "./seed";
import { startDailySpendResetCron } from "./auctionEngine";
import { storage } from "./storage";
import { setAutoResponseStorage, hydrateAutoResponseDedupeFromStorage } from "./agentMailer";

const app = express();

app.use(compression({ level: 6, threshold: 1024 }));

// Stripe webhook needs raw body for signature verification
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
// AgentMail inbound webhook also needs raw body for HMAC-SHA256 verification.
app.use('/api/agentmail/webhook', express.raw({ type: '*/*', limit: '1mb' }));

// All other routes use JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  validateEnv();
  // Wire the persistent auto-response dedupe store and rehydrate the cache
  // from any rows that haven't yet expired (Task #133). We BLOCK on this
  // before `server.listen` so the first inbound /api/agentmail/webhook
  // call after a restart can never bypass the suppression window.
  setAutoResponseStorage(storage);
  try {
    await ensureAutoResponseLogSchema();
    await hydrateAutoResponseDedupeFromStorage();
  } catch (err) {
    console.warn("[AgentMail] auto_response_log boot setup failed (continuing):", err);
  }
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  // Detect production by checking if the built frontend exists (dist/public/).
  // In the bundled dist/index.js, import.meta.dirname is the dist/ folder.
  // In development (tsx server/index.ts), import.meta.dirname is server/ — no public/ there.
  const distPublicPath = path.resolve(import.meta.dirname, "public");
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(distPublicPath);
  if (!isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    startNotificationScheduler();
    
    setupFullTextSearch().catch(err => console.warn("[FTS] Setup failed:", err));
    setupEasyEnglishTables().catch(err => console.warn("[EasyEnglish] Setup failed:", err));
    setupAdPlatformTables().catch(err => console.warn("[AdPlatform] Setup failed:", err));
    ensureReadingLevelColumn().catch(err => console.warn("[ReadingLevel] Setup failed:", err));
    setupWordBankTable().then(available => storage.setWordBankDbAvailable(available)).catch(() => {});
    ensureEntitlementSchema().catch(err => console.warn("[Entitlements] Schema setup failed:", err));
    ensureUserActivitySchema().catch(err => console.warn("[UserActivity] Schema setup failed:", err));
    // auto_response_log schema + hydration is awaited above before listen.
    seedPlans().catch(err => console.warn("[Seed] Plans seed failed:", err));
    startDailySpendResetCron();
    
    // Runtime API ingestion: fetch from external APIs and persist to DB
    setTimeout(async () => {
      try {
        const result = await (storage as any).refreshRuntimeBooks();
        console.log(`[RuntimeRefresh] Initial: ${result.inserted} inserted, ${result.skipped} skipped`);
      } catch (err: any) {
        console.warn("[RuntimeRefresh] Initial refresh failed:", err.message);
      }
      
      // Schedule periodic refresh every 30 minutes
      setInterval(async () => {
        try {
          const result = await (storage as any).refreshRuntimeBooks();
          console.log(`[RuntimeRefresh] Periodic: ${result.inserted} inserted, ${result.skipped} skipped`);
        } catch (err: any) {
          console.warn("[RuntimeRefresh] Periodic refresh failed:", err.message);
        }
      }, 30 * 60 * 1000);
    }, 10000);
    
    // Auto-start catalog seeder in background (resumes from where it left off)
    import("./catalogSeeder").then(({ startSeeding, resetAndRestartExpandedSources, getSeededBookCount }) => {
      setTimeout(async () => {
        try {
          // First run the normal seeders (LibriVox & Gutenberg resume/complete quickly)
          const result = await startSeeding(["librivox", "gutenberg", "openlibrary", "internetarchive"]);
          console.log(`[Auto-Seeder] ${result.message}`);

          // Check if we're below 1M — if so, reset OL + IA and re-run with expanded queries
          const counts = await getSeededBookCount();
          const total = counts.total ?? 0;
          console.log(`[Auto-Seeder] Current catalog size: ${total.toLocaleString()} books`);
          if (total < 1_000_000) {
            console.log(`[Auto-Seeder] Below 1M target (${total.toLocaleString()}) — launching expanded seed run across 200+ subjects and 80+ queries`);
            const expanded = await resetAndRestartExpandedSources();
            console.log(`[Auto-Seeder] Expanded run: ${expanded.message}`);
          } else {
            console.log("[Auto-Seeder] Catalog at 1M+ books — no expanded run needed");
          }
        } catch (err: any) {
          console.warn("[Auto-Seeder] Failed to start:", err);
        }
      }, 30000);
    });
  });
})();
