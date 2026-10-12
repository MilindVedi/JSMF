import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { CircleCheck, CircleX, Info, X } from "lucide-react-native";
import { useToastStore } from "@/lib/toast";
import { useColors } from "@/theme/theme";
import { Txt } from "./text";

/** Renders the toast queue at the top of the screen, above everything. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-0 z-50 items-center gap-2 px-4" style={{ paddingTop: insets.top + 8 }}>
      {toasts.map((t) => {
        const Icon = t.kind === "success" ? CircleCheck : t.kind === "error" ? CircleX : Info;
        const color = t.kind === "success" ? colors["success-foreground"] : t.kind === "error" ? colors["error-foreground"] : colors.primary;
        return (
          <Animated.View
            key={t.id}
            entering={FadeInUp.duration(180)}
            exiting={FadeOutUp.duration(160)}
            accessibilityLiveRegion="polite"
            role="alert"
            style={{ width: "100%", maxWidth: 440 }}
          >
            {/* Styled on a plain View: NativeWind classes are not applied to Reanimated's Animated.View. */}
            <View
              className="w-full flex-row items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              style={{ shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}
            >
            <Icon size={18} color={color} style={{ marginTop: 1 }} />
            <View className="flex-1">
              <Txt weight={600} className="text-sm">
                {t.title}
              </Txt>
              {t.description ? <Txt className="mt-0.5 text-[13px] text-muted-foreground">{t.description}</Txt> : null}
              {t.action ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    t.action?.onPress();
                    dismiss(t.id);
                  }}
                  className="mt-2 self-start"
                >
                  <Txt weight={700} className="text-[13px] text-primary">
                    {t.action.label}
                  </Txt>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              hitSlop={8}
              onPress={() => {
                t.onDismiss?.();
                dismiss(t.id);
              }}
            >
              <X size={16} color={colors["muted-foreground"]} />
            </Pressable>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
