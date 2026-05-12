import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import type { Book } from "@/lib/api";

type Props = {
  title: string;
  subtitle?: string;
  books: Book[];
  loading?: boolean;
  itemWidth?: number;
};

export function BookCarousel({
  title,
  subtitle,
  books,
  loading,
  itemWidth = 132,
}: Props) {
  const colors = useColors();
  const itemHeight = Math.round(itemWidth * 1.5);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text
          style={[styles.title, { color: colors.foreground }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={[styles.loading, { height: itemHeight + 60 }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : books.length === 0 ? (
        <View style={[styles.empty, { height: itemHeight + 60 }]}>
          <Text style={{ color: colors.mutedForeground }}>
            Nothing here yet.
          </Text>
        </View>
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={books}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/book/${encodeURIComponent(item.id)}`)}
              style={({ pressed }) => [
                styles.item,
                { width: itemWidth, opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}${
                item.author ? ` by ${item.author}` : ""
              }`}
            >
              <BookCover
                uri={item.coverUrl ?? null}
                title={item.title}
                width={itemWidth}
                height={itemHeight}
              />
              <Text
                numberOfLines={2}
                style={[styles.itemTitle, { color: colors.foreground }]}
              >
                {item.title}
              </Text>
              {item.author ? (
                <Text
                  numberOfLines={1}
                  style={[styles.itemAuthor, { color: colors.mutedForeground }]}
                >
                  {item.author}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 28,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  list: {
    paddingHorizontal: 12,
    gap: 12,
  },
  item: {
    marginRight: 12,
  },
  itemTitle: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  itemAuthor: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    paddingHorizontal: 16,
    justifyContent: "center",
  },
});
