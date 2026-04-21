import type { Express } from "express";
import { db } from "./db";
import { accessibilityPreferences, users, DEFAULT_A11Y_PROFILE, type A11yProfile } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";
import { stripe } from "./stripe";

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
        const [record] = await db
          .select()
          .from(accessibilityPreferences)
          .where(eq(accessibilityPreferences.userId, userId));

        if (record) {
          const merged = mergeWithDefaults(record.profile as Record<string, unknown>);
          return res.json({
            profile: merged,
            activePreset: record.activePreset || null,
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

      const [existing] = await db
        .select()
        .from(accessibilityPreferences)
        .where(eq(accessibilityPreferences.userId, userId));

      const existingProfile = existing ? (existing.profile as Record<string, unknown>) : {};
      const mergedProfile = { ...existingProfile, ...incomingProfile };

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

      res.json(result);
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

      const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow) {
        return res.status(404).json({ message: "User not found" });
      }

      const [prefsRow] = await db
        .select()
        .from(accessibilityPreferences)
        .where(eq(accessibilityPreferences.userId, userId));

      const preferences = prefsRow
        ? mergeWithDefaults(prefsRow.profile as Record<string, unknown>)
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
