interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach(key => {
      if (key.startsWith(prefix)) this.cache.delete(key);
    });
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    entries.forEach(([key, entry]) => {
      if (now > entry.expiresAt) this.cache.delete(key);
    });
  }

  stats(): { size: number; keys: string[] } {
    return { size: this.cache.size, keys: Array.from(this.cache.keys()) };
  }
}

export const apiCache = new ApiCache();

export const CACHE_TTL = {
  BOOKS: 10 * 60 * 1000,
  SEARCH: 5 * 60 * 1000,
  METADATA: 30 * 60 * 1000,
  COVERS: 60 * 60 * 1000,
  PODCASTS: 15 * 60 * 1000,
  SHORT: 2 * 60 * 1000,
};

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const delay = retryAfter
          ? parseInt(retryAfter) * 1000
          : baseDelayMs * Math.pow(2, attempt);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      return response;
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
}

export async function cachedFetch<T>(
  cacheKey: string,
  ttl: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cached = apiCache.get<T>(cacheKey);
  if (cached !== null) return cached;

  const data = await fetchFn();
  apiCache.set(cacheKey, data, ttl);
  return data;
}
