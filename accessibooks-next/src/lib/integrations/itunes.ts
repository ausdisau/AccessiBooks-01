import { fetchJson } from "./http";

const BASE = "https://itunes.apple.com";

export interface ItunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
  feedUrl?: string;
  previewUrl?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
}

export async function searchItunes(opts: {
  term: string;
  media?: "podcast" | "audiobook";
  limit?: number;
}) {
  const qs = new URLSearchParams({
    term: opts.term,
    media: opts.media ?? "podcast",
    limit: String(opts.limit ?? 25),
  });
  const data = await fetchJson<{ resultCount: number; results: ItunesResult[] }>(`${BASE}/search?${qs}`);
  return data;
}

export async function lookupItunes(id: number) {
  const data = await fetchJson<{ results: ItunesResult[] }>(`${BASE}/lookup?id=${id}`);
  return data.results[0];
}
