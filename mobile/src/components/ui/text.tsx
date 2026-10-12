import { Text, type TextProps } from "react-native";

/**
 * Text in the brand's type pairing (web/src/app/layout.tsx): Sora for display
 * and headings, Manrope for reading, JetBrains Mono for clocks and counts.
 * React Native picks a font file per family, not per weight, so the weight is
 * a prop that selects the file — never a `font-semibold` class.
 */
type Font = "sans" | "display" | "mono";
type Weight = 400 | 500 | 600 | 700;

const FAMILY: Record<Font, Record<Weight, string>> = {
  sans: { 400: "Manrope_400Regular", 500: "Manrope_500Medium", 600: "Manrope_600SemiBold", 700: "Manrope_700Bold" },
  display: { 400: "Sora_500Medium", 500: "Sora_500Medium", 600: "Sora_600SemiBold", 700: "Sora_700Bold" },
  mono: {
    400: "JetBrainsMono_500Medium",
    500: "JetBrainsMono_500Medium",
    600: "JetBrainsMono_600SemiBold",
    700: "JetBrainsMono_600SemiBold",
  },
};

/** Text colour classes (as opposed to size/alignment ones). */
const COLOR_CLASS = /(^|\s)text-(?!(xs|sm|base|lg|xl|[2-9]xl|left|right|center|justify)(\s|$))(?!\[\d)[\w-/[\]#]+/;

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export interface TxtProps extends TextProps {
  className?: string;
  font?: Font;
  weight?: Weight;
}

export function Txt({ className, font = "sans", weight = 400, style, ...props }: TxtProps) {
  const hasColor = className ? COLOR_CLASS.test(className) : false;
  return (
    <Text
      className={cn(!hasColor && "text-foreground", className)}
      style={[{ fontFamily: FAMILY[font][weight] }, style]}
      {...props}
    />
  );
}

/** A screen or section heading. */
export function Heading({ className, ...props }: TxtProps) {
  return <Txt font="display" weight={600} className={cn("text-lg", className)} {...props} />;
}

/** The small uppercase label above a figure ("TODAY'S STREAK PROGRESS"). */
export function Eyebrow({ className, ...props }: TxtProps) {
  return <Txt weight={600} className={cn("text-[11px] uppercase tracking-wider text-muted-foreground", className)} {...props} />;
}
