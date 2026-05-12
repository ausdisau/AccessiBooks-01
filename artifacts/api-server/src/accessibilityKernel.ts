import type { Express } from "express";
import { db } from "./db";
import { accessibilityPreferences, users, DEFAULT_A11Y_PROFILE, type A11yProfile } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";
import { stripe } from "./stripe";
import { storage } from "./storage";

// In-memory fallback for accessibility preferences when the DB is unreachable
// (quota exhausted, storage full, etc.). Keyed by userId. This keeps the
// settings UI fully functional in dev outages and under tests, mirroring the
// in-memory user fallback in storage.ts.
//
// IMPORTANT: this fallback is gated to non-production. In production we
// surface the DB outage as a 5xx so callers don't get a silent "success"
// for a write that won't survive a process restart.
const memPrefs = new Map<string, { profile: Record<string, unknown>; activePreset: string | null }>();
function isDbOutage(err: any): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const causeStr = typeof err?.cause?.message === "string" ? err.cause.message : "";
  const errStr = typeof err?.message === "string" ? err.message : "";
  return (
    err?.cause?.code === "53100" ||
    /HTTP status 402/i.test(causeStr) ||
    /HTTP status 402/i.test(errStr) ||
    /exceeded the compute time quota/i.test(causeStr) ||
    /exceeded the compute time quota/i.test(errStr) ||
    /could not extend file/i.test(causeStr) ||
    /could not extend file/i.test(errStr)
  );
}

const PRESETS = [
  {
    name: "Low Vision",
    profile: {
      fontSize: 24,
      highContrast: true,
      colorScheme: "high-contrast",
      lineSpacing: 2.0,
      letterSpacing: 1,
      focusHighlight: true,
    },
  },
  {
    name: "Motor Impairment",
    profile: {
      fontSize: 18,
      reducedMotion: true,
      focusHighlight: true,
      lineSpacing: 1.8,
      playbackSpeed: 0.75,
    },
  },
  {
    name: "Dyslexia Optimized",
    profile: {
      fontSize: 20,
      fontFamily: "OpenDyslexic",
      dyslexiaFont: true,
      lineSpacing: 2.0,
      letterSpacing: 2,
      colorScheme: "sepia",
    },
  },
  {
    name: "Screen Reader",
    profile: {
      screenReaderHints: true,
      reducedMotion: true,
      focusHighlight: true,
      captionsOn: true,
    },
  },
];

function mergeWithDefaults(stored: Record<string, unknown>): A11yProfile {
  return { ...DEFAULT_A11Y_PROFILE, ...stored } as A11yProfile;
}

export function registerAccessibilityKernelRoutes(app: Express) {
  app.get("/api/a11y/preferences", async (req: any, res) => {
    try {
      if (req.isAuthenticated?.() && req.user?.id) {
        const userId = req.user.id;
        let record: typeof accessibilityPreferences.$inferSelect | undefined;
        try {
          [record] = await db
            .select()
            .from(accessibilityPreferences)
            .where(eq(accessibilityPreferences.userId, userId));
        } catch (err) {
          if (!isDbOutage(err)) throw err;
          const mem = memPrefs.get(userId);
          if (mem) {
            return res.json({
              profile: mergeWithDefaults(mem.profile),
              activePreset: mem.activePreset,
            });
          }
        }

        if (record) {
          const merged = mergeWithDefaults(record.profile as Record<string, unknown>);
          return res.json({
            profile: merged,
            activePreset: record.activePreset || null,
          });
        }

        // No DB row — but check the in-memory fallback first.
        const mem = memPrefs.get(userId);
        if (mem) {
          return res.json({
            profile: mergeWithDefaults(mem.profile),
            activePreset: mem.activePreset,
          });
        }
      }

      return res.json({ profile: DEFAULT_A11Y_PROFILE, hasStoredRecord: false });
    } catch (error) {
      console.error("[A11y Kernel] Error fetching preferences:", error);
      res.status(500).json({ message: "Failed to fetch accessibility preferences" });
    }
  });

  app.put("/api/a11y/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { profile: incomingProfile, activePreset } = req.body;

      if (!incomingProfile || typeof incomingProfile !== "object") {
        return res.status(400).json({ message: "profile is required and must be an object" });
      }

      let existing: typeof accessibilityPreferences.$inferSelect | undefined;
      let dbReachable = true;
      try {
        [existing] = await db
          .select()
          .from(accessibilityPreferences)
          .where(eq(accessibilityPreferences.userId, userId));
      } catch (err) {
        if (!isDbOutage(err)) throw err;
        dbReachable = false;
      }

      const existingProfile = existing
        ? (existing.profile as Record<string, unknown>)
        : (memPrefs.get(userId)?.profile as Record<string, unknown> | undefined) || {};
      const mergedProfile = { ...existingProfile, ...incomingProfile };

      if (!dbReachable) {
        memPrefs.set(userId, { profile: mergedProfile, activePreset: activePreset || null });
        return res.json({
          userId,
          profile: mergedProfile,
          activePreset: activePreset || null,
          syncedAt: new Date(),
        });
      }

      try {
        const [result] = await db
          .insert(accessibilityPreferences)
          .values({
            userId,
            profile: mergedProfile,
            activePreset: activePreset || null,
          })
          .onConflictDoUpdate({
            target: accessibilityPreferences.userId,
            set: {
              profile: mergedProfile,
              activePreset: activePreset || null,
              syncedAt: new Date(),
            },
          })
          .returning();
        // Mirror to in-memory cache so subsequent GETs work even if the DB
        // becomes unreachable later in the same session.
        memPrefs.set(userId, { profile: mergedProfile, activePreset: activePreset || null });
        // Task #67: opt-in NDIS-friendly activity log. Skip if the patch
        // itself is the opt-in toggle so we don't immediately log it.
        if (!("activityTrackingEnabled" in (incomingProfile as object))) {
          import("./userActivity")
            .then(m => m.trackUserActivity(userId, "accessibility_change"))
            .catch(() => {});
        }
        res.json(result);
      } catch (err) {
        if (!isDbOutage(err)) throw err;
        memPrefs.set(userId, { profile: mergedProfile, activePreset: activePreset || null });
        res.json({
          userId,
          profile: mergedProfile,
          activePreset: activePreset || null,
          syncedAt: new Date(),
        });
      }
    } catch (error) {
      console.error("[A11y Kernel] Error updating preferences:", error);
      res.status(500).json({ message: "Failed to update accessibility preferences" });
    }
  });

  app.get("/api/a11y/preferences/presets", async (_req, res) => {
    try {
      res.json(PRESETS);
    } catch (error) {
      console.error("[A11y Kernel] Error fetching presets:", error);
      res.status(500).json({ message: "Failed to fetch accessibility presets" });
    }
  });

  app.get("/api/settings/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Use storage.getUser so we transparently fall back to the in-memory
      // user store when the DB is unreachable (quota exhausted, storage full,
      // etc.) — keeps /settings working in dev outages and under tests.
      const userRow = await storage.getUser(userId);
      if (!userRow) {
        return res.status(404).json({ message: "User not found" });
      }

      // Tolerate DB outage (quota / storage) by falling back to in-memory
      // preferences (or defaults) so the page can still render and tests can
      // drive the UI.
      let prefsRow: typeof accessibilityPreferences.$inferSelect | undefined;
      try {
        [prefsRow] = await db
          .select()
          .from(accessibilityPreferences)
          .where(eq(accessibilityPreferences.userId, userId));
      } catch (err) {
        if (!isDbOutage(err)) throw err;
        console.warn("[A11y Kernel] DB unreachable for preferences, using in-memory cache");
      }

      const memProfile = memPrefs.get(userId)?.profile as Record<string, unknown> | undefined;
      const preferences = prefsRow
        ? mergeWithDefaults(prefsRow.profile as Record<string, unknown>)
        : memProfile
          ? mergeWithDefaults(memProfile)
          : DEFAULT_A11Y_PROFILE;

      let nextBillingDate: string | null = null;
      let estimatedNextAmount: number | null = null;

      if (stripe && userRow.stripeCustomerId && userRow.stripeSubscriptionId) {
        try {
          const upcomingInvoice = await (stripe.invoices as any).retrieveUpcoming({
            customer: userRow.stripeCustomerId,
          });
          if (upcomingInvoice) {
            nextBillingDate = upcomingInvoice.next_payment_attempt
              ? new Date(upcomingInvoice.next_payment_attempt * 1000).toISOString()
              : null;
            estimatedNextAmount = upcomingInvoice.amount_due;
          }
        } catch {
          // Stripe might not be configured or subscription may not exist
        }
      }

      res.json({
        user: {
          id: userRow.id,
          email: userRow.email,
          firstName: userRow.firstName,
          subscriptionTier: userRow.subscriptionTier || "free",
          subscriptionEndDate: userRow.subscriptionEndDate ? userRow.subscriptionEndDate.toISOString() : null,
        },
        preferences,
        billing: {
          canManagePortal: !!userRow.stripeCustomerId,
          nextBillingDate,
          estimatedNextAmount,
        },
      });
    } catch (error) {
      console.error("[A11y Kernel] Error fetching settings summary:", error);
      res.status(500).json({ message: "Failed to fetch settings summary" });
    }
  });
}
