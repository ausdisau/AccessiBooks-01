import { SpotifyApi } from "@spotify/web-api-ts-sdk";

interface SpotifyTokens {
  accessToken: string;
  clientId: string;
  refreshToken: string;
  expiresIn: number;
}

let cachedTokens: SpotifyTokens | null = null;
let tokenExpiresAt: number = 0;

async function getAccessToken(): Promise<SpotifyTokens> {
  // Check if we have valid cached tokens
  if (cachedTokens && tokenExpiresAt > Date.now()) {
    return cachedTokens;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=spotify',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);
  
  const refreshToken = connectionSettings?.settings?.oauth?.credentials?.refresh_token;
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  const clientId = connectionSettings?.settings?.oauth?.credentials?.client_id;
  const expiresIn = connectionSettings?.settings?.oauth?.credentials?.expires_in || 3600;
  
  if (!connectionSettings || !accessToken || !clientId || !refreshToken) {
    throw new Error('Spotify not connected');
  }
  
  // Cache the tokens with expiration
  cachedTokens = { accessToken, clientId, refreshToken, expiresIn };
  tokenExpiresAt = Date.now() + (expiresIn * 1000) - 60000; // Expire 1 minute early for safety
  
  return cachedTokens;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableSpotifyClient() {
  const {accessToken, clientId, refreshToken, expiresIn} = await getAccessToken();

  const spotify = SpotifyApi.withAccessToken(clientId, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn || 3600,
    refresh_token: refreshToken,
  });

  return spotify;
}

// Check if Spotify connection is available
export async function isSpotifyConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
