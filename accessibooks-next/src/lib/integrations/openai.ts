import { logger } from "../logger";

/**
 * Thin OpenAI wrapper for Easy English conversion + transcript helpers.
 * The actual SDK call is gated on OPENAI_API_KEY; when absent we return
 * a deterministic passthrough so dev/CI doesn't make network calls.
 */
export async function easyEnglishConvert(text: string): Promise<{ text: string; cached: boolean }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    logger.warn("OPENAI_API_KEY missing — returning passthrough for easyEnglishConvert");
    return { text, cached: true };
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Rewrite the user's text in Easy English: short sentences, common words, plain language. Keep meaning faithful.",
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "OpenAI returned non-OK; falling back to passthrough");
      return { text, cached: false };
    }
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return { text: data.choices[0]?.message?.content ?? text, cached: false };
  } catch (err) {
    logger.warn({ err }, "OpenAI request failed; passthrough");
    return { text, cached: false };
  }
}
