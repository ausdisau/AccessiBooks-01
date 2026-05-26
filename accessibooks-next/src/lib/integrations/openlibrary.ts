import { fetchJson } from "./http";

const BASE = "https://openlibrary.org";

export interface OpenLibrarySearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  language?: string[];
  subject?: string[];
}

export async function searchOpenLibrary(q: string, limit = 25, offset = 0) {
  const qs = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
  const data = await fetchJson<{ docs: OpenLibrarySearchDoc[]; numFound: number }>(`${BASE}/search.json?${qs}`);
  return data;
}

export function coverUrl(coverId: number, size: "S" | "M" | "L" = "L") {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}
