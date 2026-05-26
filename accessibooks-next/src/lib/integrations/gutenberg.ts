import { fetchJson } from "./http";

const BASE = "https://gutendex.com";

export interface GutenbergBook {
  id: number;
  title: string;
  authors: { name: string; birth_year: number | null; death_year: number | null }[];
  subjects: string[];
  languages: string[];
  formats: Record<string, string>;
  download_count: number;
}

export interface GutenbergPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutenbergBook[];
}

export async function fetchGutenbergPage(opts: { page?: number; search?: string; languages?: string } = {}): Promise<GutenbergPage> {
  const qs = new URLSearchParams();
  if (opts.page) qs.set("page", String(opts.page));
  if (opts.search) qs.set("search", opts.search);
  if (opts.languages) qs.set("languages", opts.languages);
  return fetchJson<GutenbergPage>(`${BASE}/books?${qs}`);
}
