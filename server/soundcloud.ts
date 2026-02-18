const SOUNDCLOUD_API_BASE = "https://api.soundcloud.com";

const { SOUNDCLOUD_CLIENT_ID, SOUNDCLOUD_CLIENT_SECRET } = process.env;

const soundcloudEnabled = !!(SOUNDCLOUD_CLIENT_ID && SOUNDCLOUD_CLIENT_SECRET);

if (soundcloudEnabled) {
  console.log("SoundCloud API integration initialized");
} else {
  console.log(
    "SoundCloud API not configured - missing SOUNDCLOUD_CLIENT_ID or SOUNDCLOUD_CLIENT_SECRET"
  );
}

let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let tokenExpiresAt: number = 0;

export interface SoundCloudTrack {
  id: number;
  title: string;
  description: string;
  artist: string;
  artistId: number;
  artworkUrl: string;
  duration: number;
  genre: string;
  tags: string;
  permalinkUrl: string;
  streamUrl: string;
  waveformUrl: string;
  playbackCount: number;
  likesCount: number;
  commentCount: number;
  createdAt: string;
  source: "soundcloud";
}

export interface SoundCloudUser {
  id: number;
  username: string;
  avatarUrl: string;
  description: string;
  trackCount: number;
  followersCount: number;
  followingsCount: number;
  permalinkUrl: string;
  city: string;
  country: string;
}

export function isSoundCloudEnabled(): boolean {
  return soundcloudEnabled;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && tokenExpiresAt > Date.now()) {
    return cachedAccessToken;
  }

  if (!SOUNDCLOUD_CLIENT_ID || !SOUNDCLOUD_CLIENT_SECRET) {
    throw new Error("SoundCloud credentials not configured");
  }

  try {
    const credentials = Buffer.from(
      `${SOUNDCLOUD_CLIENT_ID}:${SOUNDCLOUD_CLIENT_SECRET}`
    ).toString("base64");

    const params: Record<string, string> = {
      grant_type: cachedRefreshToken ? "refresh_token" : "client_credentials",
    };
    if (cachedRefreshToken) {
      params.refresh_token = cachedRefreshToken;
    }

    const response = await fetch(`${SOUNDCLOUD_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (cachedRefreshToken) {
        cachedRefreshToken = null;
        return getAccessToken();
      }
      throw new Error(`SoundCloud token error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    cachedAccessToken = data.access_token;
    cachedRefreshToken = data.refresh_token || cachedRefreshToken;
    const expiresIn = data.expires_in || 3600;
    tokenExpiresAt = Date.now() + expiresIn * 1000 - 60000;

    return cachedAccessToken!;
  } catch (error) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    throw error;
  }
}

async function soundcloudFetch(endpoint: string, params?: Record<string, string>): Promise<any> {
  const token = await getAccessToken();
  const url = new URL(`${SOUNDCLOUD_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SoundCloud API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

function parseTrack(item: any): SoundCloudTrack {
  return {
    id: item.id,
    title: item.title || "Untitled",
    description: item.description || "",
    artist: item.user?.username || "Unknown Artist",
    artistId: item.user?.id || 0,
    artworkUrl: (item.artwork_url || item.user?.avatar_url || "").replace("-large", "-t500x500"),
    duration: item.duration || 0,
    genre: item.genre || "",
    tags: item.tag_list || item.tags || "",
    permalinkUrl: item.permalink_url || "",
    streamUrl: item.stream_url || "",
    waveformUrl: item.waveform_url || "",
    playbackCount: item.playback_count || 0,
    likesCount: item.likes_count || item.favoritings_count || 0,
    commentCount: item.comment_count || 0,
    createdAt: item.created_at || "",
    source: "soundcloud",
  };
}

function parseUser(item: any): SoundCloudUser {
  return {
    id: item.id,
    username: item.username || "Unknown",
    avatarUrl: (item.avatar_url || "").replace("-large", "-t500x500"),
    description: item.description || "",
    trackCount: item.track_count || 0,
    followersCount: item.followers_count || 0,
    followingsCount: item.followings_count || 0,
    permalinkUrl: item.permalink_url || "",
    city: item.city || "",
    country: item.country_code || item.country || "",
  };
}

export async function searchSoundCloudTracks(
  query: string,
  limit: number = 20,
  genre?: string
): Promise<SoundCloudTrack[]> {
  if (!soundcloudEnabled) {
    return [];
  }

  try {
    const params: Record<string, string> = {
      q: query,
      limit: String(Math.min(limit, 50)),
      linked_partitioning: "true",
    };
    if (genre) {
      params.genres = genre;
    }

    const data = await soundcloudFetch("/tracks", params);
    const items = Array.isArray(data) ? data : data.collection || [];
    return items.map(parseTrack);
  } catch (error) {
    console.error("SoundCloud search error:", error);
    return [];
  }
}

export async function getSoundCloudTrack(trackId: number): Promise<SoundCloudTrack | null> {
  if (!soundcloudEnabled) return null;

  try {
    const data = await soundcloudFetch(`/tracks/${trackId}`);
    return parseTrack(data);
  } catch (error) {
    console.error("SoundCloud get track error:", error);
    return null;
  }
}

export async function getSoundCloudUser(userId: number): Promise<SoundCloudUser | null> {
  if (!soundcloudEnabled) return null;

  try {
    const data = await soundcloudFetch(`/users/${userId}`);
    return parseUser(data);
  } catch (error) {
    console.error("SoundCloud get user error:", error);
    return null;
  }
}

export async function getSoundCloudUserTracks(
  userId: number,
  limit: number = 20
): Promise<SoundCloudTrack[]> {
  if (!soundcloudEnabled) return [];

  try {
    const data = await soundcloudFetch(`/users/${userId}/tracks`, {
      limit: String(Math.min(limit, 50)),
    });
    const items = Array.isArray(data) ? data : data.collection || [];
    return items.map(parseTrack);
  } catch (error) {
    console.error("SoundCloud user tracks error:", error);
    return [];
  }
}

export async function getSoundCloudStreamUrl(trackId: number): Promise<string | null> {
  if (!soundcloudEnabled) return null;

  try {
    const token = await getAccessToken();
    const data = await soundcloudFetch(`/tracks/${trackId}/streams`);
    return data.http_mp3_128_url || data.hls_mp3_128_url || data.hls_opus_64_url || null;
  } catch (error) {
    console.error("SoundCloud stream URL error:", error);
    return null;
  }
}

export const SOUNDCLOUD_GENRES = [
  "audiobooks",
  "podcast",
  "spoken word",
  "storytelling",
  "comedy",
  "education",
  "news",
  "talk",
  "ambient",
  "classical",
  "hip-hop",
  "electronic",
  "rock",
  "jazz",
  "world",
];

export async function getSoundCloudGenreTracks(
  genre: string,
  limit: number = 20
): Promise<SoundCloudTrack[]> {
  if (!soundcloudEnabled) return [];

  try {
    const data = await soundcloudFetch("/tracks", {
      genres: genre,
      limit: String(Math.min(limit, 50)),
      linked_partitioning: "true",
    });
    const items = Array.isArray(data) ? data : data.collection || [];
    return items.map(parseTrack);
  } catch (error) {
    console.error("SoundCloud genre tracks error:", error);
    return [];
  }
}

export async function getSoundCloudRelated(
  trackId: number,
  limit: number = 10
): Promise<SoundCloudTrack[]> {
  if (!soundcloudEnabled) return [];

  try {
    const data = await soundcloudFetch(`/tracks/${trackId}/related`, {
      limit: String(Math.min(limit, 50)),
    });
    const items = Array.isArray(data) ? data : data.collection || [];
    return items.map(parseTrack);
  } catch (error) {
    console.error("SoundCloud related tracks error:", error);
    return [];
  }
}
