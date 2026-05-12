export type TtsState = "idle" | "speaking" | "paused" | "error";

export type TtsEvent =
  | { type: "start"; text: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "end" }
  | { type: "error"; message: string };

export type TtsListener = (event: TtsEvent) => void;

export interface TtsVoice {
  id: string;
  name: string;
  lang: string;
  isDefault: boolean;
}

export interface TtsSpeakOptions {
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}

/**
 * Provider abstraction so a premium / server TTS can replace the browser
 * SpeechSynthesis without any UI change.
 */
export interface TtsProvider {
  readonly id: string;
  isSupported(): boolean;
  getVoices(): Promise<TtsVoice[]>;
  speak(text: string, opts?: TtsSpeakOptions): void;
  pause(): void;
  resume(): void;
  stop(): void;
  getState(): TtsState;
  subscribe(listener: TtsListener): () => void;
}

class BrowserTtsProvider implements TtsProvider {
  readonly id = "browser-speech-synthesis";
  private state: TtsState = "idle";
  private listeners = new Set<TtsListener>();
  private current: SpeechSynthesisUtterance | null = null;

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  async getVoices(): Promise<TtsVoice[]> {
    if (!this.isSupported()) return [];
    const synth = window.speechSynthesis;
    const collect = (): TtsVoice[] =>
      synth.getVoices().map((v, i) => ({
        id: v.voiceURI || `${v.name}-${i}`,
        name: v.name,
        lang: v.lang,
        isDefault: v.default,
      }));
    let voices = collect();
    if (voices.length > 0) return voices;
    // Some browsers populate voices asynchronously.
    return new Promise<TtsVoice[]>((resolve) => {
      const handler = () => {
        voices = collect();
        if (voices.length > 0) {
          synth.removeEventListener("voiceschanged", handler);
          resolve(voices);
        }
      };
      synth.addEventListener("voiceschanged", handler);
      // Safety timeout — resolve with whatever we have after 1s.
      window.setTimeout(() => {
        synth.removeEventListener("voiceschanged", handler);
        resolve(collect());
      }, 1000);
    });
  }

  speak(text: string, opts: TtsSpeakOptions = {}): void {
    if (!this.isSupported()) {
      this.emit({ type: "error", message: "Text-to-speech is not supported in this browser." });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      this.emit({ type: "error", message: "There is nothing to read." });
      return;
    }
    const synth = window.speechSynthesis;
    // Always cancel anything in flight before starting fresh.
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(trimmed);
    if (opts.rate !== undefined) utter.rate = clamp(opts.rate, 0.5, 4);
    if (opts.pitch !== undefined) utter.pitch = clamp(opts.pitch, 0, 2);
    if (opts.volume !== undefined) utter.volume = clamp(opts.volume, 0, 1);
    if (opts.lang) utter.lang = opts.lang;
    if (opts.voiceId) {
      const match = synth.getVoices().find((v) => (v.voiceURI || v.name) === opts.voiceId);
      if (match) utter.voice = match;
    }
    utter.onstart = () => {
      this.state = "speaking";
      this.emit({ type: "start", text: trimmed });
    };
    utter.onpause = () => {
      this.state = "paused";
      this.emit({ type: "pause" });
    };
    utter.onresume = () => {
      this.state = "speaking";
      this.emit({ type: "resume" });
    };
    utter.onend = () => {
      // If current was already cleared by stop(), the stop event was emitted
      // there — suppress the duplicate end/stop announcement here.
      if (this.current === null) return;
      this.current = null;
      this.state = "idle";
      this.emit({ type: "end" });
    };
    utter.onerror = (e) => {
      // Browsers report a benign "interrupted"/"canceled" error when we
      // cancel mid-speech. stop() has already emitted; swallow this one.
      const errorName = (e as SpeechSynthesisErrorEvent).error;
      if (this.current === null && (errorName === "interrupted" || errorName === "canceled")) {
        return;
      }
      this.current = null;
      this.state = "error";
      this.emit({ type: "error", message: errorName || "Speech synthesis failed." });
    };
    this.current = utter;
    synth.speak(utter);
  }

  pause(): void {
    if (!this.isSupported()) return;
    if (this.state === "speaking") {
      window.speechSynthesis.pause();
    }
  }

  resume(): void {
    if (!this.isSupported()) return;
    if (this.state === "paused") {
      window.speechSynthesis.resume();
    }
  }

  stop(): void {
    if (!this.isSupported()) return;
    const wasActive = this.state !== "idle" && this.current !== null;
    // Mark current as null so the subsequent onend / onerror from cancel()
    // is treated as already-handled and does NOT emit a second stop event.
    this.current = null;
    window.speechSynthesis.cancel();
    if (wasActive) {
      this.state = "idle";
      this.emit({ type: "stop" });
    }
  }

  getState(): TtsState {
    return this.state;
  }

  subscribe(listener: TtsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TtsEvent): void {
    this.listeners.forEach((l) => {
      try {
        l(event);
      } catch {
        /* listener errors are non-fatal */
      }
    });
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

let _provider: TtsProvider | null = null;

export function getTtsProvider(): TtsProvider {
  if (!_provider) _provider = new BrowserTtsProvider();
  return _provider;
}

/** For tests / future swap-in of a premium server-side TTS. */
export function setTtsProvider(provider: TtsProvider): void {
  _provider = provider;
}

export const TTS_BOUNDS = {
  rate: { min: 0.5, max: 2, step: 0.1 },
  pitch: { min: 0, max: 2, step: 0.1 },
  volume: { min: 0, max: 1, step: 0.05 },
} as const;

export interface TtsPreferences {
  voiceId: string | null;
  rate: number;
  pitch: number;
  volume: number;
}

export const DEFAULT_TTS_PREFS: TtsPreferences = {
  voiceId: null,
  rate: 1,
  pitch: 1,
  volume: 1,
};

const TTS_STORAGE_KEY = "accessibooks:flipbook-tts:v1";

function clampPref(
  value: unknown,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, n));
}

export function loadTtsPreferences(): TtsPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_TTS_PREFS };
  try {
    const raw = window.localStorage.getItem(TTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TTS_PREFS };
    const parsed = JSON.parse(raw) as Partial<TtsPreferences>;
    return {
      voiceId: typeof parsed.voiceId === "string" ? parsed.voiceId : null,
      rate: clampPref(parsed.rate, DEFAULT_TTS_PREFS.rate, TTS_BOUNDS.rate),
      pitch: clampPref(parsed.pitch, DEFAULT_TTS_PREFS.pitch, TTS_BOUNDS.pitch),
      volume: clampPref(parsed.volume, DEFAULT_TTS_PREFS.volume, TTS_BOUNDS.volume),
    };
  } catch {
    return { ...DEFAULT_TTS_PREFS };
  }
}

export function saveTtsPreferences(prefs: TtsPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
