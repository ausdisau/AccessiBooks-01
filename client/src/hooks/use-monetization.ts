import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { useCallback, useEffect, useRef, useState } from "react";

interface SkipStatus {
  unlimited: boolean;
  remaining: number;
  resetIn: number;
  total?: number;
}

interface AudioQuality {
  quality: "low" | "mid" | "high" | "ultra";
  bitrate: number;
  isPremium: boolean;
  tier?: string;
  upgradeMessage: string | null;
}

interface Device {
  deviceId: string;
  deviceName: string;
  lastSeen: number;
  isActive: boolean;
}

interface DevicesResponse {
  devices: Device[];
  maxDevices: number;
  isPremium: boolean;
}

interface PlaybackSession {
  success: boolean;
  sessionId?: string;
  quality: "low" | "mid" | "high" | "ultra";
  bitrate: number;
  isPremium: boolean;
  message?: string;
}

interface PlaybackRules {
  isPremium: boolean;
  skipStatus: SkipStatus;
  quality: "low" | "mid" | "high" | "ultra";
  bitrate: number;
  shuffleRequired: boolean;
  showAds: boolean;
  maxDevices: number;
  offlineEnabled: boolean;
  upgradeUrl: string | null;
}

function generateDeviceId(): string {
  let deviceId = localStorage.getItem("accessibooks_device_id");
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem("accessibooks_device_id", deviceId);
  }
  return deviceId;
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Android")) return "Android Device";
  if (ua.includes("Mac")) return "Mac";
  if (ua.includes("Windows")) return "Windows PC";
  if (ua.includes("Linux")) return "Linux";
  return "Web Browser";
}

export function useSkipStatus() {
  const { user } = useAuth();

  return useQuery<SkipStatus>({
    queryKey: ["/api/monetization/skip-status"],
    enabled: !!user,
    refetchInterval: 60000,
  });
}

export function useSkip() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/monetization/use-skip");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to use skip");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monetization/skip-status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Skip limit reached",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAudioQuality() {
  const { user } = useAuth();

  return useQuery<AudioQuality>({
    queryKey: ["/api/monetization/audio-quality"],
    enabled: !!user,
  });
}

export function useDevices() {
  const { user } = useAuth();

  return useQuery<DevicesResponse>({
    queryKey: ["/api/monetization/devices"],
    enabled: !!user,
  });
}

export function useRegisterDevice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ deviceId, deviceName }: { deviceId: string; deviceName: string }) => {
      const response = await apiRequest("POST", "/api/monetization/devices/register", {
        deviceId,
        deviceName,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to register device");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monetization/devices"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Device limit reached",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRemoveDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deviceId: string) => {
      const response = await apiRequest("DELETE", `/api/monetization/devices/${deviceId}`);
      if (!response.ok) {
        throw new Error("Failed to remove device");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monetization/devices"] });
    },
  });
}

export function usePlaybackSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [quality, setQuality] = useState<"low" | "mid" | "high" | "ultra">("low");
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const startSession = useCallback(async (bookId: string): Promise<PlaybackSession | null> => {
    try {
      const deviceId = generateDeviceId();
      const response = await apiRequest("POST", "/api/monetization/session/start", {
        deviceId,
        bookId,
      });

      if (!response.ok) {
        const error = await response.json();
        toast({
          title: "Playback blocked",
          description: error.message || "Could not start playback",
          variant: "destructive",
        });
        return null;
      }

      const data: PlaybackSession = await response.json();
      if (data.success && data.sessionId) {
        setSessionId(data.sessionId);
        setQuality(data.quality);

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          sendHeartbeat(data.sessionId!, deviceId);
        }, 25000);
      }

      return data;
    } catch (error) {
      console.error("Error starting playback session:", error);
      return null;
    }
  }, [toast]);

  const sendHeartbeat = useCallback(async (sid: string, deviceId: string) => {
    try {
      const response = await apiRequest("POST", "/api/monetization/session/heartbeat", {
        sessionId: sid,
        deviceId,
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.sessionInvalid) {
          setSessionId(null);
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }

          const audioElements = document.querySelectorAll("audio");
          audioElements.forEach((audio) => {
            audio.pause();
          });

          toast({
            title: "Playback stopped",
            description: error.message || "Playback moved to another device",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Heartbeat error:", error);
    }
  }, [toast]);

  const endSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      await apiRequest("POST", "/api/monetization/session/end", { sessionId });
    } catch (error) {
      console.error("Error ending session:", error);
    } finally {
      setSessionId(null);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  return {
    sessionId,
    quality,
    startSession,
    endSession,
    isSessionActive: !!sessionId,
  };
}

export function usePlaybackRules(contentType: "album" | "playlist" | "single" = "single") {
  const { user } = useAuth();

  return useQuery<PlaybackRules>({
    queryKey: ["/api/monetization/playback-rules", contentType],
    queryFn: async () => {
      const response = await fetch(`/api/monetization/playback-rules?contentType=${contentType}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to get playback rules");
      return response.json();
    },
    enabled: !!user,
  });
}

export function useShouldShowAd(booksPlayed: number) {
  const { user } = useAuth();

  return useQuery<{ showAd: boolean; isPremium: boolean; upgradeMessage: string | null }>({
    queryKey: ["/api/monetization/should-show-ad", booksPlayed],
    queryFn: async () => {
      const response = await fetch(`/api/monetization/should-show-ad?booksPlayed=${booksPlayed}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to check ad status");
      return response.json();
    },
    enabled: !!user && booksPlayed > 0,
  });
}

export function useMonetization() {
  const skipStatus = useSkipStatus();
  const audioQuality = useAudioQuality();
  const devices = useDevices();
  const skipMutation = useSkip();
  const playbackSession = usePlaybackSession();

  return {
    skipStatus: skipStatus.data,
    isLoadingSkipStatus: skipStatus.isLoading,
    audioQuality: audioQuality.data,
    isLoadingQuality: audioQuality.isLoading,
    devices: devices.data,
    isLoadingDevices: devices.isLoading,
    useSkip: skipMutation.mutate,
    isUsingSkip: skipMutation.isPending,
    ...playbackSession,
    isPremium: audioQuality.data?.isPremium || false,
  };
}
