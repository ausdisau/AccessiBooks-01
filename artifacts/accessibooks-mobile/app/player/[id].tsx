import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type GestureResponderEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { fetchBook, fetchSettingsSummary, formatDuration } from "@/lib/api";

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

  const audioUrl = book.data?.audioUrl ?? null;
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

  const haptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const total = status?.duration ?? book.data?.duration ?? 0;
  const livePosition = status?.currentTime ?? 0;
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
      <View style={styles.coverWrap}>
        <BookCover
          uri={b.coverUrl ?? null}
          title={b.title}
          width={r.isLargeTablet ? 320 : r.isTablet ? 280 : 240}
          height={r.isLargeTablet ? 480 : r.isTablet ? 420 : 360}
          rounded={16}
        />
      </View>

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
});
