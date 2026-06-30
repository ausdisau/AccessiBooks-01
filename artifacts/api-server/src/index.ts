import { createApp } from "./app";
import { logger } from "./lib/logger";
import { registerRoutes } from "./routes/routes";
import healthRouter from "./routes/health";
import { startNotificationScheduler } from "./notificationTriggers";
import {
  setupFullTextSearch,
  setupEasyEnglishTables,
  setupAdPlatformTables,
  ensureReadingLevelColumn,
  setupWordBankTable,
  ensureEntitlementSchema,
  ensureUserActivitySchema,
  ensureAutoResponseLogSchema,
  ensureNarrationSchema,
  ensureNdisSchema,
  ensureCommercialCreditsSchema,
} from "./db";
import { seedPlans } from "./seed";
import { startDailySpendResetCron } from "./auctionEngine";
import { storage } from "./storage";
import { setAutoResponseStorage, hydrateAutoResponseDedupeFromStorage } from "./agentMailer";
import { runAuth0HealthCheck, startAuth0HealthRecoveryLoop } from "./auth0Health";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

(async () => {
  const app = createApp();

  // Wire the persistent auto-response dedupe store and rehydrate the cache
  setAutoResponseStorage(storage);
  try {
    await ensureAutoResponseLogSchema();
    await hydrateAutoResponseDedupeFromStorage();
  } catch (err) {
    logger.warn({ err }, "[AgentMail] auto_response_log boot setup failed (continuing)");
  }

  // Probe Auth0 at boot
  runAuth0HealthCheck().catch((err: any) =>
    logger.warn({ err }, "[Auth0] Health check threw (continuing)"),
  );
  startAuth0HealthRecoveryLoop();

  // Health check — must be reachable before session/auth middleware
  app.use("/api", healthRouter);

  // Register all legacy routes — this wires auth, sessions, WebSocket, etc.
  // and returns the HTTP server.
  const server = await registerRoutes(app);

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    logger.error({ err }, "Unhandled error");
  });

  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      logger.info({ port }, "Server listening");

      startNotificationScheduler();

      setupFullTextSearch().catch((err: any) => logger.warn({ err }, "[FTS] Setup failed"));
      setupEasyEnglishTables().catch((err: any) => logger.warn({ err }, "[EasyEnglish] Setup failed"));
      setupAdPlatformTables().catch((err: any) => logger.warn({ err }, "[AdPlatform] Setup failed"));
      ensureReadingLevelColumn().catch((err: any) => logger.warn({ err }, "[ReadingLevel] Setup failed"));
      setupWordBankTable()
        .then((available: boolean) => storage.setWordBankDbAvailable(available))
        .catch(() => {});
      ensureEntitlementSchema().catch((err: any) => logger.warn({ err }, "[Entitlements] Schema setup failed"));
      ensureUserActivitySchema().catch((err: any) => logger.warn({ err }, "[UserActivity] Schema setup failed"));
      ensureNarrationSchema().catch((err: any) => logger.warn({ err }, "[Narration] Schema setup failed"));
      ensureNdisSchema().catch((err: any) => logger.warn({ err }, "[NDIS] Schema setup failed"));
      ensureCommercialCreditsSchema().catch((err: any) => logger.warn({ err }, "[CommercialCredits] Schema setup failed"));
      seedPlans().catch((err: any) => logger.warn({ err }, "[Seed] Plans seed failed"));
      startDailySpendResetCron();

      // Runtime API ingestion
      setTimeout(async () => {
        try {
          const result = await (storage as any).refreshRuntimeBooks();
          logger.info({ result }, "[RuntimeRefresh] Initial refresh done");
        } catch (err: any) {
          logger.warn({ err }, "[RuntimeRefresh] Initial refresh failed");
        }

        setInterval(async () => {
          try {
            await (storage as any).refreshRuntimeBooks();
          } catch (err: any) {
            logger.warn({ err }, "[RuntimeRefresh] Periodic refresh failed");
          }
        }, 30 * 60 * 1000);
      }, 10000);

      // Auto-start catalog seeder
      import("./catalogSeeder").then(({ startSeeding, resetAndRestartExpandedSources, getSeededBookCount }: any) => {
        setTimeout(async () => {
          try {
            const result = await startSeeding(["librivox", "gutenberg", "openlibrary", "internetarchive"]);
            logger.info({ message: result.message }, "[Auto-Seeder]");
            const counts = await getSeededBookCount();
            const total = counts.total ?? 0;
            if (total < 1_000_000) {
              const expanded = await resetAndRestartExpandedSources();
              logger.info({ message: expanded.message }, "[Auto-Seeder] Expanded run");
            }
          } catch (err: any) {
            logger.warn({ err }, "[Auto-Seeder] Failed to start");
          }
        }, 30000);
      });
    },
  );
})();
