export interface PlaybackTokenResponse {
  token: string;
  expiresAt: number;
  contentId: string;
  userId: string;
  allowedFormats: string[];
}

export interface JWTClaims {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  contentId: string;
  userId: string;
  tier: "free" | "plus" | "premium";
  allowOffline: boolean;
}
