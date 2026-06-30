import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Linking,
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
import { rememberRecent } from "@/app/(tabs)/library";
import {
  apiBase,
  type Book,
  fetchActiveLoans,
  fetchBook,
  fetchMe,
  formatDuration,
} from "@/lib/api";
import { formatBytes, useDownloads } from "@/lib/downloads";

type Cta = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  kind: "play" | "borrow" | "purchase" | "open";
  hint: string;
};

/**
 * Pick the primary CTA for a book based on the user's tier and active
 * loans. Mirrors the web app's listener-side logic:
 *   - Audiobook + (active loan OR Plus/Premium tier)  → Play
 *   - Audiobook + Free tier with no loan              → Borrow
 *   - Ebook only (no audioUrl) on any tier            → Open book
 *   - Anything paid/locked the user can't access      → Purchase
 */
function pickCta(
  isAudiobook: boolean,
  hasActiveLoan: boolean,
  tier: string,
): Cta {
  if (!isAudiobook) {
    return {
      label: "Open book",
      icon: "book-open",
      kind: "open",
      hint: "Open in the web reader",
    };
  }
  if (hasActiveLoan) {
    return {
      label: "Play audiobook",
      icon: "play",
      kind: "play",
      hint: "Stream from your active loan",
    };
  }
  if (tier === "plus" || tier === "premium") {
    return {
      label: "Play audiobook",
      icon: "play",
      kind: "play",
      hint: `Included in your ${tier} plan`,
    };
  }
  // Free tier without a loan: nudge them to borrow first; if the title
  // isn't loanable on Free, the borrow flow on the web will offer purchase.
  return tier === "free"
    ? {
        label: "Borrow to listen",
        icon: "bookmark",
        kind: "borrow",
        hint: "Free with your library card",
      }
    : {
        label: "Purchase",
        icon: "shopping-bag",
        kind: "purchase",
        hint: "Buy this title",
      };
}

export default function BookDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();

  const book = useQuery({
    queryKey: ["book", id],
    queryFn: () => fetchBook(id!),
    enabled: !!id,
  });

  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 60_000,
  });
  const loans = useQuery({
    queryKey: ["loans-active"],
    queryFn: fetchActiveLoans,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (book.data) rememberRecent(book.data);
  }, [book.data]);

  const openWeb = async (path: string) => {
    const url = `${apiBase()}${path}`;
    if (Platform.OS === "web") {
      Linking.openURL(url);
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url);
    }
  };

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
  const tier = me.data?.subscriptionTier ?? "free";
  const hasActiveLoan = !!loans.data?.loans.some((l) => l.bookId === b.id);
  const cta = pickCta(isAudiobook, hasActiveLoan, tier);

  const onCta = () => {
    if (cta.kind === "play") {
      router.push(`/player/${encodeURIComponent(b.id)}`);
    } else if (cta.kind === "borrow") {
      openWeb(`/book/${encodeURIComponent(b.id)}?action=borrow`);
    } else if (cta.kind === "purchase") {
      openWeb(`/book/${encodeURIComponent(b.id)}?action=purchase`);
    } else {
      openWeb(`/book/${encodeURIComponent(b.id)}`);
    }
  };

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
          <View
            style={[
              styles.heroContent,
              r.isTablet && {
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 32,
                maxWidth: 960,
                alignSelf: "center",
                width: "100%",
                paddingHorizontal: 32,
              },
            ]}
          >
            <BookCover
              uri={b.coverUrl ?? null}
              title={b.title}
              width={r.isLargeTablet ? 240 : r.isTablet ? 200 : 170}
              height={r.isLargeTablet ? 360 : r.isTablet ? 300 : 255}
              rounded={12}
            />
            <View
              style={[
                r.isTablet ? { flex: 1, alignItems: "flex-start" } : { alignItems: "center" },
              ]}
            >
              <Text
                style={[
                  styles.heroTitle,
                  { color: "#ffffff" },
                  r.isTablet && { textAlign: "left", fontSize: 32, lineHeight: 36 },
                ]}
                accessibilityRole="header"
              >
                {b.title}
              </Text>
              {b.author ? (
                <Text
                  style={[
                    styles.heroAuthor,
                    { color: colors.brandCream },
                    r.isTablet && { fontSize: 16 },
                  ]}
                >
                  by {b.author}
                </Text>
              ) : null}
              <View
                style={[
                  styles.metaRow,
                  r.isTablet && { justifyContent: "flex-start" },
                ]}
              >
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
        </View>

        <View
          style={[
            styles.body,
            { paddingHorizontal: r.pagePadding },
            r.isTablet && {
              maxWidth: 960,
              alignSelf: "center",
              width: "100%",
            },
          ]}
        >
          <Pressable
            onPress={onCta}
            style={({ pressed }) => [
              styles.playButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={cta.label}
            accessibilityHint={cta.hint}
          >
            <Feather
              name={cta.icon}
              size={20}
              color={colors.primaryForeground}
            />
            <Text
              style={[styles.playLabel, { color: colors.primaryForeground }]}
            >
              {cta.label}
            </Text>
          </Pressable>
          <Text
            style={[styles.ctaHint, { color: colors.mutedForeground }]}
          >
            {cta.hint}
          </Text>

          {isAudiobook && b.audioUrl ? (
            <OfflineDownloadButton book={b} />
          ) : null}

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

function OfflineDownloadButton({ book }: { book: Book }) {
  const colors = useColors();
  const { getEntry, startDownload, removeDownload } = useDownloads();
  const entry = getEntry(book.id);
  const status = entry?.status;

  const label =
    status === "done"
      ? `Downloaded${entry?.sizeBytes ? ` · ${formatBytes(entry.sizeBytes)}` : ""} · tap to remove`
      : status === "downloading"
        ? `Downloading ${Math.round((entry?.progress ?? 0) * 100)}%`
        : status === "error"
          ? "Download failed · tap to retry"
          : "Download for offline";

  const onPress = () => {
    if (status === "done") removeDownload(book.id);
    else if (status !== "downloading") startDownload(book);
  };

  const tint = status === "error" ? colors.destructive : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={status === "downloading"}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginTop: 14,
        minHeight: 48,
        paddingHorizontal: 16,
        borderWidth: 1.5,
        borderColor: tint,
        borderRadius: 12,
        opacity: pressed ? 0.7 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather
        name={
          status === "done"
            ? "check-circle"
            : status === "error"
              ? "alert-circle"
              : "download"
        }
        size={18}
        color={tint}
      />
      <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: tint }}>
        {label}
      </Text>
    </Pressable>
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
  ctaHint: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
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
