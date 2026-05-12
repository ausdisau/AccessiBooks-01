import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = {
  uri?: string | null;
  title: string;
  width: number;
  height: number;
  rounded?: number;
};

export function BookCover({ uri, title, width, height, rounded }: Props) {
  const colors = useColors();
  const radius = rounded ?? colors.radius;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.muted,
        }}
        accessible
        accessibilityLabel={`Cover of ${title}`}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.brandNavy,
        },
      ]}
      accessible
      accessibilityLabel={`Cover of ${title}`}
    >
      <Text
        numberOfLines={4}
        style={[
          styles.fallbackText,
          { color: colors.brandCream, fontSize: Math.max(11, width / 9) },
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  fallbackText: {
    fontFamily: "Fraunces_700Bold",
    textAlign: "center",
    lineHeight: 18,
  },
});
