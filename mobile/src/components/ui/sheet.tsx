import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { ThemeScope, useColors } from "@/theme/theme";
import { cn, Heading, Txt } from "./text";

/**
 * A bottom sheet: the phone's answer to web's popovers and side sheets
 * (filters, sort, the exam question grid, report). Built on RN's Modal so it
 * needs no native module beyond what Expo Go ships.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  scroll = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <ThemeScope>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end">
          <Pressable accessibilityLabel="Close" className="absolute inset-0 bg-black/40" onPress={onClose} />
          <View
            className="max-h-[85%] rounded-t-3xl border-t border-border bg-card"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <View className="items-center pt-2.5">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>
            {title ? (
              <View className="flex-row items-start gap-3 px-5 pb-2 pt-3">
                <View className="flex-1">
                  <Heading className="text-base">{title}</Heading>
                  {description ? <Txt className="mt-0.5 text-sm text-muted-foreground">{description}</Txt> : null}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} className="size-8 items-center justify-center rounded-full bg-muted">
                  <X size={16} color={colors["muted-foreground"]} />
                </Pressable>
              </View>
            ) : null}
            {scroll ? (
              <ScrollView className="px-5" contentContainerClassName="pb-3 pt-1" keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              <View className="px-5 pb-3 pt-1">{children}</View>
            )}
            {footer ? <View className="flex-row gap-2 border-t border-border px-5 pt-3">{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </ThemeScope>
    </Modal>
  );
}

/** A centred confirmation dialog. `dismissable={false}` for gates that must be answered. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  dismissable?: boolean;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={dismissable ? onClose : () => {}} statusBarTranslucent>
      <ThemeScope>
        <View className="flex-1 items-center justify-center px-5">
          <Pressable className="absolute inset-0 bg-black/50" onPress={dismissable ? onClose : undefined} accessibilityLabel={dismissable ? "Close" : undefined} />
          <View className="w-full max-w-[420px] rounded-3xl border border-border bg-card p-5">
            <Heading className="text-lg">{title}</Heading>
            {description ? <Txt className="mt-1.5 text-sm leading-5 text-muted-foreground">{description}</Txt> : null}
            {children ? <View className="mt-4">{children}</View> : null}
            {footer ? <View className={cn("mt-5 flex-row justify-end gap-2")}>{footer}</View> : null}
          </View>
        </View>
      </ThemeScope>
    </Modal>
  );
}
