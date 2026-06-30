import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { tierFromCustomerInfo, useSubscription } from "@/lib/revenuecat";

type PlanTier = "plus" | "premium" | "other";

function planTier(pkg: PurchasesPackage): PlanTier {
  const id = `${pkg.identifier} ${pkg.product.identifier}`.toLowerCase();
  if (id.includes("premium")) return "premium";
  if (id.includes("plus")) return "plus";
  return "other";
}

const TIER_LABELS: Record<string, string> = {
  free: "Free plan",
  plus: "Plus plan",
  premium: "Premium plan",
};

const TIER_BADGE: Record<PlanTier, string> = {
  plus: "Plus",
  premium: "Premium",
  other: "Plan",
};

const TIER_BLURB: Record<PlanTier, string> = {
  plus: "More borrows, offline listening, and premium voices.",
  premium: "Everything in Plus, plus unlimited access and early releases.",
  other: "Upgrade your AccessiBooks experience.",
};

const TIER_ORDER: Record<PlanTier, number> = { plus: 0, premium: 1, other: 2 };

export default function PaywallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const router = useRouter();
  const {
    configured,
    offerings,
    tier,
    isLoading,
    error: loadError,
    purchase,
    restore,
    isPurchasing,
    isRestoring,
  } = useSubscription();

  const [pending, setPending] = useState<PurchasesPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const packages = [...(offerings?.current?.availablePackages ?? [])].sort(
    (a, b) => TIER_ORDER[planTier(a)] - TIER_ORDER[planTier(b)],
  );

  const tierLabel = TIER_LABELS[tier] ?? "Free plan";

  const onConfirm = async () => {
    if (!pending) return;
    const pkg = pending;
    setError(null);
    setNotice(null);
    try {
      await purchase(pkg);
      setPending(null);
      router.back();
    } catch (e) {
      setPending(null);
      if ((e as { userCancelled?: boolean })?.userCancelled) return;
      setError("Your purchase could not be completed. Please try again.");
    }
  };

  const onRestore = async () => {
    setError(null);
    setNotice(null);
    try {
      const info = await restore();
      setNotice(
        tierFromCustomerInfo(info) === "free"
          ? "No previous purchases were found for this account."
          : "Your purchases have been restored.",
      );
    } catch {
      setError("We couldn't restore your purchases. Please try again.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: colors.border },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.title, { color: colors.foreground }]}
            accessibilityRole="header"
          >
            Choose your plan
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Current plan: {tierLabel}
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: colors.muted, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 32,
          gap: 14,
          ...(r.isTablet
            ? { maxWidth: r.contentMaxWidth, alignSelf: "center", width: "100%" }
            : {}),
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.lede, { color: colors.foreground }]}>
          Unlock the full AccessiBooks library, offline listening, and premium
          accessibility features.
        </Text>

        {notice ? (
          <View
            style={[styles.banner, { backgroundColor: colors.muted }]}
            accessibilityLiveRegion="polite"
          >
            <Feather name="check-circle" size={16} color={colors.primary} />
            <Text style={[styles.bannerText, { color: colors.foreground }]}>
              {notice}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={[styles.banner, { backgroundColor: "#fdecec" }]}
            accessibilityLiveRegion="polite"
          >
            <Feather name="alert-circle" size={16} color={colors.destructive} />
            <Text style={[styles.bannerText, { color: colors.destructive }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {!configured ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              Plans aren't available right now
            </Text>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
              In-app purchases haven't been set up on this device yet. Please try
              again later.
            </Text>
          </View>
        ) : isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : packages.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              No plans available
            </Text>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
              {loadError
                ? "We couldn't load plans. Please check your connection and try again."
                : "There are no subscription plans to show at the moment."}
            </Text>
          </View>
        ) : (
          packages.map((pkg) => {
            const pt = planTier(pkg);
            const isCurrent = tier === pt;
            return (
              <View
                key={pkg.identifier}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor:
                      pt === "premium" ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={styles.cardHead}>
                  <View
                    style={[styles.badge, { backgroundColor: colors.muted }]}
                  >
                    <Text style={[styles.badgeText, { color: colors.primary }]}>
                      {TIER_BADGE[pt]}
                    </Text>
                  </View>
                  <Text style={[styles.price, { color: colors.foreground }]}>
                    {pkg.product.priceString}
                  </Text>
                </View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  {pkg.product.title}
                </Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
                  {pkg.product.description?.trim()
                    ? pkg.product.description
                    : TIER_BLURB[pt]}
                </Text>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setNotice(null);
                    setPending(pkg);
                  }}
                  disabled={isCurrent || isPurchasing}
                  style={({ pressed }) => [
                    styles.cta,
                    {
                      backgroundColor: isCurrent
                        ? colors.muted
                        : colors.primary,
                      opacity: pressed && !isCurrent ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isCurrent
                      ? `${TIER_BADGE[pt]} is your current plan`
                      : `Choose ${TIER_BADGE[pt]} for ${pkg.product.priceString}`
                  }
                >
                  <Text
                    style={[
                      styles.ctaText,
                      {
                        color: isCurrent
                          ? colors.mutedForeground
                          : colors.primaryForeground,
                      },
                    ]}
                  >
                    {isCurrent ? "Current plan" : "Choose plan"}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}

        {configured ? (
          <Pressable
            onPress={onRestore}
            disabled={isRestoring}
            style={({ pressed }) => [
              styles.restore,
              { opacity: pressed || isRestoring ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Restore previous purchases"
          >
            {isRestoring ? (
              <ActivityIndicator color={colors.mutedForeground} size="small" />
            ) : (
              <Text style={[styles.restoreText, { color: colors.primary }]}>
                Restore purchases
              </Text>
            )}
          </Pressable>
        ) : null}

        <Text style={[styles.legal, { color: colors.mutedForeground }]}>
          Subscriptions are billed through your app store account and renew
          automatically until cancelled. Manage or cancel anytime in your store
          account settings.
        </Text>
      </ScrollView>

      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        onRequestClose={() => (isPurchasing ? null : setPending(null))}
      >
        <View style={styles.modalScrim}>
          <View
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            accessibilityViewIsModal
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Confirm subscription
            </Text>
            <Text style={[styles.modalDesc, { color: colors.mutedForeground }]}>
              {pending
                ? `Subscribe to ${pending.product.title} for ${pending.product.priceString}?`
                : ""}
            </Text>
            {__DEV__ ? (
              <Text style={[styles.modalNote, { color: colors.mutedForeground }]}>
                Test mode — no real charge will be made.
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setPending(null)}
                disabled={isPurchasing}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.muted,
                    opacity: pressed || isPurchasing ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                disabled={isPurchasing}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Confirm purchase"
              >
                {isPurchasing ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text
                    style={[
                      styles.modalBtnText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Confirm
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 24,
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  lede: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  price: {
    fontSize: 20,
    fontFamily: "Fraunces_700Bold",
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  cardDesc: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },
  cta: {
    marginTop: 6,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  loading: {
    paddingVertical: 48,
    alignItems: "center",
  },
  restore: {
    alignItems: "center",
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  restoreText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  legal: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Fraunces_700Bold",
  },
  modalDesc: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },
  modalNote: {
    fontSize: 12,
    fontStyle: "italic",
    fontFamily: "Inter_400Regular",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
