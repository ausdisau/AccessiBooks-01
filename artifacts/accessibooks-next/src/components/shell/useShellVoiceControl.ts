"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useVoiceControl, type VoiceCommand } from "@/hooks/use-voice-control";

interface Args {
  isPlaying: boolean;
  togglePlayPause: () => void;
  skip: (n: number) => void;
  nextChapter: () => void;
  prevChapter: () => void;
  changeSpeed: (delta: number) => void;
  toggleMute: () => void;
  toggleHighContrast: () => void;
  toggleDarkMode: () => void;
  skipForwardSec: number;
  skipBackSec: number;
  adLocked: boolean;
  sensoryMutate: (profile: Record<string, unknown>) => void;
}

/**
 * Mounts the global voice-control hotword pipeline. Extracted from the
 * monolithic App.tsx so MainShell stays under the 500-line cap. Returns the
 * underlying voice-control object so the shell can render its UI button
 * conditionally on `isSupported`.
 */
export function useShellVoiceControl(args: Args) {
  const {
    isPlaying,
    togglePlayPause,
    skip,
    nextChapter,
    prevChapter,
    changeSpeed,
    toggleMute,
    toggleHighContrast,
    toggleDarkMode,
    skipForwardSec,
    skipBackSec,
    adLocked,
    sensoryMutate,
  } = args;
  const router = useRouter();
  const { toast } = useToast();
  const stopListeningRef = useRef<() => void>(() => {});

  const speakConfirmation = useCallback((message: string) => {
    try {
      const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(message);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      synth.speak(u);
    } catch {
      // best-effort
    }
  }, []);

  const commands = useMemo<VoiceCommand[]>(
    () => [
      { patterns: ["stop", "stop listening", "cancel", "never mind"], handler: () => stopListeningRef.current(), description: "Stop listening" },
      { patterns: ["play", "resume", "start"], handler: () => { if (!isPlaying) togglePlayPause(); }, description: "Play / resume audio" },
      { patterns: ["pause", "stop playing"], handler: () => { if (isPlaying) togglePlayPause(); }, description: "Pause audio" },
      { patterns: ["skip forward", "forward", "skip ahead", "fast forward"], handler: () => { if (!adLocked) skip(skipForwardSec); }, description: `Skip forward ${skipForwardSec}s` },
      { patterns: ["skip back", "skip backward", "go back", "rewind"], handler: () => { if (!adLocked) skip(-skipBackSec); }, description: `Skip back ${skipBackSec}s` },
      { patterns: ["next chapter", "next"], handler: () => { if (!adLocked) nextChapter(); }, description: "Next chapter" },
      { patterns: ["previous chapter", "previous", "last chapter", "go back chapter"], handler: () => { if (!adLocked) prevChapter(); }, description: "Previous chapter" },
      { patterns: ["speed up", "faster", "increase speed"], handler: () => changeSpeed(0.25), description: "Increase playback speed" },
      { patterns: ["slow down", "slower", "decrease speed", "speed down"], handler: () => changeSpeed(-0.25), description: "Decrease playback speed" },
      { patterns: ["mute", "silence", "quiet"], handler: () => toggleMute(), description: "Mute / unmute" },
      { patterns: ["bookmark", "add bookmark", "save position"], handler: () => document.dispatchEvent(new CustomEvent("accessibooks:add-bookmark")), description: "Add bookmark" },
      { patterns: ["toggle captions", "captions", "subtitles"], handler: () => document.dispatchEvent(new CustomEvent("accessibooks:toggle-captions")), description: "Toggle captions" },
      { patterns: ["high contrast", "contrast"], handler: () => toggleHighContrast(), description: "Toggle high contrast" },
      { patterns: ["dark mode", "dark theme", "night mode"], handler: () => toggleDarkMode(), description: "Toggle dark mode" },
      { patterns: ["go to library", "go home", "library", "home"], handler: () => router.push("/"), description: "Navigate to library" },
      { patterns: ["go to player", "player", "open player"], handler: () => router.push("/player"), description: "Navigate to player" },
      {
        patterns: [/^search\s+(.+)$/],
        handler: (arg?: string) => {
          if (!arg) return;
          const searchInput = document.querySelector<HTMLInputElement>('[data-testid="main-search-input"]');
          if (searchInput) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            setter?.call(searchInput, arg);
            searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            searchInput.focus();
          }
        },
        description: "Search for a book by name",
      },
      {
        patterns: ["explain this", "explain this passage", "what does this mean", "what's happening"],
        handler: () => {
          document.dispatchEvent(
            new CustomEvent("accessibooks:open-coach", {
              detail: { message: "Explain what I'm currently listening to in simple terms." },
            }),
          );
          toast({ title: "Asking the coach", description: "Opening your Accessibility Coach to explain this passage.", duration: 2500 });
          speakConfirmation("Asking your coach to explain this passage.");
        },
        description: "Ask the coach to explain the current passage",
      },
      {
        patterns: ["find easier books", "easier books", "find easy books", "show me easier books"],
        handler: () => {
          router.push("/");
          const focusShelf = () => {
            const el = document.getElementById("easy-read-shelf");
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              (el as HTMLElement).focus({ preventScroll: true });
              return true;
            }
            return false;
          };
          if (!focusShelf()) {
            let attempts = 0;
            const interval = window.setInterval(() => {
              attempts += 1;
              if (focusShelf() || attempts > 20) window.clearInterval(interval);
            }, 150);
          }
          toast({ title: "Showing easier books", description: "Jumped to the Easy Read catalog — reading levels 1 & 2.", duration: 2500 });
          speakConfirmation("Showing easier books from the Easy Read catalog.");
        },
        description: "Show easier books from the Easy Read catalog",
      },
      {
        patterns: ["enable low sensory mode", "low sensory mode", "enable sensory mode", "turn on low sensory mode", "turn on sensory mode"],
        handler: () => {
          sensoryMutate({ sensoryMode: true, sensoryModeChosen: true });
          toast({ title: "Low Sensory Mode is on", description: "Softened motion and audio peaks. Disable any time from Settings.", duration: 3000 });
          speakConfirmation("Low Sensory Mode is on.");
        },
        description: "Turn on Low Sensory Mode",
      },
    ],
    [isPlaying, togglePlayPause, skip, nextChapter, prevChapter, changeSpeed, toggleMute, toggleHighContrast, toggleDarkMode, skipForwardSec, skipBackSec, adLocked, router, toast, speakConfirmation, sensoryMutate],
  );

  const voiceControl = useVoiceControl({
    commands,
    onNoMatch: (transcript) =>
      toast({
        title: "Command not understood",
        description: `Heard: "${transcript}" — try "play", "pause", "search [title]", or "go to library"`,
        duration: 3000,
      }),
  });

  useEffect(() => {
    stopListeningRef.current = voiceControl.stopListening;
  }, [voiceControl.stopListening]);

  return voiceControl;
}
