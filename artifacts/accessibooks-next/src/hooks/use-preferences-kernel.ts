import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { localStorageService } from "@/lib/storage";

interface A11yProfile {
  fontSize: number;
  fontFamily: string;
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderHints: boolean;
  captionsOn: boolean;
  captionPosition: "above" | "below";
  playbackSpeed: number;
  colorScheme: string;
  lineSpacing: number;
  letterSpacing: number;
  dyslexiaFont: boolean;
  focusHighlight: boolean;
  darkMode: boolean;
  karaokeFollowAlong: boolean;
  rewardedAdPreference: "always" | "never" | "ask";
  sensoryMode?: boolean;
  sensoryModeChosen?: boolean;
  lowBandwidthMode?: boolean;
  textOnlyMode?: boolean;
}

interface A11yPreset {
  name: string;
  description: string;
  profile: Partial<A11yProfile>;
}

const DEFAULT_PROFILE: A11yProfile = {
  fontSize: 16,
  fontFamily: "system",
  highContrast: false,
  reducedMotion: false,
  screenReaderHints: true,
  captionsOn: false,
  captionPosition: "below",
  playbackSpeed: 1.0,
  colorScheme: "default",
  lineSpacing: 1.5,
  letterSpacing: 0,
  dyslexiaFont: false,
  focusHighlight: true,
  darkMode: false,
  karaokeFollowAlong: false,
  rewardedAdPreference: "ask",
  sensoryMode: false,
  sensoryModeChosen: false,
  lowBandwidthMode: false,
  textOnlyMode: false,
};

function profileFromLocalStorage(): A11yProfile {
  const settings = localStorageService.getSettings();
  return {
    ...DEFAULT_PROFILE,
    highContrast: settings.highContrast,
    dyslexiaFont: settings.dyslexiaFont,
    darkMode: settings.darkMode,
    fontSize: settings.fontSize || DEFAULT_PROFILE.fontSize,
    letterSpacing: settings.letterSpacing || DEFAULT_PROFILE.letterSpacing,
    lineSpacing: settings.lineHeight || DEFAULT_PROFILE.lineSpacing,
    captionsOn: settings.captionsOn ?? DEFAULT_PROFILE.captionsOn,
    captionPosition: settings.captionPosition ?? DEFAULT_PROFILE.captionPosition,
    karaokeFollowAlong: settings.karaokeFollowAlong ?? DEFAULT_PROFILE.karaokeFollowAlong,
    // Persist rewardedAdPreference locally so users who set "never" are not
    // briefly served an ad on first frame before server prefs hydrate.
    rewardedAdPreference: settings.rewardedAdPreference ?? DEFAULT_PROFILE.rewardedAdPreference,
  };
}

function syncToLocalStorage(profile: A11yProfile) {
  const current = localStorageService.getSettings();
  localStorageService.saveSettings({
    ...current,
    highContrast: profile.highContrast,
    dyslexiaFont: profile.dyslexiaFont,
    darkMode: profile.darkMode,
    fontSize: profile.fontSize,
    letterSpacing: profile.letterSpacing,
    lineHeight: profile.lineSpacing,
    captionsOn: profile.captionsOn,
    captionPosition: profile.captionPosition,
    karaokeFollowAlong: profile.karaokeFollowAlong,
    rewardedAdPreference: profile.rewardedAdPreference,
  });
}

export { DEFAULT_PROFILE };
export type { A11yProfile, A11yPreset };

export function usePreferencesKernel() {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const { data: serverPrefs, isLoading: prefsLoading } = useQuery<{
    profile: A11yProfile;
    activePreset: string | null;
  }>({
    queryKey: ["/api/a11y/preferences"],
    enabled: isLoggedIn,
  });

  const { data: presets = [], isLoading: presetsLoading } = useQuery<A11yPreset[]>({
    queryKey: ["/api/a11y/preferences/presets"],
  });

  const [profile, setProfile] = useState<A11yProfile>(() =>
    isLoggedIn && serverPrefs ? serverPrefs.profile : profileFromLocalStorage()
  );

  const [activePreset, setActivePreset] = useState<string | null>(
    serverPrefs?.activePreset ?? null
  );

  useEffect(() => {
    if (isLoggedIn && serverPrefs) {
      setProfile(serverPrefs.profile);
      setActivePreset(serverPrefs.activePreset);
    } else if (!isLoggedIn) {
      setProfile(profileFromLocalStorage());
    }
  }, [isLoggedIn, serverPrefs]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { profile: A11yProfile; activePreset: string | null }) => {
      await apiRequest("PUT", "/api/a11y/preferences", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/a11y/preferences"] });
    },
  });

  const updateProfile = useCallback(
    (updates: Partial<A11yProfile>) => {
      setProfile((prev) => {
        const merged = { ...prev, ...updates };
        syncToLocalStorage(merged);
        if (isLoggedIn) {
          saveMutation.mutate({ profile: merged, activePreset: null });
        }
        setActivePreset(null);
        return merged;
      });
    },
    [isLoggedIn, saveMutation]
  );

  const applyPreset = useCallback(
    (presetName: string) => {
      const preset = presets.find((p) => p.name === presetName);
      if (!preset) return;
      setProfile((prev) => {
        const merged = { ...prev, ...preset.profile };
        syncToLocalStorage(merged);
        if (isLoggedIn) {
          saveMutation.mutate({ profile: merged, activePreset: presetName });
        }
        setActivePreset(presetName);
        return merged;
      });
    },
    [presets, isLoggedIn, saveMutation]
  );

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", profile.highContrast);
    document.documentElement.classList.toggle("dyslexia-font", profile.dyslexiaFont);
    document.documentElement.classList.toggle("dark", profile.darkMode);
    document.documentElement.classList.toggle("low-bandwidth-mode", !!profile.lowBandwidthMode);
    document.documentElement.classList.toggle("text-only-mode", !!profile.textOnlyMode);
    const fontPct = Math.min(150, Math.max(80, (profile.fontSize / 16) * 100));
    document.documentElement.style.setProperty("--a11y-font-size", `${fontPct}%`);
    document.documentElement.style.setProperty("--a11y-line-spacing", `${profile.lineSpacing}`);
    document.documentElement.style.setProperty("--a11y-letter-spacing", `${profile.letterSpacing}px`);
  }, [profile]);

  return {
    profile,
    presets,
    activePreset,
    updateProfile,
    applyPreset,
    isLoading: prefsLoading || presetsLoading,
  };
}
