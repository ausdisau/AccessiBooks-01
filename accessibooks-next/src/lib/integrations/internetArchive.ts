import { fetchJson } from "./http";

const BASE = "https://archive.org";

export interface InternetArchiveDoc {
  identifier: string;
  title: string;
  creator?: string | string[];
  description?: string | string[];
  language?: string | string[];
  mediatype?: string;
  downloads?: number;
}

export async function searchInternetArchive(q: string, rows = 25, page = 1) {
  const qs = new URLSearchParams({
    q,
    output: "json",
    rows: String(rows),
    page: String(page),
    "fl[]": "identifier",
  });
  const url = `${BASE}/advancedsearch.php?${qs}&fl[]=title&fl[]=creator&fl[]=description&fl[]=language&fl[]=mediatype&fl[]=downloads`;
  const data = await fetchJson<{ response: { docs: InternetArchiveDoc[]; numFound: number } }>(url);
  return data.response;
}

export function archiveItemAudioUrl(identifier: string, filename: string) {
  return `${BASE}/download/${identifier}/${encodeURIComponent(filename)}`;
}
