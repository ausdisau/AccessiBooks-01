import { Feather } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { getAuthToken, transcribeVoiceClip } from "@/lib/api";

/**
 * Hands-free / voice-controlled mode.
 *
 * A short clip is recorded (expo-audio), transcribed server-side, then parsed
 * into a command on-device. Screens register their own playback handlers via
 * `useVoiceCommands`; navigation commands are always handled globally. Feedback
 * is delivered through the OS screen reader (announceForAccessibility) plus
 * haptics and a visible status pill — no synthetic TTS of our own.
 */

export type VoiceIntent =
  | "play"
  | "pause"
  | "togglePlay"
  | "skipForward"
  | "skipBack"
  | "faster"
  | "slower"
  | "readAlong"
  | "download"
  | "navHome"
  | "navLibrary"
  | "navSearch"
  | "navSettings"
  | "openDownloads"
  | "goBack";

export type VoiceCommandHandlers = Partial<Record<VoiceIntent, () => void>>;

type MicState = "idle" | "recording" | "processing";

type VoiceContextValue = {
  register: (
    id: number,
    ref: React.MutableRefObject<VoiceCommandHandlers>,
  ) => void;
  unregister: (id: number) => void;
  state: MicState;
  statusText: string;
  onMicPress: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

const RECORD_MAX_MS = 7000;

const CONFIRM: Record<VoiceIntent, string> = {
  play: "Playing",
  pause: "Paused",
  togglePlay: "Done",
  skipForward: "Skipped forward",
  skipBack: "Skipped back",
  faster: "Speeding up",
  slower: "Slowing down",
  readAlong: "Read along toggled",
  download: "Starting download",
  navHome: "Opening home",
  navLibrary: "Opening library",
  navSearch: "Opening search",
  navSettings: "Opening settings",
  openDownloads: "Opening downloads",
  goBack: "Going back",
};

type ParseResult = VoiceIntent | "chapter" | null;

/**
 * Map a free-form transcript to a command. Order matters: more specific
 * phrases are checked first so e.g. "open downloads" is navigation, not a
 * "download" action, and "next chapter" maps to skip rather than a bare "next".
 */
export function parseIntent(raw: string): ParseResult {
  const t = raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const has = (...phrases: string[]) => phrases.some((p) => t.includes(p));

  // Downloads management (navigation) before the "download" action.
  if (has("open downloads", "my downloads", "show downloads", "go to downloads"))
    return "openDownloads";

  // Chapters: no chapter model exists, so map directional chapter requests to
  // skips and flag anything else honestly.
  if (has("next chapter", "skip chapter")) return "skipForward";
  if (has("previous chapter", "last chapter", "prior chapter", "back a chapter"))
    return "skipBack";
  if (has("chapter")) return "chapter";

  if (has("read along", "follow along", "read-along", "karaoke", "read with"))
    return "readAlong";

  if (has("download", "save offline", "save for offline", "make offline"))
    return "download";

  // Speed before play/pause so "speed up" / "slow down" win.
  if (has("faster", "speed up", "quicker", "faster speed")) return "faster";
  if (has("slower", "slow down", "slow it", "reduce speed")) return "slower";

  if (has("pause", "stop", "hold on", "wait")) return "pause";

  if (has("skip forward", "skip ahead", "fast forward", "jump forward", "forward"))
    return "skipForward";
  if (has("skip back", "skip backward", "rewind", "go backward", "back up"))
    return "skipBack";

  // Navigation. Check before bare "play" so "go to" phrases aren't shadowed.
  if (has("home", "home screen", "discover")) return "navHome";
  if (has("library", "my books", "my library")) return "navLibrary";
  if (has("search", "find a book", "find books", "look for")) return "navSearch";
  if (has("settings", "preferences", "options")) return "navSettings";

  if (has("play", "resume", "continue", "unpause", "start playing", "start"))
    return "play";

  if (has("close", "exit", "dismiss", "go back", "back")) return "goBack";

  return null;
}

let counter = 0;

/**
 * Register voice command handlers for the lifetime of a screen. Handlers are
 * stored by ref so dispatch always calls the latest closures (no stale state).
 */
export function useVoiceCommands(handlers: VoiceCommandHandlers): void {
  const ctx = useContext(VoiceContext);
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!ctx) return;
    const id = ++counter;
    ctx.register(id, ref);
    return () => ctx.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useVoice(): {
  state: MicState;
  statusText: string;
  onMicPress: () => void;
} {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoice must be used within a VoiceProvider");
  }
  const { state, statusText, onMicPress } = ctx;
  return { state, statusText, onMicPress };
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<MicState>("idle");
  const [statusText, setStatusText] = useState("");
  const stateRef = useRef<MicState>("idle");
  stateRef.current = state;
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registrations = useRef<
    Map<number, React.MutableRefObject<VoiceCommandHandlers>>
  >(new Map());

  const register = useCallback(
    (id: number, ref: React.MutableRefObject<VoiceCommandHandlers>) => {
      registrations.current.set(id, ref);
    },
    [],
  );
  const unregister = useCallback((id: number) => {
    registrations.current.delete(id);
  }, []);

  const announce = useCallback((msg: string) => {
    setStatusText(msg);
    AccessibilityInfo.announceForAccessibility(msg);
  }, []);

  const buzz = useCallback((kind: "start" | "ok" | "warn") => {
    if (Platform.OS === "web") return;
    if (kind === "start") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else if (kind === "ok") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {},
      );
    }
  }, []);

  const globalHandle = useCallback((intent: VoiceIntent): boolean => {
    switch (intent) {
      case "navHome":
        router.navigate("/");
        return true;
      case "navLibrary":
        router.navigate("/library");
        return true;
      case "navSearch":
        router.navigate("/search");
        return true;
      case "navSettings":
        router.navigate("/settings");
        return true;
      case "openDownloads":
        router.push("/downloads");
        return true;
      case "goBack":
        if (router.canGoBack()) router.back();
        return true;
      default:
        return false;
    }
  }, []);

  const dispatch = useCallback(
    (intent: VoiceIntent): boolean => {
      // Screen-registered handlers win, most-recently-mounted first.
      const regs = Array.from(registrations.current.values());
      for (let i = regs.length - 1; i >= 0; i--) {
        const handler = regs[i].current[intent];
        if (handler) {
          handler();
          return true;
        }
      }
      return globalHandle(intent);
    },
    [globalHandle],
  );

  const stopAndProcess = useCallback(async () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (stateRef.current !== "recording") return;
    setState("processing");
    announce("Processing…");

    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri ?? null;
    } catch {
      /* fall through to error feedback */
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      /* ignore */
    }

    if (!uri) {
      setState("idle");
      buzz("warn");
      announce("Didn't catch that. Try again.");
      return;
    }

    const transcript = await transcribeVoiceClip(uri);
    if (!transcript) {
      setState("idle");
      buzz("warn");
      announce("Sorry, I couldn't understand that.");
      return;
    }

    const intent = parseIntent(transcript);
    if (intent === "chapter") {
      setState("idle");
      buzz("warn");
      announce(
        "This title doesn't have chapters. Try skip forward or skip back.",
      );
      return;
    }
    if (!intent) {
      setState("idle");
      buzz("warn");
      announce(`I heard "${transcript}", but that isn't a command I know.`);
      return;
    }

    const handled = dispatch(intent);
    setState("idle");
    if (handled) {
      buzz("ok");
      announce(CONFIRM[intent]);
    } else {
      buzz("warn");
      announce(`"${transcript}" isn't available on this screen.`);
    }
  }, [announce, buzz, dispatch, recorder]);

  const startRecording = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      buzz("warn");
      announce("Sign in to use voice commands.");
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        buzz("warn");
        announce("Microphone access is needed for voice commands.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState("recording");
      buzz("start");
      announce("Listening. Say a command like play, pause, or skip forward.");
      autoStopRef.current = setTimeout(() => {
        void stopAndProcess();
      }, RECORD_MAX_MS);
    } catch {
      setState("idle");
      buzz("warn");
      announce("Couldn't start listening.");
    }
  }, [announce, buzz, recorder, stopAndProcess]);

  const onMicPress = useCallback(() => {
    if (stateRef.current === "idle") {
      void startRecording();
    } else if (stateRef.current === "recording") {
      void stopAndProcess();
    }
    // processing: ignore taps
  }, [startRecording, stopAndProcess]);

  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  const value = useMemo<VoiceContextValue>(
    () => ({ register, unregister, state, statusText, onMicPress }),
    [register, unregister, state, statusText, onMicPress],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      <MicOverlay />
    </VoiceContext.Provider>
  );
}

/**
 * Floating microphone button shown on browsing screens. The player renders its
 * own mic control (inside the native modal, where this overlay can't reach), so
 * the two together guarantee voice is reachable everywhere.
 */
function MicOverlay() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { paddingBottom: insets.bottom + 88 }]}
    >
      <MicButton floating />
    </View>
  );
}

export function MicButton({ floating = false }: { floating?: boolean }) {
  const colors = useColors();
  const { state, statusText, onMicPress } = useVoice();

  const label =
    state === "recording"
      ? "Listening. Tap to stop and run command."
      : state === "processing"
        ? "Processing voice command"
        : "Voice command. Tap and speak.";

  const bg =
    state === "recording" ? colors.destructive : colors.brandOrange;

  return (
    <View style={floating ? styles.floatingWrap : undefined}>
      {state !== "idle" && statusText ? (
        <View
          pointerEvents="none"
          style={[
            styles.pill,
            { backgroundColor: colors.brandInk },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text numberOfLines={2} style={[styles.pillText, { color: colors.brandCream }]}>
            {statusText}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={onMicPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: state === "processing" }}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: bg,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: state === "recording" ? 1.06 : 1 }],
          },
        ]}
        hitSlop={8}
      >
        {state === "processing" ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Feather
            name={state === "recording" ? "square" : "mic"}
            size={24}
            color="#ffffff"
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  floatingWrap: {
    alignItems: "flex-end",
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pill: {
    maxWidth: 240,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  pillText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
