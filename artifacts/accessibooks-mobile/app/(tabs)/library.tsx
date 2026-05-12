import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import type { Book } from "@/lib/api";

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

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [recent, setRecent] = useState<Book[]>([]);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_KEY);
      setRecent(raw ? JSON.parse(raw) : []);
    } catch {
      setRecent([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 100 : 100;

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
        <Text
          style={[styles.title, { color: colors.foreground }]}
          accessibilityRole="header"
        >
          Your Library
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Recently opened on this device
        </Text>
      </View>

      <FlatList
        data={recent}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + webBottomInset,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="book-open" size={48} color={colors.brandLine} />
            <Text
              style={[styles.emptyTitle, { color: colors.foreground }]}
            >
              No books yet
            </Text>
            <Text
              style={[styles.emptyText, { color: colors.mutedForeground }]}
            >
              Open a book from Home or Search and it'll show up here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/book/${encodeURIComponent(item.id)}`)}
            style={({ pressed }) => [
              styles.row,
              { opacity: pressed ? 0.7 : 1, borderBottomColor: colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Reopen ${item.title}`}
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
        )}
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
