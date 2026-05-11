import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_TTS_PREFS,
  getTtsProvider,
  loadTtsPreferences,
  saveTtsPreferences,
  type TtsEvent,
  type TtsPreferences,
  type TtsState,
  type TtsVoice,
} from "./tts-service";

export interface UseTtsResult {
  supported: boolean;
  state: TtsState;
  voices: TtsVoice[];
  prefs: TtsPreferences;
  lastEvent: TtsEvent | null;
  setPrefs: (patch: Partial<TtsPreferences>) => void;
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function useTts(): UseTtsResult {
  const provider = useMemo(() => getTtsProvider(), []);
  const supported = provider.isSupported();

  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [state, setState] = useState<TtsState>(provider.getState());
  const [lastEvent, setLastEvent] = useState<TtsEvent | null>(null);
  const [prefs, setPrefsState] = useState<TtsPreferences>(() =>
    typeof window === "undefined" ? { ...DEFAULT_TTS_PREFS } : loadTtsPreferences(),
  );
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Subscribe to provider events.
  useEffect(() => {
    const unsubscribe = provider.subscribe((event) => {
      setLastEvent(event);
      switch (event.type) {
        case "start":
        case "resume":
          setState("speaking");
          break;
        case "pause":
          setState("paused");
          break;
        case "stop":
        case "end":
          setState("idle");
          break;
        case "error":
          setState("error");
          break;
      }
    });
    return unsubscribe;
  }, [provider]);

  // Load voices once.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void provider.getVoices().then((v) => {
      if (!cancelled) setVoices(v);
    });
    return () => {
      cancelled = true;
    };
  }, [provider, supported]);

  // Cancel speech on unmount.
  useEffect(() => {
    return () => {
      provider.stop();
    };
  }, [provider]);

  const setPrefs = useCallback((patch: Partial<TtsPreferences>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      saveTtsPreferences(next);
      return next;
    });
  }, []);

  const speak = useCallback(
    (text: string) => {
      const p = prefsRef.current;
      provider.speak(text, {
        voiceId: p.voiceId ?? undefined,
        rate: p.rate,
        pitch: p.pitch,
        volume: p.volume,
      });
    },
    [provider],
  );

  const pause = useCallback(() => provider.pause(), [provider]);
  const resume = useCallback(() => provider.resume(), [provider]);
  const stop = useCallback(() => provider.stop(), [provider]);

  return { supported, state, voices, prefs, lastEvent, setPrefs, speak, pause, resume, stop };
}
