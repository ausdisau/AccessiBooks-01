import { logger } from "../logger";

export interface HttpOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
}

export async function safeFetch(
  url: string,
  opts: HttpOptions = {},
): Promise<Response> {
  const { timeoutMs = 15_000, retries = 1, retryDelayMs = 500, headers = {} } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "AccessiBooks/1.0", ...headers },
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      logger.warn({ url, attempt, err }, "safeFetch failed");
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error(`Fetch failed: ${url}`);
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: HttpOptions = {},
): Promise<T> {
  const res = await safeFetch(url, opts);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}
