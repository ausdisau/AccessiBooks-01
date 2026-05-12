interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  lastAccessed: number;
  size: number;
  hits: number;
}

const MAX_CACHE_ENTRIES = 5000;
const MAX_CACHE_SIZE_MB = 100;

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout;
  private totalSize = 0;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.totalSize -= entry.size;
      this.cache.delete(key);
      return null;
    }
    entry.lastAccessed = Date.now();
    entry.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    const serialized = JSON.stringify(data);
    const size = serialized.length;

    if (this.cache.has(key)) {
      this.totalSize -= this.cache.get(key)!.size;
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      lastAccessed: Date.now(),
      size,
      hits: 0,
    });
    this.totalSize += size;

    if (this.cache.size > MAX_CACHE_ENTRIES || this.totalSize > MAX_CACHE_SIZE_MB * 1024 * 1024) {
      this.evictLRU();
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  invalidate(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalSize -= entry.size;
      this.cache.delete(key);
    }
  }

  invalidatePrefix(prefix: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        const entry = this.cache.get(key);
        if (entry) this.totalSize -= entry.size;
        this.cache.delete(key);
      }
    });
  }

  private evictLRU(): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const targetEntries = Math.floor(MAX_CACHE_ENTRIES * 0.8);
    const targetBytes = MAX_CACHE_SIZE_MB * 1024 * 1024 * 0.8;
    while (
      (this.cache.size > targetEntries || this.totalSize > targetBytes) &&
      entries.length > 0
    ) {
      const [key, entry] = entries.shift()!;
      this.totalSize -= entry.size;
      this.cache.delete(key);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    entries.forEach(([key, entry]) => {
      if (now > entry.expiresAt) {
        this.totalSize -= entry.size;
        this.cache.delete(key);
      }
    });
  }

  stats(): { size: number; totalSizeMB: string; keys: string[] } {
    return {
      size: this.cache.size,
      totalSizeMB: (this.totalSize / (1024 * 1024)).toFixed(2),
      keys: Array.from(this.cache.keys()),
    };
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
  PAGINATED: 3 * 60 * 1000,
  DB_SEARCH: 2 * 60 * 1000,
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
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelayMs * Math.pow(2, attempt);
        console.warn(`Rate limited on ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`Request failed for ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

export async function cachedFetch<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = apiCache.get<T>(key);
  if (cached !== null) return cached;

  const data = await fetcher();
  apiCache.set(key, data, ttl);
  return data;
}
