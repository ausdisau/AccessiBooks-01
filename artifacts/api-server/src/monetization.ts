import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { TIER_FEATURES, type SubscriptionTier } from "@workspace/db";

function getTierFeatures(tier: SubscriptionTier) {
  return TIER_FEATURES[tier] || TIER_FEATURES.free;
}

function isPaidTier(tier: SubscriptionTier): boolean {
  return tier === "plus" || tier === "premium" || tier === "institutional";
}

const SKIP_LIMIT_FREE = TIER_FEATURES.free.skipLimit;
const SKIP_RESET_HOURS = 1;
const SKIP_RESET_MS = SKIP_RESET_HOURS * 60 * 60 * 1000;
const MAX_DEVICES_FREE = TIER_FEATURES.free.maxDevices;
const MAX_DEVICES_PREMIUM = TIER_FEATURES.premium.maxDevices;
const SESSION_TOKEN_EXPIRY_MS = 30 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const HEARTBEAT_GRACE_MS = 60 * 1000;

interface SkipTracker {
  count: number;
  resetTime: number;
}

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  lastSeen: number;
  isActive: boolean;
}

interface PlaybackSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  bookId: string;
  startedAt: number;
  lastHeartbeat: number;
  quality: "low" | "mid" | "high" | "ultra";
}

const skipTrackers = new Map<string, SkipTracker>();
const userDevices = new Map<string, DeviceInfo[]>();
const activeSessions = new Map<string, PlaybackSession>();
const userActiveSessions = new Map<string, string>();

export function getSkipStatus(userId: string, isPremium: boolean) {
  if (isPremium) {
    return { unlimited: true, remaining: Infinity, resetIn: 0 };
  }

  const key = `skip:${userId}`;
  const now = Date.now();
  let tracker = skipTrackers.get(key);

  if (!tracker || now > tracker.resetTime) {
    tracker = { count: 0, resetTime: now + SKIP_RESET_MS };
    skipTrackers.set(key, tracker);
  }

  return {
    unlimited: false,
    remaining: Math.max(0, SKIP_LIMIT_FREE - tracker.count),
    resetIn: Math.max(0, Math.ceil((tracker.resetTime - now) / 1000)),
    total: SKIP_LIMIT_FREE,
  };
}

export function useSkip(userId: string, isPremium: boolean): { success: boolean; remaining: number; message?: string } {
  if (isPremium) {
    return { success: true, remaining: Infinity };
  }

  const key = `skip:${userId}`;
  const now = Date.now();
  let tracker = skipTrackers.get(key);

  if (!tracker || now > tracker.resetTime) {
    tracker = { count: 0, resetTime: now + SKIP_RESET_MS };
    skipTrackers.set(key, tracker);
  }

  if (tracker.count >= SKIP_LIMIT_FREE) {
    const resetIn = Math.ceil((tracker.resetTime - now) / 1000 / 60);
    return {
      success: false,
      remaining: 0,
      message: `Skip limit reached. Resets in ${resetIn} minute${resetIn !== 1 ? "s" : ""}. Upgrade to Premium for unlimited skips.`,
    };
  }

  tracker.count++;
  skipTrackers.set(key, tracker);

  return {
    success: true,
    remaining: Math.max(0, SKIP_LIMIT_FREE - tracker.count),
  };
}

export function getAudioQuality(isPremium: boolean): "low" | "mid" | "high" {
  return isPremium ? "high" : "low";
}

export function getAudioQualityForTier(tier: SubscriptionTier): "low" | "mid" | "high" | "ultra" {
  if (tier === "premium") return "ultra";
  if (tier === "plus") return "mid";
  return "low";
}

export function getQualityBitrate(quality: "low" | "mid" | "high" | "ultra"): number {
  if (quality === "ultra" || quality === "high") return 320;
  if (quality === "mid") return 192;
  return 128;
}

export function getQualityDisplayInfo(quality: "low" | "mid" | "high" | "ultra"): { label: string; tier: "uhq" | "hd" | "sd" } {
  if (quality === "ultra") return { label: "UHQ · 320 kbps", tier: "uhq" };
  if (quality === "high" || quality === "mid") return { label: quality === "high" ? "HD · 320 kbps" : "HD · 192 kbps", tier: "hd" };
  return { label: "SD · 128 kbps", tier: "sd" };
}

export function registerDevice(
  userId: string,
  deviceId: string,
  deviceName: string,
  isPremium: boolean,
  tier?: SubscriptionTier
): { success: boolean; devices: DeviceInfo[]; message?: string } {
  const effectiveTier = tier || (isPremium ? "premium" : "free");
  const features = getTierFeatures(effectiveTier);
  const maxDevices = features.maxDevices;
  let devices = userDevices.get(userId) || [];

  const existingDevice = devices.find(d => d.deviceId === deviceId);
  if (existingDevice) {
    existingDevice.lastSeen = Date.now();
    existingDevice.deviceName = deviceName;
    userDevices.set(userId, devices);
    return { success: true, devices };
  }

  if (devices.length >= maxDevices) {
    const inactiveDevices = devices.filter(d => !d.isActive);
    if (inactiveDevices.length > 0) {
      devices = devices.filter(d => d.deviceId !== inactiveDevices[0].deviceId);
    } else {
      const upgradeMsg = effectiveTier === "free" ? "Upgrade to Plus for 3 devices or Premium for 5." :
                         effectiveTier === "plus" ? "Upgrade to Premium for up to 5 devices." :
                         "Remove a device to add this one.";
      return {
        success: false,
        devices,
        message: `Device limit reached (${maxDevices}). ${upgradeMsg}`,
      };
    }
  }

  devices.push({
    deviceId,
    deviceName,
    lastSeen: Date.now(),
    isActive: false,
  });

  userDevices.set(userId, devices);
  return { success: true, devices };
}

export function removeDevice(userId: string, deviceId: string): { success: boolean; devices: DeviceInfo[] } {
  let devices = userDevices.get(userId) || [];
  devices = devices.filter(d => d.deviceId !== deviceId);
  userDevices.set(userId, devices);

  const existingSession = userActiveSessions.get(userId);
  if (existingSession) {
    const session = activeSessions.get(existingSession);
    if (session && session.deviceId === deviceId) {
      activeSessions.delete(existingSession);
      userActiveSessions.delete(userId);
    }
  }

  return { success: true, devices };
}

export function getDevices(userId: string): DeviceInfo[] {
  return userDevices.get(userId) || [];
}

export function createPlaybackSession(
  userId: string,
  deviceId: string,
  bookId: string,
  isPremium: boolean,
  tier?: SubscriptionTier
): { success: boolean; sessionId?: string; quality: "low" | "mid" | "high" | "ultra"; message?: string } {
  const existingSessionId = userActiveSessions.get(userId);

  if (existingSessionId) {
    const existingSession = activeSessions.get(existingSessionId);
    if (existingSession && existingSession.deviceId !== deviceId) {
      activeSessions.delete(existingSessionId);
      userActiveSessions.delete(userId);
    }
  }

  const sessionId = crypto.randomBytes(16).toString("hex");
  const effectiveTier = tier || (isPremium ? "premium" : "free");
  const quality = getAudioQualityForTier(effectiveTier);

  const session: PlaybackSession = {
    sessionId,
    userId,
    deviceId,
    bookId,
    startedAt: Date.now(),
    lastHeartbeat: Date.now(),
    quality,
  };

  activeSessions.set(sessionId, session);
  userActiveSessions.set(userId, sessionId);

  const devices = userDevices.get(userId) || [];
  const device = devices.find(d => d.deviceId === deviceId);
  if (device) {
    devices.forEach(d => d.isActive = false);
    device.isActive = true;
    userDevices.set(userId, devices);
  }

  return { success: true, sessionId, quality };
}

export function validatePlaybackSession(sessionId: string, deviceId: string): { valid: boolean; message?: string } {
  const session = activeSessions.get(sessionId);

  if (!session) {
    return { valid: false, message: "Session not found or expired" };
  }

  if (session.deviceId !== deviceId) {
    return { valid: false, message: "Session is active on another device" };
  }

  const now = Date.now();
  if (now - session.lastHeartbeat > HEARTBEAT_INTERVAL_MS + HEARTBEAT_GRACE_MS) {
    activeSessions.delete(sessionId);
    userActiveSessions.delete(session.userId);
    return { valid: false, message: "Session expired due to inactivity" };
  }

  return { valid: true };
}

export function heartbeat(sessionId: string, deviceId: string): { success: boolean; message?: string } {
  const session = activeSessions.get(sessionId);

  if (!session) {
    return { success: false, message: "Session not found" };
  }

  if (session.deviceId !== deviceId) {
    return { success: false, message: "Session is active on another device" };
  }

  session.lastHeartbeat = Date.now();
  activeSessions.set(sessionId, session);

  return { success: true };
}

export function endPlaybackSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    const devices = userDevices.get(session.userId) || [];
    const device = devices.find(d => d.deviceId === session.deviceId);
    if (device) {
      device.isActive = false;
      userDevices.set(session.userId, devices);
    }
    activeSessions.delete(sessionId);
    userActiveSessions.delete(session.userId);
  }
}

export function getActiveSession(userId: string): PlaybackSession | null {
  const sessionId = userActiveSessions.get(userId);
  if (!sessionId) return null;
  return activeSessions.get(sessionId) || null;
}

export function shouldShowAd(userId: string, isPremium: boolean, booksPlayed: number): boolean {
  if (isPremium) return false;
  return booksPlayed > 0 && booksPlayed % 3 === 0;
}

export function shouldShowAdForTier(tier: SubscriptionTier, booksPlayed: number): boolean {
  if (isPaidTier(tier)) return false;
  return booksPlayed > 0 && booksPlayed % 3 === 0;
}

export function isShuffleModeRequired(isPremium: boolean, contentType: "album" | "playlist" | "single"): boolean {
  if (isPremium) return false;
  return contentType === "album";
}

export async function skipLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id || (req as any).user?.claims?.sub;
  
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const user = await storage.getUser(userId);
  const tier = (user?.subscriptionTier || "free") as SubscriptionTier;
  const isPremium = isPaidTier(tier);

  (req as any).skipStatus = getSkipStatus(userId, isPremium);
  (req as any).isPremium = isPremium;
  (req as any).tier = tier;

  next();
}

export async function sessionValidationMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.headers["x-playback-session"] as string;
  const deviceId = req.headers["x-device-id"] as string;

  if (!sessionId || !deviceId) {
    return res.status(400).json({ message: "Playback session and device ID required" });
  }

  const validation = validatePlaybackSession(sessionId, deviceId);
  if (!validation.valid) {
    return res.status(403).json({ message: validation.message, sessionInvalid: true });
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  
  skipTrackers.forEach((tracker, key) => {
    if (now > tracker.resetTime) {
      skipTrackers.delete(key);
    }
  });

  activeSessions.forEach((session, sessionId) => {
    if (now - session.lastHeartbeat > SESSION_TOKEN_EXPIRY_MS) {
      const devices = userDevices.get(session.userId) || [];
      const device = devices.find(d => d.deviceId === session.deviceId);
      if (device) {
        device.isActive = false;
        userDevices.set(session.userId, devices);
      }
      activeSessions.delete(sessionId);
      userActiveSessions.delete(session.userId);
    }
  });
}, 60 * 1000);
