import colors from "@/constants/colors";

/**
 * Returns the AccessiBooks design tokens.
 *
 * Mirrors the web app's baseline behaviour: light mode is the default
 * everywhere. Dark tokens are still defined in constants/colors.ts (and
 * exact-matched to the web `.dark` block) for future opt-in, but we do
 * not currently follow the device's appearance setting — the mobile
 * companion ships light-first to match the web baseline at parity.
 */
export function useColors() {
  return { ...colors.light, radius: colors.radius };
}
