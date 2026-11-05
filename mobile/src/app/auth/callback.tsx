import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuthStore } from "@/lib/auth-store";
import { useGoogleFlow } from "@/lib/google-auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";

// Lets the browser popup hand its URL back to openAuthSessionAsync (web only; a no-op on phones).
WebBrowser.maybeCompleteAuthSession();

/**
 * Where `jsmfmedprep://auth/callback?code=…` lands when the OS opens the app
 * from the link instead of handing it to the waiting sign-in flow (e.g. a cold
 * start on Android). The code is single-use, so it is exchanged here only when
 * no flow is already waiting to exchange it. When a waiting flow ends, this
 * re-checks: if the flow used this code, its outcome is shown (success
 * redirects through the auth status); if it was dismissed without using it,
 * the code is exchanged here — never a spinner left forever.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const status = useAuthStore((s) => s.status);
  const googleExchange = useAuthStore((s) => s.googleExchange);
  const router = useRouter();
  const colors = useColors();
  const exchanged = useRef(false);
  const [error, setError] = useState<string | null>(params.error ?? null);
  const flow = useGoogleFlow();

  useEffect(() => {
    if (exchanged.current || error || status === "signed-in") return;
    if (flow.active) return;
    if (params.code && flow.handledCode === params.code) {
      // The flow already spent this code; only its failure needs showing here.
      if (flow.error) setError(flow.error);
      return;
    }
    if (!params.code) {
      setError("This sign-in link is missing its code.");
      return;
    }
    exchanged.current = true;
    googleExchange(params.code).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not complete sign-in."));
  }, [params.code, error, status, googleExchange, flow.active, flow.handledCode, flow.error]);

  // Through the entry, which also returns a student whose session was lost to where they were.
  if (status === "signed-in") return <Redirect href="/" />;
  if (error) {
    return (
      <AuthShell title="Sign-in failed" description={error}>
        <Button label="Back to sign in" onPress={() => router.replace("/sign-in")} />
      </AuthShell>
    );
  }
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background">
      <ActivityIndicator color={colors["muted-foreground"]} />
      <Txt className="text-sm text-muted-foreground">Finishing sign-in…</Txt>
    </View>
  );
}
