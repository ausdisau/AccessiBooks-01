import { fetchJson } from "./http";

const BASE = "https://librivox.org/api/feed/audiobooks";

export interface LibriVoxBook {
  id: string;
  title: string;
  description: string;
  url_zip_file: string;
  totaltime: string;
  totaltimesecs: number | string;
  copyright_year?: string;
  language: string;
  genres?: string[];
  authors: { first_name: string; last_name: string }[];
  sections?: { listen_url: string; title: string; duration?: string }[];
}

export async function searchLibriVox(params: {
  limit?: number;
  offset?: number;
  title?: string;
  author?: string;
}): Promise<LibriVoxBook[]> {
  const qs = new URLSearchParams({
    format: "json",
    extended: "1",
    limit: String(params.limit ?? 25),
    offset: String(params.offset ?? 0),
  });
  if (params.title) qs.set("title", params.title);
  if (params.author) qs.set("author", params.author);
  const data = await fetchJson<{ books?: LibriVoxBook[] }>(`${BASE}?${qs}`);
  return data.books ?? [];
}
