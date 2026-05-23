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
// magic-link login.
const AUTH_BASE = "/api/replit-auth";

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`${AUTH_BASE}/user`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
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
