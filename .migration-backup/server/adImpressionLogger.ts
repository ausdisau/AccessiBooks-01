/**
 * adImpressionLogger.ts — Durable ad impression logging.
 *
 * Writes every impression to the ad_event_logs table (no FK constraints, works
 * for house/programmatic/self-serve). Self-serve impressions additionally write
 * to the existing ad_impressions table for billing/reporting joins.
 */

import { db } from "./db";
import { adImpressions, adEventLogs } from "@shared/schema";
import { sql } from "drizzle-orm";

interface ImpressionPayload {
  userId?: string;
  adId: string;
  adType: string;
  completed: boolean;
  skipped: boolean;
  provider: string;
  campaignId?: string;
  creativeId?: string;
  placementId?: string;
}

let tableEnsured = false;

async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ad_event_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar,
        ad_id varchar NOT NULL,
        ad_type varchar(32) NOT NULL,
        provider varchar(32) NOT NULL,
        placement_id varchar(64),
        completed boolean NOT NULL DEFAULT false,
        skipped boolean NOT NULL DEFAULT false,
        served_at timestamp DEFAULT now()
      )
    `);
    tableEnsured = true;
  } catch (err) {
    console.error("[AdImpressionLogger] Failed to ensure ad_event_logs table:", err);
  }
}

function normalizeAdType(adType: string): "preroll" | "midroll" {
  return adType?.toLowerCase().includes("mid") ? "midroll" : "preroll";
}

export async function logAdImpression(payload: ImpressionPayload): Promise<void> {
  await ensureTable();

  try {
    await db.insert(adEventLogs).values({
      userId: payload.userId ?? null,
      adId: payload.adId,
      adType: payload.adType,
      provider: payload.provider,
      placementId: payload.placementId ?? null,
      completed: payload.completed,
      skipped: payload.skipped,
    });
  } catch (err) {
    console.error("[AdImpressionLogger] ad_event_logs write failed:", err);
  }

  if (payload.campaignId && payload.creativeId) {
    try {
      await db.insert(adImpressions).values({
        campaignId: payload.campaignId,
        creativeId: payload.creativeId,
        userId: payload.userId ?? null,
        adType: normalizeAdType(payload.adType),
        costCents: 0,
        completed: payload.completed,
      });
    } catch (err) {
      console.error("[AdImpressionLogger] ad_impressions write failed:", err);
    }
  }
}
