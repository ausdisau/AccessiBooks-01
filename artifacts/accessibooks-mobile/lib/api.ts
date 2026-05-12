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

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

export function apiBase(): string {
  if (DOMAIN) return `https://${DOMAIN}`;
  return "";
}

export function bookCover(book: Book): string | null {
  if (book.coverUrl && book.coverUrl.length > 0) return book.coverUrl;
  return null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Accept: "application/json" },
  });
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

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
