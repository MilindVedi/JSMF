import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Sparkles } from "lucide-react-native";
import type { z } from "zod";
import { authApi } from "@jsmf/core/api";
import { signInWithGoogle } from "@/lib/google-auth";
import { toast } from "@/lib/toast";
import { Logo } from "@/components/ui/screen";
import { LogoWatermark } from "./logo-watermark";
import { Heading, Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";

/**
 * The auth screens' frame: the mark, a heading and the form card (web's
 * AuthCard, phone-sized). `watermark` lays the faint JSMF mark behind the form.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  watermark = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  watermark?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="grow px-5"
        // Clear the status bar above and Android's navigation bar below (the app draws edge to edge).
        contentContainerStyle={{ paddingTop: insets.top + 28, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Logo size={34} />
        <View className="mt-8 gap-1.5">
          <Heading className="text-[26px] leading-8 text-brand-ink" accessibilityRole="header">
            {title}
          </Heading>
          {description ? <Txt className="text-[15px] text-muted-foreground">{description}</Txt> : null}
        </View>
        <View className="mt-6 gap-4 rounded-3xl border border-border bg-card p-5">
          {children}
          {watermark ? <LogoWatermark /> : null}
        </View>
        {footer ? <View className="mt-6 items-center">{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A form-level error line. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View className="rounded-lg bg-destructive/10 px-3 py-2">
      <Txt weight={500} className="text-xs text-destructive">
        {message}
      </Txt>
    </View>
  );
}

/** First error message per field from a zod parse, keyed by path. */
export function fieldErrors<T>(result: z.ZodSafeParseResult<T>): Record<string, string> {
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "root");
    errors[key] ??= issue.message;
  }
  return errors;
}

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden>
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

/**
 * Google sign-in, for any look of button: `enabled` only once the server says
 * Google sign-in is on (`authApi.methods().google`), so no screen ever shows a
 * dead button; `start` runs the flow and reports a failure as a toast.
 */
export function useGoogleSignIn() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    authApi
      .methods()
      .then((methods) => active && setEnabled(methods.google))
      .catch(() => active && setEnabled(false));
    return () => {
      active = false;
    };
  }, []);

  async function start() {
    setBusy(true);
    const result = await signInWithGoogle();
    setBusy(false);
    if (result.status === "error") toast.error("Google sign-in failed", result.message);
  }

  return { enabled, busy, start };
}

/** The line between the Google button and the email form. */
export function EmailDivider() {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border" />
      <Txt className="text-xs text-muted-foreground">or continue with email</Txt>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

/**
 * "Continue with Google" in the classic auth card. Sign in with Apple will
 * sit next to it once the backend supports it (lib/apple-auth.ts).
 */
export function GoogleSignIn({ mode = "login" }: { mode?: "login" | "signup" }) {
  const { enabled, busy, start } = useGoogleSignIn();
  const colors = useColors();
  const signup = mode === "signup";

  if (!enabled) return null;

  return (
    <View>
      <View className={signup ? "rounded-2xl bg-accent px-4 pb-4 pt-6" : ""}>
        {signup ? (
          <View className="absolute -top-3 self-center flex-row items-center gap-1 rounded-full bg-primary px-3 py-1">
            <Sparkles size={11} color={colors["primary-foreground"]} />
            <Txt weight={700} className="text-[10px] uppercase tracking-wider text-primary-foreground">
              Recommended
            </Txt>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={start}
          className="h-12 flex-row items-center justify-center gap-2.5 rounded-xl border border-border bg-card active:bg-muted"
          style={busy ? { opacity: 0.6 } : undefined}
        >
          <GoogleMark />
          <Txt weight={600} className="text-[15px]">
            {signup ? "Sign up with Google" : "Continue with Google"}
          </Txt>
        </Pressable>
        <Txt className="mt-3 text-center text-xs text-muted-foreground">One tap — no password. Fastest sign in / sign up.</Txt>
      </View>
      <View className="mt-5">
        <EmailDivider />
      </View>
    </View>
  );
}
