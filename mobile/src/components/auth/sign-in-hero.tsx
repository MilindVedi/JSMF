import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ArrowRight, Lock, Mail } from "lucide-react-native";
import { swing, useLoopClock, usePressScale } from "@/components/motion/loop";
import { Sheen } from "@/components/motion/sheen";
import { Field, PasswordField } from "@/components/ui/field";
import { LinearGradientFill } from "@/components/ui/gradient";
import { cn, Txt } from "@/components/ui/text";
import { useColors, withAlpha } from "@/theme/theme";
import { EmailDivider, FormError, GoogleMark, useGoogleSignIn } from "./auth-shell";
import { BrandHero, HERO, Rise } from "./brand-hero";
import { LogoWatermark } from "./logo-watermark";
import type { SignInForm } from "./sign-in-form";

/**
 * The sign-in screen's redesigned look: a violet hero with the greeting, and
 * the form in a frosted card pulled up over the hero's rounded edge. Capped at
 * a phone's width so it stays one column on anything larger.
 */
export function SignInHero({ email, setEmail, password, setPassword, errors, submitting, submit }: SignInForm) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background">
      {/* White status-bar icons over the violet hero, while this screen is up. */}
      <StatusBar style="light" />
      <ScrollView
        contentContainerClassName="grow"
        // The hero runs up under the status bar on purpose; the bottom must clear Android's navigation bar.
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-[440px] self-center">
          <BrandHero />

          <Rise delayMs={220} className="z-10 mx-4 -mt-12">
            <View
              className="rounded-[26px] border px-5 py-[22px]"
              style={{
                backgroundColor: withAlpha(colors.card, 0.88),
                borderColor: withAlpha(colors.primary, 0.14),
                boxShadow: `0 24px 50px -20px ${withAlpha(colors.primary, 0.45)}`,
              }}
            >
              <GoogleOption />
              <View className="gap-3.5">
                <Field
                  variant="filled"
                  icon={Mail}
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="username"
                  error={errors.email}
                />
                <PasswordField
                  variant="filled"
                  icon={Lock}
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Your password"
                  autoComplete="current-password"
                  textContentType="password"
                  onSubmitEditing={submit}
                  error={errors.password}
                />
                <FormError message={errors.root} />
                <SubmitButton submitting={submitting} onPress={submit} />
              </View>
              <View className="mt-4 items-center">
                <Link href="/forgot-password">
                  <Txt weight={600} className="text-xs text-primary">
                    Forgot your password?
                  </Txt>
                </Link>
              </View>
              <LogoWatermark />
            </View>
          </Rise>

          <Rise delayMs={320} className="items-center pb-8 pt-5">
            <Txt className="text-sm text-muted-foreground">
              New here?{" "}
              <Link href="/sign-up">
                <Txt weight={700} className="text-sm text-primary">
                  Create an account
                </Txt>
              </Link>
            </Txt>
          </Rise>
        </View>
      </ScrollView>

    </KeyboardAvoidingView>
  );
}

/** "Continue with Google", its note and the divider — only when the server has Google sign-in on. */
function GoogleOption() {
  const colors = useColors();
  const google = useGoogleSignIn();
  const press = usePressScale();
  if (!google.enabled) return null;

  return (
    <View className="mb-5">
      <Animated.View
        style={[{ borderRadius: 16, boxShadow: `0 6px 18px -8px ${withAlpha(colors.primary, 0.4)}` }, press.style]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: google.busy, disabled: google.busy }}
          disabled={google.busy}
          onPress={() => void google.start()}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          // A minimum, not a fixed height: with the phone's text size turned up, the label grows and wraps inside.
          className={cn("min-h-[52px] flex-row items-center justify-center gap-2.5 overflow-hidden rounded-2xl border-[1.5px] bg-card px-4 py-2.5", google.busy && "opacity-60")}
          style={{ borderColor: withAlpha(colors.primary, 0.22) }}
        >
          <Sheen color={HERO.onDeep} />
          <GoogleMark size={20} />
          <Txt weight={600} className="shrink text-center text-[15px]">
            Continue with Google
          </Txt>
        </Pressable>
      </Animated.View>
      <Txt className="mt-2.5 text-center text-[11px] text-muted-foreground">One tap — no password. Fastest sign in / sign up.</Txt>
      <View className="mt-5">
        <EmailDivider />
      </View>
    </View>
  );
}

/** The violet "Sign in" button: a gradient, a sheen half a turn after Google's, and an arrow that leans forward. */
function SubmitButton({ submitting, onPress }: { submitting: boolean; onPress: () => void }) {
  const colors = useColors();
  const press = usePressScale();
  return (
    <Animated.View style={[{ borderRadius: 16, boxShadow: `0 12px 26px -10px ${withAlpha(colors.primary, 0.7)}` }, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: submitting, disabled: submitting }}
        disabled={submitting}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        className={cn("min-h-[52px] flex-row items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-2.5", submitting && "opacity-80")}
      >
        <LinearGradientFill layers={[{ angle: 115, stops: [{ offset: 0, color: HERO.deep }, { offset: 1, color: HERO.vivid }] }]} />
        <Sheen color={HERO.onDeep} delayMs={1900} />
        {submitting ? <ActivityIndicator size="small" color={HERO.onDeep} /> : null}
        <Txt weight={700} className="text-[15px]" style={{ color: HERO.onDeep }}>
          {submitting ? "Signing in…" : "Sign in"}
        </Txt>
        {submitting ? null : <NudgingArrow />}
      </Pressable>
    </Animated.View>
  );
}

/** → leaning 4px forward and back every 1.6s. */
function NudgingArrow() {
  const clock = useLoopClock(1600);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: 4 * swing(clock.value) }] }));
  return (
    <Animated.View style={style}>
      <ArrowRight size={18} color={HERO.onDeep} />
    </Animated.View>
  );
}
