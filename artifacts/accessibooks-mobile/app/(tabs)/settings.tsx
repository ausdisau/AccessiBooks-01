import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import {
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

type Row = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  href: string;
};

const ROWS: Row[] = [
  {
    icon: "user",
    label: "Account & sign in",
    description: "Manage your account on the web",
    href: "/account-settings",
  },
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
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 60_000,
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

  const tier = me.data?.subscriptionTier ?? "free";
  const tierLabel = TIER_LABELS[tier] ?? "Free plan";
  const displayName =
    me.data?.firstName?.trim() || me.data?.email || "Guest reader";

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

        <Pressable
          onPress={() => open(me.data ? "/account-settings" : "/login")}
          style={({ pressed }) => [
            styles.brandCard,
            { backgroundColor: colors.brandCream, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            me.data
              ? `Signed in as ${displayName}, ${tierLabel}. Open account settings.`
              : "Sign in on the web"
          }
        >
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.logo}
            accessibilityLabel="AccessiBooks logo"
          />
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={[styles.brandTitle, { color: colors.brandInk }]}
            >
              {me.data ? displayName : "Sign in to AccessiBooks"}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.brandSub, { color: colors.brandInkSoft }]}
            >
              {me.data ? tierLabel : "Open the web app to sign in"}
            </Text>
          </View>
          <Feather
            name="external-link"
            size={20}
            color={colors.brandInkSoft}
          />
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
    marginBottom: 20,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
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
