import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startNotificationScheduler } from "./notificationTriggers";
import { setupFullTextSearch, setupEasyEnglishTables } from "./db";
import { storage } from "./storage";

const app = express();

app.use(compression({ level: 6, threshold: 1024 }));

// Stripe webhook needs raw body for signature verification
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

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
  if (app.get("env") === "development") {
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
    import("./catalogSeeder").then(({ startSeeding }) => {
      setTimeout(() => {
        startSeeding(["librivox", "gutenberg", "openlibrary", "internetarchive"]).then(result => {
          console.log(`[Auto-Seeder] ${result.message}`);
        }).catch(err => {
          console.warn("[Auto-Seeder] Failed to start:", err);
        });
      }, 30000);
    });
  });
})();
