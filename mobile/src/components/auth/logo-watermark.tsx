import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LOGO } from "@/components/ui/screen";

/**
 * The JSMF mark over a form, as a PDF carries its watermark: large, centred,
 * upright and faint enough to read straight through. Put it last inside the
 * card — over the fields, not hidden behind them (and the same on web, where
 * an absolute element paints above its siblings anyway). It takes no touches
 * and screen readers skip it.
 */
export function LogoWatermark() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.center, styles.above]}
    >
      <Image source={LOGO} style={styles.mark} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  above: { zIndex: 1 },
  mark: { width: "80%", aspectRatio: 1, opacity: 0.06 },
});
