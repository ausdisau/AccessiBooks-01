import { useState, useEffect, useCallback } from "react";
import { localStorageService, AccessibilitySettings } from "@/lib/storage";

function dispatch() {
  document.dispatchEvent(new CustomEvent("accessibooks:settings-changed", { detail: { source: "use-accessibility" } }));
}

export function useAccessibility() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    localStorageService.getSettings()
  );

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", settings.highContrast);
    document.documentElement.classList.toggle("dyslexia-font", settings.dyslexiaFont);
    document.documentElement.classList.toggle("dark", settings.darkMode);
  }, [settings]);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.source === "use-accessibility") return;
      const stored = localStorageService.getSettings();
      setSettings((prev) => {
        const keys = Object.keys(stored) as (keyof AccessibilitySettings)[];
        const changed = keys.some((k) => (stored as Record<string, unknown>)[k] !== (prev as Record<string, unknown>)[k]);
        return changed ? stored : prev;
      });
    };
    document.addEventListener("accessibooks:settings-changed", handler);
    return () => document.removeEventListener("accessibooks:settings-changed", handler);
  }, []);

  const toggleHighContrast = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, highContrast: !prev.highContrast };
      localStorageService.saveSettings(next);
      dispatch();
      return next;
    });
  }, []);

  const toggleDyslexiaFont = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, dyslexiaFont: !prev.dyslexiaFont };
      localStorageService.saveSettings(next);
      dispatch();
      return next;
    });
  }, []);

  const toggleDarkMode = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, darkMode: !prev.darkMode };
      localStorageService.saveSettings(next);
      dispatch();
      return next;
    });
  }, []);

  const toggleVoiceControl = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, voiceControlEnabled: !prev.voiceControlEnabled };
      localStorageService.saveSettings(next);
      dispatch();
      return next;
    });
  }, []);

  return {
    settings,
    toggleHighContrast,
    toggleDyslexiaFont,
    toggleDarkMode,
    toggleVoiceControl,
  };
}
