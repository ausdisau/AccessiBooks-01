import crypto from "crypto";

const PAAPI_HOST = "webservices.amazon.com";
const PAAPI_ENDPOINT = `https://${PAAPI_HOST}/paapi5/searchitems`;
const PAAPI_GET_ENDPOINT = `https://${PAAPI_HOST}/paapi5/getitems`;
const SERVICE = "ProductAdvertisingAPI";

const {
  AMAZON_ACCESS_KEY,
  AMAZON_SECRET_KEY,
  AMAZON_PARTNER_TAG,
  AMAZON_REGION,
} = process.env;

const region = AMAZON_REGION || "us-east-1";
const amazonEnabled = !!(AMAZON_ACCESS_KEY && AMAZON_SECRET_KEY && AMAZON_PARTNER_TAG);

if (amazonEnabled) {
  console.log("Amazon Product Advertising API integration initialized");
} else {
  console.log(
    "Amazon Product Advertising API not configured - missing AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, or AMAZON_PARTNER_TAG"
  );
}

export interface AmazonAudiobook {
  asin: string;
  title: string;
  authors: string[];
  coverUrl: string;
  price?: string;
  rating?: number;
  reviewCount?: number;
  detailPageUrl: string;
  narrator?: string;
  duration?: string;
}

export function isAmazonEnabled(): boolean {
  return amazonEnabled;
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, regionName);
  const kService = hmacSha256(kRegion, serviceName);
  const kSigning = hmacSha256(kService, "aws4_request");
  return kSigning;
}

function signRequest(
  payload: string,
  target: string,
  path: string
): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const contentType = "application/json; charset=UTF-8";
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:${contentType}\n` +
    `host:${PAAPI_HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;

  const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";
  const payloadHash = sha256(payload);

  const canonicalRequest = [
    "POST",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(AMAZON_SECRET_KEY!, dateStamp, region, SERVICE);
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${AMAZON_ACCESS_KEY!}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  return {
    "Content-Type": contentType,
    "Content-Encoding": "amz-1.0",
    "Host": PAAPI_HOST,
    "X-Amz-Date": amzDate,
    "X-Amz-Target": target,
    "Authorization": authorizationHeader,
  };
}

function parseItem(item: any): AmazonAudiobook {
  const info = item.ItemInfo || {};
  const title = info.Title?.DisplayValue || "Unknown Title";
  const authors: string[] = [];

  if (info.ByLineInfo?.Contributors) {
    for (const contributor of info.ByLineInfo.Contributors) {
      if (
        contributor.RoleType === "author" ||
        contributor.Role === "Author" ||
        contributor.RoleType === "Author"
      ) {
        authors.push(contributor.Name);
      }
    }
  }

  if (authors.length === 0 && info.ByLineInfo?.Contributors?.length) {
    authors.push(info.ByLineInfo.Contributors[0].Name);
  }

  let narrator: string | undefined;
  if (info.ByLineInfo?.Contributors) {
    for (const contributor of info.ByLineInfo.Contributors) {
      if (
        contributor.RoleType === "narrator" ||
        contributor.Role === "Narrator" ||
        contributor.RoleType === "Narrator"
      ) {
        narrator = contributor.Name;
        break;
      }
    }
  }

  const coverUrl =
    item.Images?.Primary?.Large?.URL ||
    item.Images?.Primary?.Medium?.URL ||
    item.Images?.Primary?.Small?.URL ||
    "";

  let price: string | undefined;
  if (item.Offers?.Listings?.[0]?.Price) {
    const listing = item.Offers.Listings[0].Price;
    price = listing.DisplayAmount || `$${listing.Amount}`;
  }

  let rating: number | undefined;
  let reviewCount: number | undefined;
  if (info.CustomerRatings) {
    rating = info.CustomerRatings.StarRating?.Value;
    reviewCount = info.CustomerRatings.Count;
  }

  const detailPageUrl = item.DetailPageURL || "";

  let duration: string | undefined;
  if (info.ContentInfo?.Languages?.DisplayValues) {
    duration = undefined;
  }
  if (info.TechnicalInfo?.Formats?.DisplayValues) {
    const formats = info.TechnicalInfo.Formats.DisplayValues;
    if (Array.isArray(formats)) {
      const audiobookFormat = formats.find(
        (f: string) => f.toLowerCase().includes("audible") || f.toLowerCase().includes("audio")
      );
      if (audiobookFormat) {
        duration = audiobookFormat;
      }
    }
  }

  return {
    asin: item.ASIN,
    title,
    authors,
    coverUrl,
    price,
    rating,
    reviewCount,
    detailPageUrl,
    narrator,
    duration,
  };
}

export async function searchAmazonAudiobooks(
  query: string,
  limit: number = 10
): Promise<AmazonAudiobook[]> {
  if (!amazonEnabled) {
    console.warn("Amazon PA-API not configured, returning empty results");
    return [];
  }

  try {
    const payload = JSON.stringify({
      Keywords: `${query} audiobook`,
      SearchIndex: "Books",
      ItemCount: Math.min(limit, 10),
      PartnerTag: AMAZON_PARTNER_TAG!,
      PartnerType: "Associates",
      Marketplace: "www.amazon.com",
      Resources: [
        "ItemInfo.Title",
        "ItemInfo.ByLineInfo",
        "ItemInfo.ContentInfo",
        "ItemInfo.TechnicalInfo",
        "Images.Primary.Large",
        "Images.Primary.Medium",
        "Images.Primary.Small",
        "Offers.Listings.Price",
        "CustomerRatings.StarRating",
        "CustomerRatings.Count",
      ],
    });

    const target = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";
    const headers = signRequest(payload, target, "/paapi5/searchitems");

    const response = await fetch(PAAPI_ENDPOINT, {
      method: "POST",
      headers,
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Amazon PA-API SearchItems error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();

    if (!data.SearchResult?.Items) {
      return [];
    }

    return data.SearchResult.Items.map(parseItem);
  } catch (error) {
    console.error("Amazon PA-API searchAmazonAudiobooks error:", error);
    return [];
  }
}

export async function getAmazonAudiobook(
  asin: string
): Promise<AmazonAudiobook | null> {
  if (!amazonEnabled) {
    console.warn("Amazon PA-API not configured, returning null");
    return null;
  }

  try {
    const payload = JSON.stringify({
      ItemIds: [asin],
      PartnerTag: AMAZON_PARTNER_TAG!,
      PartnerType: "Associates",
      Marketplace: "www.amazon.com",
      Resources: [
        "ItemInfo.Title",
        "ItemInfo.ByLineInfo",
        "ItemInfo.ContentInfo",
        "ItemInfo.TechnicalInfo",
        "Images.Primary.Large",
        "Images.Primary.Medium",
        "Images.Primary.Small",
        "Offers.Listings.Price",
        "CustomerRatings.StarRating",
        "CustomerRatings.Count",
      ],
    });

    const target = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";
    const headers = signRequest(payload, target, "/paapi5/getitems");

    const response = await fetch(PAAPI_GET_ENDPOINT, {
      method: "POST",
      headers,
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Amazon PA-API GetItems error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();

    if (!data.ItemsResult?.Items?.length) {
      return null;
    }

    return parseItem(data.ItemsResult.Items[0]);
  } catch (error) {
    console.error("Amazon PA-API getAmazonAudiobook error:", error);
    return null;
  }
}
