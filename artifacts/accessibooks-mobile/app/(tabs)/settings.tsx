import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { apiBase, fetchMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Row = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  href: string;
};

const ROWS: Row[] = [
  {
    icon: "sliders",
    label: "Accessibility preferences",
    description: "Easy English, fonts, contrast, screen reader",
    href: "/settings",
  },
  {
    icon: "credit-card",
    label: "Subscription",
    description: "Free, Plus, or Premium",
    href: "/pricing",
  },
  {
    icon: "headphones",
    label: "Listening rooms",
    description: "Co-listen with friends",
    href: "/community",
  },
  {
    icon: "shield",
    label: "Trust & privacy",
    description: "How we handle your data",
    href: "/trust",
  },
];

const TIER_LABELS: Record<string, string> = {
  free: "Free plan",
  plus: "Plus plan",
  premium: "Premium plan",
};

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const {
    user: replitUser,
    isAuthenticated,
    isLoading: authLoading,
    login,
    logout,
  } = useAuth();

  // Falls back to the legacy /me endpoint (cookie-based Passport session)
  // when no native Replit Auth session is active, so users who signed in on
  // the web can still see their plan info on the device.
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 60_000,
    enabled: !isAuthenticated,
  });

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 100 : 100;

  const open = async (path: string) => {
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

  const handleSignInOut = async () => {
    if (isAuthenticated) {
      await logout();
    } else {
      await login();
    }
  };

  // Prefer the native Replit Auth user; fall back to the web /me response.
  const tier = me.data?.subscriptionTier ?? "free";
  const tierLabel = TIER_LABELS[tier] ?? "Free plan";
  const signedIn = isAuthenticated || !!me.data;
  const displayName = replitUser
    ? [replitUser.firstName, replitUser.lastName].filter(Boolean).join(" ") ||
      replitUser.email ||
      "Signed in"
    : me.data?.firstName?.trim() || me.data?.email || "Guest reader";
  const subtitle = replitUser
    ? replitUser.email || "Signed in with Replit"
    : signedIn
      ? tierLabel
      : "Sign in to sync your library";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 12,
          paddingBottom: insets.bottom + webBottomInset,
          ...(r.isTablet
            ? {
                maxWidth: r.contentMaxWidth,
                alignSelf: "center",
                width: "100%",
              }
            : {}),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text
            style={[styles.title, { color: colors.foreground }]}
            accessibilityRole="header"
          >
            Settings
          </Text>
        </View>

        <View
          style={[styles.brandCard, { backgroundColor: colors.brandCream }]}
        >
          {replitUser?.profileImageUrl ? (
            <Image
              source={{ uri: replitUser.profileImageUrl }}
              style={styles.avatar}
              accessibilityLabel="Profile photo"
            />
          ) : (
            <Image
              source={require("../../assets/images/logo.png")}
              style={styles.logo}
              accessibilityLabel="AccessiBooks logo"
            />
          )}
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={[styles.brandTitle, { color: colors.brandInk }]}
            >
              {signedIn ? displayName : "Sign in to AccessiBooks"}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.brandSub, { color: colors.brandInkSoft }]}
            >
              {subtitle}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleSignInOut}
          disabled={authLoading}
          style={({ pressed }) => [
            styles.authButton,
            {
              backgroundColor: isAuthenticated ? colors.muted : colors.primary,
              opacity: pressed || authLoading ? 0.75 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            isAuthenticated
              ? `Sign out of ${displayName}`
              : "Sign in with Replit"
          }
          testID={isAuthenticated ? "button-mobile-logout" : "button-mobile-login"}
        >
          {authLoading ? (
            <ActivityIndicator
              color={isAuthenticated ? colors.foreground : "#fff"}
            />
          ) : (
            <>
              <Feather
                name={isAuthenticated ? "log-out" : "log-in"}
                size={18}
                color={isAuthenticated ? colors.foreground : "#fff"}
              />
              <Text
                style={[
                  styles.authButtonText,
                  {
                    color: isAuthenticated ? colors.foreground : "#fff",
                  },
                ]}
              >
                {isAuthenticated ? "Sign out" : "Continue with Replit"}
              </Text>
            </>
          )}
        </Pressable>

        <View style={styles.list}>
          {ROWS.map((row) => (
            <Pressable
              key={row.href}
              onPress={() => open(row.href)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${row.label}. Opens in browser.`}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: colors.muted },
                ]}
              >
                <Feather name={row.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                  {row.label}
                </Text>
                <Text
                  style={[styles.rowDesc, { color: colors.mutedForeground }]}
                >
                  {row.description}
                </Text>
              </View>
              <Feather
                name="external-link"
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          v1.0 · Made with care by Australian Disability Ltd.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.5,
  },
  brandCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  brandTitle: {
    fontSize: 17,
    fontFamily: "Fraunces_700Bold",
  },
  brandSub: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  authButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  authButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  list: {
    marginHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 60,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  rowDesc: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    textAlign: "center",
    marginTop: 24,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
