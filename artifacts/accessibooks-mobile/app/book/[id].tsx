import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import { rememberRecent } from "@/app/(tabs)/library";
import { fetchBook, formatDuration } from "@/lib/api";

export default function BookDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const book = useQuery({
    queryKey: ["book", id],
    queryFn: () => fetchBook(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (book.data) rememberRecent(book.data);
  }, [book.data]);

  if (book.isError) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background, paddingTop: insets.top + 80 },
        ]}
      >
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>
          Couldn't load this book.
        </Text>
        <Pressable
          onPress={() => book.refetch()}
          style={({ pressed }) => [
            styles.retryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={[styles.retryLabel, { color: colors.primaryForeground }]}>
            Try again
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={[styles.backLabel, { color: colors.mutedForeground }]}>
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  if (book.isLoading || !book.data) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background, paddingTop: insets.top + 80 },
        ]}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const b = book.data;
  const isAudiobook =
    !b.contentType || b.contentType === "audiobook" || !!b.audioUrl;
  const actionLabel = isAudiobook ? "Play audiobook" : "Open book";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroWrap, { backgroundColor: colors.brandNavy }]}>
          <LinearGradient
            colors={[colors.brandNavyStrong, colors.brandNavy]}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ height: insets.top + 12 }} />
          <View style={styles.heroContent}>
            <BookCover
              uri={b.coverUrl ?? null}
              title={b.title}
              width={170}
              height={255}
              rounded={12}
            />
            <Text
              style={[styles.heroTitle, { color: "#ffffff" }]}
              accessibilityRole="header"
            >
              {b.title}
            </Text>
            {b.author ? (
              <Text style={[styles.heroAuthor, { color: colors.brandCream }]}>
                by {b.author}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              {b.contentType ? (
                <Chip color={colors.brandOrange}>{b.contentType}</Chip>
              ) : null}
              {b.duration ? (
                <Chip color={colors.brandCream}>
                  {formatDuration(b.duration)}
                </Chip>
              ) : null}
              {b.source ? (
                <Chip color={colors.brandCream}>{b.source}</Chip>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Pressable
            onPress={() => router.push(`/player/${encodeURIComponent(b.id)}`)}
            style={({ pressed }) => [
              styles.playButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Feather
              name={isAudiobook ? "play" : "book-open"}
              size={20}
              color={colors.primaryForeground}
            />
            <Text
              style={[styles.playLabel, { color: colors.primaryForeground }]}
            >
              {actionLabel}
            </Text>
          </Pressable>

          {b.description ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                About
              </Text>
              <Text
                style={[styles.description, { color: colors.foreground }]}
              >
                {b.description}
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Details
            </Text>
            <DetailRow
              label="Genre"
              value={b.genre ?? "—"}
              color={colors.mutedForeground}
              fg={colors.foreground}
            />
            <DetailRow
              label="Language"
              value={b.language ?? "—"}
              color={colors.mutedForeground}
              fg={colors.foreground}
            />
            <DetailRow
              label="Reading level"
              value={b.readingLevel ? `Level ${b.readingLevel}` : "—"}
              color={colors.mutedForeground}
              fg={colors.foreground}
            />
            <DetailRow
              label="Pages"
              value={b.pageCount ? String(b.pageCount) : "—"}
              color={colors.mutedForeground}
              fg={colors.foreground}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.chip,
        { borderColor: color },
      ]}
    >
      <Text style={[styles.chipText, { color }]}>{children}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  color,
  fg,
}: {
  label: string;
  value: string;
  color: string;
  fg: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: fg }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  retryBtn: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  retryLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  backBtn: {
    minHeight: 44,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  backLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  heroWrap: {
    paddingBottom: 28,
  },
  heroContent: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  heroTitle: {
    marginTop: 18,
    fontSize: 24,
    fontFamily: "Fraunces_700Bold",
    textAlign: "center",
    lineHeight: 28,
    letterSpacing: -0.5,
  },
  heroAuthor: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  metaRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
    letterSpacing: 0.3,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 14,
    minWidth: 44,
  },
  playLabel: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Fraunces_700Bold",
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  detailRow: {
    flexDirection: "row",
    paddingVertical: 8,
  },
  detailLabel: {
    width: 120,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
