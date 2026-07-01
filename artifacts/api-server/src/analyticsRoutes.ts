import type { Express, Request, Response } from "express";
import { analyticsService } from "./analyticsService";
import { requireAdmin } from "./multiAuth";

function parseDateRange(req: Request): { from: Date; to: Date } {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const fromStr = req.query.from as string | undefined;
  const toStr = req.query.to as string | undefined;

  const from = fromStr ? new Date(fromStr) : thirtyDaysAgo;
  const to = toStr ? new Date(toStr) : now;

  if (isNaN(from.getTime())) return { from: thirtyDaysAgo, to: now };
  if (isNaN(to.getTime())) return { from, to: now };

  return { from, to };
}

export function registerAnalyticsRoutes(app: Express) {
  app.get("/api/admin/analytics/subscriptions", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { from, to } = parseDateRange(req);
      const data = await analyticsService.getSubscriptionSummary(from, to);
      res.json(data);
    } catch (err) {
      console.error("[Analytics] subscriptions error:", err);
      res.status(500).json({ message: "Failed to fetch subscription analytics" });
    }
  });

  app.get("/api/admin/analytics/ads", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { from, to } = parseDateRange(req);
      const data = await analyticsService.getAdSummary(from, to);
      res.json(data);
    } catch (err) {
      console.error("[Analytics] ads error:", err);
      res.status(500).json({ message: "Failed to fetch ad analytics" });
    }
  });

  app.get("/api/admin/analytics/listening", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { from, to } = parseDateRange(req);
      const data = await analyticsService.getListeningSummary(from, to);
      res.json(data);
    } catch (err) {
      console.error("[Analytics] listening error:", err);
      res.status(500).json({ message: "Failed to fetch listening analytics" });
    }
  });

  app.get("/api/admin/analytics/funnel", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { from, to } = parseDateRange(req);
      const data = await analyticsService.getConversionFunnel(from, to);
      res.json(data);
    } catch (err) {
      console.error("[Analytics] funnel error:", err);
      res.status(500).json({ message: "Failed to fetch funnel analytics" });
    }
  });

  app.get("/api/admin/analytics/accessibility", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const data = await analyticsService.getAccessibilityUsage();
      res.json(data);
    } catch (err) {
      console.error("[Analytics] accessibility error:", err);
      res.status(500).json({ message: "Failed to fetch accessibility analytics" });
    }
  });

  app.get("/api/admin/analytics/summary", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { from, to } = parseDateRange(req);
      const [subscriptions, ads, listening, funnel, accessibility] = await Promise.all([
        analyticsService.getSubscriptionSummary(from, to),
        analyticsService.getAdSummary(from, to),
        analyticsService.getListeningSummary(from, to),
        analyticsService.getConversionFunnel(from, to),
        analyticsService.getAccessibilityUsage(),
      ]);
      res.json({ subscriptions, ads, listening, funnel, accessibility });
    } catch (err) {
      console.error("[Analytics] summary error:", err);
      res.status(500).json({ message: "Failed to fetch analytics summary" });
    }
  });
}
