"use client";
/**
 * useAuth — thin wrapper over Auth.js's useSession that also fetches the
 * full DB user row (for fields like subscriptionTier, role, referralCode
 * that aren't in the JWT).
 *
 * Returns the same shape the rest of the React app already consumes:
 *   { user, isLoading, isAuthenticated, refetch }
 *
 * - When NextAuth says "unauthenticated" we skip the user fetch entirely.
 * - When authenticated we fire the /api/auth/user query; the bearer-token
 *   bootstrap in queryClient.ts attaches the HS256 JWT automatically.
 */
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { type User } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const { status } = useSession();
  const isAuthed = status === "authenticated";
  const { data: user, isLoading: userLoading, refetch } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
  });

  return {
    user: user ?? undefined,
    isLoading: status === "loading" || (isAuthed && userLoading),
    isAuthenticated: isAuthed && !!user,
    refetch,
  };
}
