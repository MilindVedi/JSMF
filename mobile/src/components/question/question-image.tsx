import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Expand, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Txt } from "@/components/ui/text";
import { useColors } from "@/theme/theme";

/**
 * An image that belongs to a question — an X-ray, photo or diagram — at
 * reading size, and full screen on a dark background on tap, where its
 * detail can actually be read.
 */
export function QuestionImage({ uri, label }: { uri: string; label: string }) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${label}, opens full screen`}
        onPress={() => setOpen(true)}
        className="overflow-hidden rounded-2xl border border-border bg-muted"
      >
        <Image source={{ uri }} style={{ width: "100%", height: 220 }} contentFit="contain" accessibilityLabel={label} />
        <View className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-md bg-background/90 px-2 py-1">
          <Expand size={13} color={colors.foreground} strokeWidth={2.2} />
          <Txt weight={600} className="text-[11px]">
            Tap to enlarge
          </Txt>
        </View>
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel={label} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close image"
            onPress={() => setOpen(false)}
            hitSlop={12}
            style={{ position: "absolute", top: insets.top + 12, right: 16, padding: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)" }}
          >
            <X size={22} color="#fff" strokeWidth={2.4} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}
