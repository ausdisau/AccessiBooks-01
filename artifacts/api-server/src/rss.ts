import Parser from "rss-parser";
import { promises as dns } from "dns";
import { isIP } from "net";
import * as http from "http";
import * as https from "https";

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("fec0") ||
    lower.startsWith("ff") ||
    lower.startsWith("::ffff:") ||
    lower.startsWith("64:ff9b:") ||
    lower.startsWith("2001:db8:")
  );
}

function assertPrivateNotLiteral(hostname: string): void {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid")
  ) {
    throw new Error("Feed URL resolves to a private or reserved address");
  }
}

function assertIpPublic(ip: string): void {
  const v = isIP(ip);
  if (v === 4 && isPrivateIpv4(ip)) {
    throw new Error("Feed URL resolves to a private or reserved address");
  }
  if (v === 6 && isPrivateIpv6(ip)) {
    throw new Error("Feed URL resolves to a private or reserved address");
  }
}

interface PinnedAddress {
  ip: string;
  family: 4 | 6;
}

async function resolveAndPin(rawUrl: string): Promise<{ parsed: URL; pinned: PinnedAddress }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid feed URL");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error("Feed URL must use http or https");
  }

  const hostname = parsed.hostname;

  const literalVersion = isIP(hostname);
  if (literalVersion === 4) {
    assertIpPublic(hostname);
    return { parsed, pinned: { ip: hostname, family: 4 } };
  }
  if (literalVersion === 6) {
    const clean = hostname.replace(/^\[|\]$/g, "");
    assertIpPublic(clean);
    return { parsed, pinned: { ip: clean, family: 6 } };
  }

  assertPrivateNotLiteral(hostname);

  const [v4result, v6result] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);

  const allAddresses: PinnedAddress[] = [];
  if (v4result.status === "fulfilled") {
    for (const ip of v4result.value) {
      assertIpPublic(ip);
      allAddresses.push({ ip, family: 4 });
    }
  }
  if (v6result.status === "fulfilled") {
    for (const ip of v6result.value) {
      assertIpPublic(ip);
      allAddresses.push({ ip, family: 6 });
    }
  }

  if (allAddresses.length === 0) {
    throw new Error("Feed URL hostname could not be resolved");
  }

  return { parsed, pinned: allAddresses[0] };
}

interface SafeResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  getHeader(name: string): string | null;
}

function pinnedRequest(
  parsed: URL,
  pinned: PinnedAddress,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;
    const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;

    const options: https.RequestOptions = {
      method: "GET",
      host: pinned.ip,
      port,
      path: (parsed.pathname || "/") + (parsed.search || ""),
      headers: {
        Host: parsed.host,
        "User-Agent": "AccessiBooks-PodcastIngestion/1.0",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        ...headers,
      },
    };

    if (isHttps) {
      (options as https.RequestOptions).servername = parsed.hostname;
    }

    const req = mod.request(options, (res) => {
      const statusCode = res.statusCode ?? 0;

      if (statusCode >= 300 && statusCode < 400) {
        res.resume();
        reject(new Error(`Feed returned redirect (${statusCode}); redirects are not followed`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const resHeaders = res.headers;
        resolve({
          status: statusCode,
          ok: statusCode >= 200 && statusCode < 300,
          text: async () => body,
          getHeader: (name: string) => {
            const val = resHeaders[name.toLowerCase()];
            if (val === undefined || val === null) return null;
            return Array.isArray(val) ? val[0] : val;
          },
        });
      });
      res.on("error", reject);
    });

    req.on("error", reject);

    const timer = setTimeout(() => {
      req.destroy(new Error("Feed request timed out"));
    }, timeoutMs);

    req.on("close", () => clearTimeout(timer));
    req.on("error", () => clearTimeout(timer));

    req.end();
  });
}

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "AccessiBooks-PodcastIngestion/1.0 (+https://accessibooks.replit.app)",
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
  const { parsed, pinned } = await resolveAndPin(feedUrl);

  const reqHeaders: Record<string, string> = {};
  if (etag) reqHeaders["If-None-Match"] = etag;
  if (lastModified) reqHeaders["If-Modified-Since"] = lastModified;

  const res = await pinnedRequest(parsed, pinned, reqHeaders, 20_000);

  if (res.status === 304) {
    return "not_modified";
  }

  if (!res.ok) {
    throw new Error(`Feed returned HTTP ${res.status}`);
  }

  const xml = await res.text();
  if (!xml.trim()) {
    throw new Error("Feed returned empty body");
  }

  const feed_parsed = await parser.parseString(xml);

  const feed: ParsedFeed = {
    title: feed_parsed.title || "Untitled Podcast",
    description: feed_parsed.description ? stripHtml(feed_parsed.description) : null,
    imageUrl: extractImageUrl(feed_parsed),
    author: (feed_parsed as any).itunesAuthor || feed_parsed.creator || null,
    language: feed_parsed.language || null,
    websiteUrl: feed_parsed.link || null,
    categories: extractCategories(feed_parsed),
  };

  const episodes: ParsedEpisode[] = (feed_parsed.items || [])
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
    etag: res.getHeader("etag"),
    lastModified: res.getHeader("last-modified"),
  };
}
