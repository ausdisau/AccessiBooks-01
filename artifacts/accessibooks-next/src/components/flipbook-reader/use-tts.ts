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

export interface UseTtsOptions {
  /** Optional initial prefs — when provided, overrides the legacy
   *  module-level localStorage load. Lets a parent component own
   *  persistence (e.g. via the unified ReaderSessionStorage adapter). */
  initialPrefs?: TtsPreferences;
  /** Called after the user changes prefs. When provided, replaces the
   *  legacy module-level localStorage save so the parent can route
   *  persistence through its own adapter. */
  onPrefsChange?: (prefs: TtsPreferences) => void;
}

export function useTts(options: UseTtsOptions = {}): UseTtsResult {
  const { initialPrefs, onPrefsChange } = options;
  const onPrefsChangeRef = useRef(onPrefsChange);
  onPrefsChangeRef.current = onPrefsChange;
  const provider = useMemo(() => getTtsProvider(), []);
  const supported = provider.isSupported();

  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [state, setState] = useState<TtsState>(provider.getState());
  const [lastEvent, setLastEvent] = useState<TtsEvent | null>(null);
  const [prefs, setPrefsState] = useState<TtsPreferences>(() => {
    if (initialPrefs) return { ...initialPrefs };
    return typeof window === "undefined" ? { ...DEFAULT_TTS_PREFS } : loadTtsPreferences();
  });
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Keep internal prefs in sync with parent-provided `initialPrefs` (e.g.
  // when the parent owns persistence via the unified ReaderSessionStorage
  // adapter and rehydrates after a book switch or async load). Without this,
  // a subsequent partial pref edit would merge against stale internal state
  // and drop the freshly hydrated fields.
  useEffect(() => {
    if (!initialPrefs) return;
    const a = prefsRef.current;
    const b = initialPrefs;
    if (
      a.voiceId === b.voiceId &&
      a.rate === b.rate &&
      a.pitch === b.pitch &&
      a.volume === b.volume
    ) {
      return;
    }
    setPrefsState({ ...b });
  }, [initialPrefs]);

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
      // If the parent is owning persistence (unified session adapter), defer
      // to its callback. Otherwise fall back to the legacy module-level save
      // so standalone uses of the hook keep their persistence behaviour.
      if (onPrefsChangeRef.current) onPrefsChangeRef.current(next);
      else saveTtsPreferences(next);
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
