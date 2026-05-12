import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import { fetchBook, formatDuration } from "@/lib/api";

const SKIP_BACK = 30;
const SKIP_FORWARD = 30;
const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function PlayerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const book = useQuery({
    queryKey: ["book", id],
    queryFn: () => fetchBook(id!),
    enabled: !!id,
  });

  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1);

  const total = book.data?.duration ?? 0;
  const speed = SPEEDS[speedIdx];

  const haptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const togglePlay = () => {
    haptic();
    setPlaying((p) => !p);
  };
  const skipBack = () => {
    haptic();
    setPosition((p) => Math.max(0, p - SKIP_BACK));
  };
  const skipForward = () => {
    haptic();
    setPosition((p) => (total > 0 ? Math.min(total, p + SKIP_FORWARD) : p + SKIP_FORWARD));
  };
  const cycleSpeed = () => {
    haptic();
    setSpeedIdx((i) => (i + 1) % SPEEDS.length);
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

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.brandCream,
          paddingBottom: Math.max(insets.bottom + 16, 32),
        },
      ]}
      accessibilityLabel={`Now playing ${b.title}`}
    >
      <View style={styles.coverWrap}>
        <BookCover
          uri={b.coverUrl ?? null}
          title={b.title}
          width={240}
          height={360}
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
      </View>

      <View style={styles.scrubberBlock}>
        <View
          style={[styles.track, { backgroundColor: colors.brandLine }]}
          accessibilityRole="progressbar"
          accessibilityLabel={`Progress ${Math.round(progress * 100)} percent`}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${progress * 100}%`,
                backgroundColor: colors.brandOrange,
              },
            ]}
          />
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
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Skip back ${SKIP_BACK} seconds`}
          hitSlop={12}
        >
          <Feather name="rotate-ccw" size={32} color={colors.brandInk} />
          <Text style={[styles.skipNum, { color: colors.brandInk }]}>
            {SKIP_BACK}
          </Text>
        </Pressable>

        <Pressable
          onPress={togglePlay}
          style={({ pressed }) => [
            styles.playBtn,
            {
              backgroundColor: colors.brandOrange,
              opacity: pressed ? 0.85 : 1,
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
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Skip forward ${SKIP_FORWARD} seconds`}
          hitSlop={12}
        >
          <Feather name="rotate-cw" size={32} color={colors.brandInk} />
          <Text style={[styles.skipNum, { color: colors.brandInk }]}>
            {SKIP_FORWARD}
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
  scrubberBlock: {
    width: "100%",
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
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
