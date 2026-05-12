import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookCarousel } from "@/components/BookCarousel";
import { BookCover } from "@/components/BookCover";
import { useColors } from "@/hooks/useColors";
import {
  type Book,
  fetchBooks,
  fetchFeatured,
  fetchTrending,
} from "@/lib/api";

const RECENT_KEY = "accessibooks:recent";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [continueListening, setContinueListening] = useState<Book[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_KEY);
      const list: Book[] = raw ? JSON.parse(raw) : [];
      setContinueListening(list.slice(0, 12));
    } catch {
      setContinueListening([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecent();
    }, [loadRecent]),
  );

  const featured = useQuery({
    queryKey: ["featured"],
    queryFn: fetchFeatured,
  });
  // "New releases" — most recently added titles in the catalog.
  const newReleases = useQuery({
    queryKey: ["books", "new"],
    queryFn: () => fetchBooks({ limit: 24 }),
  });
  // "Recommended" — trending titles (the API doesn't expose a dedicated
  // recommender for guests; trending is the closest equivalent the web app
  // surfaces on Home as well).
  const recommended = useQuery({
    queryKey: ["recommended"],
    queryFn: fetchTrending,
  });

  const isAnyError =
    featured.isError && recommended.isError && newReleases.isError;

  const isLoading =
    featured.isLoading && recommended.isLoading && newReleases.isLoading;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 100 : 100;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 12,
          paddingBottom: insets.bottom + webBottomInset,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.logo}
            accessibilityLabel="AccessiBooks logo"
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.brandWord, { color: colors.brandInk }]}
              accessibilityRole="header"
            >
              AccessiBooks
            </Text>
            <Text style={[styles.brandTag, { color: colors.mutedForeground }]}>
              Audiobooks & ebooks for everyone
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Loading your library…
            </Text>
          </View>
        ) : isAnyError ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.foreground }]}>
              We couldn't reach the catalog.
            </Text>
            <Text
              style={[styles.errorSub, { color: colors.mutedForeground }]}
            >
              Check your connection and try again.
            </Text>
          </View>
        ) : (
          <>
            {featured.data ? (
              <Pressable
                onPress={() =>
                  router.push(
                    `/book/${encodeURIComponent(featured.data!.id)}`,
                  )
                }
                style={({ pressed }) => [
                  styles.featuredCard,
                  {
                    backgroundColor: colors.brandNavyStrong,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Featured: ${featured.data.title}`}
              >
                <BookCover
                  uri={featured.data.coverUrl ?? null}
                  title={featured.data.title}
                  width={100}
                  height={150}
                />
                <View style={styles.featuredText}>
                  <Text
                    style={[styles.featuredEyebrow, { color: colors.brandOrange }]}
                  >
                    FEATURED
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[styles.featuredTitle, { color: "#ffffff" }]}
                  >
                    {featured.data.title}
                  </Text>
                  {featured.data.author ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.featuredAuthor,
                        { color: colors.brandCream },
                      ]}
                    >
                      by {featured.data.author}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ) : null}

            {continueListening.length > 0 ? (
              <BookCarousel
                title="Continue Listening"
                subtitle="Pick up where you left off"
                books={continueListening}
                loading={false}
              />
            ) : null}
            <BookCarousel
              title="New Releases"
              subtitle="Fresh in the catalog"
              books={newReleases.data?.data ?? []}
              loading={newReleases.isLoading}
            />
            <BookCarousel
              title="Recommended"
              subtitle="Picked for accessible listening"
              books={recommended.data ?? []}
              loading={recommended.isLoading}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  brandWord: {
    fontSize: 22,
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.4,
  },
  brandTag: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  featuredCard: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 28,
    padding: 16,
    borderRadius: 16,
    gap: 16,
    minHeight: 96,
  },
  featuredText: {
    flex: 1,
    justifyContent: "center",
  },
  featuredEyebrow: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  featuredTitle: {
    fontSize: 20,
    fontFamily: "Fraunces_700Bold",
    lineHeight: 24,
  },
  featuredAuthor: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  center: {
    paddingVertical: 80,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  errorSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
