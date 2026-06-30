import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
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
  type DownloadEntry,
  formatBytes,
  useDownloads,
} from "@/lib/downloads";

export default function DownloadsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const { entries, totalBytes, removeDownload, startDownload } = useDownloads();

  const list = Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <View style={{ flex: 1, backgroundColor: colors.brandCream }}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
          r.isTablet && { maxWidth: r.contentMaxWidth, alignSelf: "center", width: "100%" },
        ]}
      >
        <Text
          style={[styles.heading, { color: colors.brandInk }]}
          accessibilityRole="header"
        >
          Downloads
        </Text>
        <Text style={[styles.sub, { color: colors.brandInkSoft }]}>
          {list.length === 0
            ? "Titles you download for offline listening will appear here."
            : `${list.length} ${list.length === 1 ? "title" : "titles"} · ${formatBytes(totalBytes)} used`}
        </Text>

        {list.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="download-cloud" size={40} color={colors.brandInkSoft} />
            <Text style={[styles.emptyText, { color: colors.brandInkSoft }]}>
              Open any audiobook and tap “Download for offline” to save it here.
            </Text>
          </View>
        ) : (
          list.map((entry) => (
            <DownloadRow
              key={entry.bookId}
              entry={entry}
              onOpen={() => router.push(`/player/${entry.bookId}`)}
              onRemove={() => removeDownload(entry.bookId)}
              onRetry={() => startDownload(entryToBook(entry))}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function entryToBook(entry: DownloadEntry) {
  return {
    id: entry.bookId,
    title: entry.title,
    author: entry.author,
    coverUrl: entry.coverUrl,
    audioUrl: entry.audioUrl,
  };
}

function DownloadRow({
  entry,
  onOpen,
  onRemove,
  onRetry,
}: {
  entry: DownloadEntry;
  onOpen: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const colors = useColors();
  const pct = Math.round(entry.progress * 100);

  const statusLine =
    entry.status === "done"
      ? `Saved · ${formatBytes(entry.sizeBytes)}`
      : entry.status === "downloading"
        ? `Downloading… ${pct}%`
        : "Download failed — tap retry";

  return (
    <View
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.brandLine }]}
    >
      <Pressable
        onPress={onOpen}
        disabled={entry.status !== "done"}
        style={styles.rowMain}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}. ${statusLine}.${entry.status === "done" ? " Tap to play." : ""}`}
      >
        <BookCover
          uri={entry.coverUrl}
          title={entry.title}
          width={48}
          height={68}
          rounded={8}
        />
        <View style={styles.rowText}>
          <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.brandInk }]}>
            {entry.title}
          </Text>
          {entry.author ? (
            <Text numberOfLines={1} style={[styles.rowAuthor, { color: colors.brandInkSoft }]}>
              {entry.author}
            </Text>
          ) : null}
          <Text
            style={[
              styles.rowStatus,
              {
                color:
                  entry.status === "error"
                    ? colors.destructive
                    : colors.brandInkSoft,
              },
            ]}
          >
            {statusLine}
          </Text>
          {entry.status === "downloading" ? (
            <View style={[styles.bar, { backgroundColor: colors.brandLine }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${pct}%`, backgroundColor: colors.brandOrange },
                ]}
              />
            </View>
          ) : null}
        </View>
      </Pressable>

      {entry.status === "error" ? (
        <Pressable
          onPress={onRetry}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={`Retry download of ${entry.title}`}
          hitSlop={10}
        >
          <Feather name="refresh-cw" size={20} color={colors.brandInk} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={onRemove}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={`Remove download of ${entry.title}`}
        hitSlop={10}
      >
        <Feather name="trash-2" size={20} color={colors.destructive} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  heading: {
    fontSize: 26,
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.5,
  },
  sub: {
    marginTop: 4,
    marginBottom: 18,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap: 14,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    lineHeight: 19,
  },
  rowAuthor: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  rowStatus: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  bar: {
    marginTop: 8,
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  action: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
});
