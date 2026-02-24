export interface PlaybackTokenResponse {
  token: string;
  manifestUrl: string;
  licenseUrl: string;
  expiresAt: number;
}

export interface JWTClaims {
  sub: string;
  tid: string;
  sid: number;
  exp: number;
  iat: number;
  policy: {
    offline: boolean;
    max_concurrent: number;
    entitlement_expiry: number | null;
  };
}
