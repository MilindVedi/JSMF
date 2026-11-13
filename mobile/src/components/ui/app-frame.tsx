import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { useColors } from "@/theme/theme";

/**
 * Below this width a phone is "narrow" (Galaxy Fold cover screen 280, old or
 * small Androids 320): the header and tab bar switch to their compact forms.
 */
export const COMPACT_WIDTH = 340;

/**
 * Whether the app is on a narrow screen. The window and the app's column are
 * the same width whenever this is true (the column only narrows it above 640).
 */
export function useIsCompact(): boolean {
  return useWindowDimensions().width < COMPACT_WIDTH;
}

/**
 * The widest the app's column gets. Phones (up to ~480 wide) and small
 * foldables use their full width; on a tablet or an unfolded phone the app
 * keeps a phone-like column in the middle, with the page colour either side.
 * The app is designed for one column, and Android 16+ ignores the portrait
 * lock on large screens, so a tablet can show it 1280 wide.
 */
export const APP_MAX_WIDTH = 640;

/**
 * Holds every screen (the stack, the tabs and their floating bar) in that
 * centred column. Screens size themselves with flex, never from the window's
 * width, so they all follow it. It clips, so a screen sliding in stays inside
 * the column instead of crossing the margins.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, width: "100%", maxWidth: APP_MAX_WIDTH, alignSelf: "center", overflow: "hidden" }}>{children}</View>
    </View>
  );
}
