import { DOMParser } from "@xmldom/xmldom";

export interface VASTCreative {
  mediaUrl: string;
  mimeType: string;
  bitrate?: number;
  duration: number;
}

export interface VASTCompanion {
  width: number;
  height: number;
  imageUrl?: string;
  clickThrough?: string;
  trackingPixels: string[];
}

export interface VASTTrackingEvents {
  impression: string[];
  start: string[];
  firstQuartile: string[];
  midpoint: string[];
  thirdQuartile: string[];
  complete: string[];
  skip: string[];
  mute: string[];
  unmute: string[];
  pause: string[];
  resume: string[];
  error: string[];
  clickThrough?: string;
  clickTracking: string[];
}

export interface VASTAd {
  id: string;
  title: string;
  description?: string;
  advertiser?: string;
  creatives: VASTCreative[];
  companions: VASTCompanion[];
  tracking: VASTTrackingEvents;
  skipOffset?: number;
  duration: number;
}

export interface VASTResponse {
  ads: VASTAd[];
  wrapperUrls: string[];
  wrapperTracking: Partial<VASTTrackingEvents>[];
  error?: string;
}

function getTextContent(parent: Element, tagName: string): string {
  const els = parent.getElementsByTagName(tagName);
  if (els.length === 0) return "";
  const el = els[0];
  if (!el) return "";
  return (el.textContent || "").trim();
}

function getElements(parent: Element, tagName: string): Element[] {
  const nodeList = parent.getElementsByTagName(tagName);
  const result: Element[] = [];
  for (let i = 0; i < nodeList.length; i++) {
    const node = nodeList[i];
    if (node) result.push(node as Element);
  }
  return result;
}

function parseDuration(durationStr: string): number {
  if (!durationStr) return 0;
  const parts = durationStr.split(":");
  if (parts.length === 3) {
    return (parseInt(parts[0]!) * 3600) + (parseInt(parts[1]!) * 60) + parseFloat(parts[2]!);
  }
  if (parts.length === 2) {
    return (parseInt(parts[0]!) * 60) + parseFloat(parts[1]!);
  }
  return parseFloat(durationStr) || 0;
}

function parseSkipOffset(skipOffset: string | null): number | undefined {
  if (!skipOffset) return undefined;
  if (skipOffset.includes(":")) {
    return parseDuration(skipOffset);
  }
  if (skipOffset.endsWith("%")) {
    return undefined;
  }
  return parseFloat(skipOffset) || undefined;
}

function extractTrackingEvents(trackingEventsEl: Element): Partial<VASTTrackingEvents> {
  const events: Partial<VASTTrackingEvents> = {};
  const trackings = getElements(trackingEventsEl, "Tracking");
  for (const tracking of trackings) {
    const event = tracking.getAttribute("event");
    const url = (tracking.textContent || "").trim();
    if (!event || !url) continue;

    const key = event as keyof VASTTrackingEvents;
    if (key in events) {
      const existing = events[key];
      if (Array.isArray(existing)) {
        existing.push(url);
      }
    } else {
      (events as any)[key] = [url];
    }
  }
  return events;
}

function emptyTracking(): VASTTrackingEvents {
  return {
    impression: [],
    start: [],
    firstQuartile: [],
    midpoint: [],
    thirdQuartile: [],
    complete: [],
    skip: [],
    mute: [],
    unmute: [],
    pause: [],
    resume: [],
    error: [],
    clickTracking: [],
  };
}

function mergeTrackingInto(target: VASTTrackingEvents, source: Partial<VASTTrackingEvents>) {
  for (const [key, urls] of Object.entries(source)) {
    if (key === "clickThrough") {
      if (!target.clickThrough && typeof urls === "string") {
        target.clickThrough = urls;
      }
    } else {
      const tKey = key as keyof VASTTrackingEvents;
      const existing = target[tKey];
      if (Array.isArray(existing) && Array.isArray(urls)) {
        existing.push(...urls);
      }
    }
  }
}

function extractWrapperTracking(wrapperEl: Element): Partial<VASTTrackingEvents> {
  const tracking: Partial<VASTTrackingEvents> = {};

  const impressionEls = getElements(wrapperEl, "Impression");
  const impressions: string[] = [];
  for (const imp of impressionEls) {
    const url = (imp.textContent || "").trim();
    if (url) impressions.push(url);
  }
  if (impressions.length > 0) tracking.impression = impressions;

  const errorEls = getElements(wrapperEl, "Error");
  const errors: string[] = [];
  for (const err of errorEls) {
    const url = (err.textContent || "").trim();
    if (url) errors.push(url);
  }
  if (errors.length > 0) tracking.error = errors;

  const creativeEls = getElements(wrapperEl, "Creative");
  for (const creative of creativeEls) {
    const linearEls = getElements(creative, "Linear");
    for (const linear of linearEls) {
      const trackingEventsEls = getElements(linear, "TrackingEvents");
      for (const te of trackingEventsEls) {
        const events = extractTrackingEvents(te);
        for (const [key, urls] of Object.entries(events)) {
          const tKey = key as keyof Partial<VASTTrackingEvents>;
          if (Array.isArray(urls)) {
            if (!tracking[tKey]) {
              (tracking as any)[tKey] = [];
            }
            (tracking[tKey] as string[]).push(...urls);
          }
        }
      }
    }
  }

  return tracking;
}

export function parseVAST(xml: string): VASTResponse {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");

    const parseErrors = getElements(doc.documentElement!, "parsererror");
    if (parseErrors.length > 0) {
      return { ads: [], wrapperUrls: [], wrapperTracking: [], error: "Failed to parse VAST XML" };
    }

    const errorEls = getElements(doc.documentElement!, "Error");
    const vastErrors = errorEls.map(el => (el.textContent || "").trim()).filter(Boolean);

    const ads: VASTAd[] = [];
    const wrapperUrls: string[] = [];
    const wrapperTracking: Partial<VASTTrackingEvents>[] = [];

    const adContainers = getElements(doc.documentElement!, "Ad");

    if (adContainers.length === 0) {
      return { ads: [], wrapperUrls: [], wrapperTracking: [], error: vastErrors.length > 0 ? vastErrors.join("; ") : "No ads in VAST response" };
    }

    for (const adContainer of adContainers) {
      const adId = adContainer.getAttribute("id") || `ad_${Date.now()}`;

      const wrapperEls = getElements(adContainer, "Wrapper");
      if (wrapperEls.length > 0) {
        const wrapper = wrapperEls[0]!;
        const tagUri = getTextContent(wrapper, "VASTAdTagURI");
        if (tagUri) {
          wrapperUrls.push(tagUri);
          wrapperTracking.push(extractWrapperTracking(wrapper));
        }
        continue;
      }

      const inLineEls = getElements(adContainer, "InLine");
      if (inLineEls.length === 0) continue;
      const inLine = inLineEls[0]!;

      const title = getTextContent(inLine, "AdTitle") || "Advertisement";
      const description = getTextContent(inLine, "Description") || undefined;
      const advertiser = getTextContent(inLine, "Advertiser") || undefined;

      const tracking = emptyTracking();

      const impressionEls = getElements(inLine, "Impression");
      for (const imp of impressionEls) {
        const url = (imp.textContent || "").trim();
        if (url) tracking.impression.push(url);
      }

      const creatives: VASTCreative[] = [];
      const companions: VASTCompanion[] = [];
      let adDuration = 0;
      let skipOffset: number | undefined;

      const creativeEls = getElements(inLine, "Creative");
      for (const creative of creativeEls) {
        const linearEls = getElements(creative, "Linear");
        for (const linear of linearEls) {
          const skipAttr = linear.getAttribute("skipoffset");
          if (skipAttr) {
            skipOffset = parseSkipOffset(skipAttr);
          }

          const durationStr = getTextContent(linear, "Duration");
          const duration = parseDuration(durationStr);
          if (duration > adDuration) adDuration = duration;

          const trackingEventsEls = getElements(linear, "TrackingEvents");
          for (const te of trackingEventsEls) {
            const events = extractTrackingEvents(te);
            mergeTrackingInto(tracking, events);
          }

          const videoClicksEls = getElements(linear, "VideoClicks");
          for (const vc of videoClicksEls) {
            const ct = getTextContent(vc, "ClickThrough");
            if (ct) tracking.clickThrough = ct;
            const ctTracking = getElements(vc, "ClickTracking");
            for (const ctt of ctTracking) {
              const url = (ctt.textContent || "").trim();
              if (url) tracking.clickTracking.push(url);
            }
          }

          const mediaFiles = getElements(linear, "MediaFile");
          for (const mf of mediaFiles) {
            const url = (mf.textContent || "").trim();
            const type = mf.getAttribute("type") || "audio/mpeg";
            const bitrate = mf.getAttribute("bitrate");

            if (url && (type.startsWith("audio/") || type === "application/ogg")) {
              creatives.push({
                mediaUrl: url,
                mimeType: type,
                bitrate: bitrate ? parseInt(bitrate) : undefined,
                duration,
              });
            }
          }
        }

        const companionAdsEls = getElements(creative, "CompanionAds");
        for (const ca of companionAdsEls) {
          const companionEls = getElements(ca, "Companion");
          for (const comp of companionEls) {
            const width = parseInt(comp.getAttribute("width") || "0");
            const height = parseInt(comp.getAttribute("height") || "0");

            const staticResource = getTextContent(comp, "StaticResource");
            const clickThrough = getTextContent(comp, "CompanionClickThrough");

            const companionTrackingPixels: string[] = [];
            const companionTrackingEls = getElements(comp, "TrackingEvents");
            for (const te of companionTrackingEls) {
              const trackings = getElements(te, "Tracking");
              for (const t of trackings) {
                const url = (t.textContent || "").trim();
                if (url) companionTrackingPixels.push(url);
              }
            }

            if (staticResource || clickThrough) {
              companions.push({
                width,
                height,
                imageUrl: staticResource || undefined,
                clickThrough: clickThrough || undefined,
                trackingPixels: companionTrackingPixels,
              });
            }
          }
        }
      }

      if (creatives.length > 0) {
        ads.push({
          id: adId,
          title,
          description,
          advertiser,
          creatives,
          companions,
          tracking,
          skipOffset,
          duration: adDuration,
        });
      }
    }

    return { ads, wrapperUrls, wrapperTracking };
  } catch (err) {
    return { ads: [], wrapperUrls: [], wrapperTracking: [], error: `VAST parse error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const MAX_WRAPPER_DEPTH = 5;

export async function resolveVAST(xml: string, timeout: number = 3000, depth: number = 0): Promise<VASTResponse> {
  const result = parseVAST(xml);

  if (result.ads.length > 0) {
    return result;
  }

  if (result.wrapperUrls.length === 0) {
    return result;
  }

  if (depth >= MAX_WRAPPER_DEPTH) {
    return { ads: [], wrapperUrls: [], wrapperTracking: [], error: "Max VAST wrapper depth exceeded" };
  }

  for (let i = 0; i < result.wrapperUrls.length; i++) {
    const wrapperUrl = result.wrapperUrls[i]!;
    const wrapperTrack = result.wrapperTracking[i] || {};

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(wrapperUrl, {
        signal: controller.signal,
        headers: {
          "Accept": "application/xml, text/xml",
          "User-Agent": "AccessiBooks/1.0",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`[VASTResolver] Wrapper fetch failed: HTTP ${response.status}`);
        continue;
      }

      const innerXml = await response.text();
      const innerResult = await resolveVAST(innerXml, timeout, depth + 1);

      if (innerResult.ads.length > 0) {
        for (const ad of innerResult.ads) {
          mergeTrackingInto(ad.tracking, wrapperTrack);
        }
        return innerResult;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log(`[VASTResolver] Wrapper fetch timeout for depth ${depth}`);
      } else {
        console.log(`[VASTResolver] Wrapper error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { ads: [], wrapperUrls: [], wrapperTracking: [], error: "All VAST wrappers failed to resolve" };
}

export function selectBestCreative(creatives: VASTCreative[]): VASTCreative | null {
  if (creatives.length === 0) return null;

  const audioCreatives = creatives.filter(c =>
    c.mimeType === "audio/mpeg" || c.mimeType === "audio/mp3" ||
    c.mimeType === "audio/ogg" || c.mimeType === "audio/aac" ||
    c.mimeType === "audio/wav" || c.mimeType === "application/ogg"
  );

  if (audioCreatives.length === 0) return creatives[0]!;

  const mp3 = audioCreatives.find(c => c.mimeType === "audio/mpeg" || c.mimeType === "audio/mp3");
  if (mp3) return mp3;

  return audioCreatives[0]!;
}

export function selectBestCompanion(companions: VASTCompanion[], preferredWidth = 300, preferredHeight = 250): VASTCompanion | null {
  if (companions.length === 0) return null;

  const exact = companions.find(c => c.width === preferredWidth && c.height === preferredHeight);
  if (exact) return exact;

  return companions[0]!;
}
