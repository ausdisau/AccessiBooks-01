import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { fetchActiveLoans, type Book } from "@/lib/api";

const RECENT_KEY = "accessibooks:recent";

export async function rememberRecent(book: Book) {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const list: Book[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((b) => b.id !== book.id);
    filtered.unshift(book);
    await AsyncStorage.setItem(
      RECENT_KEY,
      JSON.stringify(filtered.slice(0, 30)),
    );
  } catch {}
}

type Row = {
  id: string;
  title: string;
  author?: string | null;
  coverUrl?: string | null;
};

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const [recent, setRecent] = useState<Book[]>([]);

  const loans = useQuery({
    queryKey: ["loans-active"],
    queryFn: fetchActiveLoans,
    staleTime: 60_000,
  });

  const loadRecent = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_KEY);
      setRecent(raw ? JSON.parse(raw) : []);
    } catch {
      setRecent([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecent();
      loans.refetch();
    }, [loadRecent, loans]),
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 100 : 100;

  const loanRows: Row[] =
    loans.data?.loans.map((l) => ({
      id: l.bookId,
      title: l.bookTitle,
      author: l.bookAuthor,
      coverUrl: l.bookCover,
    })) ?? [];

  const recentRows: Row[] = recent.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    coverUrl: b.coverUrl,
  }));

  const sections = [
    {
      key: "loans",
      title: "Active loans",
      subtitle: loans.data
        ? `${loans.data.loans.length} of ${loans.data.limits.maxLoans} on ${loans.data.limits.tier} plan`
        : "Sign in on the web to borrow titles",
      data: loanRows,
      authed: !!loans.data,
    },
    {
      key: "recent",
      title: "Recently opened",
      subtitle: "On this device",
      data: recentRows,
      authed: true,
    },
  ].filter((s) => s.data.length > 0 || s.key === "loans");

  const renderRow = ({ item }: { item: Row }) => (
    <Pressable
      onPress={() => router.push(`/book/${encodeURIComponent(item.id)}`)}
      style={({ pressed }) => [
        styles.row,
        {
          opacity: pressed ? 0.7 : 1,
          borderBottomColor: colors.border,
          paddingHorizontal: r.pagePadding,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
    >
      <BookCover
        uri={item.coverUrl ?? null}
        title={item.title}
        width={56}
        height={84}
      />
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={2}
          style={[styles.rowTitle, { color: colors.foreground }]}
        >
          {item.title}
        </Text>
        {item.author ? (
          <Text
            numberOfLines={1}
            style={[styles.rowAuthor, { color: colors.mutedForeground }]}
          >
            {item.author}
          </Text>
        ) : null}
      </View>
      <Feather
        name="chevron-right"
        size={20}
        color={colors.mutedForeground}
      />
    </Pressable>
  );

  if (loans.isLoading && recentRows.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View
          style={{
            paddingTop: insets.top + webTopInset + 12,
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>
            Your Library
          </Text>
        </View>
        <ActivityIndicator
          color={colors.primary}
          style={{ marginTop: 60 }}
        />
      </View>
    );
  }

  if (sections.every((s) => s.data.length === 0)) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View
          style={{
            paddingTop: insets.top + webTopInset + 12,
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>
            Your Library
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Loans, listening rooms, and recently opened
          </Text>
        </View>
        <FlatList
          data={[]}
          renderItem={() => null}
          keyExtractor={() => "_"}
          contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset }}
          refreshControl={
            <RefreshControl
              refreshing={loans.isFetching}
              onRefresh={() => loans.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="book-open" size={48} color={colors.brandLine} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No books yet
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Open a book from Home or Search and it'll show up here. Sign
                in on the web to see your active loans.
              </Text>
            </View>
          }
        />
      </View>
    );
  }

  const tabletGrid = r.gridColumns > 1;

  const renderGridSection = (section: typeof sections[number]) => {
    const cols = r.gridColumns;
    const rows: Row[][] = [];
    for (let i = 0; i < section.data.length; i += cols) {
      rows.push(section.data.slice(i, i + cols));
    }
    return (
      <View key={section.key} style={{ marginBottom: 24 }}>
        <View
          style={[
            styles.sectionHeader,
            {
              backgroundColor: colors.background,
              paddingHorizontal: r.pagePadding,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {section.title}
          </Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
            {section.subtitle}
          </Text>
          {section.key === "loans" && section.data.length === 0 ? (
            <Text
              style={[styles.emptySection, { color: colors.mutedForeground }]}
            >
              No active loans yet.
            </Text>
          ) : null}
        </View>
        {rows.map((rowItems, rIdx) => (
          <View
            key={rIdx}
            style={{
              flexDirection: "row",
              gap: 16,
              paddingHorizontal: r.pagePadding,
              marginTop: 16,
            }}
          >
            {rowItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  router.push(`/book/${encodeURIComponent(item.id)}`)
                }
                style={({ pressed }) => [
                  { flex: 1 / cols, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
              >
                <BookCover
                  uri={item.coverUrl ?? null}
                  title={item.title}
                  width={r.isLargeTablet ? 180 : 150}
                  height={r.isLargeTablet ? 270 : 225}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.gridTitle,
                    { color: colors.foreground },
                  ]}
                >
                  {item.title}
                </Text>
                {item.author ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.gridAuthor,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {item.author}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {Array.from({ length: cols - rowItems.length }).map((_, idx) => (
              <View key={`spacer-${idx}`} style={{ flex: 1 / cols }} />
            ))}
          </View>
        ))}
      </View>
    );
  };

  if (tabletGrid) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + webBottomInset,
            maxWidth: 1100,
            alignSelf: "center",
            width: "100%",
          }}
          refreshControl={
            <RefreshControl
              refreshing={loans.isFetching}
              onRefresh={() => loans.refetch()}
              tintColor={colors.primary}
            />
          }
        >
          <View
            style={{
              paddingTop: insets.top + webTopInset + 12,
              paddingHorizontal: r.pagePadding,
              paddingBottom: 12,
            }}
          >
            <Text
              style={[styles.title, { color: colors.foreground }]}
              accessibilityRole="header"
            >
              Your Library
            </Text>
          </View>
          {sections.map((s) => renderGridSection(s))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        contentContainerStyle={{
          paddingBottom: insets.bottom + webBottomInset,
        }}
        ListHeaderComponent={
          <View
            style={{
              paddingTop: insets.top + webTopInset + 12,
              paddingHorizontal: 16,
              paddingBottom: 12,
            }}
          >
            <Text
              style={[styles.title, { color: colors.foreground }]}
              accessibilityRole="header"
            >
              Your Library
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={loans.isFetching}
            onRefresh={() => loans.refetch()}
            tintColor={colors.primary}
          />
        }
        renderSectionHeader={({ section }) => (
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: colors.background },
            ]}
          >
            <Text
              style={[styles.sectionTitle, { color: colors.foreground }]}
            >
              {section.title}
            </Text>
            <Text
              style={[styles.sectionSub, { color: colors.mutedForeground }]}
            >
              {section.subtitle}
            </Text>
            {section.key === "loans" && section.data.length === 0 ? (
              <Text
                style={[
                  styles.emptySection,
                  { color: colors.mutedForeground },
                ]}
              >
                No active loans yet.
              </Text>
            ) : null}
          </View>
        )}
        renderItem={({ item, section }) =>
          section.data.length > 0 ? renderRow({ item }) : null
        }
        stickySectionHeadersEnabled={false}
        SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    fontSize: 28,
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.3,
  },
  sectionSub: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  emptySection: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    paddingTop: 80,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gridTitle: {
    marginTop: 10,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 19,
  },
  gridAuthor: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 19,
  },
  rowAuthor: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
