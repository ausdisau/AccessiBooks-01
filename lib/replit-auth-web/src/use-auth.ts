import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

// Replit Auth routes are mounted under /api/replit-auth to coexist with the
// existing Passport-based /api/auth/* routes used by local / Auth0 /
// magic-link login. Login/logout still hit the Replit Auth router, but the
// user lookup uses the unified /api/auth/user endpoint, which returns the
// current user regardless of which provider signed them in.
const AUTH_BASE = "/api/replit-auth";
const UNIFIED_USER_URL = "/api/auth/user";

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(UNIFIED_USER_URL, { credentials: "include" })
      .then(async (res) => {
        // Unified endpoint responds 401 when nobody is signed in. Treat
        // that as "no user" rather than an error.
        if (res.status === 401) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Unified endpoint returns the full user row directly (not wrapped
        // in { user }). Cast to AuthUser — the shape is a superset.
        return (await res.json()) as AuthUser;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    const base = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";
    window.location.href = `${AUTH_BASE}/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = `${AUTH_BASE}/logout`;
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
