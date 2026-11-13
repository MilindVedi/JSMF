import "../../global.css";
// Configures @jsmf/core (API URL, secure token storage, notifier) before anything renders.
import "@/lib/core";
import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
// Per-weight imports, so only the weights the app uses are bundled.
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Sora_500Medium } from "@expo-google-fonts/sora/500Medium";
import { Sora_600SemiBold } from "@expo-google-fonts/sora/600SemiBold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_600SemiBold } from "@expo-google-fonts/jetbrains-mono/600SemiBold";
import { queryClient } from "@/lib/core";
import { trackSignedInPath, useAuthStore } from "@/lib/auth-store";
import { loadCelebratedDate } from "@/lib/streak";
import { ThemeRoot, useColors, useScheme } from "@/theme/theme";
import { AppFrame } from "@/components/ui/app-frame";
import { ToastHost } from "@/components/ui/toast-host";
import { LegalGate } from "@/components/legal/legal-gate";
import { StreakFlyOverlay } from "@/components/streak/fly-overlay";
import { StreakGoalCelebrator } from "@/components/streak/goal-celebrator";
import { ErrorScreen } from "@/components/ui/error-screen";
import { setCurrentScreen } from "@/lib/error-reporting";

// The crash reporter is installed in index.js, before any of these modules load.
void SplashScreen.preventAutoHideAsync();

/** Last resort: the layout or its providers threw. Screens have their own (see AppStack). */
export const ErrorBoundary = ErrorScreen;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const pathname = usePathname();

  useEffect(() => {
    setCurrentScreen(pathname);
    trackSignedInPath(pathname);
  }, [pathname, status]);

  useEffect(() => {
    void restore();
    void loadCelebratedDate();
  }, [restore]);

  const ready = (fontsLoaded || Boolean(fontError)) && status !== "restoring";
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeRoot>
            <AppStack signedIn={status === "signed-in"} />
            {/* The streak is the signed-in user's: nothing to celebrate (or request) before sign-in. */}
            {status === "signed-in" ? <StreakGoalCelebrator /> : null}
            {status === "signed-in" ? <StreakFlyOverlay /> : null}
            <LegalGate />
            <ToastHost />
          </ThemeRoot>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppStack({ signedIn }: { signedIn: boolean }) {
  const colors = useColors();
  const scheme = useScheme();
  useEffect(() => {
    if (Platform.OS !== "web") void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* A screen that crashes shows the error screen in its own place, so the
          tabs and the rest of the stack stay usable (web's error.tsx is per
          segment the same way). Inherited by the nested navigators. The root
          ErrorBoundary below catches only what fails above the stack. */}
      {/* On a tablet or unfolded phone, every screen sits in one phone-width column. */}
      <AppFrame>
        <Stack
          unstable_screenErrorBoundary={ErrorScreen}
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right" }}
        >
          <Stack.Screen name="index" />
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="session/[id]/index" options={{ gestureEnabled: false }} />
            <Stack.Screen name="session/[id]/results" />
            <Stack.Screen name="session/[id]/review" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="history" />
            <Stack.Screen name="bookmarks" />
            <Stack.Screen name="reinforce" />
            <Stack.Screen name="subscription" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          {/* Public: readable signed in or out, and the OAuth deep-link landing. */}
          <Stack.Screen name="legal/[slug]/index" />
          <Stack.Screen name="legal/[slug]/versions" />
          <Stack.Screen name="legal/[slug]/v/[version]" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </AppFrame>
    </>
  );
}
