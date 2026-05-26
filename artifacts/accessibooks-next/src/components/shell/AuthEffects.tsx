"use client";

import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Handles URL query-parameter side effects that used to live at the top of
 * App.tsx's `App` component: stashing referral codes, showing toasts for
 * OAuth-callback / magic-link outcomes, and clearing the params from the
 * URL afterwards. Mounted globally so any route can be the OAuth callback
 * landing path.
 */
export function AuthEffects() {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    const refCode = params.get("ref");
    if (refCode) {
      localStorage.setItem("accessibooks_referral_code", refCode);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const authStatus = params.get("auth");
    if (authStatus === "failed") {
      const reason = params.get("reason");
      window.history.replaceState({}, "", window.location.pathname);
      const messageByReason: Record<string, { title: string; description: string }> = {
        access_denied: { title: "Sign-in canceled", description: "You canceled the sign-in. No problem — try again whenever you're ready." },
        consent_required: { title: "Permission needed", description: "We need your permission to sign you in. Please try again and approve the request." },
        login_required: { title: "Please sign in again", description: "Your session with the sign-in provider expired. Please try signing in again." },
        interaction_required: { title: "Extra step needed", description: "Your sign-in provider needs an extra step. Please try again in a new window." },
        invalid_grant: { title: "Sign-in link expired", description: "Your sign-in attempt expired or was already used. Please try again." },
        invalid_request: { title: "Sign-in request was invalid", description: "Something was off with that sign-in request. Please try again." },
        server_error: { title: "Sign-in provider error", description: "The sign-in provider had a problem on their end. Please try again in a moment." },
        temporarily_unavailable: { title: "Sign-in temporarily unavailable", description: "The sign-in provider is briefly unavailable. Please try again in a minute." },
        no_profile: { title: "Sign-in incomplete", description: "We didn't receive your profile from the sign-in provider. Please try again." },
        session_error: { title: "Couldn't start your session", description: "We signed you in, but couldn't save your session. Please try again." },
      };
      const fallback = { title: "Sign-in failed", description: "We couldn't sign you in with that account. Please try again or use a different method." };
      const msg = (reason && messageByReason[reason]) || fallback;
      setTimeout(() => toast({ ...msg, variant: "destructive" }), 300);
    }

    if (authStatus === "unavailable") {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(
        () =>
          toast({
            title: "Sign-in temporarily unavailable",
            description: "That sign-in option is misconfigured. Please use email or another method while we sort it out.",
            variant: "destructive",
          }),
        300,
      );
    }

    const magicStatus = params.get("magic");
    if (magicStatus) {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => {
        if (magicStatus === "success") {
          toast({ title: "Welcome back!", description: "You've been signed in via magic link." });
        } else if (magicStatus === "expired") {
          toast({ title: "Link expired", description: "Your sign-in link has expired. Please request a new one.", variant: "destructive" });
        } else if (magicStatus === "invalid" || magicStatus === "error") {
          toast({ title: "Invalid link", description: "This sign-in link is not valid. Please request a new one.", variant: "destructive" });
        }
      }, 300);
    }
  }, [toast]);

  return null;
}

/**
 * Authenticated-only side effects: apply the referral code once a session
 * exists, and surface the welcome-bonus / onboarding flow control flag.
 * Returns the modal-visibility tuple the shell uses to render the modals.
 */
export function useAuthenticatedBootstrap(isAuthenticated: boolean) {
  useEffect(() => {
    if (!isAuthenticated) return;
    const savedRefCode = localStorage.getItem("accessibooks_referral_code");
    if (savedRefCode) {
      apiRequest("POST", "/api/referral/apply", { code: savedRefCode })
        .catch(() => {})
        .finally(() => localStorage.removeItem("accessibooks_referral_code"));
    }
  }, [isAuthenticated]);
}
