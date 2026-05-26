"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AudioProvider } from "@/contexts/AudioContext";
import { EbookProvider } from "@/contexts/EbookProvider";
import { AccessibilityWidget } from "@/components/accessibility-widget";
import { consumeTokenFromUrlHash } from "@/lib/authToken";
import { AudioAdManager, ColourOverlayRenderer, FocusModeExitButton, FocusShell, SwitchAccessScanner } from "./Overlays";
import { AuthEffects } from "./AuthEffects";

/**
 * Top-level client wrapper mounted from `app/layout.tsx`. It owns every
 * provider that used to live inside the monolithic App.tsx + AppClient.tsx
 * pair: data/query, audio/ebook, tooltip, toast, plus the global
 * accessibility overlays and audio-ad surface. Everything below this point
 * is route-agnostic and stays mounted across navigations.
 */
export function RootProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  // Consume `#token=...` JWT from OAuth/magic-link redirects before any
  // /api/* request fires. Mirrors the previous AppClient bootstrap.
  useEffect(() => {
    consumeTokenFromUrlHash();
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AudioProvider>
          <EbookProvider>
            <AuthEffects />
            <AudioAdManager />
            <AccessibilityWidget />
            {children}
            <ColourOverlayRenderer />
            <SwitchAccessScanner />
            <FocusModeExitButton />
            <FocusShell />
            <Toaster />
          </EbookProvider>
        </AudioProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
