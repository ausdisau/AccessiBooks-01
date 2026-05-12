import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { fetchBooks } from "@/lib/api";

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const search = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => fetchBooks({ search: submitted, limit: 50 }),
    enabled: submitted.length > 0,
  });

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 100 : 100;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + webTopInset + 12,
            paddingHorizontal: r.pagePadding,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
          r.isTablet && {
            maxWidth: 1100,
            alignSelf: "center",
            width: "100%",
          },
        ]}
      >
        <Text
          style={[styles.title, { color: colors.foreground }]}
          accessibilityRole="header"
        >
          Search
        </Text>
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => setSubmitted(query.trim())}
            returnKeyType="search"
            placeholder="Search audiobooks, ebooks…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            accessibilityLabel="Search the catalog"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => {
                setQuery("");
                setSubmitted("");
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {submitted.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="search" size={48} color={colors.brandLine} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Search 3,000+ audiobooks and ebooks
          </Text>
        </View>
      ) : search.isLoading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : search.isError ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.foreground }]}>
            Search failed. Try again.
          </Text>
        </View>
      ) : (
        <FlatList
          key={`grid-${r.gridColumns}`}
          data={search.data?.data ?? []}
          keyExtractor={(b) => b.id}
          numColumns={r.gridColumns}
          {...(r.gridColumns > 1
            ? { columnWrapperStyle: { gap: 16, paddingHorizontal: r.pagePadding } }
            : {})}
          contentContainerStyle={{
            paddingHorizontal: r.gridColumns > 1 ? 0 : r.pagePadding,
            paddingTop: 12,
            paddingBottom: insets.bottom + webBottomInset,
            gap: r.gridColumns > 1 ? 20 : 0,
            ...(r.isTablet
              ? { maxWidth: 1100, alignSelf: "center", width: "100%" }
              : {}),
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                No matches for "{submitted}"
              </Text>
            </View>
          }
          renderItem={({ item }) =>
            r.gridColumns > 1 ? (
              <Pressable
                onPress={() =>
                  router.push(`/book/${encodeURIComponent(item.id)}`)
                }
                style={({ pressed }) => [
                  styles.gridItem,
                  { flex: 1 / r.gridColumns, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}${
                  item.author ? ` by ${item.author}` : ""
                }`}
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
            ) : (
              <Pressable
                onPress={() =>
                  router.push(`/book/${encodeURIComponent(item.id)}`)
                }
                style={({ pressed }) => [
                  styles.row,
                  { opacity: pressed ? 0.7 : 1, borderBottomColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}${
                  item.author ? ` by ${item.author}` : ""
                }`}
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
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 28,
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    paddingTop: 80,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  gridItem: {
    alignItems: "flex-start",
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
});
