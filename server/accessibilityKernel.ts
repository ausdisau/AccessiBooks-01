import type { Express } from "express";
import { db } from "./db";
import { accessibilityPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";

const DEFAULT_PROFILE = {
  fontSize: 16,
  fontFamily: "system",
  highContrast: false,
  reducedMotion: false,
  screenReaderHints: true,
  captionsOn: false,
  playbackSpeed: 1.0,
  colorScheme: "default",
  lineSpacing: 1.5,
  letterSpacing: 0,
  dyslexiaFont: false,
  focusHighlight: true,
};

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
          return res.json({
            profile: record.profile,
            activePreset: record.activePreset || null,
          });
        }
      }

      // No stored record — return DEFAULT_PROFILE for backward compat with existing consumers,
      // but set hasStoredRecord: false so the widget can distinguish "never saved" from "saved"
      return res.json({ profile: DEFAULT_PROFILE, hasStoredRecord: false });
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

      const { profile, activePreset } = req.body;

      if (!profile || typeof profile !== "object") {
        return res.status(400).json({ message: "profile is required and must be an object" });
      }

      const [result] = await db
        .insert(accessibilityPreferences)
        .values({
          userId,
          profile,
          activePreset: activePreset || null,
        })
        .onConflictDoUpdate({
          target: accessibilityPreferences.userId,
          set: {
            profile,
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
}
