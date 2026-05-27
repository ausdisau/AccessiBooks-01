import OpenAI from "openai";

const apiKey =
  process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const baseURL =
  process.env.OPENAI_BASE_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

if (!apiKey) {
  console.warn(
    "[openai] OPENAI_API_KEY is not set; AI features will fail until configured.",
  );
}

export const openai = new OpenAI({
  apiKey: apiKey ?? "missing-api-key",
  ...(baseURL ? { baseURL } : {}),
});

export const OPENAI_IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3";
export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "tts-1";
