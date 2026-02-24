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
  playbackSpeed: number;
  colorScheme: string;
  lineSpacing: number;
  letterSpacing: number;
  dyslexiaFont: boolean;
  focusHighlight: boolean;
  darkMode: boolean;
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
  playbackSpeed: 1.0,
  colorScheme: "default",
  lineSpacing: 1.5,
  letterSpacing: 0,
  dyslexiaFont: false,
  focusHighlight: true,
  darkMode: false,
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
    document.documentElement.style.setProperty("--a11y-font-size", `${profile.fontSize}px`);
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
