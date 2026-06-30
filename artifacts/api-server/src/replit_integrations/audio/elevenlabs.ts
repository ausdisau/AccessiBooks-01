const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

interface CachedVoices {
  voices: ElevenLabsVoice[];
  fetchedAt: number;
}

let voiceCache: CachedVoices | null = null;
const VOICE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Well-known default ElevenLabs voice IDs for common "premade" voices.
// These are stable voice IDs that work with any ElevenLabs API key.
export const ELEVENLABS_DEFAULT_VOICES: ElevenLabsVoice[] = [
  { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", category: "premade", description: "Calm, young American female — great for audiobooks" },
  { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", category: "premade", description: "Strong, confident American female" },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", category: "premade", description: "Soft, warm American female" },
  { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni", category: "premade", description: "Well-rounded American male" },
  { voice_id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", category: "premade", description: "Emotional, young American female" },
  { voice_id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", category: "premade", description: "Deep American male — ideal for narration" },
  { voice_id: "VR6AewLTigWG4xSOukaG", name: "Arnold", category: "premade", description: "Crisp, mature American male" },
  { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", category: "premade", description: "Deep, authoritative American male" },
  { voice_id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", category: "premade", description: "Raspy, energetic American male" },
  { voice_id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", category: "premade", description: "Deep, warm British male — excellent for audiobooks" },
  { voice_id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", category: "premade", description: "Seductive, Swedish-accented female" },
  { voice_id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", category: "premade", description: "Confident, British female narrator" },
];

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

export async function listVoices(): Promise<ElevenLabsVoice[]> {
  if (voiceCache && Date.now() - voiceCache.fetchedAt < VOICE_CACHE_TTL_MS) {
    return voiceCache.voices;
  }

  try {
    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      headers: { "xi-api-key": getApiKey() },
    });

    if (!response.ok) {
      const errText = await response.text();
      // If the error is a permissions issue, fall back gracefully to default voices
      if (response.status === 401 || response.status === 403) {
        console.warn(`[ElevenLabs] Cannot list voices (permission/auth issue). Using default voice list. Error: ${errText}`);
        voiceCache = { voices: ELEVENLABS_DEFAULT_VOICES, fetchedAt: Date.now() };
        return ELEVENLABS_DEFAULT_VOICES;
      }
      throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as { voices: ElevenLabsVoice[] };
    voiceCache = { voices: data.voices, fetchedAt: Date.now() };
    return data.voices;
  } catch (err: any) {
    // On any fetch failure, return defaults to keep the UI functional
    if (err.message?.includes("ElevenLabs API error")) throw err;
    console.warn("[ElevenLabs] listVoices failed, using defaults:", err.message);
    return ELEVENLABS_DEFAULT_VOICES;
  }
}

export async function textToSpeech(
  text: string,
  voiceId: string,
  options?: {
    stability?: number;
    similarityBoost?: number;
    modelId?: string;
  }
): Promise<Buffer> {
  const modelId = options?.modelId || "eleven_turbo_v2_5";
  const stability = options?.stability ?? 0.5;
  const similarityBoost = options?.similarityBoost ?? 0.75;

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs TTS error ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Character-level alignment returned by the ElevenLabs `/with-timestamps`
// endpoint. Arrays are parallel: `characters[i]` is spoken from
// `character_start_times_seconds[i]` to `character_end_times_seconds[i]`
// (seconds, relative to the returned audio clip).
export interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TimestampedSpeech {
  audio: Buffer;
  alignment: CharacterAlignment | null;
}

// Like `textToSpeech`, but uses the `/with-timestamps` endpoint so we can
// capture per-character timing for read-along (karaoke) sync. Returns the
// decoded mp3 buffer plus the character alignment (or null if the provider
// omitted it). Callers should fall back to plain `textToSpeech` on failure.
export async function textToSpeechWithTimestamps(
  text: string,
  voiceId: string,
  options?: {
    stability?: number;
    similarityBoost?: number;
    modelId?: string;
  }
): Promise<TimestampedSpeech> {
  const modelId = options?.modelId || "eleven_turbo_v2_5";
  const stability = options?.stability ?? 0.5;
  const similarityBoost = options?.similarityBoost ?? 0.75;

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs TTS (timestamps) error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    audio_base64?: string;
    alignment?: CharacterAlignment | null;
    normalized_alignment?: CharacterAlignment | null;
  };

  if (!data.audio_base64) {
    throw new Error("ElevenLabs TTS (timestamps) response missing audio");
  }

  const audio = Buffer.from(data.audio_base64, "base64");
  const alignment = data.alignment ?? data.normalized_alignment ?? null;
  return { audio, alignment };
}

export type { ElevenLabsVoice };
