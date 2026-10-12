import { useEffect, useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, useColorScheme, View } from "react-native";
import { vars } from "nativewind";
import { getStreakLevel } from "@jsmf/core/domain";
import palette from "./palette.json";

/**
 * Light/dark follows the system, as web's next-themes "system" default does.
 * Colours come from palette.json (hex copies of web's globals.css tokens) and
 * reach NativeWind classes as CSS variables of "r g b" channels.
 */
export type Scheme = "light" | "dark";
export type ColorToken = keyof typeof palette.light;
export type Colors = Record<ColorToken, string>;

export function useScheme(): Scheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function useColors(): Colors {
  return palette[useScheme()];
}

function channels(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const cssVarsByScheme: Record<Scheme, Record<string, string>> = {
  light: Object.fromEntries(Object.entries(palette.light).map(([k, v]) => [`--${k}`, channels(v)])),
  dark: Object.fromEntries(Object.entries(palette.dark).map(([k, v]) => [`--${k}`, channels(v)])),
};

/** NativeWind variable style for a subtree (used at the root and inside modals). */
export function useThemeVars() {
  const scheme = useScheme();
  return useMemo(() => vars(cssVarsByScheme[scheme]), [scheme]);
}

/**
 * Sets the theme variables for everything below. On web they also go on
 * <html>, because react-native-web renders modals in a portal outside this
 * view.
 */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const scheme = useScheme();
  const themeVars = useThemeVars();
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(cssVarsByScheme[scheme])) root.style.setProperty(name, value);
    root.style.colorScheme = scheme;
    document.body.style.backgroundColor = palette[scheme].background;
  }, [scheme]);
  return <View style={[styles.fill, themeVars]}>{children}</View>;
}

/** Re-applies the theme inside a modal's content (native modals live outside the root view). */
export function ThemeScope({ children, style }: { children: ReactNode; style?: object }) {
  const themeVars = useThemeVars();
  return <View style={[styles.fill, themeVars, style]}>{children}</View>;
}

/**
 * A streak tier's colour for this scheme. Core's tiers carry CSS-variable
 * accents for web (`var(--streak-hot)`); on native the tier id maps to the
 * same colours as concrete hex values.
 */
export function useStreakAccent(days: number): string {
  const scheme = useScheme();
  const level = getStreakLevel(days);
  const table = palette.streak[scheme] as Record<string, string>;
  return table[level.id] ?? table.new;
}

/** `#rrggbb` at an opacity, for tinted fills and borders drawn in style props. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex.slice(0, 7)}${a}`;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
