import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import {
  fetchBook,
  fetchSettingsSummary,
  fetchWordAlignment,
  formatDuration,
} from "@/lib/api";
import { useDownloads } from "@/lib/downloads";
import { loadProgress, saveProgress } from "@/lib/progress";
import {
  useVoice,
  useVoiceCommands,
  type VoiceCommandHandlers,
} from "@/lib/voice";

const DEFAULT_SKIP = 30;
const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function PlayerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();

  const book = useQuery({
    queryKey: ["book", id],
    queryFn: () => fetchBook(id!),
    enabled: !!id,
  });

  // Pull preferred skip seconds from /api/settings/summary when the user is
  // signed in. Falls back silently to DEFAULT_SKIP for guests.
  const settings = useQuery({
    queryKey: ["settings-summary"],
    queryFn: fetchSettingsSummary,
    staleTime: 5 * 60_000,
  });

  const skipBackSecs =
    Number(settings.data?.preferences?.skipBackwardSeconds) || DEFAULT_SKIP;
  const skipFwdSecs =
    Number(settings.data?.preferences?.skipForwardSeconds) || DEFAULT_SKIP;

  const downloads = useDownloads();
  const voice = useVoice();
  const downloadEntry = id ? downloads.getEntry(id) : null;
  const localUri = id ? downloads.getLocalUri(id) : null;
  const remoteAudioUrl = book.data?.audioUrl ?? null;
  // Prefer the downloaded file so a saved title plays fully offline.
  const audioUrl = localUri ?? remoteAudioUrl;
  const isDownloaded = !!localUri;
  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : null);
  const status = useAudioPlayerStatus(player);

  const [speedIdx, setSpeedIdx] = useState(1);
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrubPos, setScrubPos] = useState<number | null>(null);
  const wasPlayingRef = useRef(false);

  const seekFromX = (x: number) => {
    if (!audioUrl || trackWidth <= 0 || (status?.duration ?? 0) <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    return ratio * (status?.duration ?? 0);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!audioUrl,
        onMoveShouldSetPanResponder: () => !!audioUrl,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          if (!audioUrl) return;
          haptic();
          wasPlayingRef.current = !!status?.playing;
          if (wasPlayingRef.current) player.pause();
          const x = e.nativeEvent.locationX;
          setScrubPos(seekFromX(x));
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          if (!audioUrl) return;
          const x = e.nativeEvent.locationX;
          setScrubPos(seekFromX(x));
        },
        onPanResponderRelease: () => {
          if (!audioUrl) return;
          if (scrubPos !== null) player.seekTo(scrubPos);
          setScrubPos(null);
          if (wasPlayingRef.current) player.play();
        },
        onPanResponderTerminate: () => {
          setScrubPos(null);
          if (wasPlayingRef.current) player.play();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audioUrl, trackWidth, status?.duration, status?.playing, scrubPos],
  );

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  // Offline resume: restore the saved position for downloaded titles once audio
  // is loaded, and persist progress periodically + on unmount so the listener
  // can continue where they left off with no network.
  const idRef = useRef(id);
  idRef.current = id;
  const posRef = useRef(0);
  const downloadedRef = useRef(false);
  downloadedRef.current = isDownloaded;
  const resumedRef = useRef(false);

  useEffect(() => {
    if (resumedRef.current || !isDownloaded || !id) return;
    if ((status?.duration ?? 0) <= 0) return;
    resumedRef.current = true;
    loadProgress(id).then((sec) => {
      if (sec > 0) {
        try {
          player.seekTo(sec);
        } catch {}
      }
    });
  }, [isDownloaded, id, status?.duration, player]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (downloadedRef.current && idRef.current) {
        saveProgress(idRef.current, posRef.current);
      }
    }, 10000);
    return () => {
      clearInterval(iv);
      if (downloadedRef.current && idRef.current) {
        saveProgress(idRef.current, posRef.current);
      }
    };
  }, []);

  const haptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  // ---- Read-along (karaoke) ----------------------------------------------
  // Word- AND sentence-level timing, fetched only when a title actually has
  // audio (read-along has nothing to sync to otherwise). The endpoint returns
  // available:false for titles without timing, so the toggle stays hidden and
  // we never fabricate timing.
  const alignment = useQuery({
    queryKey: ["word-alignment", id],
    queryFn: () => fetchWordAlignment(id!),
    enabled: !!id && !!audioUrl,
    staleTime: 60 * 60 * 1000,
  });
  const words = alignment.data?.words ?? [];
  const segments = alignment.data?.segments ?? [];
  const readAlongAvailable =
    !!audioUrl && !!alignment.data?.available && segments.length > 0;
  // Word-level highlight only for exact per-word timing; "estimated" timing
  // (words interpolated within a real sentence) drives sentence-level read-along
  // only, so we never highlight individual words from fabricated positions.
  const isExactTiming = alignment.data?.precision === "exact";

  const [followAlong, setFollowAlong] = useState(false);
  const [readAlongTimeMs, setReadAlongTimeMs] = useState(0);
  const lastTickRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const segmentYRef = useRef<Record<number, number>>({});

  // Accessibility prefs from the signed-in user's settings; safe defaults for
  // guests. fontSize / dyslexia spacing / high contrast all flow into the panel.
  const prefs = settings.data?.preferences;
  const baseFontSize =
    typeof prefs?.fontSize === "number" && prefs.fontSize > 0 ? prefs.fontSize : 16;
  const dyslexiaFont = !!prefs?.dyslexiaFont;
  const highContrast = !!prefs?.highContrast;
  const readAlongFontSize = Math.max(15, Math.min(30, baseFontSize + 2));
  // No OpenDyslexic on mobile — honor the dyslexia preference via the
  // recommended wider letter/line spacing instead of swapping to a missing font.
  const readAlongTextStyle = useMemo(
    () => ({
      fontSize: readAlongFontSize,
      lineHeight: Math.round(readAlongFontSize * (dyslexiaFont ? 1.95 : 1.6)),
      letterSpacing: dyslexiaFont ? 0.8 : 0,
      fontFamily: "Inter_500Medium" as const,
    }),
    [readAlongFontSize, dyslexiaFont],
  );

  // Throttle playback time to ~4 Hz so highlight recompute/auto-scroll stay cheap.
  useEffect(() => {
    if (!followAlong) return;
    const ms = (status?.currentTime ?? 0) * 1000;
    if (Math.abs(ms - lastTickRef.current) >= 240) {
      lastTickRef.current = ms;
      setReadAlongTimeMs(ms);
    }
  }, [status?.currentTime, followAlong]);

  // Largest word whose start time has been reached (binary search over startMs).
  const activeWordIndex = useMemo(() => {
    if (!followAlong || words.length === 0) return -1;
    let lo = 0;
    let hi = words.length - 1;
    let res = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid].startMs <= readAlongTimeMs) {
        res = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (res === -1) return -1;
    if (readAlongTimeMs > words[res].endMs && res === words.length - 1) return -1;
    return res;
  }, [followAlong, words, readAlongTimeMs]);

  const activeSegmentIndex =
    activeWordIndex >= 0 ? words[activeWordIndex].segmentIndex : -1;

  // Keep the active sentence in view as playback advances.
  useEffect(() => {
    if (!followAlong || activeSegmentIndex < 0) return;
    const y = segmentYRef.current[activeSegmentIndex];
    if (typeof y === "number") {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true });
    }
  }, [followAlong, activeSegmentIndex]);

  const seekToMs = (ms: number) => {
    if (!audioUrl) return;
    haptic();
    player.seekTo(ms / 1000);
  };

  const toggleFollowAlong = useCallback(() => {
    haptic();
    setFollowAlong((prev) => {
      const next = !prev;
      if (next) {
        const ms = (status?.currentTime ?? 0) * 1000;
        lastTickRef.current = ms;
        setReadAlongTimeMs(ms);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.currentTime]);

  const total = status?.duration ?? book.data?.duration ?? 0;
  const livePosition = status?.currentTime ?? 0;
  posRef.current = livePosition;
  const position = scrubPos !== null ? scrubPos : livePosition;
  const playing = !!status?.playing;
  const speed = SPEEDS[speedIdx];

  const togglePlay = () => {
    if (!audioUrl) return;
    haptic();
    if (playing) player.pause();
    else player.play();
  };
  const skipBack = () => {
    if (!audioUrl) return;
    haptic();
    player.seekTo(Math.max(0, position - skipBackSecs));
  };
  const skipForward = () => {
    if (!audioUrl) return;
    haptic();
    const target =
      total > 0 ? Math.min(total, position + skipFwdSecs) : position + skipFwdSecs;
    player.seekTo(target);
  };
  const cycleSpeed = () => {
    haptic();
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    try {
      player.setPlaybackRate(SPEEDS[next]);
    } catch {}
  };
  const setSpeed = (idx: number) => {
    const clamped = Math.max(0, Math.min(SPEEDS.length - 1, idx));
    if (clamped === speedIdx) return;
    haptic();
    setSpeedIdx(clamped);
    try {
      player.setPlaybackRate(SPEEDS[clamped]);
    } catch {}
  };

  // Hands-free playback commands for this screen. Only currently-actionable
  // commands are registered, so screen-reader confirmations stay honest:
  // unavailable actions fall through to a "not available" announcement instead
  // of falsely confirming success. Handlers are stored by ref each render, so
  // the registered set updates as state changes (e.g. once a title is saved).
  const voiceHandlers: VoiceCommandHandlers = {};
  if (audioUrl) {
    voiceHandlers.play = () => {
      haptic();
      player.play();
    };
    voiceHandlers.pause = () => {
      haptic();
      try {
        player.pause();
      } catch {}
    };
    voiceHandlers.togglePlay = togglePlay;
    voiceHandlers.skipForward = skipForward;
    voiceHandlers.skipBack = skipBack;
    voiceHandlers.faster = () => setSpeed(speedIdx + 1);
    voiceHandlers.slower = () => setSpeed(speedIdx - 1);
  }
  if (readAlongAvailable) {
    voiceHandlers.readAlong = () => toggleFollowAlong();
  }
  if (remoteAudioUrl && !isDownloaded) {
    voiceHandlers.download = () => {
      if (book.data) downloads.startDownload(book.data);
    };
  }
  useVoiceCommands(voiceHandlers);

  if (book.isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.brandCream }]}>
        <Text style={[styles.errorTitle, { color: colors.brandInk }]}>
          Couldn't load this book.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.errorBtn,
            { backgroundColor: colors.brandOrange, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close player"
        >
          <Text style={styles.errorBtnLabel}>Close</Text>
        </Pressable>
      </View>
    );
  }

  if (book.isLoading || !book.data) {
    return (
      <View style={[styles.root, { backgroundColor: colors.brandCream }]}>
        <ActivityIndicator color={colors.brandOrange} size="large" />
      </View>
    );
  }

  const b = book.data;
  const progress = total > 0 ? Math.min(1, position / total) : 0;
  const audioDisabled = !audioUrl;

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.brandCream }}
      accessibilityLabel={`Now playing ${b.title}`}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.brandCream,
            paddingBottom: Math.max(insets.bottom + 16, 32),
          },
          r.isTablet && {
            maxWidth: r.contentMaxWidth,
            alignSelf: "center",
            width: "100%",
          },
        ]}
      >
      {followAlong && readAlongAvailable ? (
        <View
          testID="read-along-panel"
          style={[
            styles.readAlongPanel,
            { backgroundColor: colors.card, borderColor: colors.brandLine },
          ]}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.readAlongScroll}
            contentContainerStyle={styles.readAlongContent}
            showsVerticalScrollIndicator
          >
            {segments.map((seg) => {
              const isActiveSeg = seg.segmentIndex === activeSegmentIndex;
              const onLayout = (e: LayoutChangeEvent) => {
                segmentYRef.current[seg.segmentIndex] = e.nativeEvent.layout.y;
              };
              // Active sentence with EXACT per-word timing: tokenize into tappable
              // words and highlight the current word.
              if (isActiveSeg && isExactTiming) {
                const segWords = words.slice(
                  seg.firstWordIndex,
                  seg.firstWordIndex + seg.wordCount,
                );
                return (
                  <View
                    key={seg.segmentIndex}
                    onLayout={onLayout}
                    style={[styles.segmentRow, { backgroundColor: colors.brandCreamDeep }]}
                  >
                    <Text style={[readAlongTextStyle, { color: colors.brandInk }]}>
                      {segWords.map((w) => {
                        const isActiveWord = w.wordIndex === activeWordIndex;
                        const activeStyle = highContrast
                          ? { color: colors.brandCream, backgroundColor: colors.brandInk }
                          : { color: "#ffffff", backgroundColor: colors.brandOrange };
                        return (
                          <Text
                            key={w.wordIndex}
                            onPress={() => seekToMs(w.startMs)}
                            suppressHighlighting
                            accessibilityRole="button"
                            accessibilityLabel={`Jump to ${w.word}`}
                            style={isActiveWord ? activeStyle : { color: colors.brandInk }}
                          >
                            {w.word + " "}
                          </Text>
                        );
                      })}
                    </Text>
                  </View>
                );
              }
              // Active sentence WITHOUT exact word timing: highlight the whole
              // sentence (real segment timing) — no fabricated per-word highlight.
              if (isActiveSeg) {
                return (
                  <View
                    key={seg.segmentIndex}
                    onLayout={onLayout}
                    style={[styles.segmentRow, { backgroundColor: colors.brandCreamDeep }]}
                  >
                    <Text
                      onPress={() => seekToMs(seg.startMs)}
                      suppressHighlighting
                      accessibilityRole="button"
                      accessibilityLabel={`Jump to: ${seg.text}`}
                      style={[readAlongTextStyle, { color: colors.brandInk }]}
                    >
                      {seg.text}
                    </Text>
                  </View>
                );
              }
              return (
                <View key={seg.segmentIndex} onLayout={onLayout} style={styles.segmentRow}>
                  <Text
                    onPress={() => seekToMs(seg.startMs)}
                    suppressHighlighting
                    accessibilityRole="button"
                    accessibilityLabel={`Jump to: ${seg.text}`}
                    style={[readAlongTextStyle, { color: colors.brandInkSoft }]}
                  >
                    {seg.text}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.coverWrap}>
          <BookCover
            uri={b.coverUrl ?? null}
            title={b.title}
            width={r.isLargeTablet ? 320 : r.isTablet ? 280 : 240}
            height={r.isLargeTablet ? 480 : r.isTablet ? 420 : 360}
            rounded={16}
          />
        </View>
      )}

      <View style={styles.titleBlock}>
        <Text
          numberOfLines={2}
          style={[styles.title, { color: colors.brandInk }]}
          accessibilityRole="header"
        >
          {b.title}
        </Text>
        {b.author ? (
          <Text style={[styles.author, { color: colors.brandInkSoft }]}>
            {b.author}
          </Text>
        ) : null}
        {audioDisabled ? (
          <Text
            style={[styles.audioNotice, { color: colors.brandInkSoft }]}
          >
            No audio available for this title.
          </Text>
        ) : null}
      </View>

      <View style={styles.scrubberBlock}>
        <View
          {...panResponder.panHandlers}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          style={styles.scrubHit}
          accessibilityRole="adjustable"
          accessibilityLabel="Audio scrubber"
          accessibilityValue={{
            min: 0,
            max: Math.max(1, Math.round(total)),
            now: Math.round(position),
            text: `${formatTime(position)} of ${total > 0 ? formatDuration(total) : "unknown"}`,
          }}
          accessibilityActions={[
            { name: "increment", label: "Skip forward" },
            { name: "decrement", label: "Skip back" },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "increment") skipForward();
            if (e.nativeEvent.actionName === "decrement") skipBack();
          }}
        >
          <View style={[styles.track, { backgroundColor: colors.brandLine }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: colors.brandOrange,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.thumb,
                {
                  left: `${progress * 100}%`,
                  backgroundColor: colors.brandOrange,
                  borderColor: colors.brandCream,
                  opacity: audioDisabled ? 0.4 : 1,
                },
              ]}
            />
          </View>
        </View>
        <View style={styles.timeRow}>
          <Text style={[styles.time, { color: colors.brandInkSoft }]}>
            {formatTime(position)}
          </Text>
          <Text style={[styles.time, { color: colors.brandInkSoft }]}>
            {total > 0 ? formatDuration(total) : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={skipBack}
          disabled={audioDisabled}
          style={({ pressed }) => [
            styles.iconBtn,
            { opacity: audioDisabled ? 0.35 : pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Skip back ${skipBackSecs} seconds`}
          hitSlop={12}
        >
          <Feather name="rotate-ccw" size={32} color={colors.brandInk} />
          <Text style={[styles.skipNum, { color: colors.brandInk }]}>
            {skipBackSecs}
          </Text>
        </Pressable>

        <Pressable
          onPress={togglePlay}
          disabled={audioDisabled}
          style={({ pressed }) => [
            styles.playBtn,
            {
              backgroundColor: colors.brandOrange,
              opacity: audioDisabled ? 0.35 : pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause" : "Play"}
        >
          <Feather
            name={playing ? "pause" : "play"}
            size={40}
            color="#ffffff"
          />
        </Pressable>

        <Pressable
          onPress={skipForward}
          disabled={audioDisabled}
          style={({ pressed }) => [
            styles.iconBtn,
            { opacity: audioDisabled ? 0.35 : pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Skip forward ${skipFwdSecs} seconds`}
          hitSlop={12}
        >
          <Feather name="rotate-cw" size={32} color={colors.brandInk} />
          <Text style={[styles.skipNum, { color: colors.brandInk }]}>
            {skipFwdSecs}
          </Text>
        </Pressable>
      </View>

      <View style={styles.bottomRow}>
        {readAlongAvailable ? (
          <Pressable
            testID="read-along-toggle"
            onPress={toggleFollowAlong}
            style={({ pressed }) => [
              styles.readAlongToggle,
              {
                borderColor: followAlong ? colors.brandOrange : colors.brandInk,
                backgroundColor: followAlong ? colors.brandOrange : "transparent",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: followAlong }}
            accessibilityLabel="Read along"
          >
            <Feather
              name="align-left"
              size={18}
              color={followAlong ? "#ffffff" : colors.brandInk}
            />
            <Text
              style={[
                styles.readAlongToggleText,
                { color: followAlong ? "#ffffff" : colors.brandInk },
              ]}
            >
              Read along
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={cycleSpeed}
          style={({ pressed }) => [
            styles.speedBtn,
            { borderColor: colors.brandInk, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${speed} times. Tap to change.`}
        >
          <Text style={[styles.speedText, { color: colors.brandInk }]}>
            {speed.toFixed(2).replace(/\.?0+$/, "")}x
          </Text>
        </Pressable>
        {remoteAudioUrl ? (
          <Pressable
            onPress={() => {
              if (isDownloaded) {
                if (id) downloads.removeDownload(id);
              } else if (
                downloadEntry?.status !== "downloading" &&
                book.data
              ) {
                downloads.startDownload(book.data);
              }
            }}
            disabled={downloadEntry?.status === "downloading"}
            style={({ pressed }) => [
              styles.speedBtn,
              {
                borderColor: isDownloaded ? colors.brandOrange : colors.brandInk,
                opacity: pressed ? 0.7 : 1,
                flexDirection: "row",
                gap: 6,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              isDownloaded
                ? "Downloaded for offline. Tap to remove."
                : downloadEntry?.status === "downloading"
                  ? `Downloading ${Math.round((downloadEntry?.progress ?? 0) * 100)} percent`
                  : "Download for offline listening"
            }
          >
            <Feather
              name={isDownloaded ? "check-circle" : "download"}
              size={16}
              color={isDownloaded ? colors.brandOrange : colors.brandInk}
            />
            <Text
              style={[
                styles.speedText,
                { color: isDownloaded ? colors.brandOrange : colors.brandInk },
              ]}
            >
              {isDownloaded
                ? "Saved"
                : downloadEntry?.status === "downloading"
                  ? `${Math.round((downloadEntry?.progress ?? 0) * 100)}%`
                  : "Download"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={voice.onMicPress}
          style={({ pressed }) => [
            styles.speedBtn,
            {
              borderColor:
                voice.state === "recording"
                  ? colors.destructive
                  : colors.brandInk,
              opacity: pressed ? 0.7 : 1,
              flexDirection: "row",
              gap: 6,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ busy: voice.state === "processing" }}
          accessibilityLabel={
            voice.state === "recording"
              ? "Listening. Tap to stop and run command."
              : voice.state === "processing"
                ? "Processing voice command"
                : "Voice command. Tap and speak."
          }
        >
          <Feather
            name={voice.state === "recording" ? "square" : "mic"}
            size={16}
            color={
              voice.state === "recording" ? colors.destructive : colors.brandInk
            }
          />
          <Text
            style={[
              styles.speedText,
              {
                color:
                  voice.state === "recording"
                    ? colors.destructive
                    : colors.brandInk,
              },
            ]}
          >
            {voice.state === "processing"
              ? "…"
              : voice.state === "recording"
                ? "Stop"
                : "Voice"}
          </Text>
        </Pressable>
      </View>
      </View>
    </View>
  );
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 80,
  },
  errorBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBtnLabel: {
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  coverWrap: {
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  titleBlock: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: "Fraunces_700Bold",
    textAlign: "center",
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  author: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  audioNotice: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    fontStyle: "italic",
  },
  scrubberBlock: {
    width: "100%",
  },
  scrubHit: {
    width: "100%",
    paddingVertical: 16,
    justifyContent: "center",
  },
  track: {
    height: 6,
    borderRadius: 3,
    justifyContent: "center",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  thumb: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    borderWidth: 2,
  },
  timeRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  time: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  skipNum: {
    position: "absolute",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  playBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  speedBtn: {
    minWidth: 56,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  speedText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums"],
  },
  readAlongToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  readAlongToggleText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  readAlongPanel: {
    flex: 1,
    width: "100%",
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  readAlongScroll: {
    flex: 1,
  },
  readAlongContent: {
    padding: 16,
  },
  segmentRow: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
});
