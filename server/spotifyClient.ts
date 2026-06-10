import { SpotifyApi } from "@spotify/web-api-ts-sdk";

interface SpotifyTokens {
  accessToken: string;
  clientId: string;
  refreshToken: string;
  expiresIn: number;
}

let cachedTokens: SpotifyTokens | null = null;
let tokenExpiresAt = 0;

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    accessToken: data.access_token,
    clientId,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresIn: data.expires_in,
  };
}

async function getAccessToken(): Promise<SpotifyTokens> {
  if (cachedTokens && tokenExpiresAt > Date.now()) {
    return cachedTokens;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Spotify not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.",
    );
  }

  if (!refreshToken) {
    throw new Error(
      "Spotify user connection not configured. Set SPOTIFY_REFRESH_TOKEN from your Spotify OAuth flow.",
    );
  }

  cachedTokens = await refreshAccessToken(clientId, clientSecret, refreshToken);
  tokenExpiresAt = Date.now() + cachedTokens.expiresIn * 1000 - 60_000;

  return cachedTokens;
}

export async function getUncachableSpotifyClient() {
  const { accessToken, clientId, refreshToken, expiresIn } =
    await getAccessToken();

  return SpotifyApi.withAccessToken(clientId, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn || 3600,
    refresh_token: refreshToken,
  });
}

export async function isSpotifyConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
