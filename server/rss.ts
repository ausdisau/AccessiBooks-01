import Parser from "rss-parser";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "AccessiBooks-PodcastIngestion/1.0 (+https://accessibooks.app)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  customFields: {
    feed: [
      "itunes:author" as any,
      "itunes:image" as any,
      "itunes:category" as any,
    ],
    item: [
      "itunes:duration" as any,
      "itunes:summary" as any,
      "itunes:explicit" as any,
      "itunes:image" as any,
    ],
  },
});

export interface ParsedFeed {
  title: string;
  description: string | null;
  imageUrl: string | null;
  author: string | null;
  language: string | null;
  websiteUrl: string | null;
  categories: string[];
}

export interface ParsedEpisode {
  guid: string | null;
  title: string;
  descriptionText: string | null;
  descriptionHtml: string | null;
  pubDate: Date | null;
  durationSeconds: number | null;
  audioUrl: string;
  audioType: string | null;
  audioLengthBytes: number | null;
  explicit: boolean | null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseDuration(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.trim();

  if (/^\d+$/.test(cleaned)) {
    const n = parseInt(cleaned, 10);
    return n > 0 ? n : null;
  }

  const parts = cleaned.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || null;
}

function extractImageUrl(feed: any): string | null {
  if (feed.itunesImage?.href) return feed.itunesImage.href;
  if (typeof feed.itunesImage === "string") return feed.itunesImage;
  if (feed.image?.url) return feed.image.url;
  return null;
}

function extractCategories(feed: any): string[] {
  const cats: string[] = [];
  if (feed.itunesCategory) {
    if (typeof feed.itunesCategory === "string") cats.push(feed.itunesCategory);
    else if (Array.isArray(feed.itunesCategory)) {
      feed.itunesCategory.forEach((c: any) => {
        if (typeof c === "string") cats.push(c);
        else if (c?.$ && c.$.text) cats.push(c.$.text);
      });
    } else if (feed.itunesCategory?.$ && feed.itunesCategory.$.text) {
      cats.push(feed.itunesCategory.$.text);
    }
  }
  return Array.from(new Set(cats));
}

export interface FetchResult {
  feed: ParsedFeed;
  episodes: ParsedEpisode[];
  etag: string | null;
  lastModified: string | null;
}

export async function fetchAndParseRSS(
  feedUrl: string,
  etag?: string | null,
  lastModified?: string | null
): Promise<FetchResult | "not_modified"> {
  const headers: Record<string, string> = {
    "User-Agent": "AccessiBooks-PodcastIngestion/1.0",
  };
  if (etag) headers["If-None-Match"] = etag;
  if (lastModified) headers["If-Modified-Since"] = lastModified;

  const res = await fetch(feedUrl, {
    headers,
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 304) {
    return "not_modified";
  }

  if (!res.ok) {
    throw new Error(`Feed returned HTTP ${res.status}: ${res.statusText}`);
  }

  const xml = await res.text();
  if (!xml.trim()) {
    throw new Error("Feed returned empty body");
  }

  const parsed = await parser.parseString(xml);

  const feed: ParsedFeed = {
    title: parsed.title || "Untitled Podcast",
    description: parsed.description ? stripHtml(parsed.description) : null,
    imageUrl: extractImageUrl(parsed),
    author: (parsed as any).itunesAuthor || parsed.creator || null,
    language: parsed.language || null,
    websiteUrl: parsed.link || null,
    categories: extractCategories(parsed),
  };

  const episodes: ParsedEpisode[] = (parsed.items || [])
    .filter((item: any) => item.enclosure?.url)
    .map((item: any) => {
      const rawDesc = item.content || item.contentSnippet || (item as any).itunesSummary || item.description || "";
      const hasHtml = /<[^>]+>/.test(rawDesc);

      return {
        guid: item.guid || null,
        title: item.title || "Untitled Episode",
        descriptionText: hasHtml ? stripHtml(rawDesc) : rawDesc || null,
        descriptionHtml: hasHtml ? rawDesc : null,
        pubDate: item.pubDate ? new Date(item.pubDate) : item.isoDate ? new Date(item.isoDate) : null,
        durationSeconds: parseDuration((item as any).itunesDuration),
        audioUrl: item.enclosure.url,
        audioType: item.enclosure.type || null,
        audioLengthBytes: item.enclosure.length ? parseInt(item.enclosure.length, 10) || null : null,
        explicit: (item as any).itunesExplicit === "yes" || (item as any).itunesExplicit === "true" ? true
          : (item as any).itunesExplicit === "no" || (item as any).itunesExplicit === "false" ? false
          : null,
      };
    });

  return {
    feed,
    episodes,
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}
