import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { router, usePathname, type ErrorBoundaryProps } from "expo-router";
import { errorReporter, setCurrentScreen } from "@/lib/error-reporting";
import { useColors } from "@/theme/theme";

/**
 * What a screen that threw while rendering shows instead. Used twice: as
 * each screen's own boundary (the stack's unstable_screenErrorBoundary, so the
 * rest of the app stays usable) and as the root layout's ErrorBoundary, where
 * it replaces everything. For the second case it uses only plain components
 * and the palette (useColors needs no provider) — nothing from the providers
 * that may be what failed.
 *
 * "Go home" is the way out web's error page has too. `/` redirects by sign-in
 * state; at the root, where no navigator is mounted, retry() remounts it.
 */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const colors = useColors();
  // The route that failed: the router records it while that screen renders,
  // even when the render throws before the root layout can pass it on.
  const pathname = usePathname();

  useEffect(() => {
    setCurrentScreen(pathname);
    errorReporter.report(error, "render");
    // Once per error: a later route change must not report it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 20, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ fontSize: 14, color: colors["muted-foreground"], textAlign: "center", marginBottom: 20 }}>
        This screen hit an unexpected error. It has been reported — trying again usually works.
      </Text>
      <Pressable
        onPress={() => void retry()}
        accessibilityRole="button"
        style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}
      >
        <Text style={{ color: colors["primary-foreground"], fontWeight: "600" }}>Try again</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          router.replace("/");
          void retry();
        }}
        accessibilityRole="button"
        style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}
      >
        <Text style={{ color: colors.foreground, fontWeight: "600" }}>Go home</Text>
      </Pressable>
    </View>
  );
}
