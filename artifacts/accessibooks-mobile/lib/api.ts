import AsyncStorage from "@react-native-async-storage/async-storage";

export type Book = {
  id: string;
  title: string;
  author?: string | null;
  coverUrl?: string | null;
  description?: string | null;
  contentType?: string | null;
  source?: string | null;
  audioUrl?: string | null;
  duration?: number | null;
  pageCount?: number | null;
  genre?: string | null;
  language?: string | null;
  readingLevel?: number | null;
  publishedDate?: string | null;
};

export type BooksPage = {
  data: Book[];
  hasMore: boolean;
  total?: number;
};

export type Me = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  subscriptionTier?: string | null;
};

export type SettingsSummary = {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    subscriptionTier: string;
    subscriptionEndDate: string | null;
  };
  preferences: Record<string, unknown> & {
    skipForwardSeconds?: number;
    skipBackwardSeconds?: number;
    fontSize?: number;
    dyslexiaFont?: boolean;
    highContrast?: boolean;
  };
};

/**
 * Read-along (karaoke) timing. Mirrors the GET /api/books/:id/word-alignment
 * contract in the API server (artifacts/api-server/src/transcripts.ts): word-
 * AND sentence-level timing in milliseconds. `available` is false when the
 * title has no usable timing, so clients only surface read-along when it works.
 */
export type WordAlignment = {
  word: string;
  startMs: number;
  endMs: number;
  wordIndex: number;
  segmentIndex: number;
};

export type AlignmentSegment = {
  text: string;
  startMs: number;
  endMs: number;
  segmentIndex: number;
  firstWordIndex: number;
  wordCount: number;
};

export type WordAlignmentResponse = {
  available: boolean;
  precision: "exact" | "estimated" | "none";
  words: WordAlignment[];
  segments: AlignmentSegment[];
};

export type ActiveLoan = {
  id: string;
  bookId: string;
  expiresAt: string;
  bookTitle: string;
  bookAuthor: string | null;
  bookCover: string | null;
};

export type ActiveLoansResponse = {
  loans: ActiveLoan[];
  limits: { tier: string; maxLoans: number };
};

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

export function apiBase(): string {
  if (DOMAIN) return `https://${DOMAIN}`;
  return "";
}

export function bookCover(book: Book): string | null {
  if (book.coverUrl && book.coverUrl.length > 0) return book.coverUrl;
  return null;
}

/**
 * JWT bearer-token authentication. React Native does not have a usable
 * cookie jar across native fetch + WebView, so the mobile app authenticates
 * exclusively via Authorization: Bearer <jwt> against the same API endpoints
 * the web app uses.
 */
const AUTH_TOKEN_KEY = "accessibooks_auth_token";

export async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    /* storage unavailable — request will fall back to unauthenticated */
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function getJson<T>(path: string, withAuth = false): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (withAuth) {
    Object.assign(headers, await authHeaders());
  }
  const res = await fetch(`${apiBase()}${path}`, { headers });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${path}`);
  return (await res.json()) as T;
}

export async function fetchBooks(params?: {
  limit?: number;
  search?: string;
  contentType?: string;
}): Promise<BooksPage> {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.contentType) q.set("contentType", params.contentType);
  const qs = q.toString();
  return getJson<BooksPage>(`/api/books${qs ? `?${qs}` : ""}`);
}

export async function fetchTrending(): Promise<Book[]> {
  return getJson<Book[]>("/api/books/trending");
}

export async function fetchFeatured(): Promise<Book | null> {
  try {
    return await getJson<Book>("/api/books/featured");
  } catch {
    return null;
  }
}

export async function fetchEasyRead(): Promise<BooksPage> {
  return getJson<BooksPage>("/api/books/easy-read?limit=24");
}

export async function fetchBook(id: string): Promise<Book> {
  return getJson<Book>(`/api/books/${encodeURIComponent(id)}`);
}

const EMPTY_ALIGNMENT: WordAlignmentResponse = {
  available: false,
  precision: "none",
  words: [],
  segments: [],
};

/**
 * Public endpoint — returns read-along timing for a title, or a safe
 * "unavailable" payload when timing is missing or the request fails. Callers
 * should only surface read-along UI when `available` is true.
 */
export async function fetchWordAlignment(
  id: string,
): Promise<WordAlignmentResponse> {
  try {
    return await getJson<WordAlignmentResponse>(
      `/api/books/${encodeURIComponent(id)}/word-alignment`,
    );
  } catch {
    return EMPTY_ALIGNMENT;
  }
}

/**
 * Authenticated endpoints. These return 401 when the user is not signed in
 * — callers should treat a thrown error as "not signed in" and fall back
 * to the guest UX (sign-in CTA, AsyncStorage recents, etc.).
 */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await getJson<Me>("/api/auth/me", true);
  } catch {
    return null;
  }
}

export async function fetchSettingsSummary(): Promise<SettingsSummary | null> {
  try {
    return await getJson<SettingsSummary>("/api/settings/summary", true);
  } catch {
    return null;
  }
}

export async function fetchActiveLoans(): Promise<ActiveLoansResponse | null> {
  try {
    return await getJson<ActiveLoansResponse>("/api/loans/active", true);
  } catch {
    return null;
  }
}

export type RevenueCatSyncResult = {
  tier: string;
  status: string | null;
  subscriptionEndDate: string | null;
};

/**
 * Reconcile the signed-in user's RevenueCat entitlements into their server
 * account (subscriptionTier). Called right after a purchase/restore so the
 * account reflects the new entitlement without waiting on the webhook. Returns
 * null when the request fails or the user is not signed in — callers fall back
 * to the local RevenueCat customerInfo state.
 */
export async function syncRevenueCatEntitlements(): Promise<RevenueCatSyncResult | null> {
  try {
    const res = await fetch(`${apiBase()}/api/billing/revenuecat/sync`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      body: "{}",
    });
    if (!res.ok) return null;
    return (await res.json()) as RevenueCatSyncResult;
  } catch {
    return null;
  }
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
