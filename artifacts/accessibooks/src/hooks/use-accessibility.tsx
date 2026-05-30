import { useState, useEffect, useCallback, useRef } from "react";
import { localStorageService, AccessibilitySettings } from "@/lib/storage";

let instanceCounter = 0;

export function useAccessibility() {
  const instanceId = useRef(`a11y-${++instanceCounter}`);

  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    localStorageService.getSettings()
  );

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
    document.documentElement.classList.toggle("dyslexia-font", settings.dyslexiaFont);
    document.documentElement.classList.toggle("dark", settings.darkMode);
  }, [settings]);

  useEffect(() => {
    const id = instanceId.current;
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.source === id) return;
      const stored = localStorageService.getSettings();
      setSettings((prev) => {
        const keys = Object.keys(stored) as (keyof AccessibilitySettings)[];
        const changed = keys.some((k) => stored[k] !== prev[k]);
        return changed ? stored : prev;
      });
    };
    document.addEventListener("accessibooks:settings-changed", handler);
    return () => document.removeEventListener("accessibooks:settings-changed", handler);
  }, []);

  const dispatch = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent("accessibooks:settings-changed", {
        detail: { source: instanceId.current },
      })
    );
  }, []);

  const toggleHighContrast = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, highContrast: !prev.highContrast };
      localStorageService.saveSettings(next);
      return next;
    });
    dispatch();
  }, [dispatch]);

  const toggleDyslexiaFont = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, dyslexiaFont: !prev.dyslexiaFont };
      localStorageService.saveSettings(next);
      return next;
    });
    dispatch();
  }, [dispatch]);

  const toggleDarkMode = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, darkMode: !prev.darkMode };
      localStorageService.saveSettings(next);
      return next;
    });
    dispatch();
  }, [dispatch]);

  const toggleVoiceControl = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, voiceControlEnabled: !prev.voiceControlEnabled };
      localStorageService.saveSettings(next);
      return next;
    });
    dispatch();
  }, [dispatch]);

  return {
    settings,
    toggleHighContrast,
    toggleDyslexiaFont,
    toggleDarkMode,
    toggleVoiceControl,
  };
}
